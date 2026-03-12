package geo

//
// consts and globals

const (
	geohashBase32    = "0123456789bcdefghjkmnpqrstuvwxyz"
	GeohashPrecision = 4
)

//
// functions

func Geohash(lat, lon float64) string {
	minLon, maxLon := -180.0, 180.0
	minLat, maxLat := -90.0, 90.0

	result := make([]byte, GeohashPrecision)
	bits := 0
	hashValue := 0
	isLon := true

	for i := 0; i < GeohashPrecision; {
		if isLon {
			mid := (minLon + maxLon) / 2
			if lon >= mid {
				hashValue = (hashValue << 1) | 1
				minLon = mid
			} else {
				hashValue <<= 1
				maxLon = mid
			}
		} else {
			mid := (minLat + maxLat) / 2
			if lat >= mid {
				hashValue = (hashValue << 1) | 1
				minLat = mid
			} else {
				hashValue <<= 1
				maxLat = mid
			}
		}
		isLon = !isLon
		bits++
		if bits == 5 {
			result[i] = geohashBase32[hashValue]
			i++
			bits = 0
			hashValue = 0
		}
	}
	return string(result)
}
