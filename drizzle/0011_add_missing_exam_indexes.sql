CREATE INDEX "assessment_questions_exam_idx" ON "assessment_questions" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "assessment_submissions_trainee_idx" ON "assessment_submissions" USING btree ("trainee_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");