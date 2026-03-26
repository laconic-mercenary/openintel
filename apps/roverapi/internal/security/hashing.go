package security

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"

	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/argon2"
	"openintel.jp/roverapi/internal/config"
)

//
// Functions

func HashSha256(plainText string) string {
	hash := sha256.Sum256([]byte(plainText))
	return string(hash[:])
}

func Hash(plainText string, salt []byte) (string, error) {
	log.Trace().Msg("Hash")
	memory := config.Argon2Memory()
	iterations := config.Argon2Iterations()
	parallism := config.Argon2Parallelism()
	keyLength := config.Argon2KeyLength()

	hash := argon2.IDKey(
		[]byte(plainText),
		salt,
		iterations,
		memory,
		parallism,
		keyLength,
	)

	return base64.URLEncoding.EncodeToString(hash), nil
}

func HmacSha256Hex(data, key string) string {
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(data))
	return hex.EncodeToString(mac.Sum(nil))
}

func HmacSha256Bytes(data, key string) []byte {
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(data))
	return mac.Sum(nil)
}
