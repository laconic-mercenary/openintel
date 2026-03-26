package geo

import "math"

//
// consts and globals

const (
	geohashBase32    = "0123456789bcdefghjkmnpqrstuvwxyz"
	GeohashPrecision = 5

	geohash5LatStep = 0.03
	geohash5LonStep = 0.03
	maxBboxCells    = 2000

	MinLat = -90.0
	MaxLat = 90.0
	MinLon = -180.0
	MaxLon = 180.0
)

//
// functions

func Geohash(lat, lon float64) string {
	minLon, maxLon := MinLon, MaxLon
	minLat, maxLat := MinLat, MaxLat

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

func BboxToGeohash5Cells(minLat, minLon, maxLat, maxLon float64) []string {
	seen := make(map[string]bool)
	var cells []string

	addCell := func(lat, lon float64) bool {
		cell := Geohash(lat, lon)
		if !seen[cell] {
			seen[cell] = true
			cells = append(cells, cell)
		}
		return len(cells) < maxBboxCells
	}

	lat := minLat
	for lat <= maxLat {
		lon := minLon
		for lon <= maxLon {
			if !addCell(lat, lon) {
				return cells
			}
			if lon >= maxLon {
				break
			}
			lon = math.Min(lon+geohash5LonStep, maxLon)
		}
		if lat >= maxLat {
			break
		}
		lat = math.Min(lat+geohash5LatStep, maxLat)
	}
	return cells
}
