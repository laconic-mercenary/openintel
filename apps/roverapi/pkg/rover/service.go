package rover

import (
	"context"
	"encoding/base64"
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
	intelImageURLExpiry = time.Hour
)

var (
	ErrEncryptedPayloadRequired = errors.New("encrypted payload is required")
	ErrKeyRequired              = errors.New("key is required")
	ErrGeohashRequired          = errors.New("geohash is required")
	ErrEmailHashRequired        = errors.New("email hash is required")
)

//
// types

type RoverServiceCfg func(service *RoverService) error

type RoverService struct {
	metadataRepository storage.PrivateIntelMetadataRepository
	imageRepository    storage.IntelImageRepository
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

//
// methods

func (service *RoverService) StorePrivateIntel(ctx context.Context, intel storage.PrivateIntel) (string, error) {
	log.Trace().Msg("StorePrivateIntel")
	if validation.IsEmptyStr(intel.Key) {
		return "", ErrKeyRequired
	}
	if validation.IsEmptyStr(intel.Geohash) {
		return "", ErrGeohashRequired
	}
	if validation.IsEmptyStr(intel.EmailHash) {
		return "", ErrEmailHashRequired
	}
	if validation.IsEmptyStr(intel.EncryptedPayload) && validation.IsEmptyStr(intel.Image) {
		return "", ErrEncryptedPayloadRequired
	}

	if !validation.IsEmptyStr(intel.Image) {
		imageData, decodeErr := base64.StdEncoding.DecodeString(intel.Image)
		if decodeErr != nil {
			log.Error().Err(decodeErr).Str("key", intel.Key).Msg("error decoding image data")
			return "", fmt.Errorf("invalid image data: %w", decodeErr)
		}
		storeImageErr := service.imageRepository.StoreIntelImage(ctx, intel.Key, imageData)
		if storeImageErr != nil {
			log.Error().Err(storeImageErr).Str("key", intel.Key).Msg("error storing intel image")
			return "", fmt.Errorf("failed to store image: %w", storeImageErr)
		}
		intel.ImageKey = intel.Key
	}

	intelMeta := intel
	intelMeta.Image = ""
	intelMeta.Timestamp = 0
	rowKey, storeMetaErr := service.metadataRepository.StorePrivateIntelMetadata(ctx, intelMeta)
	if storeMetaErr != nil {
		log.Error().Err(storeMetaErr).Str("key", intel.Key).Msg("error storing intel metadata")
		return "", fmt.Errorf("failed to store metadata: %w", storeMetaErr)
	}
	return rowKey, nil
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

// imageKeyFromRowKey derives the S3 image key from the RowKey.
// RowKey format: {20-digit-padded-ts}-{uuid} — splits on first dash, uuid suffix becomes image key base.
func imageKeyFromRowKey(rowKey string) (string, error) {
	parts := strings.SplitN(rowKey, "-", 2)
	if len(parts) != 2 || parts[1] == "" {
		return "", fmt.Errorf("invalid rowKey format: %s", rowKey)
	}
	return parts[1], nil
}
