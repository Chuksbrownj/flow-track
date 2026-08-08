import { relations } from "drizzle-orm";
import {
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"),
  topic: text("topic"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const trainees = pgTable("trainees", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "set null" })
    .unique(),
  registrationNumber: text("registration_number").unique(),
  fullName: text("full_name").notNull(),
  gender: text("gender").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  status: text("status").notNull().default("active"),
  deviceFingerprint: text("device_fingerprint").unique(),
  deviceIp: text("device_ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => trainees.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: text("status").notNull(),
    source: text("source").notNull().default("manual"),
    confirmedById: uuid("confirmed_by_id").references(() => users.id, { onDelete: "set null" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("attendance_trainee_date_idx").on(t.traineeId, t.date)]
);

export const assessments = pgTable("assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  traineeId: uuid("trainee_id")
    .notNull()
    .references(() => trainees.id, { onDelete: "cascade" })
    .unique(),
  graphicDesign: integer("graphic_design"),
  animation: integer("animation"),
  dataAnalysis: integer("data_analysis"),
  hpLife: integer("hp_life"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const exams = pgTable("assessment_exams", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  topic: text("topic").notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  status: text("status").notNull().default("draft"),
  opensAt: timestamp("opens_at", { withTimezone: true }),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const examQuestions = pgTable("assessment_questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  examId: uuid("exam_id")
    .notNull()
    .references(() => exams.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  prompt: text("prompt").notNull(),
  options: text("options"),
  correctOption: integer("correct_option"),
  points: integer("points").notNull().default(1),
  order: integer("order").notNull().default(0),
});

export const examSubmissions = pgTable(
  "assessment_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => trainees.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    currentQuestion: integer("current_question").notNull().default(0),
    fullscreenViolations: integer("fullscreen_violations").notNull().default(0),
    answers: text("answers"),
    autoScore: integer("auto_score"),
    totalPoints: integer("total_points").notNull().default(0),
    writtenScore: integer("written_score"),
    writtenGrades: text("written_grades"),
    gradedById: uuid("graded_by_id").references(() => users.id, { onDelete: "set null" }),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    overriddenAt: timestamp("overridden_at", { withTimezone: true }),
    overriddenById: uuid("overridden_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("assessment_submissions_exam_trainee_idx").on(t.examId, t.traineeId)]
);

export const traineeChangeLogs = pgTable("trainee_change_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  traineeId: uuid("trainee_id")
    .notNull()
    .references(() => trainees.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  actorName: text("actor_name"),
  action: text("action").notNull(),
  field: text("field"),
  before: text("before"),
  after: text("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

export const trainingSchedule = pgTable("training_schedule", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  programme: text("programme").notNull(),
  date: date("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const traineesRelations = relations(trainees, ({ many }) => ({
  attendance: many(attendance),
  assessments: many(assessments),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  trainee: one(trainees, {
    fields: [attendance.traineeId],
    references: [trainees.id],
  }),
}));

export const assessmentsRelations = relations(assessments, ({ one }) => ({
  trainee: one(trainees, {
    fields: [assessments.traineeId],
    references: [trainees.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Trainee = typeof trainees.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type Assessment = typeof assessments.$inferSelect;
export type TrainingSession = typeof trainingSchedule.$inferSelect;
