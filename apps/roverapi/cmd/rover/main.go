package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	gotime "time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"openintel.jp/roverapi/internal/config"
	"openintel.jp/roverapi/internal/geo"
	"openintel.jp/roverapi/internal/security"
	"openintel.jp/roverapi/internal/server"
	"openintel.jp/roverapi/internal/storage"
	"openintel.jp/roverapi/internal/validation"
	"openintel.jp/roverapi/pkg/rover"
)

//
// consts and globals

const (
	httpPortDefault          = ":8081"
	shutdownDeadlineSecs     = 30
	maxRequestBodyBytes      = 25 << 20 // 25MB — POST /rover/intel carries base64-encoded encrypted image (~33% overhead on 15MB raw)
	maxSmallRequestBodyBytes = 32 << 10 // 32KB — all other routes carry no image data
	maxGeohashQueryCells     = 500
	maxCommentBodyBytes      = 4 << 10 // 4KB — comment payloads are small encrypted text only
)

func listenAddr() string {
	if port := os.Getenv("FUNCTIONS_CUSTOMHANDLER_PORT"); port != "" {
		return ":" + port
	}
	return httpPortDefault
}

//
// types

type updateIntelRequest struct {
	EncryptedPayload string `json:"encryptedPayload"`
}

type storeIntelRequest struct {
	Key              string `json:"key"`
	Geohash          string `json:"geohash"`
	Image            string `json:"image"`
	EncryptedPayload string `json:"encryptedPayload"`
	Timestamp        int64  `json:"timestamp"`
}

type storeIntelResponse struct {
	Key     string `json:"key"`
	Geohash string `json:"geohash"`
}

type getIntelImageURLResponse struct {
	URL string `json:"url"`
}

type addCommentRequest struct {
	EncryptedText string `json:"encryptedText"`
}

type addCommentResponse struct {
	RowKey     string `json:"rowKey"`
	AuthorHash string `json:"authorHash"`
	CreatedAt  int64  `json:"createdAt"`
}

type commentItem struct {
	RowKey        string `json:"rowKey"`
	AuthorHash    string `json:"authorHash"`
	EncryptedText string `json:"encryptedText"`
	Geohash       string `json:"geohash"`
	CreatedAt     int64  `json:"createdAt"`
}

type listIntelItem struct {
	Key                 string `json:"key"`
	Geohash             string `json:"geohash"`
	TimestampObfuscated int64  `json:"timestampObfuscated"`
	EncryptedPayload    string `json:"encryptedPayload"`
	HasImage            bool   `json:"hasImage"`
}

//
// functions

func handleHealth(writer http.ResponseWriter, request *http.Request) {
	log.Trace().Msg("handleHealth")
	server.RespondWithOk(writer, []byte(`{"status":"ok"}`))
}

func handleStoreIntel(roverService *rover.RoverService, jwtSecret []byte, emailHashPepper, timestampPepper string) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		log.Trace().Msg("handleStoreIntel")
		request.Body = http.MaxBytesReader(writer, request.Body, maxRequestBodyBytes)

		email, emailErr := server.EmailFromCookie(request, jwtSecret)
		if emailErr != nil {
			log.Warn().Err(emailErr).Msg("missing or invalid auth cookie")
			server.RespondUnauthorized(writer)
			return
		}

		var req storeIntelRequest
		decodeErr := json.NewDecoder(request.Body).Decode(&req)
		if decodeErr != nil {
			log.Warn().Err(decodeErr).Msg("invalid request body")
			server.RespondWithError(writer, http.StatusBadRequest, decodeErr, "invalid request body")
			return
		}

		if !validation.IsValidGeohash5(req.Geohash) {
			log.Warn().Str("geohash", req.Geohash).Msg("invalid geohash in store request")
			server.RespondWithError(writer, http.StatusBadRequest, validation.ErrInvalidGeohash, "invalid geohash")
			return
		}
		if !validation.IsValidIntelKey(req.Key) {
			log.Warn().Str("key", req.Key).Msg("invalid key in store request")
			server.RespondWithError(writer, http.StatusBadRequest, validation.ErrInvalidIntelKey, "invalid key")
			return
		}

		emailHash := security.HmacSha256Hex(email, emailHashPepper)
		hmacBytes := security.HmacSha256Bytes(email, timestampPepper)
		obfuscatedTs := req.Timestamp + int64(binary.BigEndian.Uint32(hmacBytes[:4])) // TODO: 4 = first 4 bytes of HMAC → uint32 offset; per-user constant derived from email pepper

		intel := storage.PrivateIntel{
			Key:                 req.Key,
			Geohash:             req.Geohash,
			Image:               req.Image,
			EncryptedPayload:    req.EncryptedPayload,
			Timestamp:           req.Timestamp,
			EmailHash:           emailHash,
			TimestampObfuscated: obfuscatedTs,
		}

		rowKey, storeErr := roverService.StorePrivateIntel(request.Context(), intel)
		if storeErr != nil {
			log.Error().Err(storeErr).Msg("failed to store intel")
			server.RespondWithError(writer, http.StatusInternalServerError, storeErr, "failed to store intel")
			return
		}

		resp := storeIntelResponse{Key: rowKey, Geohash: req.Geohash}
		respBytes, marshalErr := json.Marshal(resp)
		if marshalErr != nil {
			log.Error().Err(marshalErr).Msg("failed to marshal store intel response")
			server.RespondWithError(writer, http.StatusInternalServerError, marshalErr, "failed to marshal response")
			return
		}
		server.RespondWithOk(writer, respBytes)
	}
}

func handleUpdateIntel(roverService *rover.RoverService, jwtSecret []byte, emailHashPepper string) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		log.Trace().Msg("handleUpdateIntel")

		email, emailErr := server.EmailFromCookie(request, jwtSecret)
		if emailErr != nil {
			log.Warn().Err(emailErr).Msg("missing or invalid auth cookie")
			server.RespondUnauthorized(writer)
			return
		}

		geohash := request.PathValue("geohash")
		key := request.PathValue("key")

		if !validation.IsValidGeohash5(geohash) {
			log.Warn().Str("geohash", geohash).Msg("invalid geohash in update request")
			server.RespondWithError(writer, http.StatusBadRequest, validation.ErrInvalidGeohash, "invalid geohash")
			return
		}
		if !validation.IsValidIntelRowKey(key) {
			log.Warn().Str("key", key).Msg("invalid row key in update request")
			server.RespondWithError(writer, http.StatusBadRequest, validation.ErrInvalidIntelRowKey, "invalid key")
			return
		}

		emailHash := security.HmacSha256Hex(email, emailHashPepper)

		var req updateIntelRequest
		decodeErr := json.NewDecoder(request.Body).Decode(&req)
		if decodeErr != nil {
			log.Warn().Err(decodeErr).Msg("invalid request body")
			server.RespondWithError(writer, http.StatusBadRequest, decodeErr, "invalid request body")
			return
		}

		updateErr := roverService.UpdatePrivateIntel(request.Context(), emailHash, geohash, key, storage.PrivateIntel{
			EncryptedPayload: req.EncryptedPayload,
		})
		if updateErr != nil {
			log.Error().Err(updateErr).Msg("failed to update intel")
			server.RespondWithError(writer, http.StatusInternalServerError, updateErr, "failed to update intel")
			return
		}
		server.RespondWithOk(writer, []byte("{}"))
	}
}

func handleGetIntelImageURL(roverService *rover.RoverService) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		log.Trace().Msg("handleGetIntelImageURL")
		geohash := request.PathValue("geohash")
		key := request.PathValue("key")

		if !validation.IsValidGeohash5(geohash) {
			log.Warn().Str("geohash", geohash).Msg("invalid geohash in image URL request")
			server.RespondWithError(writer, http.StatusBadRequest, validation.ErrInvalidGeohash, "invalid geohash")
			return
		}
		if !validation.IsValidIntelRowKey(key) {
			log.Warn().Str("key", key).Msg("invalid row key in image URL request")
			server.RespondWithError(writer, http.StatusBadRequest, validation.ErrInvalidIntelRowKey, "invalid key")
			return
		}

		imageURL, urlErr := roverService.GetPrivateIntelImageURL(request.Context(), key)
		if urlErr != nil {
			log.Error().Err(urlErr).Msg("failed to get intel image URL")
			server.RespondWithError(writer, http.StatusInternalServerError, urlErr, "failed to get image URL")
			return
		}
		resp := getIntelImageURLResponse{URL: imageURL}
		respBytes, marshalErr := json.Marshal(resp)
		if marshalErr != nil {
			log.Error().Err(marshalErr).Msg("failed to marshal image URL response")
			server.RespondWithError(writer, http.StatusInternalServerError, marshalErr, "failed to marshal response")
			return
		}
		server.RespondWithOk(writer, respBytes)
	}
}

func handleDeleteIntel(roverService *rover.RoverService, jwtSecret []byte, emailHashPepper string) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		log.Trace().Msg("handleDeleteIntel")

		email, emailErr := server.EmailFromCookie(request, jwtSecret)
		if emailErr != nil {
			log.Warn().Err(emailErr).Msg("missing or invalid auth cookie")
			server.RespondUnauthorized(writer)
			return
		}

		geohash := request.PathValue("geohash")
		key := request.PathValue("key")

		if !validation.IsValidGeohash5(geohash) {
			log.Warn().Str("geohash", geohash).Msg("invalid geohash in delete request")
			server.RespondWithError(writer, http.StatusBadRequest, validation.ErrInvalidGeohash, "invalid geohash")
			return
		}
		if !validation.IsValidIntelRowKey(key) {
			log.Warn().Str("key", key).Msg("invalid row key in delete request")
			server.RespondWithError(writer, http.StatusBadRequest, validation.ErrInvalidIntelRowKey, "invalid key")
			return
		}

		emailHash := security.HmacSha256Hex(email, emailHashPepper)

		deleteErr := roverService.DeletePrivateIntel(request.Context(), emailHash, geohash, key)
		if deleteErr != nil {
			if errors.Is(deleteErr, storage.ErrNotFound) {
				server.RespondWithError(writer, http.StatusNotFound, deleteErr, "intel not found")
				return
			}
			log.Error().Err(deleteErr).Msg("failed to delete intel")
			server.RespondWithError(writer, http.StatusInternalServerError, deleteErr, "failed to delete intel")
			return
		}
		server.RespondWithOk(writer, []byte("{}"))
	}
}

func handleAddComment(roverService *rover.RoverService, jwtSecret []byte, emailHashPepper string) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		log.Trace().Msg("handleAddComment")

		email, emailErr := server.EmailFromCookie(request, jwtSecret)
		if emailErr != nil {
			log.Warn().Err(emailErr).Msg("missing or invalid auth cookie")
			server.RespondUnauthorized(writer)
			return
		}

		geohash := request.PathValue("geohash")
		key := request.PathValue("key")

		if !validation.IsValidGeohash5(geohash) {
			log.Warn().Str("geohash", geohash).Msg("invalid geohash in add comment request")
			server.RespondWithError(writer, http.StatusBadRequest, validation.ErrInvalidGeohash, "invalid geohash")
			return
		}
		if !validation.IsValidIntelRowKey(key) {
			log.Warn().Str("key", key).Msg("invalid row key in add comment request")
			server.RespondWithError(writer, http.StatusBadRequest, validation.ErrInvalidIntelRowKey, "invalid key")
			return
		}

		var req addCommentRequest
		decodeErr := json.NewDecoder(request.Body).Decode(&req)
		if decodeErr != nil {
			log.Warn().Err(decodeErr).Msg("invalid comment request body")
			server.RespondWithError(writer, http.StatusBadRequest, decodeErr, "invalid request body")
			return
		}

		emailHash := security.HmacSha256Hex(email, emailHashPepper)
		comment := storage.PrivateIntelComment{
			IntelRowKey:   key,
			AuthorHash:    emailHash,
			EncryptedText: req.EncryptedText,
			Geohash:       geohash,
		}

		rowKey, addErr := roverService.AddComment(request.Context(), emailHash, geohash, key, comment)
		if addErr != nil {
			if errors.Is(addErr, storage.ErrNotFound) {
				server.RespondWithError(writer, http.StatusNotFound, addErr, "intel not found")
				return
			}
			if errors.Is(addErr, storage.ErrTooManyComments) {
				server.RespondWithError(writer, http.StatusConflict, addErr, "comment limit reached")
				return
			}
			if errors.Is(addErr, storage.ErrCommentInvalid) {
				server.RespondWithError(writer, http.StatusBadRequest, addErr, "invalid comment")
				return
			}
			log.Error().Err(addErr).Msg("failed to add comment")
			server.RespondWithError(writer, http.StatusInternalServerError, addErr, "failed to add comment")
			return
		}

		resp := addCommentResponse{RowKey: rowKey, AuthorHash: emailHash}
		respBytes, marshalErr := json.Marshal(resp)
		if marshalErr != nil {
			log.Error().Err(marshalErr).Msg("failed to marshal add comment response")
			server.RespondWithError(writer, http.StatusInternalServerError, marshalErr, "failed to marshal response")
			return
		}
		server.RespondWithOk(writer, respBytes)
	}
}

func handleListComments(roverService *rover.RoverService, jwtSecret []byte) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		log.Trace().Msg("handleListComments")

		_, emailErr := server.EmailFromCookie(request, jwtSecret)
		if emailErr != nil {
			log.Warn().Err(emailErr).Msg("missing or invalid auth cookie")
			server.RespondUnauthorized(writer)
			return
		}

		key := request.PathValue("key")
		if !validation.IsValidIntelRowKey(key) {
			log.Warn().Str("key", key).Msg("invalid row key in list comments request")
			server.RespondWithError(writer, http.StatusBadRequest, validation.ErrInvalidIntelRowKey, "invalid key")
			return
		}

		items, listErr := roverService.ListComments(request.Context(), key)
		if listErr != nil {
			log.Error().Err(listErr).Msg("failed to list comments")
			server.RespondWithError(writer, http.StatusInternalServerError, listErr, "failed to list comments")
			return
		}

		responseItems := make([]commentItem, len(items))
		for i, item := range items {
			responseItems[i] = commentItem{
				RowKey:        item.RowKey,
				AuthorHash:    item.AuthorHash,
				EncryptedText: item.EncryptedText,
				Geohash:       item.Geohash,
				CreatedAt:     item.CreatedAt,
			}
		}

		respBytes, marshalErr := json.Marshal(responseItems)
		if marshalErr != nil {
			log.Error().Err(marshalErr).Msg("failed to marshal list comments response")
			server.RespondWithError(writer, http.StatusInternalServerError, marshalErr, "failed to marshal response")
			return
		}
		server.RespondWithOk(writer, respBytes)
	}
}

func handleListIntel(roverService *rover.RoverService, jwtSecret []byte, emailHashPepper string) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		log.Trace().Msg("handleListIntel")

		email, emailErr := server.EmailFromCookie(request, jwtSecret)
		if emailErr != nil {
			log.Warn().Err(emailErr).Msg("missing or invalid auth cookie")
			server.RespondUnauthorized(writer)
			return
		}

		minLat, minLatErr := strconv.ParseFloat(request.URL.Query().Get("minLat"), 64)
		minLon, minLonErr := strconv.ParseFloat(request.URL.Query().Get("minLon"), 64)
		maxLat, maxLatErr := strconv.ParseFloat(request.URL.Query().Get("maxLat"), 64)
		maxLon, maxLonErr := strconv.ParseFloat(request.URL.Query().Get("maxLon"), 64)
		if minLatErr != nil || minLonErr != nil || maxLatErr != nil || maxLonErr != nil {
			log.Warn().
				Str("minLat", request.URL.Query().Get("minLat")).
				Str("minLon", request.URL.Query().Get("minLon")).
				Str("maxLat", request.URL.Query().Get("maxLat")).
				Str("maxLon", request.URL.Query().Get("maxLon")).
				Msg("invalid bbox parameters")
			server.RespondWithError(writer, http.StatusBadRequest, nil, "invalid bbox parameters")
			return
		}
		if minLat < geo.MinLat || maxLat > geo.MaxLat || minLon < geo.MinLon || maxLon > geo.MaxLon || minLat >= maxLat || minLon >= maxLon {
			log.Error().Float64("minLat", minLat).Float64("maxLat", maxLat).Float64("minLon", minLon).Float64("maxLon", maxLon).Msg("bbox out of range")
			server.RespondWithError(writer, http.StatusBadRequest, nil, "invalid bbox parameters")
			return
		}

		emailHash := security.HmacSha256Hex(email, emailHashPepper)
		geohashes := geo.BboxToGeohash5Cells(minLat, minLon, maxLat, maxLon)
		if len(geohashes) > maxGeohashQueryCells {
			log.Error().Int("cells", len(geohashes)).Msg("bbox query area too large")
			server.RespondWithError(writer, http.StatusBadRequest, nil, "query area too large")
			return
		}

		items, listErr := roverService.ListPrivateIntel(request.Context(), emailHash, geohashes)
		if listErr != nil {
			log.Error().Err(listErr).Msg("failed to list intel")
			server.RespondWithError(writer, http.StatusInternalServerError, listErr, "failed to list intel")
			return
		}

		responseItems := make([]listIntelItem, len(items))
		for i, item := range items {
			responseItems[i] = listIntelItem{
				Key:                 item.Key,
				Geohash:             item.Geohash,
				TimestampObfuscated: item.TimestampObfuscated,
				EncryptedPayload:    item.EncryptedPayload,
				HasImage:            item.ImageKey != "",
			}
		}

		respBytes, marshalErr := json.Marshal(responseItems)
		if marshalErr != nil {
			log.Error().Err(marshalErr).Msg("failed to marshal list intel response")
			server.RespondWithError(writer, http.StatusInternalServerError, marshalErr, "failed to marshal response")
			return
		}
		server.RespondWithOk(writer, respBytes)
	}
}

func awaitShutdown(apiServer *http.Server) {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), shutdownDeadlineSecs*gotime.Second)
	defer cancel()

	shutdownErr := apiServer.Shutdown(ctx)
	if shutdownErr != nil {
		log.Fatal().Err(shutdownErr).Msg("forced shutdown")
	}

	log.Info().Msg("server stopped")
}

func configureLogging() {
	log.Logger = zerolog.New(os.Stdout).With().Timestamp().Logger()
}

func main() {
	fmt.Fprintln(os.Stdout, "roverapi: process started")
	configureLogging()
	log.Info().Msg("starting up...")
	ctx := context.Background()

	tableRepo, tableRepoErr := storage.NewAZPrivateIntelRepository(
		config.RoverTableConnStr(),
		config.RoverPrivateIntelTableName(),
		config.RoverTimestampSecretBase(),
	)
	if tableRepoErr != nil {
		log.Fatal().Err(tableRepoErr).Msg("failed to create table repository")
	}

	tableInitErr := tableRepo.Initialize(ctx)
	if tableInitErr != nil {
		log.Fatal().Err(tableInitErr).Msg("failed to initialize table repository")
	}

	commentRepo, commentRepoErr := storage.NewAZPrivateIntelCommentRepository(
		config.RoverTableConnStr(),
		config.RoverCommentTableName(),
	)
	if commentRepoErr != nil {
		log.Fatal().Err(commentRepoErr).Msg("failed to create comment repository")
	}

	commentInitErr := commentRepo.Initialize(ctx)
	if commentInitErr != nil {
		log.Fatal().Err(commentInitErr).Msg("failed to initialize comment repository")
	}

	imageRepo, imageRepoErr := storage.NewS3IntelImageRepository(
		config.RoverStoreEndpoint(),
		config.RoverStorePublicEndpoint(),
		config.RoverStoreBucket(),
		config.RoverStoreAccessKey(),
		config.RoverStoreSecretKey(),
	)
	if imageRepoErr != nil {
		log.Fatal().Err(imageRepoErr).Msg("failed to create image repository")
	}

	imageInitErr := imageRepo.Initialize(ctx)
	if imageInitErr != nil {
		log.Fatal().Err(imageInitErr).Msg("failed to initialize image repository")
	}

	roverService, roverServiceErr := rover.NewRoverService(
		rover.WithPrivateMetadataRepository(tableRepo),
		rover.WithImageRepository(imageRepo),
		rover.WithCommentRepository(commentRepo),
	)
	if roverServiceErr != nil {
		log.Fatal().Err(roverServiceErr).Msg("failed to create rover service")
	}

	jwtSecret := config.JWTSecret()
	allowedOrigins := config.AllowedRoverOrigins()
	emailHashPepper := config.RoverIntelEmailHashPepper()
	timestampPepper := config.RoverTimestampPepper()

	mux := http.NewServeMux()
	mux.HandleFunc("/rover/health", handleHealth)
	mux.HandleFunc("POST /rover/intel", server.WithOriginCheck(allowedOrigins, server.WithCookieAuth(jwtSecret, server.WithRequestSizeLimit(maxRequestBodyBytes, handleStoreIntel(roverService, jwtSecret, emailHashPepper, timestampPepper)))))
	mux.HandleFunc("GET /rover/intel", server.WithOriginCheck(allowedOrigins, server.WithCookieAuth(jwtSecret, server.WithRequestSizeLimit(maxSmallRequestBodyBytes, handleListIntel(roverService, jwtSecret, emailHashPepper)))))
	mux.HandleFunc("GET /rover/intel/{geohash}/{key}", server.WithOriginCheck(allowedOrigins, server.WithCookieAuth(jwtSecret, server.WithRequestSizeLimit(maxSmallRequestBodyBytes, handleGetIntelImageURL(roverService)))))
	mux.HandleFunc("PUT /rover/intel/{geohash}/{key}", server.WithOriginCheck(allowedOrigins, server.WithCookieAuth(jwtSecret, server.WithRequestSizeLimit(maxSmallRequestBodyBytes, handleUpdateIntel(roverService, jwtSecret, emailHashPepper)))))
	mux.HandleFunc("DELETE /rover/intel/{geohash}/{key}", server.WithOriginCheck(allowedOrigins, server.WithCookieAuth(jwtSecret, server.WithRequestSizeLimit(maxSmallRequestBodyBytes, handleDeleteIntel(roverService, jwtSecret, emailHashPepper)))))
	mux.HandleFunc("GET /rover/intel/{geohash}/{key}/comments", server.WithOriginCheck(allowedOrigins, server.WithCookieAuth(jwtSecret, server.WithRequestSizeLimit(maxSmallRequestBodyBytes, handleListComments(roverService, jwtSecret)))))
	mux.HandleFunc("POST /rover/intel/{geohash}/{key}/comments", server.WithOriginCheck(allowedOrigins, server.WithCookieAuth(jwtSecret, server.WithRequestSizeLimit(maxCommentBodyBytes, handleAddComment(roverService, jwtSecret, emailHashPepper)))))

	apiServer := &http.Server{
		Addr:    listenAddr(),
		Handler: mux,
	}

	if config.ServerlessMode() {
		log.Info().Msg("serverless mode enabled - blocking on ListenAndServe")
		listenErr := apiServer.ListenAndServe()
		if listenErr != nil {
			log.Fatal().Err(listenErr).Msg("server error")
		}
	} else {
		go func() {
			listenErr := apiServer.ListenAndServe()
			if listenErr != nil && listenErr != http.ErrServerClosed {
				log.Fatal().Err(listenErr).Msg("server error")
			}
		}()
		awaitShutdown(apiServer)
	}
}
