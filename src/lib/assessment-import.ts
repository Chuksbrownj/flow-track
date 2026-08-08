import * as XLSX from "xlsx";

export type ImportedQuestion = {
  type: "objective" | "written";
  prompt: string;
  options: string[] | null;
  correctOption: number | null;
  points: number;
};

export type ImportResult = {
  ok: boolean;
  questions?: ImportedQuestion[];
  errors?: string[];
  imported?: number;
};

const MAX_QUESTIONS = 200;
const OPTION_LETTERS = ["a", "b", "c", "d", "e", "f"];

function rowLabel(index: number) {
  return `Row ${index + 2}`; // +2 because row 1 is the header
}

/**
 * Parses a CSV/Excel upload into validated exam questions.
 *
 * Expected columns (header row):
 *   type, question, optionA, optionB, optionC, optionD, correct, points
 * - type: objective | written
 * - objective questions: options A–D and `correct` (A/B/C/D or 1-4) required
 * - written questions: only question + points
 */
export async function parseQuestionFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv");
  const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");
  if (!isCsv && !isExcel) {
    return { ok: false, errors: ["Please upload a .csv, .xlsx or .xls file."] };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, errors: ["The file is too large (maximum 5 MB)."] };
  }

  let workbook: XLSX.WorkBook;
  try {
    if (isCsv) {
      const text = await file.text();
      workbook = XLSX.read(text, { type: "string" });
    } else {
      workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    }
  } catch {
    return { ok: false, errors: ["Could not read the file. Make sure it is a valid CSV or Excel file."] };
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { ok: false, errors: ["The file does not contain any sheets."] };

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (raw.length === 0) return { ok: false, errors: ["The file is empty."] };
  if (raw.length > MAX_QUESTIONS) {
    return { ok: false, errors: [`A maximum of ${MAX_QUESTIONS} questions per file is allowed.`] };
  }

  const questions: ImportedQuestion[] = [];
  const errors: string[] = [];

  raw.forEach((row, index) => {
    const label = rowLabel(index);
    const str = (value: unknown) =>
      String(value ?? "")
        .trim()
        .replace(/^["']|["']$/g, "");

    const type = str(row.type).toLowerCase();
    const prompt = str(row.question);
    const pointsRaw = str(row.points);

    const points = pointsRaw === "" ? 1 : Number(pointsRaw);
    if (!Number.isInteger(points) || points < 1 || points > 100) {
      errors.push(`${label}: points must be a whole number between 1 and 100.`);
      return;
    }

    if (type === "written") {
      if (!prompt) {
        errors.push(`${label}: written question is missing the question text.`);
        return;
      }
      questions.push({ type: "written", prompt, options: null, correctOption: null, points });
      return;
    }

    if (type !== "objective" && type !== "mcq") {
      errors.push(`${label}: type must be "objective" or "written" (got "${type || "empty"}").`);
      return;
    }
    if (!prompt) {
      errors.push(`${label}: objective question is missing the question text.`);
      return;
    }

    const options = ["optionA", "optionB", "optionC", "optionD", "optionE", "optionF"]
      .map((key) => str(row[key]))
      .filter((value) => value !== "");
    if (options.length < 2) {
      errors.push(`${label}: objective questions need at least two options (optionA–optionF).`);
      return;
    }

    const correctRaw = str(row.correct).toLowerCase();
    let correctOption: number | null = null;
    if (/^[a-f1-6]$/.test(correctRaw)) {
      const byLetter = OPTION_LETTERS.indexOf(correctRaw);
      const byNumber = Number(correctRaw) - 1;
      correctOption = byLetter >= 0 ? byLetter : byNumber;
    }
    if (correctOption === null || correctOption < 0 || correctOption >= options.length) {
      errors.push(`${label}: "correct" must be a letter (A–F) or number (1–6) matching one of the options.`);
      return;
    }

    questions.push({
      type: "objective",
      prompt,
      options,
      correctOption,
      points,
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  if (questions.length === 0) return { ok: false, errors: ["No valid questions found in the file."] };

  return { ok: true, questions, imported: questions.length };
}

/** Builds the CSV template text shown/downloaded to trainers. */
export function questionTemplateCsv(): string {
  const header = ["type", "question", "optionA", "optionB", "optionC", "optionD", "correct", "points"];
  const examples = [
    ["objective", "Which colour model is used for print?", "RGB", "CMYK", "HSV", "HSL", "B", "2"],
    ["objective", "In 2D animation, what does 'tweening' mean?", "Frames in between", "Outlining", "Colouring", "Rendering", "A", "2"],
    ["written", "Explain how a stacked bar chart differs from a grouped bar chart.", "", "", "", "", "", "5"],
  ];
  const escape = (value: string) => {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };
  const lines = [header.join(","), ...examples.map((row) => row.map(escape).join(","))];
  return lines.join("\n");
}
