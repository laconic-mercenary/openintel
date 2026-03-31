package config

import (
	"context"
	"os"
	"strings"
	"sync"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azsecrets"
	"github.com/rs/zerolog/log"
)

var (
	kvClient     *azsecrets.Client
	kvClientOnce sync.Once
)

func getSecretEnv(envVar string) string {
	if val := os.Getenv(envVar); val != "" {
		return val
	}
	val := getFromKeyVault(envVarToSecretName(envVar))
	if val == "" {
		log.Fatal().Str("envVar", envVar).Msg("secret not found in environment or Key Vault")
	}
	return val
}

func envVarToSecretName(envVar string) string {
	return strings.ToLower(strings.ReplaceAll(envVar, "_", "-"))
}

func getFromKeyVault(secretName string) string {
	kvURL := os.Getenv(envKeyVaultURL)
	if kvURL == "" {
		return ""
	}
	kvClientOnce.Do(func() {
		cred, err := azidentity.NewDefaultAzureCredential(nil)
		if err != nil {
			log.Fatal().Err(err).Msg("failed to create Azure credential for Key Vault")
		}
		client, err := azsecrets.NewClient(kvURL, cred, nil)
		if err != nil {
			log.Fatal().Err(err).Msg("failed to create Key Vault client")
		}
		kvClient = client
	})
	resp, err := kvClient.GetSecret(context.Background(), secretName, "", nil)
	if err != nil {
		log.Error().Err(err).Str("secret", secretName).Msg("failed to get secret from Key Vault")
		return ""
	}
	if resp.Value == nil {
		return ""
	}
	return *resp.Value
}
