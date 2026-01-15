package validation

import (
	"errors"
	"net/mail"

	"github.com/rs/zerolog/log"
)

//
// Conts and Globals

var (
	ErrTargetEmailIsRequired = errors.New("target email is required")
	ErrEmailParseProblem     = errors.New("error parsing email address")
)

//
// Functions

func ParseEmail(target string) (string, error) {
	log.Trace().Msg("ParseEmail")
	if IsEmptyStr(target) {
		return "", ErrTargetEmailIsRequired
	}
	parsedEmail, parseErr := mail.ParseAddress(target)
	if parseErr != nil {
		return "", parseErr
	}
	if parsedEmail == nil {
		// looking at current implementation of mail.ParseAddress
		// nil and error are well covered and low risk of nil + nil
		return "", ErrEmailParseProblem
	}
	return parsedEmail.Address, nil
}
