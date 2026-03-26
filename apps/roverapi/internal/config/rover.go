package config

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/rs/zerolog/log"
)

const roverCfgEnvPrefix = "ROVERAPI_ROVER"

var (
	envRoverTableConnStr              = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "TABLE_CONN_STR")
	envRoverPrivateIntelTableName     = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "PRIVATE_INTEL_TABLE_NAME")
	envRoverIntelEmailHashPepper      = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "INTEL_EMAIL_HASH_PEPPER")
	envRoverTimestampPepper           = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "TIMESTAMP_PEPPER")
	envRoverTimestampSecretBase       = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "TIMESTAMP_SECRET_BASE")
	envRoverStoreEndpoint             = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "STORE_ENDPOINT")
	envRoverStoreBucket               = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "STORE_BUCKET")
	envRoverStoreAccessKey            = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "STORE_ACCESS_KEY")
	envRoverStoreSecretKey            = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "STORE_SECRET_KEY")
	envRoverStorePublicEndpoint       = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "STORE_PUBLIC_ENDPOINT")
	envRoverAllowedOrigins            = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "ALLOWED_ORIGINS")
)

func RoverTableConnStr() string {
	return getRequiredEnv(envRoverTableConnStr)
}

func RoverPrivateIntelTableName() string {
	return getRequiredEnv(envRoverPrivateIntelTableName)
}

func RoverIntelEmailHashPepper() string {
	return getRequiredEnv(envRoverIntelEmailHashPepper)
}

func RoverTimestampPepper() string {
	return getRequiredEnv(envRoverTimestampPepper)
}

func RoverTimestampSecretBase() int64 {
	raw := getRequiredEnv(envRoverTimestampSecretBase)
	val, parseErr := strconv.ParseInt(raw, 10, 64)
	if parseErr != nil {
		log.Fatal().Str("envVar", envRoverTimestampSecretBase).Err(parseErr).Msg("TIMESTAMP_SECRET_BASE must be a valid int64")
	}
	return val
}

func RoverStoreEndpoint() string {
	return getRequiredEnv(envRoverStoreEndpoint)
}

func RoverStoreBucket() string {
	return getRequiredEnv(envRoverStoreBucket)
}

func RoverStoreAccessKey() string {
	return getRequiredEnv(envRoverStoreAccessKey)
}

func RoverStoreSecretKey() string {
	return getRequiredEnv(envRoverStoreSecretKey)
}

func RoverStorePublicEndpoint() string {
	return getRequiredEnv(envRoverStorePublicEndpoint)
}

func AllowedRoverOrigins() []string {
	originsCsv := getRequiredEnv(envRoverAllowedOrigins)
	originsCsv = strings.TrimSpace(originsCsv)
	origins := strings.Split(originsCsv, ",")
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}
	return origins
}
