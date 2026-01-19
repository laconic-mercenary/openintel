package logging

import "time"

//
// Functions

func TimestampMs() int64 {
	return time.Now().UnixMilli()
}

func ElapsedMs(timestamp int64) int64 {
	return TimestampMs() - timestamp
}