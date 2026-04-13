package storage

import (
	"context"
	"time"
)

//
// types

type PrivateIntel struct {
	Key                 string
	Geohash             string
	EmailHash           string
	TimestampObfuscated int64
	EncryptedPayload    string
	ImageKey            string
	// transient fields — populated during store, not persisted in table
	Image     string
	Timestamp int64
}

type PrivateIntelMetadataRepository interface {
	Initialize(ctx context.Context) error
	StorePrivateIntelMetadata(ctx context.Context, intel PrivateIntel) (string, error)
	GetPrivateIntelMetadata(ctx context.Context, partitionKey, rowKey string) (PrivateIntel, error)
	UpdatePrivateIntelMetadata(ctx context.Context, partitionKey, rowKey string, intel PrivateIntel) error
	DeletePrivateIntelMetadata(ctx context.Context, partitionKey, rowKey string) error
	ListPrivateIntelByGeohashes(ctx context.Context, emailHash string, geohashes []string) ([]PrivateIntel, error)
}

type IntelImageRepository interface {
	Initialize(ctx context.Context) error
	StoreIntelImage(ctx context.Context, key string, imageData []byte) error
	GetIntelImage(ctx context.Context, key string) ([]byte, error)
	GetIntelImagePresignedURL(ctx context.Context, key string, expiry time.Duration) (string, error)
	DeleteIntelImage(ctx context.Context, key string) error
}
