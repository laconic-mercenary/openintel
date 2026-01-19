package storage

import (
	"errors"

	"github.com/rs/zerolog/log"
	"openintel.jp/roverapi/internal/time"
)

//
// Types

type AuthTokenEntry struct {
	Token                string
	Code                 string
	ExpiryTimestamp      int64
	LoginAttempts        uint
	WindowStartTimestamp int64
	Enabled              bool
}

type AuthTokenQueryRepository interface {
	GetAuthToken(authToken string) (AuthTokenEntry, bool, error)
}

type AuthTokenRepository interface {
	StoreAuthToken(authToken, authCode string, expirySeconds uint) error
	DeleteAuthToken(authToken string) error
	IncrementLoginAttempts(authToken string) error
	ResetLoginAttempts(authToken string) error
	DisableAuthToken(authToken string, durationSeconds uint) error
}

// for testing / demonstration purposes - NEVER FOR PRODUCTION!!!
type InMemoryAuthTokenRepository struct {
	database map[string]AuthTokenEntry
}

//
// Methods

func (repository *InMemoryAuthTokenRepository) DisableAuthToken(authToken string, durationSeconds uint) error {
	log.Trace().Msg("DisableAuthToken")
	entry, exists := repository.database[authToken]
	if !exists {
		return errors.New("authToken does not exist")
	}
	entry.Enabled = false
	entry.ExpiryTimestamp = time.UnixTimestampMs() + time.SecondsToMillis(durationSeconds)
	repository.database[authToken] = entry
	return nil
}

func (repository *InMemoryAuthTokenRepository) IncrementLoginAttempts(authToken string) error {
	log.Trace().Msg("IncrementLoginAttempts")
	entry, exists := repository.database[authToken]
	if !exists {
		return errors.New("authToken does not exist")
	}
	entry.LoginAttempts++
	repository.database[authToken] = entry
	return nil
}

func (repository *InMemoryAuthTokenRepository) ResetLoginAttempts(authToken string) error {
	log.Trace().Msg("ResetLoginAttempts")
	entry, exists := repository.database[authToken]
	if !exists {
		return errors.New("authToken does not exist")
	}
	entry.LoginAttempts = 0
	entry.WindowStartTimestamp = time.UnixTimestampMs()
	entry.Enabled = true
	repository.database[authToken] = entry
	return nil
}

func (repository *InMemoryAuthTokenRepository) StoreAuthToken(authToken, authCode string, expirySeconds uint) error {
	log.Trace().Msg("StoreAuthToken")
	if _, exists := repository.database[authToken]; exists {
		return errors.New("authToken already exists")
	}
	repository.database[authToken] = AuthTokenEntry{
		Token:                authToken,
		ExpiryTimestamp:      time.UnixTimestampMs() + time.SecondsToMillis(expirySeconds),
		Code:                 authCode,
		LoginAttempts:        0,
		WindowStartTimestamp: time.UnixTimestampMs(),
		Enabled:              true,
	}
	return nil
}

func (repository *InMemoryAuthTokenRepository) DeleteAuthToken(authToken string) error {
	log.Trace().Msg("DeleteAuthToken")
	delete(repository.database, authToken)
	return nil
}

func (repository *InMemoryAuthTokenRepository) GetAuthToken(authToken string) (AuthTokenEntry, bool, error) {
	log.Trace().Msg("GetAuthToken")
	entry, exists := repository.database[authToken]
	if !exists {
		return AuthTokenEntry{}, false, nil
	}
	return entry, true, nil
}

//
// Functions

func NewInMemoryAuthTokenRepository() *InMemoryAuthTokenRepository {
	log.Trace().Msg("NewInMemoryAuthTokenRepository")
	return &InMemoryAuthTokenRepository{
		database: make(map[string]AuthTokenEntry),
	}
}
