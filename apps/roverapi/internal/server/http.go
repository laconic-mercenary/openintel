package server

import (
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

//
// constants and globals

const (
	HeaderContentType = "Content-Type"
	HeaderOrigin      = "Origin"
	ContentTypeJSON   = "application/json"
	ContentTypeHTML   = "text/html"
	authTokenGetParam = "x"
	cookieAuthToken   = "auth_token"
)

//
// functions

func AuthTokenGetParam() string {
	return authTokenGetParam
}

func HasAllowedOrigin(request *http.Request, allowedOrigins []string) bool {
	log.Trace().Msg("HasAllowedOrigin")
	origin := request.Header.Get(HeaderOrigin)
	if origin == "" {
		log.Warn().Str("path", request.URL.Path).Msg("no origin header — allowing (proxied or same-origin request)")
		return true
	}
	return slices.Contains(allowedOrigins, origin)
}

func RespondWithOk(response http.ResponseWriter, responseBody []byte) {
	log.Trace().Msg("RespondWithOk")
	response.Header().Set(HeaderContentType, ContentTypeJSON)
	response.WriteHeader(http.StatusOK)
	response.Write(responseBody)
}

func RespondWithHtml(response http.ResponseWriter, html string) {
	log.Trace().Msg("RespondWithHtml")
	response.Header().Set(HeaderContentType, ContentTypeHTML)
	response.WriteHeader(http.StatusOK)
	response.Write([]byte(html))
}

func RespondWithError(w http.ResponseWriter, statusCode int, err error, logMessage string) {
	log.Trace().Msg("RespondWithError")
	log.Error().Err(err).Caller(1).Caller(2).Caller(3).Int("httpStatus", statusCode).Msg(logMessage)
	http.Error(w, http.StatusText(statusCode), statusCode)
}

func RespondUnauthorized(response http.ResponseWriter) {
	log.Trace().Msg("RespondUnauthorized")
	log.Warn().Msg("user failed to authenticate")
	http.Error(response, http.StatusText(http.StatusUnauthorized), http.StatusUnauthorized)
}

func DumpHTTPRequest(request *http.Request) {
	log.Trace().Msg("DumpHTTPRequest")
	if zerolog.GlobalLevel() == zerolog.DebugLevel {
		var dump strings.Builder
		dump.WriteString("REQUEST DUMP: Method: ")
		dump.WriteString(request.Method)
		dump.WriteString(", URL: ")
		dump.WriteString(request.URL.String())
		dump.WriteString(", Header: ")
		dump.WriteString(fmt.Sprintf("%v", request.Header))
		log.Debug().Msg(dump.String())
	}
}

// Method check middleware
func WithMethodCheck(method string, next http.HandlerFunc) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != method {
			RespondWithError(writer, http.StatusMethodNotAllowed, nil, "unsupported method")
			return
		}
		next(writer, request)
	}
}

func EmailFromCookie(request *http.Request, jwtSecret []byte) (string, error) {
	cookie, cookieErr := request.Cookie(cookieAuthToken)
	if cookieErr != nil {
		return "", cookieErr
	}
	email, jwtErr := ValidateJWT(cookie.Value, jwtSecret)
	if jwtErr != nil {
		return "", jwtErr
	}
	return email, nil
}

// Cookie auth middleware
func WithCookieAuth(jwtSecret []byte, next http.HandlerFunc) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		cookie, cookieErr := request.Cookie(cookieAuthToken)
		if cookieErr != nil {
			RespondUnauthorized(writer)
			return
		}
		_, jwtErr := ValidateJWT(cookie.Value, jwtSecret)
		if jwtErr != nil {
			RespondUnauthorized(writer)
			return
		}
		next(writer, request)
	}
}

// Request size limit middleware
func WithRequestSizeLimit(maxBytes int64, next http.HandlerFunc) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		request.Body = http.MaxBytesReader(writer, request.Body, maxBytes)
		next(writer, request)
	}
}

// Origin check middleware
func WithOriginCheck(allowedOrigins []string, next http.HandlerFunc) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if !HasAllowedOrigin(request, allowedOrigins) {
			RespondWithError(writer, http.StatusForbidden, nil, "origin not allowed")
			return
		}
		next(writer, request)
	}
}
