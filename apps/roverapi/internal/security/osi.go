package security

import "github.com/rs/zerolog/log"

//
// Types

type EmptyOSIEmailService struct {
}

//
// Methods

func (osi EmptyOSIEmailService) IsFlagged(email string) (bool, error) {
	return false, nil
}

func (osi EmptyOSIEmailService) SetBlockEmail(email string, forDays int) error {
	log.Info().Str("email", email).Int("forDays", forDays).Msg("setting email for blocking")
	return nil
}

//
// Functions

func NewOSIEmailService() EmptyOSIEmailService {
	return EmptyOSIEmailService{}
}
