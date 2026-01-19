package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	gotime "time"

	"github.com/rs/zerolog/log"
	"openintel.jp/roverapi/internal/config"
	"openintel.jp/roverapi/internal/server"
)

//
// Consts and Globals

const (
	httpPort             = ":8081"
	shutdownDeadlineSecs = 30
)

//
// Functions

func handleHealth(writer http.ResponseWriter, request *http.Request) {
	log.Trace().Msg("handleHealth")
	server.RespondWithOk(writer, []byte("ok"))
}

func awaitShutdown(apiServer *http.Server) {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), shutdownDeadlineSecs*gotime.Second)
	defer cancel()

	if err := apiServer.Shutdown(ctx); err != nil {
		log.Fatal().Err(err).Msg("forced shutdown")
	}

	log.Info().Msg("server stopped")
}

//
// Main

func main() {
	log.Info().Msg("starting up...")
	mux := http.NewServeMux()
	mux.HandleFunc("/rover/health", handleHealth)

	apiServer := &http.Server{
		Addr:    httpPort,
		Handler: mux,
	}

	if config.ServerlessMode() {
		log.Info().Msg("serverless mode enabled - blocking on ListenAndServe")
		if err := apiServer.ListenAndServe(); err != nil {
			log.Fatal().Err(err).Msg("server error")
		}
	} else {
		go func() {
			if err := apiServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Fatal().Err(err).Msg("server error")
			}
		}()
		awaitShutdown(apiServer)
	}
}
