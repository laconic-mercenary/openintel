package server

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/rs/zerolog/log"
)

const (
	claimSubject   = "sub"
	claimIssuedAt  = "iat"
	claimExpiresAt = "exp"
	claimIssuer    = "iss"
	jwtIssuer      = "rover-api"
)

func GenerateJWT(email string, expirySeconds uint, secret []byte) (string, error) {
	log.Trace().Msg("GenerateJWT")

	now := time.Now()
	claims := jwt.MapClaims{
		claimSubject:   email,
		claimIssuedAt:  now.Unix(),
		claimExpiresAt: now.Add(time.Duration(expirySeconds) * time.Second).Unix(),
		claimIssuer:    jwtIssuer,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secret)
}
