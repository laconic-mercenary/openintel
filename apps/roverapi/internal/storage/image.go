package storage

import (
	"bytes"
	"context"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/rs/zerolog/log"
)

//
// consts and globals

const imageObjectKeySuffix = ".jpg"

//
// types

type S3IntelImageRepository struct {
	client        *s3.Client
	presignClient *s3.PresignClient
	bucketName    string
}

//
// functions

func NewS3IntelImageRepository(internalEndpoint, publicEndpoint, bucket, accessKey, secretKey string) (*S3IntelImageRepository, error) {
	log.Trace().Msg("NewS3IntelImageRepository")
	cfg, cfgErr := awsconfig.LoadDefaultConfig(
		context.Background(),
		awsconfig.WithRegion("us-east-1"),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
	)
	if cfgErr != nil {
		log.Error().Err(cfgErr).Msg("error loading aws config")
		return nil, cfgErr
	}
	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(internalEndpoint)
		o.UsePathStyle = true
	})
	publicClient := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(publicEndpoint)
		o.UsePathStyle = true
	})
	return &S3IntelImageRepository{
		client:        client,
		presignClient: s3.NewPresignClient(publicClient),
		bucketName:    bucket,
	}, nil
}

//
// methods

func (r *S3IntelImageRepository) Initialize(ctx context.Context) error {
	log.Trace().Msg("Initialize")
	return nil
}

func (r *S3IntelImageRepository) StoreIntelImage(ctx context.Context, key string, imageData []byte) error {
	log.Trace().Msg("StoreIntelImage")
	objectKey := key + imageObjectKeySuffix
	_, putErr := r.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      &r.bucketName,
		Key:         &objectKey,
		Body:        bytes.NewReader(imageData),
		ContentType: aws.String("image/jpeg"),
	})
	if putErr != nil {
		log.Error().Err(putErr).Str("key", key).Msg("error storing intel image")
		return putErr
	}
	return nil
}

func (r *S3IntelImageRepository) GetIntelImage(ctx context.Context, key string) ([]byte, error) {
	log.Trace().Msg("GetIntelImage")
	objectKey := key + imageObjectKeySuffix
	resp, getErr := r.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: &r.bucketName,
		Key:    &objectKey,
	})
	if getErr != nil {
		log.Error().Err(getErr).Str("key", key).Msg("error getting intel image")
		return nil, getErr
	}
	defer resp.Body.Close()
	imageData, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		log.Error().Err(readErr).Str("key", key).Msg("error reading intel image body")
		return nil, readErr
	}
	return imageData, nil
}

func (r *S3IntelImageRepository) GetIntelImagePresignedPutURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	log.Trace().Msg("GetIntelImagePresignedPutURL")
	objectKey := key + imageObjectKeySuffix
	presigned, presignErr := r.presignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket: &r.bucketName,
		Key:    &objectKey,
	}, s3.WithPresignExpires(expiry))
	if presignErr != nil {
		log.Error().Err(presignErr).Str("key", key).Msg("error presigning intel image PUT URL")
		return "", presignErr
	}
	return presigned.URL, nil
}

func (r *S3IntelImageRepository) GetIntelImagePresignedURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	log.Trace().Msg("GetIntelImagePresignedURL")
	objectKey := key + imageObjectKeySuffix
	presigned, presignErr := r.presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: &r.bucketName,
		Key:    &objectKey,
	}, s3.WithPresignExpires(expiry))
	if presignErr != nil {
		log.Error().Err(presignErr).Str("key", key).Msg("error presigning intel image URL")
		return "", presignErr
	}
	return presigned.URL, nil
}

func (r *S3IntelImageRepository) DeleteIntelImage(ctx context.Context, key string) error {
	log.Trace().Msg("DeleteIntelImage")
	objectKey := key + imageObjectKeySuffix
	_, deleteErr := r.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: &r.bucketName,
		Key:    &objectKey,
	})
	if deleteErr != nil {
		log.Error().Err(deleteErr).Str("key", key).Msg("error deleting intel image")
		return deleteErr
	}
	return nil
}
