package security

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"

	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/argon2"
	"openintel.jp/roverapi/internal/config"
)

//
// Functions

func HashArgon2(plainText string) (string, error) {
	log.Trace().Msg("HashArgon2")
	memory := config.Argon2Memory()
	iterations := config.Argon2Iterations()
	parallism := config.Argon2Parallelism()
	keyLength := config.Argon2KeyLength()

	salt := make([]byte, config.Argon2SaltLength())
	_, saltErr := rand.Read(salt)
	if saltErr != nil {
		return "", saltErr
	}

	hash := argon2.IDKey(
		[]byte(plainText),
		salt,
		iterations,
		memory,
		parallism,
		keyLength,
	)

	urlSafeToken := base64.URLEncoding.EncodeToString(hash)
	return urlSafeToken, nil
}

func HashSha256(plainText string) string {
	hash := sha256.Sum256([]byte(plainText))
	return string(hash[:])
}

func Hash(plainText string) (string, error) {
	return HashArgon2(plainText)
}
