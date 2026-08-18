import { describe, expect, it } from "vitest";
import { describeAudit, roleLabel, type AuditLogRow } from "@/lib/audit";

function label(entityType: string, action: string): string {
  return describeAudit({ entityType, action } as AuditLogRow);
}

describe("describeAudit", () => {
  it("labels entity names", () => {
    expect(label("trainee", "created")).toBe("Trainee created");
    expect(label("attendance", "checkin")).toBe("Attendance checked in");
    expect(label("score_sheet", "scores_saved")).toBe("Score sheet saved scores");
    expect(label("schedule", "created")).toBe("Schedule created");
    expect(label("staff", "created")).toBe("Staff created");
    expect(label("exam", "created")).toBe("Exam created");
    expect(label("profile", "updated")).toBe("Profile updated");
    expect(label("course", "course_added")).toBe("Course added course");
    expect(label("support", "ticket_resolved")).toBe("Support ticket resolved");
  });

  it("falls back to 'Account' for unknown entity types", () => {
    expect(label("widget", "created")).toBe("Account created");
    expect(label("auth", "password_reset")).toBe("Account reset password");
  });

  it("labels the common actions", () => {
    expect(label("trainee", "approved")).toBe("Trainee approved");
    expect(label("trainee", "status")).toBe("Trainee changed status");
    expect(label("trainee", "device_reset")).toBe("Trainee reset device binding");
    expect(label("attendance", "attendance_marked")).toBe("Attendance marked attendance");
    expect(label("attendance", "attendance_confirmed")).toBe(
      "Attendance confirmed attendance"
    );
  });

  it("labels the exam lifecycle actions", () => {
    expect(label("exam", "exam_updated")).toBe("Exam updated exam");
    expect(label("exam", "exam_deleted")).toBe("Exam deleted exam");
    expect(label("exam", "exam_opened")).toBe("Exam opened exam");
    expect(label("exam", "exam_closed")).toBe("Exam closed exam");
    expect(label("exam", "exam_reopened")).toBe("Exam reopened exam");
    expect(label("exam", "exam_graded")).toBe("Exam graded exam");
    expect(label("exam", "exam_override")).toBe("Exam granted exam override");
  });

  it("labels account/suspension/support actions", () => {
    expect(label("staff", "role_promoted")).toBe("Staff promoted");
    expect(label("trainee", "suspended")).toBe("Trainee suspended");
    expect(label("trainee", "restored")).toBe("Trainee restored");
    expect(label("trainee", "suspend_requested")).toBe("Trainee requested suspension");
    expect(label("trainee", "suspend_confirmed")).toBe("Trainee confirmed suspension");
    expect(label("trainee", "suspend_rejected")).toBe("Trainee rejected suspension request");
    expect(label("auth", "password_reset")).toBe("Account reset password");
    expect(label("support", "ticket_reopened")).toBe("Support ticket reopened");
  });

  it("passes through unknown actions verbatim", () => {
    expect(label("trainee", "some_future_action")).toBe("Trainee some_future_action");
  });
});

describe("roleLabel", () => {
  it("maps the known roles", () => {
    expect(roleLabel("master_admin")).toBe("Master admin");
    expect(roleLabel("admin")).toBe("Admin");
    expect(roleLabel("student")).toBe("Student");
  });

  it("handles null and unknown values", () => {
    expect(roleLabel(null)).toBe("");
    expect(roleLabel("other_role")).toBe("other_role");
  });
});
