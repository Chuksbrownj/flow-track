ALTER TABLE "attendance" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "confirmed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trainees" ADD COLUMN "device_fingerprint" text;--> statement-breakpoint
ALTER TABLE "trainees" ADD COLUMN "device_ip" text;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainees" ADD CONSTRAINT "trainees_device_fingerprint_unique" UNIQUE("device_fingerprint");