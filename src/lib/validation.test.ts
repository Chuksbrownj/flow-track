import { describe, expect, it } from "vitest";
import {
  isUuid,
  isValidEmail,
  isValidUrl,
  validatePassword,
  validateSchedule,
  validateScore,
  validateSignup,
  validateTrainee,
} from "@/lib/validation";

describe("isValidEmail", () => {
  it("accepts well-formed emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("user+tag@sub.example.co")).toBe(true);
  });

  it("rejects malformed emails", () => {
    expect(isValidEmail("user@example")).toBe(false);
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("user @example.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("isUuid", () => {
  it("accepts valid UUIDs (case-insensitive)", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuid("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
  });

  it("rejects non-UUID strings", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("123e4567-e89b-12d3-a456")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

describe("validateTrainee", () => {
  const valid = {
    registrationNumber: "1234",
    fullName: "Ada Lovelace",
    gender: "Female",
    phone: "08012345678",
    email: "ada@example.com",
  };

  it("returns null for valid input", () => {
    expect(validateTrainee(valid)).toBeNull();
  });

  it("allows an empty email", () => {
    expect(validateTrainee({ ...valid, email: "" })).toBeNull();
  });

  it("requires a registration number", () => {
    expect(validateTrainee({ ...valid, registrationNumber: "" })).toBe(
      "Registration number is required."
    );
  });

  it("enforces the registration number length", () => {
    expect(validateTrainee({ ...valid, registrationNumber: "12" })).toBe(
      "Registration number must be 3–30 characters."
    );
  });

  it("rejects non-numeric registration numbers", () => {
    expect(validateTrainee({ ...valid, registrationNumber: "abc123" })).toBe(
      "Registration number may only contain numbers."
    );
  });

  it("requires a full name of at least 3 characters", () => {
    expect(validateTrainee({ ...valid, fullName: "Ab" })).toBe(
      "Full name is required (at least 3 characters)."
    );
  });

  it("rejects unknown genders", () => {
    expect(validateTrainee({ ...valid, gender: "Other" })).toBe(
      "Please choose a valid gender."
    );
  });

  it("rejects invalid phone numbers", () => {
    expect(validateTrainee({ ...valid, phone: "12" })).toBe(
      "Please enter a valid phone number."
    );
    expect(validateTrainee({ ...valid, phone: "call me!" })).toBe(
      "Please enter a valid phone number."
    );
  });

  it("rejects malformed emails when provided", () => {
    expect(validateTrainee({ ...valid, email: "not-an-email" })).toBe(
      "Please enter a valid email address."
    );
  });
});

describe("validatePassword", () => {
  it("requires at least 8 characters", () => {
    expect(validatePassword("1234567")).toBe("Password must be at least 8 characters.");
  });

  it("rejects passwords over 128 characters", () => {
    expect(validatePassword("x".repeat(129))).toBe(
      "Password is too long (max 128 characters)."
    );
  });

  it("accepts 8–128 characters", () => {
    expect(validatePassword("12345678")).toBeNull();
    expect(validatePassword("x".repeat(128))).toBeNull();
  });
});

describe("validateSignup", () => {
  const valid = {
    registrationNumber: "1234",
    fullName: "Ada Lovelace",
    gender: "Female",
    email: "ada@example.com",
    phone: "08012345678",
    password: "supersecret",
  };

  it("returns null for valid input", () => {
    expect(validateSignup(valid)).toBeNull();
  });

  it("requires an email (unlike a staff-entered trainee)", () => {
    expect(validateSignup({ ...valid, email: "" })).toBe(
      "Please enter a valid email address."
    );
  });

  it("rejects weak passwords", () => {
    expect(validateSignup({ ...valid, password: "short" })).toBe(
      "Password must be at least 8 characters."
    );
  });
});

describe("isValidUrl", () => {
  it("accepts http(s) URLs", () => {
    expect(isValidUrl("https://forms.gle/abc123")).toBe(true);
    expect(isValidUrl("http://example.com/x")).toBe(true);
  });

  it("rejects other protocols and garbage", () => {
    expect(isValidUrl("ftp://example.com")).toBe(false);
    expect(isValidUrl("javascript:alert(1)")).toBe(false);
    expect(isValidUrl("example.com")).toBe(false);
    expect(isValidUrl("")).toBe(false);
  });
});

describe("validateScore", () => {
  it("accepts 0–100", () => {
    expect(validateScore(0)).toBeNull();
    expect(validateScore(50.5)).toBeNull();
    expect(validateScore(100)).toBeNull();
  });

  it("rejects out-of-range and NaN values", () => {
    expect(validateScore(-1)).toBe("Scores must be between 0 and 100.");
    expect(validateScore(101)).toBe("Scores must be between 0 and 100.");
    expect(validateScore(Number.NaN)).toBe("Scores must be between 0 and 100.");
  });
});

describe("validateSchedule", () => {
  const valid = {
    title: "Design principles",
    programme: "Graphic Design",
    date: "2026-08-17",
    startTime: "10:00",
    endTime: "12:00",
  };

  it("returns null for valid input", () => {
    expect(validateSchedule(valid)).toBeNull();
  });

  it("requires a title of at least 3 characters", () => {
    expect(validateSchedule({ ...valid, title: "Ab" })).toBe(
      "Title is required (at least 3 characters)."
    );
  });

  it("requires a programme", () => {
    expect(validateSchedule({ ...valid, programme: "" })).toBe("Programme is required.");
  });

  it("requires an ISO date", () => {
    expect(validateSchedule({ ...valid, date: "17-08-2026" })).toBe(
      "Please choose a valid date."
    );
  });

  it("rejects malformed times", () => {
    expect(validateSchedule({ ...valid, startTime: "25:00" })).toBe(
      "Please choose a valid start time."
    );
    expect(validateSchedule({ ...valid, endTime: "9am" })).toBe(
      "Please choose a valid end time."
    );
  });

  it("requires the end time to be after the start time", () => {
    expect(validateSchedule({ ...valid, startTime: "10:00", endTime: "10:00" })).toBe(
      "End time must be after start time."
    );
    expect(validateSchedule({ ...valid, startTime: "12:00", endTime: "10:00" })).toBe(
      "End time must be after start time."
    );
  });
});
