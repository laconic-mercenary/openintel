package rover

import (
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
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
