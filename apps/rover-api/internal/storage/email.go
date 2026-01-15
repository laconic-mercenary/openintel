package storage

type EmailAbuseQueryRepository interface {
	IsFlagged(email string) (bool, error)
}

type EmailBlocklistRepository interface {
	SetBlockEmail(email string, forDays int) error
}
