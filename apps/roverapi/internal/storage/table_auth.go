package storage

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/data/aztables"
	"github.com/rs/zerolog/log"
	"openintel.jp/roverapi/internal/time"
)

//
// consts and globals

const (
	authTokenPartitionKey      = "auth"
	tableErrAlreadyExists      = "TableAlreadyExists"
	authTokenInitialAttempts   = "0"
	authTokenInitialEnabled    = "true"
)

//
// types

type authTokenTableEntity struct {
	PartitionKey         string `json:"PartitionKey"`
	RowKey               string `json:"RowKey"`
	Code                 string `json:"Code"`
	ExpiryTimestamp      string `json:"ExpiryTimestamp"`
	LoginAttempts        string `json:"LoginAttempts"`
	WindowStartTimestamp string `json:"WindowStartTimestamp"`
	Enabled              string `json:"Enabled"`
}

type AzureTableAuthTokenRepository struct {
	serviceClient *aztables.ServiceClient
	tableClient   *aztables.Client
	tableName     string
}

//
// methods

func (repository *AzureTableAuthTokenRepository) Initialize(ctx context.Context) error {
	log.Trace().Msg("Initialize")
	_, createErr := repository.serviceClient.CreateTable(ctx, repository.tableName, nil)
	if createErr != nil {
		var respErr *azcore.ResponseError
		if errors.As(createErr, &respErr) && respErr.ErrorCode == tableErrAlreadyExists {
			return nil
		}
		log.Error().Err(createErr).Str("tableName", repository.tableName).Msg("error creating table")
		return createErr
	}
	return nil
}

func (repository *AzureTableAuthTokenRepository) StoreAuthToken(authToken, authCode string, expirySeconds uint) error {
	log.Trace().Msg("StoreAuthToken")
	entity := authTokenTableEntity{
		PartitionKey:         authTokenPartitionKey,
		RowKey:               authToken,
		Code:                 authCode,
		ExpiryTimestamp:      strconv.FormatInt(time.UnixTimestampMs()+time.SecondsToMillis(expirySeconds), 10),
		LoginAttempts:        authTokenInitialAttempts,
		WindowStartTimestamp: strconv.FormatInt(time.UnixTimestampMs(), 10),
		Enabled:              authTokenInitialEnabled,
	}
	entityBytes, marshalErr := json.Marshal(entity)
	if marshalErr != nil {
		log.Error().Err(marshalErr).Msg("error marshaling auth token entity")
		return marshalErr
	}
	_, addErr := repository.tableClient.AddEntity(context.Background(), entityBytes, nil)
	if addErr != nil {
		log.Error().Err(addErr).Msg("error adding auth token entity to table")
		return addErr
	}
	return nil
}

func (repository *AzureTableAuthTokenRepository) DeleteAuthToken(authToken string) error {
	log.Trace().Msg("DeleteAuthToken")
	etag := azcore.ETag("*")
	_, deleteErr := repository.tableClient.DeleteEntity(context.Background(), authTokenPartitionKey, authToken, &aztables.DeleteEntityOptions{
		IfMatch: &etag,
	})
	if deleteErr != nil {
		log.Error().Err(deleteErr).Str("authToken", authToken).Msg("error deleting auth token entity from table")
		return deleteErr
	}
	return nil
}

func (repository *AzureTableAuthTokenRepository) IncrementLoginAttempts(authToken string) error {
	log.Trace().Msg("IncrementLoginAttempts")
	entry, exists, fetchErr := repository.GetAuthToken(authToken)
	if fetchErr != nil {
		return fetchErr
	}
	if !exists {
		return errors.New("authToken does not exist")
	}
	entry.LoginAttempts++
	return repository.updateEntry(authToken, entry)
}

func (repository *AzureTableAuthTokenRepository) ResetLoginAttempts(authToken string) error {
	log.Trace().Msg("ResetLoginAttempts")
	entry, exists, fetchErr := repository.GetAuthToken(authToken)
	if fetchErr != nil {
		return fetchErr
	}
	if !exists {
		return errors.New("authToken does not exist")
	}
	entry.LoginAttempts = 0
	entry.WindowStartTimestamp = time.UnixTimestampMs()
	entry.Enabled = true
	return repository.updateEntry(authToken, entry)
}

func (repository *AzureTableAuthTokenRepository) DisableAuthToken(authToken string, durationSeconds uint) error {
	log.Trace().Msg("DisableAuthToken")
	entry, exists, fetchErr := repository.GetAuthToken(authToken)
	if fetchErr != nil {
		return fetchErr
	}
	if !exists {
		return errors.New("authToken does not exist")
	}
	entry.Enabled = false
	entry.ExpiryTimestamp = time.UnixTimestampMs() + time.SecondsToMillis(durationSeconds)
	return repository.updateEntry(authToken, entry)
}

func (repository *AzureTableAuthTokenRepository) GetAuthToken(authToken string) (AuthTokenEntry, bool, error) {
	log.Trace().Msg("GetAuthToken")
	resp, getErr := repository.tableClient.GetEntity(context.Background(), authTokenPartitionKey, authToken, nil)
	if getErr != nil {
		var respErr *azcore.ResponseError
		if errors.As(getErr, &respErr) && respErr.StatusCode == 404 {
			return AuthTokenEntry{}, false, nil
		}
		log.Error().Err(getErr).Msg("error getting auth token entity from table")
		return AuthTokenEntry{}, false, getErr
	}
	var entity authTokenTableEntity
	unmarshalErr := json.Unmarshal(resp.Value, &entity)
	if unmarshalErr != nil {
		log.Error().Err(unmarshalErr).Msg("error unmarshaling auth token entity")
		return AuthTokenEntry{}, false, unmarshalErr
	}
	entry, parseErr := parseAuthTokenEntity(entity)
	if parseErr != nil {
		return AuthTokenEntry{}, false, parseErr
	}
	return entry, true, nil
}

func (repository *AzureTableAuthTokenRepository) updateEntry(authToken string, entry AuthTokenEntry) error {
	entity := authTokenTableEntity{
		PartitionKey:         authTokenPartitionKey,
		RowKey:               authToken,
		Code:                 entry.Code,
		ExpiryTimestamp:      strconv.FormatInt(entry.ExpiryTimestamp, 10),
		LoginAttempts:        strconv.FormatUint(uint64(entry.LoginAttempts), 10),
		WindowStartTimestamp: strconv.FormatInt(entry.WindowStartTimestamp, 10),
		Enabled:              strconv.FormatBool(entry.Enabled),
	}
	entityBytes, marshalErr := json.Marshal(entity)
	if marshalErr != nil {
		log.Error().Err(marshalErr).Msg("error marshaling auth token entity for update")
		return marshalErr
	}
	_, updateErr := repository.tableClient.UpdateEntity(context.Background(), entityBytes, &aztables.UpdateEntityOptions{
		UpdateMode: aztables.UpdateModeMerge,
	})
	if updateErr != nil {
		log.Error().Err(updateErr).Str("authToken", authToken).Msg("error updating auth token entity in table")
		return updateErr
	}
	return nil
}

//
// functions

func NewAzureTableAuthTokenRepository(connStr, tableName string) (*AzureTableAuthTokenRepository, error) {
	log.Trace().Msg("NewAzureTableAuthTokenRepository")
	serviceClient, serviceClientErr := aztables.NewServiceClientFromConnectionString(connStr, nil)
	if serviceClientErr != nil {
		log.Error().Err(serviceClientErr).Msg("error creating azure table service client")
		return nil, serviceClientErr
	}
	return &AzureTableAuthTokenRepository{
		serviceClient: serviceClient,
		tableClient:   serviceClient.NewClient(tableName),
		tableName:     tableName,
	}, nil
}

func parseAuthTokenEntity(entity authTokenTableEntity) (AuthTokenEntry, error) {
	expiry, expiryErr := strconv.ParseInt(entity.ExpiryTimestamp, 10, 64)
	if expiryErr != nil {
		return AuthTokenEntry{}, expiryErr
	}
	attempts, attemptsErr := strconv.ParseUint(entity.LoginAttempts, 10, 64)
	if attemptsErr != nil {
		return AuthTokenEntry{}, attemptsErr
	}
	windowStart, windowErr := strconv.ParseInt(entity.WindowStartTimestamp, 10, 64)
	if windowErr != nil {
		return AuthTokenEntry{}, windowErr
	}
	enabled, enabledErr := strconv.ParseBool(entity.Enabled)
	if enabledErr != nil {
		return AuthTokenEntry{}, enabledErr
	}
	return AuthTokenEntry{
		Token:                entity.RowKey,
		Code:                 entity.Code,
		ExpiryTimestamp:      expiry,
		LoginAttempts:        uint(attempts),
		WindowStartTimestamp: windowStart,
		Enabled:              enabled,
	}, nil
}
