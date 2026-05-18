package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/data/aztables"
	"github.com/rs/zerolog/log"
)

//
// consts and globals

const (
	tableErrResourceNotFound  = "ResourceNotFound"
	tableErrEntityAlreadyExists = "EntityAlreadyExists"
)

//
// types

type intelTableEntity struct {
	PartitionKey        string `json:"PartitionKey"`
	RowKey              string `json:"RowKey"`
	TimestampObfuscated int64  `json:"TimestampObfuscated"`
	EncryptedPayload    string `json:"EncryptedPayload"`
	ImageKey            string `json:"ImageKey"`
}

type intelTableEntityUpdate struct {
	PartitionKey     string `json:"PartitionKey"`
	RowKey           string `json:"RowKey"`
	EncryptedPayload string `json:"EncryptedPayload"`
}

type AZPrivateIntelRepository struct {
	serviceClient *aztables.ServiceClient
	tableClient   *aztables.Client
	tableName     string
	secretBase    int64
}

//
// functions

func NewAZPrivateIntelRepository(connStr, tableName string, secretBase int64) (*AZPrivateIntelRepository, error) {
	log.Trace().Msg("NewAZPrivateIntelRepository")
	serviceClient, serviceClientErr := aztables.NewServiceClientFromConnectionString(connStr, nil)
	if serviceClientErr != nil {
		log.Error().Err(serviceClientErr).Msg("error creating azure table service client")
		return nil, serviceClientErr
	}
	return &AZPrivateIntelRepository{
		serviceClient: serviceClient,
		tableClient:   serviceClient.NewClient(tableName),
		tableName:     tableName,
		secretBase:    secretBase,
	}, nil
}

//
// methods

func (repository *AZPrivateIntelRepository) Initialize(ctx context.Context) error {
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

func (repository *AZPrivateIntelRepository) StorePrivateIntelMetadata(ctx context.Context, intel PrivateIntel) (string, error) {
	log.Trace().Msg("StorePrivateIntelMetadata")
	partitionKey := intel.EmailHash + intel.Geohash
	rowKey := fmt.Sprintf("%020d-%s", repository.secretBase-intel.TimestampObfuscated, intel.Key)
	entity := intelTableEntity{
		PartitionKey:        partitionKey,
		RowKey:              rowKey,
		TimestampObfuscated: intel.TimestampObfuscated,
		EncryptedPayload:    intel.EncryptedPayload,
		ImageKey:            intel.ImageKey,
	}
	entityBytes, marshalErr := json.Marshal(entity)
	if marshalErr != nil {
		log.Error().Err(marshalErr).Msg("error marshaling intel entity")
		return "", marshalErr
	}
	_, addErr := repository.tableClient.AddEntity(ctx, entityBytes, nil)
	if addErr != nil {
		var respErr *azcore.ResponseError
		if errors.As(addErr, &respErr) && respErr.ErrorCode == tableErrEntityAlreadyExists {
			log.Debug().Str("rowKey", rowKey).Msg("intel already exists")
			return rowKey, ErrIntelAlreadyExists
		}
		log.Error().Err(addErr).Str("key", intel.Key).Msg("error adding intel entity to table")
		return "", addErr
	}
	return rowKey, nil
}

func (repository *AZPrivateIntelRepository) GetPrivateIntelMetadata(ctx context.Context, partitionKey, rowKey string) (PrivateIntel, error) {
	log.Trace().Msg("GetPrivateIntelMetadata")
	resp, getErr := repository.tableClient.GetEntity(ctx, partitionKey, rowKey, nil)
	if getErr != nil {
		var respErr *azcore.ResponseError
		if errors.As(getErr, &respErr) && respErr.ErrorCode == tableErrResourceNotFound {
			return PrivateIntel{}, ErrNotFound
		}
		log.Error().Err(getErr).Str("partitionKey", partitionKey).Str("rowKey", rowKey).Msg("error getting intel entity from table")
		return PrivateIntel{}, getErr
	}
	var entity intelTableEntity
	unmarshalErr := json.Unmarshal(resp.Value, &entity)
	if unmarshalErr != nil {
		log.Error().Err(unmarshalErr).Str("rowKey", rowKey).Msg("error unmarshaling intel entity")
		return PrivateIntel{}, unmarshalErr
	}
	return entityToPrivateIntel(entity), nil
}

func (repository *AZPrivateIntelRepository) UpdatePrivateIntelMetadata(ctx context.Context, partitionKey, rowKey string, intel PrivateIntel) error {
	log.Trace().Msg("UpdatePrivateIntelMetadata")
	entity := intelTableEntityUpdate{
		PartitionKey:     partitionKey,
		RowKey:           rowKey,
		EncryptedPayload: intel.EncryptedPayload,
	}
	entityBytes, marshalErr := json.Marshal(entity)
	if marshalErr != nil {
		log.Error().Err(marshalErr).Msg("error marshaling intel entity for update")
		return marshalErr
	}
	_, updateErr := repository.tableClient.UpdateEntity(ctx, entityBytes, &aztables.UpdateEntityOptions{
		UpdateMode: aztables.UpdateModeMerge,
	})
	if updateErr != nil {
		log.Error().Err(updateErr).Str("partitionKey", partitionKey).Str("rowKey", rowKey).Msg("error updating intel entity in table")
		return updateErr
	}
	return nil
}

func (repository *AZPrivateIntelRepository) DeletePrivateIntelMetadata(ctx context.Context, partitionKey, rowKey string) error {
	log.Trace().Msg("DeletePrivateIntelMetadata")
	etag := azcore.ETag("*")
	_, deleteErr := repository.tableClient.DeleteEntity(ctx, partitionKey, rowKey, &aztables.DeleteEntityOptions{
		IfMatch: &etag,
	})
	if deleteErr != nil {
		var respErr *azcore.ResponseError
		if errors.As(deleteErr, &respErr) && respErr.ErrorCode == tableErrResourceNotFound {
			return fmt.Errorf("%w", ErrNotFound)
		}
		log.Error().Err(deleteErr).Str("partitionKey", partitionKey).Str("rowKey", rowKey).Msg("error deleting intel entity from table")
		return deleteErr
	}
	return nil
}

func (repository *AZPrivateIntelRepository) ListPrivateIntelByGeohashes(ctx context.Context, emailHash string, geohashes []string) ([]PrivateIntel, error) {
	log.Trace().Msg("ListPrivateIntelByGeohashes")

	type queryResult struct {
		items []PrivateIntel
		err   error
	}

	results := make(chan queryResult, len(geohashes))

	for _, geohash := range geohashes {
		go func(gh string) {
			partitionKey := emailHash + gh
			items, queryErr := repository.queryPartition(ctx, partitionKey)
			results <- queryResult{items, queryErr}
		}(geohash)
	}

	var all []PrivateIntel
	var firstErr error
	for range geohashes {
		r := <-results
		if r.err != nil && firstErr == nil {
			firstErr = r.err
		}
		all = append(all, r.items...)
	}
	if firstErr != nil {
		log.Error().Err(firstErr).Msg("error querying one or more geohash partitions")
		return nil, firstErr
	}
	return all, nil
}

func (repository *AZPrivateIntelRepository) queryPartition(ctx context.Context, partitionKey string) ([]PrivateIntel, error) {
	filter := fmt.Sprintf("PartitionKey eq '%s'", partitionKey)
	pager := repository.tableClient.NewListEntitiesPager(&aztables.ListEntitiesOptions{
		Filter: &filter,
	})
	var items []PrivateIntel
	for pager.More() {
		page, pageErr := pager.NextPage(ctx)
		if pageErr != nil {
			log.Error().Err(pageErr).Str("partitionKey", partitionKey).Msg("error listing intel entities")
			return nil, pageErr
		}
		for _, entityBytes := range page.Entities {
			var entity intelTableEntity
			unmarshalErr := json.Unmarshal(entityBytes, &entity)
			if unmarshalErr != nil {
				log.Error().Err(unmarshalErr).Msg("error unmarshaling intel entity in list")
				return nil, unmarshalErr
			}
			items = append(items, entityToPrivateIntel(entity))
		}
	}
	return items, nil
}

func entityToPrivateIntel(entity intelTableEntity) PrivateIntel {
	const emailHashLen = 64 // HMAC-SHA256 hex = 64 chars
	geohash := ""
	emailHash := ""
	if len(entity.PartitionKey) > emailHashLen {
		emailHash = entity.PartitionKey[:emailHashLen]
		geohash = entity.PartitionKey[emailHashLen:]
	}
	return PrivateIntel{
		Key:                 entity.RowKey,
		Geohash:             geohash,
		EmailHash:           emailHash,
		TimestampObfuscated: entity.TimestampObfuscated,
		EncryptedPayload:    entity.EncryptedPayload,
		ImageKey:            entity.ImageKey,
	}
}
