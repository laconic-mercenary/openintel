package server

import (
	"github.com/resend/resend-go/v2"
	"github.com/rs/zerolog/log"
)

//
// types

type ResendEmailService struct {
	client *resend.Client
}

//
// functions

func NewResendEmailService(apiKey string) EmailService {
	return &ResendEmailService{
		client: resend.NewClient(apiKey),
	}
}

//
// methods

func (s *ResendEmailService) SendEmail(from, to, text string) error {
	log.Trace().Str("from", from).Str("to", to).Msg("SendEmail")
	params := &resend.SendEmailRequest{
		From:    from,
		To:      []string{to},
		Text:    text,
		Subject: "Your openintel login code",
	}
	_, sendErr := s.client.Emails.Send(params)
	if sendErr != nil {
		log.Error().Err(sendErr).Str("to", to).Msg("failed to send email via resend")
		return sendErr
	}
	return nil
}
