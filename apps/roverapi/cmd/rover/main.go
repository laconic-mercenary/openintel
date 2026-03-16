package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	gotime "time"

	"github.com/rs/zerolog/log"
	"openintel.jp/roverapi/internal/config"
	"openintel.jp/roverapi/internal/server"
	"openintel.jp/roverapi/internal/storage"
	"openintel.jp/roverapi/pkg/rover"
)

//
// consts and globals

const (
	httpPort             = ":8081"
	shutdownDeadlineSecs = 30
	maxRequestBodyBytes  = 10 << 20
)

//
// types

type storeIntelRequest struct {
	Key         string  `json:"key"`
	Image       string  `json:"image"`
	Description string  `json:"description"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Accuracy    float64 `json:"accuracy"`
	Timestamp   int64   `json:"timestamp"`
}

type storeIntelResponse struct {
	Key     string `json:"key"`
	Geohash string `json:"geohash"`
}

type getIntelImageURLResponse struct {
	URL string `json:"url"`
}

//
// functions

func handleHealth(writer http.ResponseWriter, request *http.Request) {
	log.Trace().Msg("handleHealth")
	server.RespondWithOk(writer, []byte("ok"))
}

func handleStoreIntel(roverService *rover.RoverService) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		log.Trace().Msg("handleStoreIntel")
		request.Body = http.MaxBytesReader(writer, request.Body, maxRequestBodyBytes)

		var req storeIntelRequest
		decodeErr := json.NewDecoder(request.Body).Decode(&req)
		if decodeErr != nil {
			server.RespondWithError(writer, http.StatusBadRequest, decodeErr, "invalid request body")
			return
		}

		image := req.Image
		if commaIdx := strings.Index(image, ","); commaIdx != -1 {
			image = image[commaIdx+1:]
		}

		intel := storage.Intel{
			Key:         req.Key,
			Image:       image,
			Description: req.Description,
			Latitude:    req.Latitude,
			Longitude:   req.Longitude,
			Accuracy:    req.Accuracy,
			Timestamp:   req.Timestamp,
		}

		geohash, storeErr := roverService.StoreIntel(request.Context(), intel)
		if storeErr != nil {
			server.RespondWithError(writer, http.StatusInternalServerError, storeErr, "failed to store intel")
			return
		}

		resp := storeIntelResponse{Key: req.Key, Geohash: geohash}
		respBytes, marshalErr := json.Marshal(resp)
		if marshalErr != nil {
			server.RespondWithError(writer, http.StatusInternalServerError, marshalErr, "failed to marshal response")
			return
		}
		server.RespondWithOk(writer, respBytes)
	}
}

func handleGetIntelImageURL(roverService *rover.RoverService) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		log.Trace().Msg("handleGetIntelImageURL")
		key := request.PathValue("key")
		imageURL, urlErr := roverService.GetIntelImageURL(request.Context(), key)
		if urlErr != nil {
			server.RespondWithError(writer, http.StatusInternalServerError, urlErr, "failed to get image URL")
			return
		}
		resp := getIntelImageURLResponse{URL: imageURL}
		respBytes, marshalErr := json.Marshal(resp)
		if marshalErr != nil {
			server.RespondWithError(writer, http.StatusInternalServerError, marshalErr, "failed to marshal response")
			return
		}
		server.RespondWithOk(writer, respBytes)
	}
}

func handleDeleteIntel(roverService *rover.RoverService) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		log.Trace().Msg("handleDeleteIntel")
		geohash := request.PathValue("geohash")
		key := request.PathValue("key")
		deleteErr := roverService.DeleteIntel(request.Context(), geohash, key)
		if deleteErr != nil {
			server.RespondWithError(writer, http.StatusInternalServerError, deleteErr, "failed to delete intel")
			return
		}
		server.RespondWithOk(writer, []byte("{}"))
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

func main() {
	log.Info().Msg("starting up...")
	ctx := context.Background()

	tableRepo, tableRepoErr := storage.NewAzureTableIntelRepository(
		config.RoverTableConnStr(),
		config.RoverTableName(),
	)
	if tableRepoErr != nil {
		log.Fatal().Err(tableRepoErr).Msg("failed to create table repository")
	}

	tableInitErr := tableRepo.Initialize(ctx)
	if tableInitErr != nil {
		log.Fatal().Err(tableInitErr).Msg("failed to initialize table repository")
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
		rover.WithMetadataRepository(tableRepo),
		rover.WithImageRepository(imageRepo),
	)
	if roverServiceErr != nil {
		log.Fatal().Err(roverServiceErr).Msg("failed to create rover service")
	}

	jwtSecret := config.JWTSecret()
	allowedOrigins := config.AllowedRoverOrigins()

	mux := http.NewServeMux()
	mux.HandleFunc("/rover/health", handleHealth)
	mux.HandleFunc("/rover/intel", server.WithOriginCheck(allowedOrigins, server.WithCookieAuth(jwtSecret, server.WithMethodCheck(http.MethodPost, handleStoreIntel(roverService)))))
	mux.HandleFunc("GET /rover/intel/{geohash}/{key}/image-url", server.WithOriginCheck(allowedOrigins, server.WithCookieAuth(jwtSecret, handleGetIntelImageURL(roverService))))
	mux.HandleFunc("DELETE /rover/intel/{geohash}/{key}", server.WithOriginCheck(allowedOrigins, server.WithCookieAuth(jwtSecret, handleDeleteIntel(roverService))))

	apiServer := &http.Server{
		Addr:    httpPort,
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
