package validation

import (
	"errors"
	"strings"
)

//
// consts and globals

const (
	geohashAlphabet      = "0123456789bcdefghjkmnpqrstuvwxyz"
	geohash5Len          = 5
	rowKeyPrefixLen      = 20
	rowKeySeparatorPos   = 20
	rowKeySeparator      = '-'
	rowKeyDigestLen      = 53 // {20-digit-ts}-{32-char-sha256-digest}
	rowKeyLegacyLen      = 57 // {20-digit-ts}-{36-char-uuid} — existing data
)

var (
	ErrInvalidGeohash     = errors.New("invalid geohash")
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

// IsValidIntelRowKey validates the server-generated rowKey format.
// Accepts both the legacy format {20-digit-ts}-{36-char-uuid} and the new format {20-digit-ts}-{32-char-sha256-digest}.
func IsValidIntelRowKey(s string) bool {
	n := len(s)
	if n != rowKeyDigestLen && n != rowKeyLegacyLen {
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
	return true
}
