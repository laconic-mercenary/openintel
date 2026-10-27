package auth

import (
	"strings"
	"testing"
)

const emailHashPepperEnvVar = "ROVERAPI_AUTH_EMAIL_HASH_PEPPER"

// TestFormatMessageDeliversCodeNotLink pins the fix for the deterministic-login-token
// finding. The login code must travel in the email body. If a URL is ever reintroduced
// here it becomes a credential that outlives the email, readable from browser history,
// forwarded mail and link-prefetching scanners.
func TestFormatMessageDeliversCodeNotLink(t *testing.T) {
	const authCode = "481920"
	message := (&AuthService{}).formatMessage(authCode, 300)

	if !strings.Contains(message, authCode) {
		t.Errorf("login email does not contain the code %q: %s", authCode, message)
	}

	forbidden := []string{"href", "http://", "https://", "/auth/get-code", "?x="}
	for _, needle := range forbidden {
		if strings.Contains(message, needle) {
			t.Errorf("login email must not contain %q, got: %s", needle, message)
		}
	}
}

func TestFormatMessageRendersExpiryMinutes(t *testing.T) {
	tests := []struct {
		name          string
		expirySeconds uint
		wantSubstring string
	}{
		{name: "five minutes", expirySeconds: 300, wantSubstring: "5 minutes"},
		{name: "one minute is singular", expirySeconds: 60, wantSubstring: "1 minute."},
		{name: "ten minutes", expirySeconds: 600, wantSubstring: "10 minutes"},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			message := (&AuthService{}).formatMessage("123456", testCase.expirySeconds)
			if !strings.Contains(message, testCase.wantSubstring) {
				t.Errorf("formatMessage(%d) missing %q, got: %s", testCase.expirySeconds, testCase.wantSubstring, message)
			}
		})
	}
}

// TestAuthRowKeyIsDeterministic guards the property SendLoginCode, VerifyLoginCode and
// DeleteLoginCode all depend on: the same email must resolve to the same auth table
// RowKey, or a user could never redeem the code they were sent.
func TestAuthRowKeyIsDeterministic(t *testing.T) {
	t.Setenv(emailHashPepperEnvVar, "test-pepper-value")
	service := &AuthService{}

	first := service.authRowKey("someone@example.com")
	second := service.authRowKey("someone@example.com")
	if first != second {
		t.Errorf("authRowKey is not deterministic: %q != %q", first, second)
	}

	other := service.authRowKey("someone.else@example.com")
	if first == other {
		t.Errorf("authRowKey collided across distinct emails: %q", first)
	}
}

// TestAuthRowKeyIsHexAndPepperScoped checks the key is a plain hex HMAC digest — it is
// used directly as an Azure Table RowKey, which forbids several characters — and that
// it actually depends on the pepper.
func TestAuthRowKeyIsHexAndPepperScoped(t *testing.T) {
	const hmacSha256HexLen = 64
	const email = "someone@example.com"

	t.Setenv(emailHashPepperEnvVar, "pepper-one")
	withFirstPepper := (&AuthService{}).authRowKey(email)

	if len(withFirstPepper) != hmacSha256HexLen {
		t.Errorf("authRowKey length = %d, want %d", len(withFirstPepper), hmacSha256HexLen)
	}
	for i := range len(withFirstPepper) {
		c := withFirstPepper[i]
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			t.Errorf("authRowKey has non lowercase-hex byte %q at %d: %s", c, i, withFirstPepper)
			break
		}
	}

	t.Setenv(emailHashPepperEnvVar, "pepper-two")
	withSecondPepper := (&AuthService{}).authRowKey(email)
	if withFirstPepper == withSecondPepper {
		t.Error("authRowKey did not change when the pepper changed - pepper is not being applied")
	}
}
