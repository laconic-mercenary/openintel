package validation

import (
	"encoding/base64"
	"errors"
	"strings"

	"github.com/rs/zerolog/log"
)

//
// consts and globals

const otpCodeLen = 6

var ErrInvalidOTPCode = errors.New("invalid OTP code")

//
// functions

func IsEmptyStr(target string) bool {
	log.Trace().Msg("IsEmptyStr")
	return len(strings.TrimSpace(target)) == 0
}

func IsURLEncodedB64(s string) bool {
	_, err := base64.URLEncoding.DecodeString(s)
	return err == nil
}

func IsValidOTPCode(s string) bool {
	if len(s) != otpCodeLen {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}
