package auth

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math"
	"math/big"
	"net/url"
	"strings"

	"github.com/rs/zerolog/log"
	"openintel.jp/roverapi/internal/config"
	"openintel.jp/roverapi/internal/security"
	"openintel.jp/roverapi/internal/server"
	"openintel.jp/roverapi/internal/storage"
	"openintel.jp/roverapi/internal/time"
	"openintel.jp/roverapi/internal/validation"
)

//
// consts and globals

var (
	ErrAbuseQueryRequired      = errors.New("osiAbuseDatabase is required")
	ErrEmailerRequired         = errors.New("Emailer is required")
	ErrAuthTokensRequired      = errors.New("AuthTokens is required")
	ErrAuthTokensQueryRequired = errors.New("AuthTokensQuery is required")
	ErrInvalidAuthToken        = errors.New("invalid auth token provided")
	ErrEmailAndCodeRequired    = errors.New("email and code are required")
	ErrRateLimiterRequired     = errors.New("rate limiter is required")
	ErrLoginCodeAlreadySent    = errors.New("a login code has already been sent")
)

const (
	authTokenFmt    = "%s$$%s$$%s"
	authCodeMax     = 1000000 // 6 digit login code
	authTokenMaxLen = math.MaxUint8
)

//
// types

type AuthService struct {
	osiAbuse       storage.EmailAbuseQueryRepository
	emailBlocklist storage.EmailAbuseQueryRepository
	authTokens     storage.AuthTokenRepository
	authTokenQuery storage.AuthTokenQueryRepository
	emailer        server.EmailService
	rateLimiter    *server.RateLimiter
}

type AuthServiceConfig func(service *AuthService) error

//
// Methods

func (service *AuthService) IsEmailFlagged(email string) (bool, error) {
	log.Trace().Msg("IsEmailFlagged")
	isEmailBlocked, blockCheckErr := service.emailBlocklist.IsFlagged(email)
	if blockCheckErr != nil {
		return false, blockCheckErr
	}
	if isEmailBlocked {
		return true, nil
	}
	isEmailOSIFlagged, osiCheckErr := service.osiAbuse.IsFlagged(email)
	if osiCheckErr != nil {
		return false, osiCheckErr
	}
	return isEmailOSIFlagged, nil
}

func (service *AuthService) SendLoginCode(email string) error {
	log.Trace().Msg("SendLoginCode")

	authToken, authTokenErr := service.newAuthToken(email)
	if authTokenErr != nil {
		log.Error().Err(authTokenErr).Msg("error creating auth token")
		return authTokenErr
	}

	existing, exists, fetchErr := service.authTokenQuery.GetAuthToken(authToken)
	if fetchErr != nil {
		log.Error().Err(fetchErr).Msg("error checking for existing auth token")
		return fetchErr
	}
	if exists {
		if time.UnixTimestampMs() < existing.ExpiryTimestamp {
			log.Warn().Msg("login code already sent and not yet expired")
			return ErrLoginCodeAlreadySent
		}
		if deleteErr := service.authTokens.DeleteAuthToken(authToken); deleteErr != nil {
			log.Error().Err(deleteErr).Msg("error deleting expired auth token before reissue")
			return deleteErr
		}
	}

	authCode, authCodeErr := service.newAuthCode()
	if authCodeErr != nil {
		log.Error().Err(authCodeErr).Msg("error generating auth code")
		return authCodeErr
	}

	expirySecs := config.LoginCodeExpiry()
	if storageErr := service.authTokens.StoreAuthToken(authToken, authCode, expirySecs); storageErr != nil {
		log.Error().Err(storageErr).Msg("error storing login code auth entry")
		return storageErr
	}

	sender := config.LoginCodeSenderEmail()
	link, loginLinkErr := service.newLoginLink(authToken)
	if loginLinkErr != nil {
		return loginLinkErr
	}
	message := service.formatMessage(link)
	if emailErr := service.emailer.SendEmail(sender, email, message); emailErr != nil {
		service.authTokens.DeleteAuthToken(authToken)
		log.Error().Err(emailErr).Msg("error sending email for login link")
		return emailErr
	}
	return nil
}

func (service *AuthService) GetAuthCode(authToken string) (string, error) {
	log.Trace().Msg("GetAuthCode")
	if validation.IsEmptyStr(authToken) {
		log.Error().Msg("empty auth token provided")
		return "", ErrInvalidAuthToken
	}
	if len(authToken) > authTokenMaxLen {
		log.Error().Int("tokenLength", len(authToken)).Int("maxLengthAllowed", authTokenMaxLen).Msg("auth token is too long (invalid format)")
		return "", ErrInvalidAuthToken
	}
	if !validation.IsURLEncodedB64(authToken) {
		log.Error().Str("authToken", authToken).Msg("auth token is not base64 encoded (invalid format)")
		return "", ErrInvalidAuthToken
	}
	token, exists, fetchErr := service.authTokenQuery.GetAuthToken(authToken)
	if fetchErr != nil {
		log.Error().Err(fetchErr).Msg("error fetching auth token")
		return "", fetchErr
	}
	if !exists {
		log.Error().Str("authToken", authToken).Msg("auth token does not exist")
		return "", ErrInvalidAuthToken
	}
	return token.Code, nil
}

func (service *AuthService) VerifyLoginCode(email string, userProvidedCode string) (bool, error) {
	log.Trace().Msg("VerifyLoginCode")
	if validation.IsEmptyStr(email) || validation.IsEmptyStr(userProvidedCode) {
		return false, ErrEmailAndCodeRequired
	}
	authToken, authTokenErr := service.newAuthToken(email)
	if authTokenErr != nil {
		log.Error().Err(authTokenErr).Msg("error creating new auth token")
		return false, authTokenErr
	}

	token, exists, fetchErr := service.authTokenQuery.GetAuthToken(authToken)
	if fetchErr != nil {
		log.Error().Err(fetchErr).Msg("error fetching auth token")
		return false, fetchErr
	}
	if !exists {
		// discourage logging the token but because it doesn't exist, there's no
		// compromise on the logging system - also this can expose brute force attempts
		log.Warn().Str("authToken", authToken).Msg("authToken does not exist")
		return false, nil
	}
	if time.UnixTimestampMs() > token.ExpiryTimestamp {
		// check expiry first before the Enabled check. We should see disabled logs
		// for a period of time and then the expiry - if everything is working correctly
		log.Warn().Msg("authToken has expired")
		if deleteErr := service.authTokens.DeleteAuthToken(authToken); deleteErr != nil {
			log.Error().Err(deleteErr).Msg("error deleting expired auth token")
		}
		return false, nil
	}
	if !token.Enabled {
		log.Warn().Msg("authToken is disabled - rejecting login attempts")
		return false, nil
	}

	// considered using subtle.ConstantTimeCompare - but per this discussion https://github.com/golang/go/issues/18936#issuecomment-313797253:
	// decided against it. More imporant is rate limiting
	if token.Code == userProvidedCode {
		return true, nil
	}

	// a failed login attempt - update rate limiter
	rateLimitResult, rateLimitErr := service.rateLimiter.LogAndCheck(authToken)
	if rateLimitErr != nil {
		log.Error().Err(rateLimitErr).Msg("error when updating rate limiter")
		return false, rateLimitErr
	}
	if rateLimitResult == server.RateLimitTriggered {
		// prefer to not log emails or tokens at any time - but this log
		// would be important in identifying abuse and updating our blocklists
		log.Warn().
			Str("email", email).
			Uint("maxAllowedAttempts", service.rateLimiter.MaxAttempts()).
			Uint("attemptsWindowSeconds", service.rateLimiter.AttemptsWindowSeconds()).
			Uint("disableDuration", service.rateLimiter.DisableDurationSeconds()).
			Msg("rate limiter triggered - subsequent attempts will be blocked")
	}
	return false, nil
}

func (service *AuthService) DeriveEncryptionSalt(email string) string {
	log.Trace().Msg("DeriveEncryptionSalt")
	return security.HmacSha256Hex(email, config.EncryptionSaltPepper())
}

func (service *AuthService) DeleteLoginCode(email string) error {
	log.Trace().Msg("DeleteLoginCode")
	authToken, authTokenErr := service.newAuthToken(email)
	if authTokenErr != nil {
		log.Error().Err(authTokenErr).Msg("error creating auth token")
		return authTokenErr
	}
	return service.authTokens.DeleteAuthToken(authToken)
}

func (service *AuthService) newAuthCode() (string, error) {
	log.Trace().Msg("newAuthCode")
	max := big.NewInt(authCodeMax)
	randInt, randErr := rand.Int(rand.Reader, max)
	if randErr != nil {
		log.Error().Err(randErr).Msg("error generating login code")
		return "", randErr
	}
	return fmt.Sprintf("%06d", randInt.Int64()), nil
}

func (service *AuthService) formatMessage(loginLinkUrl string) string {
	emailMsg := strings.Builder{}
	emailMsg.WriteString("Your requested login link: <a href=") // TODO translation table for other languages
	emailMsg.WriteString("\"")
	emailMsg.WriteString(loginLinkUrl)
	emailMsg.WriteString("\"")
	emailMsg.WriteString(">LINK</a>")
	return emailMsg.String()
}

func (service *AuthService) newAuthToken(email string) (string, error) {
	log.Trace().Msg("newAuthToken")
	salt := []byte(security.HashSha256(email))
	pepper := config.EmailHashPepper()
	hashedEmail, hashErr := security.Hash(email, salt)
	if hashErr != nil {
		log.Error().Err(hashErr).Msg("error hashing email")
		return "", hashErr
	}
	authTokenPlainTxt := fmt.Sprintf(authTokenFmt, hashedEmail, string(salt), pepper)
	return security.Hash(authTokenPlainTxt, salt)
}

func (service *AuthService) newLoginLink(authToken string) (string, error) {
	baseUrl, urlParseErr := url.Parse(config.LoginRedirectURL())
	if urlParseErr != nil {
		log.Error().Err(urlParseErr).Msg("error parsing login redirect url")
		return "", urlParseErr
	}
	baseUrl.Path = "/auth/get-code"
	params := url.Values{}
	params.Add(server.AuthTokenGetParam(), authToken)
	baseUrl.RawQuery = params.Encode()
	return baseUrl.String(), nil
}

//
// Functions

func NewAuthService(configs ...AuthServiceConfig) (*AuthService, error) {
	log.Trace().Msg("NewAuthService")
	authService := &AuthService{}
	for _, configure := range configs {
		cfgErr := configure(authService)
		if cfgErr != nil {
			return nil, cfgErr
		}
	}
	if authService.osiAbuse == nil {
		return nil, ErrAbuseQueryRequired
	}
	if authService.emailBlocklist == nil {
		return nil, ErrAbuseQueryRequired
	}
	if authService.authTokens == nil {
		return nil, ErrAuthTokensRequired
	}
	if authService.authTokenQuery == nil {
		return nil, ErrAuthTokensQueryRequired
	}
	if authService.emailer == nil {
		return nil, ErrEmailerRequired
	}
	if authService.rateLimiter == nil {
		return nil, ErrRateLimiterRequired
	}
	return authService, nil
}

func WithBlocklist(emailBlocklistService storage.EmailAbuseQueryRepository) AuthServiceConfig {
	log.Trace().Msg("WithBlocklist")
	return func(service *AuthService) error {
		if emailBlocklistService == nil {
			return ErrAbuseQueryRequired
		}
		service.emailBlocklist = emailBlocklistService
		return nil
	}
}

func WithOSIAbuseDatabase(osiAbuseQueryService storage.EmailAbuseQueryRepository) AuthServiceConfig {
	log.Trace().Msg("WithOSIAbuseDatabase")
	return func(service *AuthService) error {
		if osiAbuseQueryService == nil {
			return ErrAbuseQueryRequired
		}
		service.osiAbuse = osiAbuseQueryService
		return nil
	}
}

func WithEmailer(emailer server.EmailService) AuthServiceConfig {
	log.Trace().Msg("WithEmailer")
	return func(service *AuthService) error {
		if emailer == nil {
			return ErrEmailerRequired
		}
		service.emailer = emailer
		return nil
	}
}

func WithAuthTokens(authTokens storage.AuthTokenRepository) AuthServiceConfig {
	log.Trace().Msg("WithAuthTokens")
	return func(service *AuthService) error {
		if authTokens == nil {
			return ErrAuthTokensRequired
		}
		service.authTokens = authTokens
		return nil
	}
}

func WithAuthTokensQuery(authTokensQuery storage.AuthTokenQueryRepository) AuthServiceConfig {
	log.Trace().Msg("WithAuthTokensQuery")
	return func(service *AuthService) error {
		if authTokensQuery == nil {
			return ErrAuthTokensQueryRequired
		}
		service.authTokenQuery = authTokensQuery
		return nil
	}
}

func WithRateLimiter(rateLimiter *server.RateLimiter) AuthServiceConfig {
	log.Trace().Msg("WithRateLimiter")
	return func(service *AuthService) error {
		if rateLimiter == nil {
			return ErrRateLimiterRequired
		}
		service.rateLimiter = rateLimiter
		return nil
	}
}
