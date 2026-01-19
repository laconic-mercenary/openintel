package server

import (
	"errors"

	"github.com/rs/zerolog/log"
	"openintel.jp/roverapi/internal/storage"
	"openintel.jp/roverapi/internal/time"
)

//
// Consts and Globals

var (
	ErrAuthTokenDoesNotExist      = errors.New("auth token does not exist")
	ErrMaxAttemptsRequired        = errors.New("maxAttempts must be greater than 0")
	ErrAttemptsWindowSecsRequired = errors.New("attemptsWindowSecs must be greater than 0")
	ErrDisabledDurationRequired   = errors.New("disableDuration must be greater than 0")
	ErrAttemptsQueryRequired      = errors.New("attemptsQuery is required")
	ErrAttemptsStorageRequired    = errors.New("attemptsStorage is required")
)

const (
	RateLimitUnknown RateLimitResult = iota
	RateLimitTriggered
	RateLimitOk
)

//
// Types

type RateLimitResult int

type RateLimiter struct {
	maxAttempts         uint
	attemptsWindowSecs  uint
	disableDurationSecs uint
	attemptsStorage     storage.AuthTokenRepository
	attemptsQuery       storage.AuthTokenQueryRepository
}

//
// Methods

func (limiter *RateLimiter) MaxAttempts() uint {
	return limiter.maxAttempts
}

func (limiter *RateLimiter) AttemptsWindowSeconds() uint {
	return limiter.attemptsWindowSecs
}

func (limiter *RateLimiter) DisableDurationSeconds() uint {
	return limiter.disableDurationSecs
}

func (limiter *RateLimiter) LogAndCheck(authToken string) (RateLimitResult, error) {
	log.Trace().Msg("LogAndCheck")
	entry, exists, getErr := limiter.attemptsQuery.GetAuthToken(authToken)
	if getErr != nil {
		return RateLimitUnknown, getErr
	}
	if !exists {
		return RateLimitUnknown, ErrAuthTokenDoesNotExist
	}
	// if time.UnixTimestampMs() > entry.ExpiryTimestamp {
	// design decision - allow Verify*() to handle this
	// }
	if entry.LoginAttempts >= limiter.maxAttempts {
		elapsedTimeMs := time.UnixTimestampMs() - entry.WindowStartTimestamp
		if elapsedTimeMs > time.SecondsToMillis(limiter.attemptsWindowSecs) {
			return RateLimitOk, limiter.attemptsStorage.ResetLoginAttempts(authToken)
		}
		return RateLimitTriggered, limiter.attemptsStorage.DisableAuthToken(authToken, limiter.disableDurationSecs)
	}
	return RateLimitOk, limiter.attemptsStorage.IncrementLoginAttempts(authToken)
}

//
// Functions

func NewRateLimiter(maxAttempts, attemptsWindowSecs, disableDuration uint, query storage.AuthTokenQueryRepository, attemptsStorage storage.AuthTokenRepository) (*RateLimiter, error) {
	log.Trace().Msg("NewRateLimiter")
	if maxAttempts == 0 {
		return nil, ErrMaxAttemptsRequired
	}
	if attemptsWindowSecs == 0 {
		return nil, ErrAttemptsWindowSecsRequired
	}
	if disableDuration == 0 {
		return nil, ErrDisabledDurationRequired
	}
	if query == nil {
		return nil, ErrAttemptsQueryRequired
	}
	if attemptsStorage == nil {
		return nil, ErrAttemptsStorageRequired
	}
	return &RateLimiter{
		maxAttempts:         maxAttempts,
		attemptsWindowSecs:  attemptsWindowSecs,
		attemptsQuery:       query,
		attemptsStorage:     attemptsStorage,
		disableDurationSecs: disableDuration,
	}, nil
}
