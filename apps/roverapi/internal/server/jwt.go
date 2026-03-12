package server

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/rs/zerolog/log"
)

var ErrInvalidJWT = errors.New("invalid or expired JWT")

const (
	claimSubject   = "sub"
	claimIssuedAt  = "iat"
	claimExpiresAt = "exp"
	claimIssuer    = "iss"
	jwtIssuer      = "rover-api"
)

func ValidateJWT(tokenStr string, secret []byte) (string, error) {
	log.Trace().Msg("ValidateJWT")
	token, parseErr := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidJWT
		}
		return secret, nil
	}, jwt.WithIssuer(jwtIssuer), jwt.WithExpirationRequired())
	if parseErr != nil || !token.Valid {
		log.Debug().Err(parseErr).Msg("JWT validation failed")
		return "", ErrInvalidJWT
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", ErrInvalidJWT
	}
	email, ok := claims[claimSubject].(string)
	if !ok || email == "" {
		return "", ErrInvalidJWT
	}
	return email, nil
}

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
