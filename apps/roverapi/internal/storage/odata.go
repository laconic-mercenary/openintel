package storage

import (
	"fmt"
	"strings"
)

//
// consts and globals

const (
	odataQuote           = "'"
	odataQuoteEscaped    = "''"
	odataPartitionKeyFmt = "PartitionKey eq '%s'"
)

//
// functions

// escapeODataLiteral escapes a value for interpolation into an OData string literal.
// A single quote terminates the literal, so it is doubled per the OData ABNF.
//
// This is defence in depth, not a substitute for validating the value first — see
// validation.IsValidIntelRowKey and validation.IsValidGeohash5.
func escapeODataLiteral(value string) string {
	return strings.ReplaceAll(value, odataQuote, odataQuoteEscaped)
}

// partitionKeyFilter builds an equality filter on PartitionKey with the value escaped.
// All partition-scoped queries in this package go through here so there is a single
// place where the literal is constructed.
func partitionKeyFilter(partitionKey string) string {
	return fmt.Sprintf(odataPartitionKeyFmt, escapeODataLiteral(partitionKey))
}
