package time

import "time"

//
// Consts and Globals

const (
	secondsToMillisMultiplier = 1000
)

//
// Functions

func UnixTimestampMs() int64 {
	return time.Now().UnixMilli()
}

func SecondsToMillis(seconds uint) int64 {
	return int64(seconds) * secondsToMillisMultiplier
}
