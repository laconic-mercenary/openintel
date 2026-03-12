package storage

import (
	"context"
	"time"
)

//
// types

type Intel struct {
	Key         string
	Geohash     string
	Image       string
	ImageKey    string
	Description string
	Latitude    float64
	Longitude   float64
	Accuracy    float64
	Timestamp   int64
}

type IntelMetadataRepository interface {
	Initialize(ctx context.Context) error
	StoreIntelMetadata(ctx context.Context, intel Intel) error
	GetIntelMetadata(ctx context.Context, geohash, key string) (Intel, error)
	DeleteIntelMetadata(ctx context.Context, geohash, key string) error
}

type IntelImageRepository interface {
	Initialize(ctx context.Context) error
	StoreIntelImage(ctx context.Context, key string, imageData []byte) error
	GetIntelImage(ctx context.Context, key string) ([]byte, error)
	GetIntelImagePresignedURL(ctx context.Context, key string, expiry time.Duration) (string, error)
	DeleteIntelImage(ctx context.Context, key string) error
}
