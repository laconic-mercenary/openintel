package rover

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/rs/zerolog/log"
	"openintel.jp/roverapi/internal/geo"
	"openintel.jp/roverapi/internal/storage"
	"openintel.jp/roverapi/internal/validation"
)

//
// consts and globals

const (
	intelImageURLExpiry = time.Hour
)

var (
	ErrImageOrDescriptionRequired = errors.New("at least one of image or description is required")
	ErrKeyRequired                = errors.New("key is required")
	ErrGeohashRequired            = errors.New("geohash is required")
	ErrInvalidLatitude            = errors.New("invalid latitude")
	ErrInvalidLongitude           = errors.New("invalid longitude")
)

//
// types

type RoverServiceCfg func(service *RoverService) error

type RoverService struct {
	metadataRepository storage.IntelMetadataRepository
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

func WithMetadataRepository(repo storage.IntelMetadataRepository) RoverServiceCfg {
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

func (service *RoverService) StoreIntel(ctx context.Context, intel storage.Intel) (string, error) {
	log.Trace().Msg("StoreIntel")

	noImage := validation.IsEmptyStr(intel.Image)
	noDescription := validation.IsEmptyStr(intel.Description)

	if noImage && noDescription {
		return "", ErrImageOrDescriptionRequired
	}
	if validation.IsEmptyStr(intel.Key) {
		return "", ErrKeyRequired
	}
	if !validation.IsValidLatitude(intel.Latitude) {
		return "", ErrInvalidLatitude
	}
	if !validation.IsValidLongitude(intel.Longitude) {
		return "", ErrInvalidLongitude
	}

	geohash := geo.Geohash(intel.Latitude, intel.Longitude)
	intel.Geohash = geohash

	if !noImage {
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
		intel.ImageKey = intel.Key + ".jpg"
	}

	intelMeta := intel
	intelMeta.Image = ""
	storeMetaErr := service.metadataRepository.StoreIntelMetadata(ctx, intelMeta)
	if storeMetaErr != nil {
		log.Error().Err(storeMetaErr).Str("key", intel.Key).Msg("error storing intel metadata")
		return "", fmt.Errorf("failed to store metadata: %w", storeMetaErr)
	}
	return geohash, nil
}

func (service *RoverService) GetIntelImageURL(ctx context.Context, key string) (string, error) {
	log.Trace().Msg("GetIntelImageURL")
	if validation.IsEmptyStr(key) {
		return "", ErrKeyRequired
	}
	url, urlErr := service.imageRepository.GetIntelImagePresignedURL(ctx, key, intelImageURLExpiry)
	if urlErr != nil {
		log.Error().Err(urlErr).Str("key", key).Msg("error getting intel image URL")
		return "", fmt.Errorf("failed to get image URL: %w", urlErr)
	}
	return url, nil
}

func (service *RoverService) DeleteIntel(ctx context.Context, geohash, key string) error {
	log.Trace().Msg("DeleteIntel")
	if validation.IsEmptyStr(geohash) {
		return ErrGeohashRequired
	}
	if validation.IsEmptyStr(key) {
		return ErrKeyRequired
	}
	deleteImageErr := service.imageRepository.DeleteIntelImage(ctx, key)
	if deleteImageErr != nil {
		log.Error().Err(deleteImageErr).Str("key", key).Msg("error deleting intel image")
		return fmt.Errorf("failed to delete image: %w", deleteImageErr)
	}
	deleteMetaErr := service.metadataRepository.DeleteIntelMetadata(ctx, geohash, key)
	if deleteMetaErr != nil {
		log.Error().Err(deleteMetaErr).Str("key", key).Msg("error deleting intel metadata")
		return fmt.Errorf("failed to delete metadata: %w", deleteMetaErr)
	}
	return nil
}
