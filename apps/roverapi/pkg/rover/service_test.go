package rover

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"openintel.jp/roverapi/internal/storage"
	"openintel.jp/roverapi/internal/validation"
)

// rowKeyFmt mirrors AZPrivateIntelRepository.StorePrivateIntelMetadata, which builds
// the rowKey as fmt.Sprintf("%020d-%s", secretBase-timestampObfuscated, intel.Key).
const rowKeyFmt = "%020d-%s"

// secretBaseDefault matches ROVERAPI_ROVER_TIMESTAMP_SECRET_BASE in apps/test/docker-compose.yml.
const secretBaseDefault int64 = 9999999999999999

// TestGeneratedRowKeysAreValid is a round-trip contract between the code that generates
// rowKeys and the code that validates them. IsValidIntelRowKey is deliberately strict
// because rowKeys reach OData filters as string literals; this test guards against that
// strictness rejecting keys the service itself produces, which would break every read,
// update, delete and comment operation on affected intel.
func TestGeneratedRowKeysAreValid(t *testing.T) {
	emailHash := "5f3c9a1b2d4e6f8a0c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a"
	now := time.Now().UnixMilli()

	for i := range 2000 {
		obfuscatedTs := now + int64(i)*7919

		digestKey := fmt.Sprintf(rowKeyFmt, secretBaseDefault-obfuscatedTs, intelDigest(emailHash, "xn76u", obfuscatedTs))
		if !validation.IsValidIntelRowKey(digestKey) {
			t.Fatalf("generated digest rowKey rejected by validator: %q", digestKey)
		}

		legacyKey := fmt.Sprintf(rowKeyFmt, secretBaseDefault-obfuscatedTs, uuid.New().String())
		if !validation.IsValidIntelRowKey(legacyKey) {
			t.Fatalf("generated legacy uuid rowKey rejected by validator: %q", legacyKey)
		}
	}
}

// TestIntelDigestIsStable pins the properties the rowKey format depends on: the digest
// is 32 lowercase hex characters and is deterministic for the same inputs. The
// determinism is what makes a duplicate store return 409 instead of writing a second row.
func TestIntelDigestIsStable(t *testing.T) {
	const wantLen = 32
	emailHash := "5f3c9a1b2d4e6f8a0c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a"

	first := intelDigest(emailHash, "xn76u", 1750000000000)
	second := intelDigest(emailHash, "xn76u", 1750000000000)
	if first != second {
		t.Errorf("intelDigest is not deterministic: %q != %q", first, second)
	}
	if len(first) != wantLen {
		t.Errorf("intelDigest length = %d, want %d", len(first), wantLen)
	}
	for i := range len(first) {
		c := first[i]
		isHex := (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')
		if !isHex {
			t.Errorf("intelDigest produced non lowercase-hex byte %q at %d in %q", c, i, first)
			break
		}
	}

	different := intelDigest(emailHash, "xn76u", 1750000000001)
	if first == different {
		t.Errorf("intelDigest collided across timestamps: %q", first)
	}
}

//
// fakes for ownership tests

const (
	ownerEmailHash      = "5f3c9a1b2d4e6f8a0c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a"
	attackerEmailHash   = "0000000000000000000000000000000000000000000000000000000000000000"
	testGeohash         = "xn76u"
	testRowKey          = "09999999999999999999-0123456789abcdef0123456789abcdef"
	fakePresignedPutURL = "https://example.invalid/put"
)

// fakeMetadataRepo stores intel keyed by partitionKey (emailHash+geohash) and rowKey,
// which is what makes a successful lookup proof of ownership.
type fakeMetadataRepo struct {
	rows map[string]storage.PrivateIntel
}

func newFakeMetadataRepo() *fakeMetadataRepo {
	return &fakeMetadataRepo{rows: map[string]storage.PrivateIntel{
		ownerEmailHash + testGeohash + "|" + testRowKey: {Key: testRowKey, Geohash: testGeohash, EmailHash: ownerEmailHash},
	}}
}

func (r *fakeMetadataRepo) Initialize(ctx context.Context) error { return nil }

func (r *fakeMetadataRepo) StorePrivateIntelMetadata(ctx context.Context, intel storage.PrivateIntel) (string, error) {
	return "", nil
}

func (r *fakeMetadataRepo) GetPrivateIntelMetadata(ctx context.Context, partitionKey, rowKey string) (storage.PrivateIntel, error) {
	intel, exists := r.rows[partitionKey+"|"+rowKey]
	if !exists {
		return storage.PrivateIntel{}, storage.ErrNotFound
	}
	return intel, nil
}

func (r *fakeMetadataRepo) UpdatePrivateIntelMetadata(ctx context.Context, partitionKey, rowKey string, intel storage.PrivateIntel) error {
	return nil
}

func (r *fakeMetadataRepo) DeletePrivateIntelMetadata(ctx context.Context, partitionKey, rowKey string) error {
	return nil
}

func (r *fakeMetadataRepo) ListPrivateIntelByGeohashes(ctx context.Context, emailHash string, geohashes []string) ([]storage.PrivateIntel, error) {
	return nil, nil
}

// fakeCommentRepo counts reads so a test can assert the comment store was never touched
// when the ownership check should have short-circuited.
type fakeCommentRepo struct {
	listCalls int
}

func (r *fakeCommentRepo) Initialize(ctx context.Context) error { return nil }

func (r *fakeCommentRepo) AddComment(ctx context.Context, comment storage.PrivateIntelComment) (string, error) {
	return "", nil
}

func (r *fakeCommentRepo) ListComments(ctx context.Context, intelRowKey string) ([]storage.PrivateIntelComment, error) {
	r.listCalls++
	return []storage.PrivateIntelComment{{RowKey: "c1", IntelRowKey: intelRowKey, EncryptedText: "ciphertext"}}, nil
}

func (r *fakeCommentRepo) DeleteCommentsByIntel(ctx context.Context, intelRowKey string) error {
	return nil
}

// fakeImageRepo counts presign calls so a test can assert no upload URL was ever minted
// for a caller that does not own the intel.
type fakeImageRepo struct {
	presignPutCalls int
}

func (r *fakeImageRepo) Initialize(ctx context.Context) error { return nil }
func (r *fakeImageRepo) StoreIntelImage(ctx context.Context, key string, data []byte) error {
	return nil
}
func (r *fakeImageRepo) GetIntelImage(ctx context.Context, key string) ([]byte, error) {
	return nil, nil
}
func (r *fakeImageRepo) DeleteIntelImage(ctx context.Context, key string) error { return nil }

func (r *fakeImageRepo) GetIntelImagePresignedURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	return "", nil
}

func (r *fakeImageRepo) GetIntelImagePresignedPutURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	r.presignPutCalls++
	return fakePresignedPutURL, nil
}

func newTestService(t *testing.T) (*RoverService, *fakeCommentRepo, *fakeImageRepo) {
	t.Helper()
	commentRepo := &fakeCommentRepo{}
	imageRepo := &fakeImageRepo{}
	service, serviceErr := NewRoverService(
		WithPrivateMetadataRepository(newFakeMetadataRepo()),
		WithCommentRepository(commentRepo),
		WithImageRepository(imageRepo),
	)
	if serviceErr != nil {
		t.Fatalf("failed to build test service: %v", serviceErr)
	}
	return service, commentRepo, imageRepo
}

//
// ownership tests

// TestListCommentsRequiresOwnership covers security finding 5. Comments are partitioned
// by intel rowKey alone, so without an explicit ownership check any authenticated user
// holding a rowKey could read another user's comment ciphertext, author hashes and geohash.
func TestListCommentsRequiresOwnership(t *testing.T) {
	t.Run("owner can read the thread", func(t *testing.T) {
		service, commentRepo, _ := newTestService(t)
		items, listErr := service.ListComments(context.Background(), ownerEmailHash, testGeohash, testRowKey)
		if listErr != nil {
			t.Fatalf("owner was denied their own comments: %v", listErr)
		}
		if len(items) != 1 {
			t.Errorf("expected 1 comment, got %d", len(items))
		}
		if commentRepo.listCalls != 1 {
			t.Errorf("expected comment store to be read once, got %d", commentRepo.listCalls)
		}
	})

	t.Run("another user is denied and never reaches the comment store", func(t *testing.T) {
		service, commentRepo, _ := newTestService(t)
		items, listErr := service.ListComments(context.Background(), attackerEmailHash, testGeohash, testRowKey)
		if !errors.Is(listErr, storage.ErrNotFound) {
			t.Fatalf("expected storage.ErrNotFound for a non-owner, got %v", listErr)
		}
		if items != nil {
			t.Errorf("expected no comments leaked to a non-owner, got %d", len(items))
		}
		if commentRepo.listCalls != 0 {
			t.Errorf("ownership check ran too late - comment store was read %d time(s)", commentRepo.listCalls)
		}
	})

	t.Run("wrong geohash is denied", func(t *testing.T) {
		service, _, _ := newTestService(t)
		_, listErr := service.ListComments(context.Background(), ownerEmailHash, "gbsuv", testRowKey)
		if !errors.Is(listErr, storage.ErrNotFound) {
			t.Fatalf("expected storage.ErrNotFound for a mismatched geohash, got %v", listErr)
		}
	})

	t.Run("missing identity is rejected", func(t *testing.T) {
		service, _, _ := newTestService(t)
		if _, err := service.ListComments(context.Background(), "", testGeohash, testRowKey); !errors.Is(err, ErrEmailHashRequired) {
			t.Errorf("expected ErrEmailHashRequired, got %v", err)
		}
		if _, err := service.ListComments(context.Background(), ownerEmailHash, "", testRowKey); !errors.Is(err, ErrGeohashRequired) {
			t.Errorf("expected ErrGeohashRequired, got %v", err)
		}
		if _, err := service.ListComments(context.Background(), ownerEmailHash, testGeohash, ""); !errors.Is(err, ErrKeyRequired) {
			t.Errorf("expected ErrKeyRequired, got %v", err)
		}
	})
}

// TestGetImageUploadURLRequiresOwnership covers security finding 4. This one is a
// destructive cross-tenant write: a presigned PUT URL lets the holder overwrite another
// user's image object, so the URL must never be minted for a non-owner.
func TestGetImageUploadURLRequiresOwnership(t *testing.T) {
	t.Run("owner gets an upload URL", func(t *testing.T) {
		service, _, imageRepo := newTestService(t)
		putURL, urlErr := service.GetImageUploadURL(context.Background(), ownerEmailHash, testGeohash, testRowKey)
		if urlErr != nil {
			t.Fatalf("owner was denied an upload URL: %v", urlErr)
		}
		if putURL != fakePresignedPutURL {
			t.Errorf("unexpected upload URL %q", putURL)
		}
		if imageRepo.presignPutCalls != 1 {
			t.Errorf("expected 1 presign call, got %d", imageRepo.presignPutCalls)
		}
	})

	t.Run("another user is denied and no URL is minted", func(t *testing.T) {
		service, _, imageRepo := newTestService(t)
		putURL, urlErr := service.GetImageUploadURL(context.Background(), attackerEmailHash, testGeohash, testRowKey)
		if !errors.Is(urlErr, storage.ErrNotFound) {
			t.Fatalf("expected storage.ErrNotFound for a non-owner, got %v", urlErr)
		}
		if putURL != "" {
			t.Errorf("an upload URL leaked to a non-owner: %q", putURL)
		}
		if imageRepo.presignPutCalls != 0 {
			t.Errorf("ownership check ran too late - %d presigned PUT URL(s) were minted", imageRepo.presignPutCalls)
		}
	})

	t.Run("unknown row key is denied", func(t *testing.T) {
		service, _, imageRepo := newTestService(t)
		_, urlErr := service.GetImageUploadURL(context.Background(), ownerEmailHash, testGeohash, "09999999999999999999-ffffffffffffffffffffffffffffffff")
		if !errors.Is(urlErr, storage.ErrNotFound) {
			t.Fatalf("expected storage.ErrNotFound for an unknown row key, got %v", urlErr)
		}
		if imageRepo.presignPutCalls != 0 {
			t.Errorf("expected no presign calls, got %d", imageRepo.presignPutCalls)
		}
	})

	t.Run("missing identity is rejected", func(t *testing.T) {
		service, _, _ := newTestService(t)
		if _, err := service.GetImageUploadURL(context.Background(), "", testGeohash, testRowKey); !errors.Is(err, ErrEmailHashRequired) {
			t.Errorf("expected ErrEmailHashRequired, got %v", err)
		}
		if _, err := service.GetImageUploadURL(context.Background(), ownerEmailHash, "", testRowKey); !errors.Is(err, ErrGeohashRequired) {
			t.Errorf("expected ErrGeohashRequired, got %v", err)
		}
		if _, err := service.GetImageUploadURL(context.Background(), ownerEmailHash, testGeohash, ""); !errors.Is(err, ErrKeyRequired) {
			t.Errorf("expected ErrKeyRequired, got %v", err)
		}
	})
}
