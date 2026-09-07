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
	uuidLen              = 36
	uuidSeparator        = '-'
	digitMin             = '0'
	digitMax             = '9'
	hexLowerMin          = 'a'
	hexLowerMax          = 'f'
)

// uuidSeparatorPositions are the offsets of '-' within a canonical 8-4-4-4-12 UUID.
var uuidSeparatorPositions = map[int]bool{8: true, 13: true, 18: true, 23: true}

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

func isDigitByte(c byte) bool {
	return c >= digitMin && c <= digitMax
}

func isLowerHexByte(c byte) bool {
	return isDigitByte(c) || (c >= hexLowerMin && c <= hexLowerMax)
}

// isLowerHexString reports whether every byte is a lowercase hex digit.
func isLowerHexString(s string) bool {
	for i := range len(s) {
		if !isLowerHexByte(s[i]) {
			return false
		}
	}
	return true
}

// isCanonicalUUID reports whether s is a canonical lowercase 8-4-4-4-12 UUID,
// matching the output of uuid.New().String().
func isCanonicalUUID(s string) bool {
	if len(s) != uuidLen {
		return false
	}
	for i := range len(s) {
		if uuidSeparatorPositions[i] {
			if s[i] != uuidSeparator {
				return false
			}
			continue
		}
		if !isLowerHexByte(s[i]) {
			return false
		}
	}
	return true
}

// IsValidIntelRowKey validates the server-generated rowKey format.
// Accepts both the legacy format {20-digit-ts}-{36-char-uuid} and the new format {20-digit-ts}-{32-char-sha256-digest}.
//
// The suffix is validated character by character, not just by length. RowKeys reach
// Azure Table Storage OData filters as string literals, so admitting any byte here —
// a single quote in particular — would allow the literal to be escaped and the filter
// rewritten. Keep this strict.
func IsValidIntelRowKey(s string) bool {
	n := len(s)
	if n != rowKeyDigestLen && n != rowKeyLegacyLen {
		return false
	}
	for i := range rowKeyPrefixLen {
		if !isDigitByte(s[i]) {
			return false
		}
	}
	if s[rowKeySeparatorPos] != rowKeySeparator {
		return false
	}
	suffix := s[rowKeySeparatorPos+1:]
	if n == rowKeyDigestLen {
		return isLowerHexString(suffix)
	}
	return isCanonicalUUID(suffix)
}
