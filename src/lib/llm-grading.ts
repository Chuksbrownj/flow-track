/**
 * First-pass LLM suggestion for written (theory) exam answers.
 *
 * The suggested grades are never final: they are stored on the submission and
 * shown to the trainer in the review queue, who approves or overrides each one.
 * Only the reviewed grade is shown to the trainee.
 *
 * Fully optional — if GEMINI_API_KEY is not set or the call fails, the trainer
 * grades manually (the app never depends on the LLM being available).
 */

export type WrittenQuestionForLlm = {
  id: string;
  prompt: string;
  points: number;
};

const MAX_ATTEMPTS = 2;

/**
 * Asks Gemini to suggest a score (0..points) for each written answer.
 * Returns a {questionId: score} map, or null when the LLM is unavailable.
 */
export async function suggestWrittenGrades(
  questions: WrittenQuestionForLlm[],
  answers: Record<string, string>
): Promise<Record<string, number> | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = questions
    .map((question) => {
      const answer = (answers[question.id] ?? "").trim() || "(no answer given)";
      return {
        questionId: question.id,
        prompt: question.prompt,
        maxPoints: question.points,
        answer,
      };
    })
    .map((entry) => JSON.stringify(entry))
    .join(",\n");

  const systemPrompt = [
    "You are a strict exam grader. Grade each written answer on how well it answers the question.",
    "Return ONLY a JSON object mapping each questionId to a whole-number score between 0 and its maxPoints.",
    "Be fair but rigorous: partial understanding earns partial credit; irrelevant or empty answers earn 0.",
    `Questions:\n[\n${payload}\n]`,
  ].join("\n");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error("Gemini grading failed:", response.status, body.slice(0, 200));
        return null;
      }

      const data = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const parsed = parseGradeJson(text);
      if (parsed && Object.keys(parsed).length > 0) return parsed;
    } catch (error) {
      console.error("Gemini grading request error:", error);
    }
  }

  return null;
}

/** Extracts a {questionId: number} map from whatever Gemini returns. */
export function parseGradeJson(text: string): Record<string, number> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw)) {
      const num = Number(value);
      if (Number.isInteger(num) && num >= 0) result[key] = num;
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Sanitizes LLM suggestions against the actual question list, so an LLM that
 * invents question ids or out-of-range scores can never corrupt grading.
 */
export function sanitizeLlmGrades(
  raw: Record<string, number> | null,
  questions: WrittenQuestionForLlm[]
): Record<string, number> | null {
  if (!raw) return null;
  const result: Record<string, number> = {};
  for (const question of questions) {
    const value = raw[question.id];
    if (typeof value === "number" && Number.isInteger(value)) {
      result[question.id] = Math.max(0, Math.min(value, question.points));
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}
