CREATE TABLE "trainee_change_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainee_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_name" text,
	"action" text NOT NULL,
	"field" text,
	"before" text,
	"after" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trainee_change_logs" ADD CONSTRAINT "trainee_change_logs_trainee_id_trainees_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."trainees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainee_change_logs" ADD CONSTRAINT "trainee_change_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;