package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/data/aztables"
	"github.com/rs/zerolog/log"
)

//
// types

type intelTableEntity struct {
	PartitionKey   string `json:"PartitionKey"`
	RowKey         string `json:"RowKey"`
	Description    string `json:"Description"`
	Latitude       string `json:"Latitude"`
	Longitude      string `json:"Longitude"`
	Accuracy       string `json:"Accuracy"`
	IntelTimestamp string `json:"IntelTimestamp"`
	ImageKey       string `json:"ImageKey"`
}

type AzureTableIntelRepository struct {
	serviceClient *aztables.ServiceClient
	tableClient   *aztables.Client
	tableName     string
}

//
// functions

func NewAzureTableIntelRepository(connStr, tableName string) (*AzureTableIntelRepository, error) {
	log.Trace().Msg("NewAzureTableIntelRepository")
	serviceClient, serviceClientErr := aztables.NewServiceClientFromConnectionString(connStr, nil)
	if serviceClientErr != nil {
		log.Error().Err(serviceClientErr).Msg("error creating azure table service client")
		return nil, serviceClientErr
	}
	return &AzureTableIntelRepository{
		serviceClient: serviceClient,
		tableClient:   serviceClient.NewClient(tableName),
		tableName:     tableName,
	}, nil
}

//
// methods

func (repository *AzureTableIntelRepository) Initialize(ctx context.Context) error {
	log.Trace().Msg("Initialize")
	_, createErr := repository.serviceClient.CreateTable(ctx, repository.tableName, nil)
	if createErr != nil {
		var respErr *azcore.ResponseError
		if errors.As(createErr, &respErr) && respErr.ErrorCode == "TableAlreadyExists" {
			return nil
		}
		log.Error().Err(createErr).Str("tableName", repository.tableName).Msg("error creating table")
		return createErr
	}
	return nil
}

func (repository *AzureTableIntelRepository) StoreIntelMetadata(ctx context.Context, intel Intel) error {
	log.Trace().Msg("StoreIntelMetadata")
	entity := intelTableEntity{
		PartitionKey:   intel.Geohash,
		RowKey:         intel.Key,
		Description:    intel.Description,
		Latitude:       strconv.FormatFloat(intel.Latitude, 'f', -1, 64),
		Longitude:      strconv.FormatFloat(intel.Longitude, 'f', -1, 64),
		Accuracy:       strconv.FormatFloat(intel.Accuracy, 'f', -1, 64),
		IntelTimestamp: strconv.FormatInt(intel.Timestamp, 10),
		ImageKey:       intel.ImageKey,
	}
	entityBytes, marshalErr := json.Marshal(entity)
	if marshalErr != nil {
		log.Error().Err(marshalErr).Msg("error marshaling intel entity")
		return marshalErr
	}
	_, addErr := repository.tableClient.AddEntity(ctx, entityBytes, nil)
	if addErr != nil {
		log.Error().Err(addErr).Str("key", intel.Key).Msg("error adding intel entity to table")
		return addErr
	}
	return nil
}

func (repository *AzureTableIntelRepository) GetIntelMetadata(ctx context.Context, geohash, key string) (Intel, error) {
	log.Trace().Msg("GetIntelMetadata")
	resp, getErr := repository.tableClient.GetEntity(ctx, geohash, key, nil)
	if getErr != nil {
		log.Error().Err(getErr).Str("key", key).Msg("error getting intel entity from table")
		return Intel{}, getErr
	}
	var entity intelTableEntity
	unmarshalErr := json.Unmarshal(resp.Value, &entity)
	if unmarshalErr != nil {
		log.Error().Err(unmarshalErr).Str("key", key).Msg("error unmarshaling intel entity")
		return Intel{}, unmarshalErr
	}
	return parseIntelEntity(entity)
}

func (repository *AzureTableIntelRepository) DeleteIntelMetadata(ctx context.Context, geohash, key string) error {
	log.Trace().Msg("DeleteIntelMetadata")
	etag := azcore.ETag("*")
	_, deleteErr := repository.tableClient.DeleteEntity(ctx, geohash, key, &aztables.DeleteEntityOptions{
		IfMatch: &etag,
	})
	if deleteErr != nil {
		log.Error().Err(deleteErr).Str("key", key).Msg("error deleting intel entity from table")
		return deleteErr
	}
	return nil
}

func parseIntelEntity(entity intelTableEntity) (Intel, error) {
	latitude, latErr := strconv.ParseFloat(entity.Latitude, 64)
	if latErr != nil {
		return Intel{}, fmt.Errorf("invalid latitude in table: %w", latErr)
	}
	longitude, lonErr := strconv.ParseFloat(entity.Longitude, 64)
	if lonErr != nil {
		return Intel{}, fmt.Errorf("invalid longitude in table: %w", lonErr)
	}
	accuracy, accErr := strconv.ParseFloat(entity.Accuracy, 64)
	if accErr != nil {
		return Intel{}, fmt.Errorf("invalid accuracy in table: %w", accErr)
	}
	timestamp, tsErr := strconv.ParseInt(entity.IntelTimestamp, 10, 64)
	if tsErr != nil {
		return Intel{}, fmt.Errorf("invalid timestamp in table: %w", tsErr)
	}
	return Intel{
		Key:         entity.RowKey,
		Geohash:     entity.PartitionKey,
		Description: entity.Description,
		Latitude:    latitude,
		Longitude:   longitude,
		Accuracy:    accuracy,
		Timestamp:   timestamp,
		ImageKey:    entity.ImageKey,
	}, nil
}
