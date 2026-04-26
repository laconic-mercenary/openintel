package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	gotime "time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/data/aztables"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"openintel.jp/roverapi/internal/validation"
)

//
// consts and globals

const (
	authorHashLen       = 64   // HMAC-SHA256 hex = 32 bytes = 64 chars
	maxEncryptedTextLen = 2048 // base64 of 300-char AES-GCM encrypted text with headroom for multibyte UTF-8
)

//
// types

type commentTableEntity struct {
	PartitionKey  string `json:"PartitionKey"`
	RowKey        string `json:"RowKey"`
	AuthorHash    string `json:"AuthorHash"`
	EncryptedText string `json:"EncryptedText"`
	Geohash       string `json:"Geohash"`
	CreatedAt     int64  `json:"CreatedAt"`
}

type AZPrivateIntelCommentRepository struct {
	serviceClient *aztables.ServiceClient
	tableClient   *aztables.Client
	tableName     string
}

//
// functions

func NewAZPrivateIntelCommentRepository(connStr, tableName string) (*AZPrivateIntelCommentRepository, error) {
	log.Trace().Msg("NewAZPrivateIntelCommentRepository")
	serviceClient, serviceClientErr := aztables.NewServiceClientFromConnectionString(connStr, nil)
	if serviceClientErr != nil {
		log.Error().Err(serviceClientErr).Msg("error creating azure table service client for comments")
		return nil, serviceClientErr
	}
	return &AZPrivateIntelCommentRepository{
		serviceClient: serviceClient,
		tableClient:   serviceClient.NewClient(tableName),
		tableName:     tableName,
	}, nil
}

func validateComment(comment PrivateIntelComment) error {
	if !validation.IsValidIntelRowKey(comment.IntelRowKey) {
		return ErrCommentInvalid
	}
	if len(comment.AuthorHash) != authorHashLen {
		return ErrCommentInvalid
	}
	if !validation.IsValidGeohash5(comment.Geohash) {
		return ErrCommentInvalid
	}
	if len(comment.EncryptedText) == 0 || len(comment.EncryptedText) > maxEncryptedTextLen {
		return ErrCommentInvalid
	}
	return nil
}

//
// methods

func (repository *AZPrivateIntelCommentRepository) Initialize(ctx context.Context) error {
	log.Trace().Msg("Initialize")
	_, createErr := repository.serviceClient.CreateTable(ctx, repository.tableName, nil)
	if createErr != nil {
		var respErr *azcore.ResponseError
		if errors.As(createErr, &respErr) && respErr.ErrorCode == tableErrAlreadyExists {
			return nil
		}
		log.Error().Err(createErr).Str("tableName", repository.tableName).Msg("error creating comments table")
		return createErr
	}
	return nil
}

func (repository *AZPrivateIntelCommentRepository) AddComment(ctx context.Context, comment PrivateIntelComment) (string, error) {
	log.Trace().Msg("AddComment")
	if validateErr := validateComment(comment); validateErr != nil {
		return "", validateErr
	}
	rowKey := uuid.New().String()
	entity := commentTableEntity{
		PartitionKey:  comment.IntelRowKey,
		RowKey:        rowKey,
		AuthorHash:    comment.AuthorHash,
		EncryptedText: comment.EncryptedText,
		Geohash:       comment.Geohash,
		CreatedAt:     gotime.Now().UnixMilli(),
	}
	entityBytes, marshalErr := json.Marshal(entity)
	if marshalErr != nil {
		log.Error().Err(marshalErr).Msg("error marshaling comment entity")
		return "", marshalErr
	}
	_, addErr := repository.tableClient.AddEntity(ctx, entityBytes, nil)
	if addErr != nil {
		log.Error().Err(addErr).Str("intelRowKey", comment.IntelRowKey).Msg("error adding comment entity to table")
		return "", addErr
	}
	return rowKey, nil
}

func (repository *AZPrivateIntelCommentRepository) DeleteCommentsByIntel(ctx context.Context, intelRowKey string) error {
	log.Trace().Msg("DeleteCommentsByIntel")
	if !validation.IsValidIntelRowKey(intelRowKey) {
		return ErrCommentInvalid
	}
	comments, listErr := repository.ListComments(ctx, intelRowKey)
	if listErr != nil {
		log.Error().Err(listErr).Str("intelRowKey", intelRowKey).Msg("error listing comments for deletion")
		return listErr
	}
	etag := azcore.ETag("*")
	for _, comment := range comments {
		_, deleteErr := repository.tableClient.DeleteEntity(ctx, intelRowKey, comment.RowKey, &aztables.DeleteEntityOptions{
			IfMatch: &etag,
		})
		if deleteErr != nil {
			var respErr *azcore.ResponseError
			if errors.As(deleteErr, &respErr) && respErr.ErrorCode == tableErrResourceNotFound {
				continue
			}
			log.Error().Err(deleteErr).Str("rowKey", comment.RowKey).Msg("error deleting comment entity")
			return deleteErr
		}
	}
	return nil
}

func (repository *AZPrivateIntelCommentRepository) ListComments(ctx context.Context, intelRowKey string) ([]PrivateIntelComment, error) {
	log.Trace().Msg("ListComments")
	if !validation.IsValidIntelRowKey(intelRowKey) {
		return nil, ErrCommentInvalid
	}
	filter := fmt.Sprintf("PartitionKey eq '%s'", intelRowKey)
	pager := repository.tableClient.NewListEntitiesPager(&aztables.ListEntitiesOptions{
		Filter: &filter,
	})
	var items []PrivateIntelComment
	for pager.More() {
		page, pageErr := pager.NextPage(ctx)
		if pageErr != nil {
			log.Error().Err(pageErr).Str("intelRowKey", intelRowKey).Msg("error listing comment entities")
			return nil, pageErr
		}
		for _, entityBytes := range page.Entities {
			var entity commentTableEntity
			unmarshalErr := json.Unmarshal(entityBytes, &entity)
			if unmarshalErr != nil {
				log.Error().Err(unmarshalErr).Msg("error unmarshaling comment entity")
				return nil, unmarshalErr
			}
			comment := PrivateIntelComment{
				RowKey:        entity.RowKey,
				IntelRowKey:   entity.PartitionKey,
				AuthorHash:    entity.AuthorHash,
				EncryptedText: entity.EncryptedText,
				Geohash:       entity.Geohash,
				CreatedAt:     entity.CreatedAt,
			}
			if validateErr := validateComment(comment); validateErr != nil {
				log.Warn().Str("rowKey", entity.RowKey).Msg("skipping malformed comment entity from table")
				continue
			}
			items = append(items, comment)
		}
	}
	return items, nil
}
