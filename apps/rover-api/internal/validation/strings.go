package validation

import (
	"encoding/base64"
	"strings"

	"github.com/rs/zerolog/log"
)

func IsEmptyStr(target string) bool {
	log.Trace().Msg("IsEmptyStr")
	return len(strings.TrimSpace(target)) == 0
}

func IsURLEncodedB64(s string) bool {
	_, err := base64.URLEncoding.DecodeString(s)
	return err == nil
}
