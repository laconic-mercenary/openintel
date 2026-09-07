package validation

import "testing"

// odataInjectionRowKey is a well-formed rowKey by length and prefix, whose 32-character
// suffix breaks out of an OData string literal and rewrites the filter to match every
// row in the table. Before the suffix was validated character by character this was
// accepted, and GET /rover/intel/{geohash}/{key}/comments returned every comment row
// for every user. Keep this case.
const odataInjectionRowKey = `00000000000000000000-' or RowKey ne 'aaaaaaaaaaaaaaaa`

func TestIsValidIntelRowKey(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  bool
	}{
		{
			name:  "valid digest form",
			input: "09999999999999999999-0123456789abcdef0123456789abcdef",
			want:  true,
		},
		{
			name:  "valid legacy uuid form",
			input: "09999999999999999999-3f2504e0-4f89-11d3-9a0c-0305e82c3301",
			want:  true,
		},
		{
			name:  "odata injection in digest suffix",
			input: odataInjectionRowKey,
			want:  false,
		},
		{
			name:  "single quote in digest suffix",
			input: "09999999999999999999-0123456789abcdef0123456789abcde'",
			want:  false,
		},
		{
			name:  "uppercase hex digest rejected",
			input: "09999999999999999999-0123456789ABCDEF0123456789abcdef",
			want:  false,
		},
		{
			name:  "non hex character in digest",
			input: "09999999999999999999-0123456789abcdefg123456789abcde",
			want:  false,
		},
		{
			name:  "non digit in timestamp prefix",
			input: "0999999999999999999x-0123456789abcdef0123456789abcdef",
			want:  false,
		},
		{
			name:  "negative timestamp prefix rejected",
			input: "-9999999999999999999-0123456789abcdef0123456789abcdef",
			want:  false,
		},
		{
			name:  "wrong separator",
			input: "09999999999999999999_0123456789abcdef0123456789abcdef",
			want:  false,
		},
		{
			name:  "uuid with misplaced separator",
			input: "09999999999999999999-3f2504e04-f89-11d3-9a0c-0305e82c3301",
			want:  false,
		},
		{
			name:  "uuid with non hex character",
			input: "09999999999999999999-3f2504e0-4f89-11d3-9a0c-0305e82c330z",
			want:  false,
		},
		{
			name:  "too short",
			input: "09999999999999999999-0123456789abcdef",
			want:  false,
		},
		{
			name:  "too long",
			input: "09999999999999999999-0123456789abcdef0123456789abcdef00",
			want:  false,
		},
		{
			name:  "empty",
			input: "",
			want:  false,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			if got := IsValidIntelRowKey(testCase.input); got != testCase.want {
				t.Errorf("IsValidIntelRowKey(%q) = %v, want %v", testCase.input, got, testCase.want)
			}
		})
	}
}

func TestIsValidGeohash5(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  bool
	}{
		{name: "valid", input: "xn76u", want: true},
		{name: "all digits", input: "01234", want: true},
		{name: "excluded letter a", input: "xn76a", want: false},
		{name: "excluded letter i", input: "xn76i", want: false},
		{name: "excluded letter l", input: "xn76l", want: false},
		{name: "excluded letter o", input: "xn76o", want: false},
		{name: "uppercase", input: "XN76U", want: false},
		{name: "single quote", input: "xn76'", want: false},
		{name: "too short", input: "xn76", want: false},
		{name: "too long", input: "xn76uv", want: false},
		{name: "empty", input: "", want: false},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			if got := IsValidGeohash5(testCase.input); got != testCase.want {
				t.Errorf("IsValidGeohash5(%q) = %v, want %v", testCase.input, got, testCase.want)
			}
		})
	}
}
