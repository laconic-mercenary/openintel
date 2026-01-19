package logging

import (
	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

//
// Functions

func NewTracingLogger() zerolog.Logger {
	return log.With().Str("traceId", uuid.NewString()).Logger()
}
