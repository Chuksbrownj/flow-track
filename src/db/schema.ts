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
