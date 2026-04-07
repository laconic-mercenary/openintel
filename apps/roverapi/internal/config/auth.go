package config

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/rs/zerolog/log"
)

//
// consts and globals

var (
	envAuthTableConnStr               = fmt.Sprintf(envVarFmt, authEnvPrefix, "TABLE_CONN_STR")
	envAuthTableName                  = fmt.Sprintf(envVarFmt, authEnvPrefix, "TABLE_NAME")
	envAuthEmailAPIKey                = fmt.Sprintf(envVarFmt, authEnvPrefix, "EMAIL_API_KEY")
	envAuthEmailHashPepper            = fmt.Sprintf(envVarFmt, authEnvPrefix, "EMAIL_HASH_PEPPER")
	envAuthEncryptionSaltPepper       = fmt.Sprintf(envVarFmt, authEnvPrefix, "ENCRYPTION_SALT_PEPPER")
	envAuthAllowedDomains             = fmt.Sprintf(envVarFmt, authEnvPrefix, "ALLOWED_DOMAINS")
	envAuthCookieExpirySeconds        = fmt.Sprintf(envVarFmt, authEnvPrefix, "COOKIE_EXPIRY_SECS")
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
	authEnvPrefix = "ROVERAPI_AUTH"
)

//
// functions

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

func AllowedAuthOrigins() []string {
	originsCsv := getRequiredEnv(envAuthAllowedDomains)
	originsCsv = strings.TrimSpace(originsCsv)
	origins := strings.Split(originsCsv, ",")
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}
	return origins
}

func AuthTableConnStr() string {
	return getSecretEnv(envAuthTableConnStr)
}

func AuthTableName() string {
	return getRequiredEnv(envAuthTableName)
}

func EmailHashPepper() string {
	return getSecretEnv(envAuthEmailHashPepper)
}

func EncryptionSaltPepper() string {
	return getSecretEnv(envAuthEncryptionSaltPepper)
}

func LoginCodeSenderEmail() string {
	return getRequiredEnv(envAuthLoginCodeSender)
}

func LoginCodeExpiry() uint {
	envStr := getRequiredEnv(envAuthLoginCodeExpiry)
	envInt, parseErr := strconv.ParseUint(envStr, 10, 32)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthLoginCodeExpiry).Msg("required env var has invalid format (expected integer)")
	}
	return uint(envInt)
}

func Argon2Memory() uint32 {
	envStr := getRequiredEnv(envAuthArgon2Memory)
	envInt, parseErr := strconv.ParseUint(envStr, 10, 32)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthArgon2Memory).Msg("required env var has invalid format (expected integer)")
	}
	return uint32(envInt)
}

func Argon2Iterations() uint32 {
	envStr := getRequiredEnv(envAuthArgon2Iterations)
	envInt, parseErr := strconv.ParseUint(envStr, 10, 32)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthArgon2Iterations).Msg("required env var has invalid format (expected integer)")
	}
	return uint32(envInt)
}

func Argon2Parallelism() uint8 {
	envStr := getRequiredEnv(envAuthArgon2Parallelism)
	envInt, parseErr := strconv.ParseUint(envStr, 10, 8)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthArgon2Parallelism).Msg("required env var has invalid format (expected integer)")
	}
	return uint8(envInt)
}

func Argon2SaltLength() uint32 {
	envStr := getRequiredEnv(envAuthArgon2SaltLength)
	envInt, parseErr := strconv.ParseUint(envStr, 10, 32)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthArgon2SaltLength).Msg("required env var has invalid format (expected integer)")
	}
	return uint32(envInt)
}

func Argon2KeyLength() uint32 {
	envStr := getRequiredEnv(envAuthArgon2KeyLength)
	envInt, parseErr := strconv.ParseUint(envStr, 10, 32)
	if parseErr != nil {
		log.Fatal().Err(parseErr).Str("envVar", envAuthArgon2KeyLength).Msg("required env var has invalid format (expected integer)")
	}
	return uint32(envInt)
}

func AuthCookieDomain() string {
	return getOptionalEnv(envAuthCookieDomain)
}

func LoginRedirectURL() string {
	return getRequiredEnv(envAuthLoginRedirectURL)
}

func EmailAPIKey() string {
	return getSecretEnv(envAuthEmailAPIKey)
}
