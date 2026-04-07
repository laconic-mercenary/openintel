package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	gotime "time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"openintel.jp/roverapi/internal/config"
	"openintel.jp/roverapi/internal/logging"
	"openintel.jp/roverapi/internal/security"
	"openintel.jp/roverapi/internal/server"
	"openintel.jp/roverapi/internal/storage"
	"openintel.jp/roverapi/internal/time"
	"openintel.jp/roverapi/internal/validation"
	"openintel.jp/roverapi/pkg/auth"
)

//
// consts and globals

const (
	emailFormParam       = "email"
	cookieTokenKey       = "auth_token"
	shutdownDeadlineSecs = 30
	httpPortDefault      = ":8080"
	maxRequestBodyBytes  = 4096
)

func listenAddr() string {
	if port := os.Getenv("FUNCTIONS_CUSTOMHANDLER_PORT"); port != "" {
		return ":" + port
	}
	return httpPortDefault
}

//
// types

type AuthHandler struct {
	authService *auth.AuthService
}

//
// Methods

func (handler *AuthHandler) handleCode(writer http.ResponseWriter, request *http.Request) {
	log.Trace().Msg("handleCode")

	timestampNow := time.UnixTimestampMs()
	logger := logging.NewTracingLogger()
	defer logger.Debug().Int64("requestElapsedMs", logging.ElapsedMs(timestampNow)).Msg("request finished")

	rawEmail := request.PostFormValue("email")
	code := request.PostFormValue("code")

	if validation.IsEmptyStr(rawEmail) || validation.IsEmptyStr(code) {
		server.RespondWithError(writer, http.StatusBadRequest, nil, "missing email or code")
		return
	}

	email, parseErr := validation.ParseEmail(rawEmail)
	if parseErr != nil {
		server.RespondWithError(writer, http.StatusBadRequest, parseErr, "invalid email")
		return
	}

	isValidLogin, verifyErr := handler.authService.VerifyLoginCode(email, code)
	if verifyErr != nil {
		server.RespondWithError(writer, http.StatusServiceUnavailable, verifyErr, "error verifying code")
		return
	}
	if !isValidLogin {
		server.RespondWithError(writer, http.StatusUnauthorized, nil, "invalid or expired code")
		return
	}

	expirySecs := config.AuthCookieExpirySeconds()
	jwtToken, jwtErr := server.GenerateJWT(email, expirySecs, config.JWTSecret())
	if jwtErr != nil {
		server.RespondWithError(writer, http.StatusInternalServerError, jwtErr, "error generating token")
		return
	}

	http.SetCookie(writer, &http.Cookie{
		Name:     cookieTokenKey,
		Value:    jwtToken,
		Domain:   config.AuthCookieDomain(),
		Path:     "/",
		MaxAge:   int(expirySecs),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})

	if deleteErr := handler.authService.DeleteLoginCode(email); deleteErr != nil {
		log.Warn().Err(deleteErr).Msg("error deleting login code")
	}

	salt := handler.authService.DeriveEncryptionSalt(email)
	redirectUrl := config.LoginRedirectURL()
	server.RespondWithOk(writer, fmt.Appendf(nil, `{"status":"authenticated","redirectUrl":"%s","salt":"%s"}`, redirectUrl, salt))
}

func (handler *AuthHandler) handleGetCode(writer http.ResponseWriter, request *http.Request) {
	log.Trace().Msg("handleGetCode")

	timestampNow := time.UnixTimestampMs()
	logger := logging.NewTracingLogger()
	defer logger.Debug().Int64("requestElapsedMs", logging.ElapsedMs(timestampNow)).Msg("request finished")

	params := request.URL.Query()
	authToken := params.Get(server.AuthTokenGetParam())
	if validation.IsEmptyStr(authToken) {
		server.RespondWithError(writer, http.StatusBadRequest, nil, "missing auth token param")
		return
	}

	authCode, authCodeErr := handler.authService.GetAuthCode(authToken)
	if authCodeErr != nil {
		httpStatus := http.StatusServiceUnavailable
		if errors.Is(authCodeErr, auth.ErrInvalidAuthToken) {
			httpStatus = http.StatusNotFound
		}
		server.RespondWithError(writer, httpStatus, authCodeErr, "error retrieving auth code")
		return
	}

	htmlRx := fmt.Sprintf(`<!DOCTYPE html>
		<html>
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Login Code - ログインコード</title>
			<style>
				body {
					background-color: #000000;
					color: #ffffff;
					font-family: Arial, sans-serif;
					display: flex;
					justify-content: center;
					align-items: center;
					height: 100vh;
					margin: 0;
				}
				.container {
					text-align: center;
				}
				h1 {
					font-size: 2rem;
					margin-bottom: 1rem;
				}
				p {
					font-size: 3rem;
					letter-spacing: 0.5rem;
					font-weight: bold;
				}
			</style>
		</head>
		<body>
			<div class="container">
				<h1>Login Code - ログインコード</h1>
				<p>%s</p>
			</div>
		</body>
		</html>
		`, authCode)
	server.RespondWithHtml(writer, htmlRx)
}

func (handler *AuthHandler) handleLogout(writer http.ResponseWriter, request *http.Request) {
	log.Trace().Msg("handleLogout")
	http.SetCookie(writer, &http.Cookie{
		Name:     cookieTokenKey,
		Value:    "",
		Domain:   config.AuthCookieDomain(),
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})
	server.RespondWithOk(writer, []byte("{}"))
}

func (handler *AuthHandler) handleMe(writer http.ResponseWriter, request *http.Request) {
	log.Trace().Msg("handleMe")

	timestampNow := time.UnixTimestampMs()
	logger := logging.NewTracingLogger()
	defer logger.Debug().Int64("requestElapsedMs", logging.ElapsedMs(timestampNow)).Msg("request finished")

	cookie, cookieErr := request.Cookie(cookieTokenKey)
	if cookieErr != nil {
		server.RespondWithError(writer, http.StatusUnauthorized, cookieErr, "missing auth cookie")
		return
	}

	email, jwtErr := server.ValidateJWT(cookie.Value, config.JWTSecret())
	if jwtErr != nil {
		server.RespondWithError(writer, http.StatusUnauthorized, jwtErr, "invalid or expired session")
		return
	}

	salt := handler.authService.DeriveEncryptionSalt(email)
	server.RespondWithOk(writer, fmt.Appendf(nil, `{"salt":"%s"}`, salt))
}

func (handler *AuthHandler) handleEmailLink(writer http.ResponseWriter, request *http.Request) {
	log.Trace().Msg("handleEmailLink")

	timestampNow := time.UnixTimestampMs()
	logger := logging.NewTracingLogger()
	defer logger.Debug().Int64("requestElapsedMs", logging.ElapsedMs(timestampNow)).Msg("request finished")

	rawEmail := request.PostFormValue(emailFormParam)
	if validation.IsEmptyStr(rawEmail) {
		missingErr := errors.New("missing email entry from form")
		server.RespondWithError(writer, http.StatusBadRequest, missingErr, "email parameter missing from form")
		return
	}

	parsedEmail, parseErr := validation.ParseEmail(rawEmail)
	if parseErr != nil {
		server.RespondWithError(writer, http.StatusBadRequest, parseErr, "error in parsing email")
		return
	}

	isEmailFlagged, flagCheckErr := handler.authService.IsEmailFlagged(parsedEmail)
	if flagCheckErr != nil {
		server.RespondWithError(writer, http.StatusServiceUnavailable, flagCheckErr, "error in checking email for abuse")
		return
	}
	if isEmailFlagged {
		server.RespondWithError(writer, http.StatusUnauthorized, nil, "email flagged for abuse")
		return
	}

	if sendErr := handler.authService.SendLoginCode(parsedEmail); sendErr != nil {
		if errors.Is(sendErr, auth.ErrLoginCodeAlreadySent) {
			server.RespondWithError(writer, http.StatusConflict, sendErr, "login code already sent")
			return
		}
		server.RespondWithError(writer, http.StatusServiceUnavailable, sendErr, "error sending login link to email")
	} else {
		server.RespondWithOk(writer, []byte(`{"status":"ok"}`))
	}
}

//
// Functions

func handleHealth(writer http.ResponseWriter, request *http.Request) {
	log.Trace().Msg("handleHealth")
	server.RespondWithOk(writer, []byte(`{"status":"ok"}`))
}

func newAuthHandler() *AuthHandler {
	log.Trace().Msg("newAuthHandler")

	authTokensRepo, authTokensRepoErr := storage.NewAzureTableAuthTokenRepository(
		config.AuthTableConnStr(),
		config.AuthTableName(),
	)
	if authTokensRepoErr != nil {
		log.Fatal().Err(authTokensRepoErr).Msg("error creating auth token repository")
	}
	if initErr := authTokensRepo.Initialize(context.Background()); initErr != nil {
		log.Fatal().Err(initErr).Msg("error initializing auth token table")
	}

	blockList := security.NewOSIEmailService()
	emailer := server.NewResendEmailService(config.EmailAPIKey())
	limiter, limiterErr := server.NewRateLimiter(
		config.AuthRateLimiterAttempts(),
		config.AuthRateLimiterWindow(),
		config.AuthRateLimiterDisableDuration(),
		authTokensRepo,
		authTokensRepo,
	)
	if limiterErr != nil {
		log.Fatal().Err(limiterErr).Msg("error creating rate limiter")
	}

	authService, authServiceErr := auth.NewAuthService(
		auth.WithBlocklist(blockList),
		auth.WithOSIAbuseDatabase(blockList),
		auth.WithEmailer(emailer),
		auth.WithAuthTokensQuery(authTokensRepo),
		auth.WithAuthTokens(authTokensRepo),
		auth.WithRateLimiter(limiter),
	)
	if authServiceErr != nil {
		log.Fatal().AnErr("authServiceError", authServiceErr).Msg("error creating EmailCodeHandler")
	}
	return &AuthHandler{
		authService: authService,
	}
}

func applyMiddleware(allowedMethod string, handler http.HandlerFunc) http.HandlerFunc {
	return server.WithOriginCheck(config.AllowedAuthOrigins(), server.WithMethodCheck(allowedMethod, server.WithRequestSizeLimit(maxRequestBodyBytes, handler)))
}

func awaitShutdown(apiServer *http.Server) {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), shutdownDeadlineSecs*gotime.Second)
	defer cancel()

	if shutdownErr := apiServer.Shutdown(ctx); shutdownErr != nil {
		log.Fatal().Err(shutdownErr).Msg("forced shutdown")
	}

	log.Info().Msg("server stopped")
}

//
// functions

func configureLogging() {
	log.Logger = zerolog.New(os.Stdout).With().Timestamp().Logger()
}

//
// Main

func main() {
	configureLogging()
	log.Info().Msg("starting up...")

	authHandler := newAuthHandler()

	emailLinkHandler := applyMiddleware(http.MethodPost, authHandler.handleEmailLink)
	getCodeHandler := server.WithMethodCheck(http.MethodGet, authHandler.handleGetCode)
	codeHandler := applyMiddleware(http.MethodPost, authHandler.handleCode)
	meHandler := applyMiddleware(http.MethodGet, authHandler.handleMe)
	logoutHandler := applyMiddleware(http.MethodPost, authHandler.handleLogout)

	mux := http.NewServeMux()
	mux.HandleFunc("/auth/health", handleHealth)
	mux.HandleFunc("/auth/email-link", emailLinkHandler)
	mux.HandleFunc("/auth/get-code", getCodeHandler)
	mux.HandleFunc("/auth/code-login", codeHandler)
	mux.HandleFunc("/auth/me", meHandler)
	mux.HandleFunc("/auth/logout", logoutHandler)

	apiServer := &http.Server{
		Addr:    listenAddr(),
		Handler: mux,
	}

	if config.ServerlessMode() {
		log.Info().Msg("serverless mode enabled - blocking on ListenAndServe")
		if err := apiServer.ListenAndServe(); err != nil {
			log.Fatal().Err(err).Msg("server error")
		}
	} else {
		go func() {
			if err := apiServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Fatal().Err(err).Msg("server error")
			}
		}()
		awaitShutdown(apiServer)
	}
}
