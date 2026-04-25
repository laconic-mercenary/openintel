package validation

import (
	"errors"
	"strings"

	"github.com/google/uuid"
)

//
// consts and globals

const (
	geohashAlphabet = "0123456789bcdefghjkmnpqrstuvwxyz"
	geohash5Len     = 5
)

var (
	ErrInvalidGeohash  = errors.New("invalid geohash")
	ErrInvalidIntelKey = errors.New("invalid intel key")
)

//
// functions

func IsValidGeohash5(s string) bool {
	if len(s) != geohash5Len {
		return false
	}
	for _, c := range s {
		if !strings.ContainsRune(geohashAlphabet, c) {
			return false
		}
	}
	return true
}

func IsValidIntelKey(s string) bool {
	_, parseErr := uuid.Parse(s)
	return parseErr == nil
}
