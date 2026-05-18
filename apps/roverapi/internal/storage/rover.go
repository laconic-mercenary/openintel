package storage

import (
	"context"
	"errors"
	"time"
)

//
// consts and globals

var (
	ErrNotFound            = errors.New("not found")
	ErrTooManyComments     = errors.New("comment limit reached")
	ErrCommentInvalid      = errors.New("comment is invalid")
	ErrIntelAlreadyExists  = errors.New("intel already exists")
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
	HasImage  bool
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

type PrivateIntelComment struct {
	RowKey        string
	IntelRowKey   string
	AuthorHash    string
	EncryptedText string
	Geohash       string
	CreatedAt     int64
}

type PrivateIntelCommentRepository interface {
	Initialize(ctx context.Context) error
	AddComment(ctx context.Context, comment PrivateIntelComment) (string, error)
	ListComments(ctx context.Context, intelRowKey string) ([]PrivateIntelComment, error)
	DeleteCommentsByIntel(ctx context.Context, intelRowKey string) error
}

type IntelImageRepository interface {
	Initialize(ctx context.Context) error
	StoreIntelImage(ctx context.Context, key string, imageData []byte) error
	GetIntelImage(ctx context.Context, key string) ([]byte, error)
	GetIntelImagePresignedURL(ctx context.Context, key string, expiry time.Duration) (string, error)
	GetIntelImagePresignedPutURL(ctx context.Context, key string, expiry time.Duration) (string, error)
	DeleteIntelImage(ctx context.Context, key string) error
}
