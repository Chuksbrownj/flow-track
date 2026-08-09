CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_name" text,
	"actor_role" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessments" DROP CONSTRAINT "assessments_trainee_id_unique";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'student';--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "week" date;--> statement-breakpoint
ALTER TABLE "training_schedule" ADD COLUMN "google_form_url" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
--> statement-breakpoint
-- Backfill existing score rows with the Monday of the week they were last updated.
UPDATE "assessments" SET "week" = date_trunc('week', COALESCE("updated_at", "created_at"))::date WHERE "week" IS NULL;
--> statement-breakpoint
ALTER TABLE "assessments" ALTER COLUMN "week" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "assessments_trainee_week_idx" ON "assessments" USING btree ("trainee_id","week");
--> statement-breakpoint
-- Rename roles: admin -> master_admin, trainer -> admin, trainee -> student.
UPDATE "users" SET "role" = 'master_admin' WHERE "role" = 'admin';
UPDATE "users" SET "role" = 'admin' WHERE "role" = 'trainer';
UPDATE "users" SET "role" = 'student' WHERE "role" = 'trainee';
