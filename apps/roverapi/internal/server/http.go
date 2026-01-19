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
)

//
// functions

func AuthTokenGetParam() string {
	return authTokenGetParam
}

func HasAllowedOrigin(request *http.Request, allowedOrigins []string) bool {
	log.Trace().Msg("HasAllowedOrigin")
	origin := request.Header.Get(HeaderOrigin)
	if origin != "" {
		if slices.Contains(allowedOrigins, origin) {
			return true
		}
	}
	return false
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
