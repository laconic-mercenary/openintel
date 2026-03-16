package config

import (
	"fmt"
	"strings"
)

const roverCfgEnvPrefix = "ROVERAPI_ROVER"

var (
	envRoverTableConnStr        = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "TABLE_CONN_STR")
	envRoverTableName           = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "TABLE_NAME")
	envRoverStoreEndpoint       = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "STORE_ENDPOINT")
	envRoverStoreBucket         = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "STORE_BUCKET")
	envRoverStoreAccessKey      = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "STORE_ACCESS_KEY")
	envRoverStoreSecretKey      = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "STORE_SECRET_KEY")
	envRoverStorePublicEndpoint = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "STORE_PUBLIC_ENDPOINT")
	envRoverAllowedOrigins      = fmt.Sprintf(envVarFmt, roverCfgEnvPrefix, "ALLOWED_ORIGINS")
)

func RoverTableConnStr() string {
	return getRequiredEnv(envRoverTableConnStr)
}

func RoverTableName() string {
	return getRequiredEnv(envRoverTableName)
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
