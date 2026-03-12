package validation

func IsValidLatitude(latitude float64) bool {
	return latitude >= -90.0 && latitude <= 90.0
}

func IsValidLongitude(longitude float64) bool {
	return longitude >= -180.0 && longitude <= 180.0
}
