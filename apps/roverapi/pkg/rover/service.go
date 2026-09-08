package rover

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"openintel.jp/roverapi/internal/storage"
	"openintel.jp/roverapi/internal/validation"
)

//
// consts and globals

const (
	intelImageURLExpiry       = time.Hour
	imageUploadURLExpiry      = 10 * time.Minute
)

const (
	maxCommentsPerIntel = 10
)

var (
	ErrEncryptedPayloadRequired = errors.New("encrypted payload is required")
	ErrKeyRequired              = errors.New("key is required")
	ErrGeohashRequired          = errors.New("geohash is required")
	ErrEmailHashRequired        = errors.New("email hash is required")
)

type StorePrivateIntelResult struct {
	RowKey          string
	ImageKey        string
	PresignedPutURL string
}

type GetPrivateIntelResult struct {
	EncryptedPayload string
	HasImage         bool
	ImageURL         string
}

//
// types

type RoverServiceCfg func(service *RoverService) error

type RoverService struct {
	metadataRepository storage.PrivateIntelMetadataRepository
	imageRepository    storage.IntelImageRepository
	commentRepository  storage.PrivateIntelCommentRepository
}

//
// functions

func NewRoverService(cfgs ...RoverServiceCfg) (*RoverService, error) {
	log.Trace().Msg("NewRoverService")
	service := &RoverService{}
	for _, cfg := range cfgs {
		cfgErr := cfg(service)
		if cfgErr != nil {
			log.Error().Err(cfgErr).Msg("error applying rover service config")
			return nil, cfgErr
		}
	}
	return service, nil
}

func WithPrivateMetadataRepository(repo storage.PrivateIntelMetadataRepository) RoverServiceCfg {
	return func(service *RoverService) error {
		service.metadataRepository = repo
		return nil
	}
}

func WithImageRepository(repo storage.IntelImageRepository) RoverServiceCfg {
	return func(service *RoverService) error {
		service.imageRepository = repo
		return nil
	}
}

func WithCommentRepository(repo storage.PrivateIntelCommentRepository) RoverServiceCfg {
	return func(service *RoverService) error {
		service.commentRepository = repo
		return nil
	}
}

//
// methods

func (service *RoverService) StorePrivateIntel(ctx context.Context, intel storage.PrivateIntel) (StorePrivateIntelResult, error) {
	log.Trace().Msg("StorePrivateIntel")
	if validation.IsEmptyStr(intel.Geohash) {
		return StorePrivateIntelResult{}, ErrGeohashRequired
	}
	if validation.IsEmptyStr(intel.EmailHash) {
		return StorePrivateIntelResult{}, ErrEmailHashRequired
	}
	if validation.IsEmptyStr(intel.EncryptedPayload) {
		return StorePrivateIntelResult{}, ErrEncryptedPayloadRequired
	}

	intel.Key = intelDigest(intel.EmailHash, intel.Geohash, intel.TimestampObfuscated)

	var presignedPutURL string
	if intel.HasImage {
		intel.ImageKey = intel.Key
		putURL, urlErr := service.imageRepository.GetIntelImagePresignedPutURL(ctx, intel.Key, imageUploadURLExpiry)
		if urlErr != nil {
			log.Error().Err(urlErr).Str("key", intel.Key).Msg("error generating presigned PUT URL")
			return StorePrivateIntelResult{}, fmt.Errorf("failed to generate image upload URL: %w", urlErr)
		}
		presignedPutURL = putURL
	}

	intelMeta := intel
	intelMeta.Timestamp = 0
	rowKey, storeMetaErr := service.metadataRepository.StorePrivateIntelMetadata(ctx, intelMeta)
	if storeMetaErr != nil {
		if errors.Is(storeMetaErr, storage.ErrIntelAlreadyExists) {
			return StorePrivateIntelResult{RowKey: rowKey}, storage.ErrIntelAlreadyExists
		}
		log.Error().Err(storeMetaErr).Str("key", intel.Key).Msg("error storing intel metadata")
		return StorePrivateIntelResult{}, fmt.Errorf("failed to store metadata: %w", storeMetaErr)
	}
	return StorePrivateIntelResult{
		RowKey:          rowKey,
		ImageKey:        intel.ImageKey,
		PresignedPutURL: presignedPutURL,
	}, nil
}

// GetImageUploadURL issues a presigned PUT URL for an intel's image.
//
// The caller's emailHash and the geohash are required and verified against the metadata
// row before presigning. Without that check any authenticated user holding a rowKey could
// obtain a write URL for another user's image object and overwrite it.
func (service *RoverService) GetImageUploadURL(ctx context.Context, emailHash, geohash, rowKey string) (string, error) {
	log.Trace().Msg("GetImageUploadURL")
	if validation.IsEmptyStr(emailHash) {
		return "", ErrEmailHashRequired
	}
	if validation.IsEmptyStr(geohash) {
		return "", ErrGeohashRequired
	}
	if validation.IsEmptyStr(rowKey) {
		return "", ErrKeyRequired
	}
	if ownershipErr := service.assertIntelOwnedBy(ctx, emailHash, geohash, rowKey); ownershipErr != nil {
		return "", ownershipErr
	}
	imageKey, imageKeyErr := imageKeyFromRowKey(rowKey)
	if imageKeyErr != nil {
		return "", imageKeyErr
	}
	putURL, urlErr := service.imageRepository.GetIntelImagePresignedPutURL(ctx, imageKey, imageUploadURLExpiry)
	if urlErr != nil {
		log.Error().Err(urlErr).Str("rowKey", rowKey).Msg("error generating presigned PUT URL for retry")
		return "", fmt.Errorf("failed to generate image upload URL: %w", urlErr)
	}
	return putURL, nil
}

func (service *RoverService) GetPrivateIntel(ctx context.Context, emailHash, geohash, rowKey string) (GetPrivateIntelResult, error) {
	log.Trace().Msg("GetPrivateIntel")
	if validation.IsEmptyStr(emailHash) {
		return GetPrivateIntelResult{}, ErrEmailHashRequired
	}
	if validation.IsEmptyStr(geohash) {
		return GetPrivateIntelResult{}, ErrGeohashRequired
	}
	if validation.IsEmptyStr(rowKey) {
		return GetPrivateIntelResult{}, ErrKeyRequired
	}
	partitionKey := emailHash + geohash
	intel, getErr := service.metadataRepository.GetPrivateIntelMetadata(ctx, partitionKey, rowKey)
	if getErr != nil {
		log.Error().Err(getErr).Str("rowKey", rowKey).Msg("error getting private intel metadata")
		return GetPrivateIntelResult{}, fmt.Errorf("failed to get intel: %w", getErr)
	}
	hasImage := intel.ImageKey != ""
	result := GetPrivateIntelResult{
		EncryptedPayload: intel.EncryptedPayload,
		HasImage:         hasImage,
	}
	if hasImage {
		imageURL, urlErr := service.imageRepository.GetIntelImagePresignedURL(ctx, intel.ImageKey, intelImageURLExpiry)
		if urlErr != nil {
			log.Error().Err(urlErr).Str("rowKey", rowKey).Msg("error getting intel image URL")
			return GetPrivateIntelResult{}, fmt.Errorf("failed to get image URL: %w", urlErr)
		}
		result.ImageURL = imageURL
	}
	return result, nil
}

func (service *RoverService) GetPrivateIntelImageURL(ctx context.Context, rowKey string) (string, error) {
	log.Trace().Msg("GetPrivateIntelImageURL")
	if validation.IsEmptyStr(rowKey) {
		return "", ErrKeyRequired
	}
	imageKey, imageKeyErr := imageKeyFromRowKey(rowKey)
	if imageKeyErr != nil {
		return "", imageKeyErr
	}
	imageURL, urlErr := service.imageRepository.GetIntelImagePresignedURL(ctx, imageKey, intelImageURLExpiry)
	if urlErr != nil {
		log.Error().Err(urlErr).Str("rowKey", rowKey).Msg("error getting intel image URL")
		return "", fmt.Errorf("failed to get image URL: %w", urlErr)
	}
	return imageURL, nil
}

func (service *RoverService) UpdatePrivateIntel(ctx context.Context, emailHash, geohash, rowKey string, intel storage.PrivateIntel) error {
	log.Trace().Msg("UpdatePrivateIntel")
	if validation.IsEmptyStr(emailHash) {
		return ErrEmailHashRequired
	}
	if validation.IsEmptyStr(geohash) {
		return ErrGeohashRequired
	}
	if validation.IsEmptyStr(rowKey) {
		return ErrKeyRequired
	}
	if validation.IsEmptyStr(intel.EncryptedPayload) {
		return ErrEncryptedPayloadRequired
	}
	partitionKey := emailHash + geohash
	updateErr := service.metadataRepository.UpdatePrivateIntelMetadata(ctx, partitionKey, rowKey, intel)
	if updateErr != nil {
		log.Error().Err(updateErr).Str("rowKey", rowKey).Msg("error updating private intel")
		return fmt.Errorf("failed to update intel: %w", updateErr)
	}
	return nil
}

func (service *RoverService) DeletePrivateIntel(ctx context.Context, emailHash, geohash, rowKey string) error {
	log.Trace().Msg("DeletePrivateIntel")
	if validation.IsEmptyStr(emailHash) {
		return ErrEmailHashRequired
	}
	if validation.IsEmptyStr(geohash) {
		return ErrGeohashRequired
	}
	if validation.IsEmptyStr(rowKey) {
		return ErrKeyRequired
	}

	imageKey, imageKeyErr := imageKeyFromRowKey(rowKey)
	if imageKeyErr != nil {
		return imageKeyErr
	}
	deleteImageErr := service.imageRepository.DeleteIntelImage(ctx, imageKey)
	if deleteImageErr != nil {
		log.Error().Err(deleteImageErr).Str("rowKey", rowKey).Msg("error deleting intel image")
		return fmt.Errorf("failed to delete image: %w", deleteImageErr)
	}

	partitionKey := emailHash + geohash
	deleteMetaErr := service.metadataRepository.DeletePrivateIntelMetadata(ctx, partitionKey, rowKey)
	if deleteMetaErr != nil {
		log.Error().Err(deleteMetaErr).Str("rowKey", rowKey).Msg("error deleting intel metadata")
		return fmt.Errorf("failed to delete metadata: %w", deleteMetaErr)
	}

	deleteCommentsErr := service.commentRepository.DeleteCommentsByIntel(ctx, rowKey)
	if deleteCommentsErr != nil {
		log.Error().Err(deleteCommentsErr).Str("rowKey", rowKey).Msg("error deleting comments for intel")
		return fmt.Errorf("failed to delete comments: %w", deleteCommentsErr)
	}
	return nil
}

func (service *RoverService) ListPrivateIntel(ctx context.Context, emailHash string, geohashes []string) ([]storage.PrivateIntel, error) {
	log.Trace().Msg("ListPrivateIntel")
	if validation.IsEmptyStr(emailHash) {
		return nil, ErrEmailHashRequired
	}
	items, listErr := service.metadataRepository.ListPrivateIntelByGeohashes(ctx, emailHash, geohashes)
	if listErr != nil {
		log.Error().Err(listErr).Msg("error listing private intel")
		return nil, fmt.Errorf("failed to list intel: %w", listErr)
	}
	return items, nil
}

func (service *RoverService) AddComment(ctx context.Context, emailHash, geohash, intelRowKey string, comment storage.PrivateIntelComment) (string, error) {
	log.Trace().Msg("AddComment")
	if validation.IsEmptyStr(emailHash) {
		return "", ErrEmailHashRequired
	}
	if validation.IsEmptyStr(geohash) {
		return "", ErrGeohashRequired
	}
	if validation.IsEmptyStr(intelRowKey) {
		return "", ErrKeyRequired
	}
	if ownershipErr := service.assertIntelOwnedBy(ctx, emailHash, geohash, intelRowKey); ownershipErr != nil {
		return "", ownershipErr
	}
	existing, listErr := service.commentRepository.ListComments(ctx, intelRowKey)
	if listErr != nil {
		log.Error().Err(listErr).Str("intelRowKey", intelRowKey).Msg("error counting comments")
		return "", fmt.Errorf("failed to count comments: %w", listErr)
	}
	if len(existing) >= maxCommentsPerIntel {
		return "", storage.ErrTooManyComments
	}
	rowKey, addErr := service.commentRepository.AddComment(ctx, comment)
	if addErr != nil {
		log.Error().Err(addErr).Str("intelRowKey", intelRowKey).Msg("error adding comment")
		return "", fmt.Errorf("failed to add comment: %w", addErr)
	}
	return rowKey, nil
}

// ListComments returns the comment thread for an intel.
//
// Comments are partitioned by intel rowKey alone, so ownership is not structural here —
// it must be proven against the intel metadata row first. Without that check any
// authenticated user holding a rowKey could read another user's comment ciphertext,
// author hashes and geohash.
func (service *RoverService) ListComments(ctx context.Context, emailHash, geohash, intelRowKey string) ([]storage.PrivateIntelComment, error) {
	log.Trace().Msg("ListComments")
	if validation.IsEmptyStr(emailHash) {
		return nil, ErrEmailHashRequired
	}
	if validation.IsEmptyStr(geohash) {
		return nil, ErrGeohashRequired
	}
	if validation.IsEmptyStr(intelRowKey) {
		return nil, ErrKeyRequired
	}
	if ownershipErr := service.assertIntelOwnedBy(ctx, emailHash, geohash, intelRowKey); ownershipErr != nil {
		return nil, ownershipErr
	}
	items, listErr := service.commentRepository.ListComments(ctx, intelRowKey)
	if listErr != nil {
		log.Error().Err(listErr).Str("intelRowKey", intelRowKey).Msg("error listing comments")
		return nil, fmt.Errorf("failed to list comments: %w", listErr)
	}
	return items, nil
}

// assertIntelOwnedBy verifies that the intel identified by rowKey lives in the caller's
// partition. Intel is partitioned by emailHash+geohash, so a successful lookup is proof
// of ownership; a miss returns storage.ErrNotFound so callers can respond 404 rather than
// 403 and avoid confirming that another user's intel exists.
func (service *RoverService) assertIntelOwnedBy(ctx context.Context, emailHash, geohash, rowKey string) error {
	partitionKey := emailHash + geohash
	_, getErr := service.metadataRepository.GetPrivateIntelMetadata(ctx, partitionKey, rowKey)
	if getErr != nil {
		log.Warn().Err(getErr).Str("rowKey", rowKey).Msg("intel not found in caller's partition - denying access")
		return getErr
	}
	return nil
}

func intelDigest(emailHash, geohash string, obfuscatedTs int64) string {
	h := sha256.Sum256([]byte(fmt.Sprintf("%s|%s|%d", emailHash, geohash, obfuscatedTs)))
	return fmt.Sprintf("%x", h[:16])
}

// imageKeyFromRowKey derives the S3 image key from the RowKey.
// RowKey format: {20-digit-padded-ts}-{digest} — splits on first dash, digest suffix becomes image key.
func imageKeyFromRowKey(rowKey string) (string, error) {
	parts := strings.SplitN(rowKey, "-", 2)
	if len(parts) != 2 || parts[1] == "" {
		return "", fmt.Errorf("invalid rowKey format: %s", rowKey)
	}
	return parts[1], nil
}
