package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/rs/zerolog/log"
)

//
// Consts and Globals

var (
	envVarFmt                         = "%s_%s"
	envAuthEmailHashPepper            = fmt.Sprintf(envVarFmt, authEnvPrefix, "EMAIL_HASH_PEPPER")
	envAuthAllowedDomains             = fmt.Sprintf(envVarFmt, authEnvPrefix, "ALLOWED_DOMAINS")
	envAuthCookieExpirySeconds        = fmt.Sprintf(envVarFmt, authEnvPrefix, "COOKIE_EXPIRY_SECS")
	envAuthJWTSecret                  = fmt.Sprintf(envVarFmt, authEnvPrefix, "JWT_SECRET")
	envAuthEmailLoginDomain           = fmt.Sprintf(envVarFmt, authEnvPrefix, "EMAIL_LOGIN_DOMAIN")
	envAuthLoginCodeSender            = fmt.Sprintf(envVarFmt, authEnvPrefix, "LOGIN_CODE_SENDER")
	envAuthLoginCodeExpiry            = fmt.Sprintf(envVarFmt, authEnvPrefix, "LOGIN_CODE_EXPIRY")
	envAuthRateLimiterAttempts        = fmt.Sprintf(envVarFmt, authEnvPrefix, "RATELIMITER_ATTEMPTS")
	envAuthRateLimiterWindow          = fmt.Sprintf(envVarFmt, authEnvPrefix, "RATELIMITER_WINDOW")
	envAuthRateLimiterDisableDuration = fmt.Sprintf(envVarFmt, authEnvPrefix, "RATELIMITER_DISABLE_DURATION")
	envAuthArgon2Memory               = fmt.Sprintf(envVarFmt, authEnvPrefix, "ARGON2_MEMORY")
	envAuthArgon2Iterations           = fmt.Sprintf(envVarFmt, authEnvPrefix, "ARGON2_ITERATIONS")
	envAuthArgon2Parallelism          = fmt.Sprintf(envVarFmt, authEnvPrefix, "ARGON2_PARALLELISM")
	envAuthArgon2SaltLength           = fmt.Sprintf(envVarFmt, authEnvPrefix, "ARGON2_SALT_LENGTH")
	envAuthArgon2KeyLength            = fmt.Sprintf(envVarFmt, authEnvPrefix, "ARGON2_KEY_LENGTH")
	envAuthCookieDomain               = fmt.Sprintf(envVarFmt, authEnvPrefix, "COOKIE_DOMAIN")
	envAuthLoginRedirectURL           = fmt.Sprintf(envVarFmt, authEnvPrefix, "LOGIN_REDIRECT_URL")
)

const (
	authEnvPrefix   = "ROVERAPI_AUTH"
	roverEnvPrefix  = "ROVERAPI_"
	jwtSecretMinLen = 32
)

//
// Functions

func ServerlessMode() bool {
	return true
}

func AuthRateLimiterAttempts() uint {
	envStr := getRequiredEnv(envAuthRateLimiterAttempts)
	envInt, parseErr := strconv.ParseUint(envStr, 10, 32)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthRateLimiterAttempts).Msg("required env var has invalid format (expected integer)")
	}
	return uint(envInt)
}

func AuthRateLimiterWindow() uint {
	envStr := getRequiredEnv(envAuthRateLimiterWindow)
	envInt, parseErr := strconv.ParseUint(envStr, 10, 32)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthRateLimiterWindow).Msg("required env var has invalid format (expected integer)")
	}
	return uint(envInt)
}

func AuthRateLimiterDisableDuration() uint {
	envStr := getRequiredEnv(envAuthRateLimiterDisableDuration)
	envInt, parseErr := strconv.ParseUint(envStr, 10, 32)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthRateLimiterDisableDuration).Msg("required env var has invalid format (expected integer)")
	}
	return uint(envInt)
}

func AuthCookieExpirySeconds() uint {
	expiryStr := getRequiredEnv(envAuthCookieExpirySeconds)
	expiry, parseErr := strconv.ParseUint(expiryStr, 10, 32)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthCookieExpirySeconds).Msg("required env var has invalid format (expected integer)")
	}
	return uint(expiry)
}

func EmailLoginDomain() string {
	return getRequiredEnv(envAuthEmailLoginDomain)
}

func AllowedAuthOrigins() []string {
	originsCsv := getRequiredEnv(envAuthAllowedDomains)
	originsCsv = strings.TrimSpace(originsCsv)
	origins := strings.Split(originsCsv, ",")
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}
	return origins
}

func EmailHashPepper() string {
	return getRequiredEnv(envAuthEmailHashPepper)
}

func JWTSecret() []byte {
	secret := []byte(getRequiredEnv(envAuthJWTSecret))
	if len(secret) < jwtSecretMinLen {
		log.Fatal().
			Int("minLength", jwtSecretMinLen).
			Int("actualLen", len(secret)).
			Msg("JWTSecret does not meet minimum length")
	}
	return secret
}

func LoginCodeSenderEmail() string {
	return getRequiredEnv(envAuthLoginCodeSender)
}

func LoginCodeExpiry() uint {
	// return 60 * 10 // suggested value: 600 (10 minutes)
	envStr := getRequiredEnv(envAuthLoginCodeExpiry)
	envInt, parseErr := strconv.ParseUint(envStr, 10, 32)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthLoginCodeExpiry).Msg("required env var has invalid format (expected integer)")
	}
	return uint(envInt)
}

func Argon2Memory() uint32 {
	// return 64 * 1024 // suggested value: 65536 (64 KiB)
	envStr := getRequiredEnv(envAuthArgon2Memory)
	envInt, parseErr := strconv.ParseUint(envStr, 10, 32)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthArgon2Memory).Msg("required env var has invalid format (expected integer)")
	}
	return uint32(envInt)
}

func Argon2Iterations() uint32 {
	// return 3 // suggested value: 3
	envStr := getRequiredEnv(envAuthArgon2Iterations)
	envInt, parseErr := strconv.ParseUint(envStr, 10, 32)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthArgon2Iterations).Msg("required env var has invalid format (expected integer)")
	}
	return uint32(envInt)
}

func Argon2Parallelism() uint8 {
	// return 2 // suggested value: 2
	envStr := getRequiredEnv(envAuthArgon2Parallelism)
	envInt, parseErr := strconv.ParseUint(envStr, 10, 8)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthArgon2Parallelism).Msg("required env var has invalid format (expected integer)")
	}
	return uint8(envInt)
}

func Argon2SaltLength() uint32 {
	// return 16 // suggested value: 16
	envStr := getRequiredEnv(envAuthArgon2SaltLength)
	envInt, parseErr := strconv.ParseUint(envStr, 10, 32)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthArgon2SaltLength).Msg("required env var has invalid format (expected integer)")
	}
	return uint32(envInt)
}

func Argon2KeyLength() uint32 {
	// return 64 // suggested value: 64
	envStr := getRequiredEnv(envAuthArgon2KeyLength)
	envInt, parseErr := strconv.ParseUint(envStr, 10, 32)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthArgon2KeyLength).Msg("required env var has invalid format (expected integer)")
	}
	return uint32(envInt)
}

func AuthCookieDomain() string {
	return os.Getenv(envAuthCookieDomain) // empty = scoped to exact host (localhost-friendly)
}

func LoginRedirectURL() string {
	return getRequiredEnv(envAuthLoginRedirectURL)
}

func getRequiredEnv(envVar string) string {
	val := os.Getenv(envVar)
	if val == "" {
		log.Fatal().Str("envVar", envVar).Msg("required environment variable is missing")
	}
	return val
}
