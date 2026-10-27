package storage

import "testing"

func TestEscapeODataLiteral(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "no quotes is unchanged",
			input: "09999999999999999999-0123456789abcdef0123456789abcdef",
			want:  "09999999999999999999-0123456789abcdef0123456789abcdef",
		},
		{
			name:  "single quote is doubled",
			input: "o'brien",
			want:  "o''brien",
		},
		{
			name:  "every quote is doubled",
			input: `' or RowKey ne '`,
			want:  `'' or RowKey ne ''`,
		},
		{
			name:  "already doubled quotes are doubled again",
			input: "a''b",
			want:  "a''''b",
		},
		{
			name:  "empty",
			input: "",
			want:  "",
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			if got := escapeODataLiteral(testCase.input); got != testCase.want {
				t.Errorf("escapeODataLiteral(%q) = %q, want %q", testCase.input, got, testCase.want)
			}
		})
	}
}

func TestPartitionKeyFilter(t *testing.T) {
	t.Run("well formed key", func(t *testing.T) {
		got := partitionKeyFilter("09999999999999999999-0123456789abcdef0123456789abcdef")
		want := "PartitionKey eq '09999999999999999999-0123456789abcdef0123456789abcdef'"
		if got != want {
			t.Errorf("partitionKeyFilter() = %q, want %q", got, want)
		}
	})

	// Defence in depth: even if a caller skips validation.IsValidIntelRowKey, the
	// quotes are neutralised and the injected clause stays inside the literal
	// rather than becoming filter syntax.
	t.Run("injection stays inside the literal", func(t *testing.T) {
		got := partitionKeyFilter(`00000000000000000000-' or RowKey ne 'aaaaaaaaaaaaaaaa`)
		want := `PartitionKey eq '00000000000000000000-'' or RowKey ne ''aaaaaaaaaaaaaaaa'`
		if got != want {
			t.Errorf("partitionKeyFilter() = %q, want %q", got, want)
		}
	})
}
