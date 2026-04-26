package validation

import (
	"errors"
	"strings"

	"github.com/google/uuid"
)

//
// consts and globals

const (
	geohashAlphabet    = "0123456789bcdefghjkmnpqrstuvwxyz"
	geohash5Len        = 5
	rowKeyLen          = 57
	rowKeyPrefixLen    = 20
	rowKeySeparatorPos = 20
	rowKeySeparator    = '-'
)

var (
	ErrInvalidGeohash     = errors.New("invalid geohash")
	ErrInvalidIntelKey    = errors.New("invalid intel key")
	ErrInvalidIntelRowKey = errors.New("invalid intel row key")
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

// IsValidIntelRowKey validates the server-generated rowKey format: {20 digits}-{UUID}
func IsValidIntelRowKey(s string) bool {
	if len(s) != rowKeyLen {
		return false
	}
	for i := range rowKeyPrefixLen {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	if s[rowKeySeparatorPos] != rowKeySeparator {
		return false
	}
	_, parseErr := uuid.Parse(s[rowKeyPrefixLen+1:])
	return parseErr == nil
}
