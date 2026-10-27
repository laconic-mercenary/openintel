package auth

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
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
	ErrEmailAndCodeRequired    = errors.New("email and code are required")
	ErrRateLimiterRequired     = errors.New("rate limiter is required")
	ErrLoginCodeAlreadySent    = errors.New("a login code has already been sent")
)

const (
	authCodeMax        = 1000000 // 6 digit login code
	authCodeFmt        = "%06d"
	secondsPerMinute   = 60
	loginCodeSubjectJP = "ログインコード"
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

	authToken := service.authRowKey(email)

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
	message := service.formatMessage(authCode, expirySecs)
	if emailErr := service.emailer.SendEmail(sender, email, message); emailErr != nil {
		service.authTokens.DeleteAuthToken(authToken)
		log.Error().Err(emailErr).Msg("error sending email for login link")
		return emailErr
	}
	return nil
}

func (service *AuthService) VerifyLoginCode(email string, userProvidedCode string) (bool, error) {
	log.Trace().Msg("VerifyLoginCode")
	if validation.IsEmptyStr(email) || validation.IsEmptyStr(userProvidedCode) {
		return false, ErrEmailAndCodeRequired
	}
	authToken := service.authRowKey(email)

	token, exists, fetchErr := service.authTokenQuery.GetAuthToken(authToken)
	if fetchErr != nil {
		log.Error().Err(fetchErr).Msg("error fetching auth token")
		return false, fetchErr
	}
	if !exists {
		// never log the row key itself - it is derived from the user's email and is
		// stable for that account, so logging it would write account-identifying
		// material into log retention
		log.Warn().Msg("no pending login code for this email")
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
		log.Warn().
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
	return service.authTokens.DeleteAuthToken(service.authRowKey(email))
}

func (service *AuthService) newAuthCode() (string, error) {
	log.Trace().Msg("newAuthCode")
	max := big.NewInt(authCodeMax)
	randInt, randErr := rand.Int(rand.Reader, max)
	if randErr != nil {
		log.Error().Err(randErr).Msg("error generating login code")
		return "", randErr
	}
	return fmt.Sprintf(authCodeFmt, randInt.Int64()), nil
}

// formatMessage builds the login email. The code is delivered inline rather than behind
// a link: a URL that reveals the code is a credential that outlives the email it arrived
// in, and it leaks through browser history, forwarding and link-prefetching scanners.
//
// authCode is server-generated and numeric (see newAuthCode), so it is safe to embed
// in HTML without escaping.
func (service *AuthService) formatMessage(authCode string, expirySeconds uint) string {
	expiryMinutes := expirySeconds / secondsPerMinute
	emailMsg := strings.Builder{} // TODO translation table for other languages
	emailMsg.WriteString("<p>Your openintel login code - ")
	emailMsg.WriteString(loginCodeSubjectJP)
	emailMsg.WriteString("</p>")
	emailMsg.WriteString(`<p style="font-size:2rem;letter-spacing:0.5rem;font-weight:bold;">`)
	emailMsg.WriteString(authCode)
	emailMsg.WriteString("</p>")
	emailMsg.WriteString("<p>It expires in ")
	fmt.Fprintf(&emailMsg, "%d", expiryMinutes)
	emailMsg.WriteString(" minute")
	if expiryMinutes != 1 {
		emailMsg.WriteString("s")
	}
	emailMsg.WriteString(". If you did not request it, you can ignore this email.</p>")
	return emailMsg.String()
}

// authRowKey derives the auth table RowKey for an email.
//
// This is an internal lookup key only — it is never sent to the user, never appears in
// a URL, and is never logged. A keyed hash is therefore sufficient; Argon2 bought no
// security here while making every unauthenticated call to /auth/email-link and
// /auth/code-login cost two 64 MB derivations, which was a trivial denial-of-service
// lever. This matches how roverapi already derives intel partition keys.
//
// Note this pepper (AUTH_EMAIL_HASH_PEPPER) is distinct from the encryption salt pepper
// used by DeriveEncryptionSalt. Changing this one orphans pending login codes; changing
// that one would make every user's data permanently undecryptable.
func (service *AuthService) authRowKey(email string) string {
	log.Trace().Msg("authRowKey")
	return security.HmacSha256Hex(email, config.EmailHashPepper())
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
