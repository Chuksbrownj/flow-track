CREATE TABLE "assessment_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainee_id" uuid NOT NULL,
	"week" date NOT NULL,
	"course_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_number" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"registration_number" text,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
CREATE TABLE "suspend_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainee_id" uuid NOT NULL,
	"requested_by_id" uuid,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Seed the default active courses. HP LIFE is removed from the programme entirely.
INSERT INTO "courses" ("name") VALUES ('Graphic Design'), ('Data Analysis'), ('2D & 3D Animation');
--> statement-breakpoint
-- Migrate existing weekly scores into the new course-scoped table (HP LIFE
-- scores are dropped along with the removed course).
INSERT INTO "assessment_scores" ("trainee_id", "week", "course_id", "score")
SELECT a."trainee_id", a."week", c."id", a."graphic_design"
FROM "assessments" a
JOIN "courses" c ON c."name" = 'Graphic Design'
WHERE a."graphic_design" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "assessment_scores" ("trainee_id", "week", "course_id", "score")
SELECT a."trainee_id", a."week", c."id", a."data_analysis"
FROM "assessments" a
JOIN "courses" c ON c."name" = 'Data Analysis'
WHERE a."data_analysis" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "assessment_scores" ("trainee_id", "week", "course_id", "score")
SELECT a."trainee_id", a."week", c."id", a."animation"
FROM "assessments" a
JOIN "courses" c ON c."name" = '2D & 3D Animation'
WHERE a."animation" IS NOT NULL;
--> statement-breakpoint
DROP TABLE "assessments" CASCADE;--> statement-breakpoint
ALTER TABLE "trainees" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_trainee_id_trainees_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."trainees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspend_requests" ADD CONSTRAINT "suspend_requests_trainee_id_trainees_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."trainees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspend_requests" ADD CONSTRAINT "suspend_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspend_requests" ADD CONSTRAINT "suspend_requests_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_scores_trainee_week_course_idx" ON "assessment_scores" USING btree ("trainee_id","week","course_id");
