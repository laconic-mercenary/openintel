package config

import (
	"fmt"
	"os"

	"github.com/rs/zerolog/log"
)

//
// consts and globals

var (
	envVarFmt        = "%s_%s"
	envAuthJWTSecret = fmt.Sprintf(envVarFmt, authEnvPrefix, "JWT_SECRET")
	envKeyVaultURL   = "ROVERAPI_KEYVAULT_URL"
)

const (
	jwtSecretMinLen = 32
)

//
// functions

func JWTSecret() []byte {
	secret := []byte(getSecretEnv(envAuthJWTSecret))
	if len(secret) < jwtSecretMinLen {
		log.Fatal().
			Int("minLength", jwtSecretMinLen).
			Int("actualLen", len(secret)).
			Msg("JWTSecret does not meet minimum length")
	}
	return secret
}

func ServerlessMode() bool {
	return true
}

func getRequiredEnv(envVar string) string {
	val := os.Getenv(envVar)
	if val == "" {
		log.Fatal().Str("envVar", envVar).Msg("required environment variable is missing")
	}
	return val
}

func getOptionalEnv(envVar string) string {
	return os.Getenv(envVar)
}
