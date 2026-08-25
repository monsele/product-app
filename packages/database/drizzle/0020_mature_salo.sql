CREATE TYPE "public"."source_document_ingestion_artifact_state" AS ENUM('staging', 'ready');--> statement-breakpoint
ALTER TABLE "source_document_ingestion_artifacts" ADD COLUMN "configuration_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_document_ingestion_artifacts" ADD COLUMN "processing_time_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "source_document_ingestion_artifacts" ADD COLUMN "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "source_document_ingestion_artifacts" ADD COLUMN "state" "source_document_ingestion_artifact_state" DEFAULT 'ready' NOT NULL;