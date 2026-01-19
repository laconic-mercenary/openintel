package server

import "github.com/rs/zerolog/log"

//
// Types

type EmailService interface {
	SendEmail(from, to, text string) error
}

type EmptyEmailService struct {
}

//
// Methods

func (service EmptyEmailService) SendEmail(from, to, text string) error {
	log.Info().Str("from", from).Str("to", to).Str("text", text).Msg("sending email...")
	return nil
}

//
// Functions

func NewEmptyEmailService() EmailService {
	return EmptyEmailService{}
}
