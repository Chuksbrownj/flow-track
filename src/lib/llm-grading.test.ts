import { describe, expect, it } from "vitest";
import { parseGradeJson, sanitizeLlmGrades } from "@/lib/llm-grading";

describe("sanitizeLlmGrades", () => {
  const questions = [
    { id: "q1", prompt: "Explain X", points: 5 },
    { id: "q2", prompt: "Explain Y", points: 10 },
  ];

  it("keeps valid scores within bounds", () => {
    const result = sanitizeLlmGrades({ q1: 4, q2: 7 }, questions);
    expect(result).toEqual({ q1: 4, q2: 7 });
  });

  it("clamps scores above the question's points", () => {
    const result = sanitizeLlmGrades({ q1: 99, q2: 3 }, questions);
    expect(result).toEqual({ q1: 5, q2: 3 });
  });

  it("clamps scores below zero and drops non-integers", () => {
    const result = sanitizeLlmGrades({ q1: -2, q2: 3.7 }, questions);
    expect(result).toEqual({ q1: 0 });
  });

  it("ignores invented question ids", () => {
    const result = sanitizeLlmGrades({ q1: 5, fake: 8 }, questions);
    expect(result).toEqual({ q1: 5 });
  });

  it("returns null for empty input", () => {
    expect(sanitizeLlmGrades(null, questions)).toBeNull();
    expect(sanitizeLlmGrades({}, questions)).toBeNull();
  });
});

describe("parseGradeJson", () => {
  it("extracts a JSON object from wrapped prose", () => {
    const text = 'Here are the grades:\n{"q1": 4, "q2": 8}\nLet me know if you disagree.';
    expect(parseGradeJson(text)).toEqual({ q1: 4, q2: 8 });
  });

  it("accepts a bare JSON object", () => {
    expect(parseGradeJson('{"q1": 5}')).toEqual({ q1: 5 });
  });

  it("returns null for non-JSON text", () => {
    expect(parseGradeJson("I could not grade this exam.")).toBeNull();
  });
});
