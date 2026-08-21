import * as XLSX from "xlsx";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { extractText } from "unpdf";

export type ImportedQuestion = {
  type: "objective" | "multiple" | "written";
  prompt: string;
  options: string[] | null;
  correctOption: number | null;
  correctOptions: number[] | null;
  points: number;
};

export type ImportResult = {
  ok: boolean;
  questions?: ImportedQuestion[];
  errors?: string[];
  imported?: number;
};

export const MAX_QUESTIONS = 200;
const OPTION_LETTERS = ["a", "b", "c", "d", "e", "f"];

// A question-number prefix like "1.", "1)", "Q1." or "Question 2:".
const QUESTION_NUMBER = /^\s*(?:question\s+)?q?\s*(\d{1,3})\s*[.):\-–—]\s+/i;

/** Strips a leading question-number prefix so the app can number questions itself. */
function stripQuestionNumber(text: string): string {
  const match = QUESTION_NUMBER.exec(text);
  return match ? text.slice(match[0].length).trim() : text;
}

// Default marks when a file doesn't state points: option questions carry 1
// mark each, written (theory) questions carry 5 marks each.
export const DEFAULT_OPTION_POINTS = 1;
export const DEFAULT_WRITTEN_POINTS = 5;

const ACCEPTED_MESSAGE =
  "Please upload a .csv, .xlsx, .xls, .docx, .doc, .pdf, .md, .txt or .html file.";

function rowLabel(index: number) {
  return `Row ${index + 2}`; // +2 because row 1 is the header
}

/**
 * Parses a CSV/Excel upload into validated exam questions.
 *
 * Expected columns (header row):
 *   type, question, optionA, optionB, optionC, optionD, correct, points
 * - type: objective | multiple | written
 * - objective questions: options A–D and `correct` (A/B/C/D or 1-4) required
 * - multiple questions: options A–D and `correct` with several letters
 *   (e.g. "A,C") — auto-graded when the trainee picks exactly those
 * - written questions: only question + points
 *
 * When `points` is left blank the default is applied: 1 for option questions,
 * 5 for written (theory) questions.
 */
export async function parseQuestionFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv");
  const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");
  const isDocx = name.endsWith(".docx");
  const isDoc = name.endsWith(".doc");
  const isPdf = name.endsWith(".pdf");
  // Markdown and plain text share the same parser as Word documents.
  const isText = name.endsWith(".md") || name.endsWith(".txt") || name.endsWith(".markdown");
  // Web pages exported from Google Docs / Word (.html, .htm).
  const isHtml = name.endsWith(".html") || name.endsWith(".htm");
  if (!isCsv && !isExcel && !isDocx && !isDoc && !isPdf && !isText && !isHtml) {
    return { ok: false, errors: [ACCEPTED_MESSAGE] };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, errors: ["The file is too large (maximum 5 MB)."] };
  }

  if (isDocx) {
    return parseDocxQuestions(file);
  }
  if (isDoc) {
    return parseDocQuestions(file);
  }
  if (isPdf) {
    return parsePdfQuestions(file);
  }
  if (isText) {
    return parseTextFile(file);
  }
  if (isHtml) {
    return parseHtmlFile(file);
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
    // The app numbers questions itself in the preview, so drop any leading
    // "1. ", "Q2) " etc. pasted into the question column (like the free-text
    // papers) to avoid showing "1. 1. …".
    const prompt = stripQuestionNumber(str(row.question));
    const pointsRaw = str(row.points);

    // Blank points → default by type: 1 for option questions, 5 for written.
    const points =
      pointsRaw === ""
        ? type === "written"
          ? DEFAULT_WRITTEN_POINTS
          : DEFAULT_OPTION_POINTS
        : Number(pointsRaw);
    if (!Number.isInteger(points) || points < 1 || points > 100) {
      errors.push(`${label}: points must be a whole number between 1 and 100.`);
      return;
    }

    if (type === "written") {
      if (!prompt) {
        errors.push(`${label}: written question is missing the question text.`);
        return;
      }
      questions.push({ type: "written", prompt, options: null, correctOption: null, correctOptions: null, points });
      return;
    }

    if (type !== "objective" && type !== "multiple" && type !== "mcq") {
      errors.push(`${label}: type must be "objective", "multiple" or "written" (got "${type || "empty"}").`);
      return;
    }

    const isMultiple = type === "multiple";
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
    let correctOptions: number[] | null = null;

    if (isMultiple) {
      // Multiple correct answers: letters and/or numbers, e.g. "A,C" or "1,3".
      const parts = correctRaw
        .split(/[,;]+/)
        .map((part) => part.trim())
        .filter((part) => part !== "");
      const indices = parts.map((part) => {
        if (/^[a-f]$/.test(part)) return OPTION_LETTERS.indexOf(part);
        if (/^[1-6]$/.test(part)) return Number(part) - 1;
        return -1;
      });
      if (
        indices.length < 2 ||
        indices.some((index) => index < 0 || index >= options.length)
      ) {
        errors.push(
          `${label}: "correct" must list at least two valid letters (A–F) or numbers (1–6), e.g. "A,C".`
        );
        return;
      }
      correctOptions = [...new Set(indices)].sort();
    } else {
      if (/^[a-f1-6]$/.test(correctRaw)) {
        const byLetter = OPTION_LETTERS.indexOf(correctRaw);
        const byNumber = Number(correctRaw) - 1;
        correctOption = byLetter >= 0 ? byLetter : byNumber;
      }
      if (correctOption === null || correctOption < 0 || correctOption >= options.length) {
        errors.push(`${label}: "correct" must be a letter (A–F) or number (1–6) matching one of the options.`);
        return;
      }
    }

    questions.push({
      type: isMultiple ? "multiple" : "objective",
      prompt,
      options,
      correctOption,
      correctOptions,
      points,
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  if (questions.length === 0) return { ok: false, errors: ["No valid questions found in the file."] };

  return { ok: true, questions, imported: questions.length };
}

/** Reads a Microsoft Word (.docx) question paper and parses it as text. */
async function parseDocxQuestions(file: File): Promise<ImportResult> {
  let text: string;
  try {
    // The Node build of mammoth accepts a Buffer (the browser build takes an
    // ArrayBuffer — passing one here throws "Could not find file in options").
    const result = await mammoth.extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) });
    text = result.value;
  } catch {
    return { ok: false, errors: ["Could not read the Word document. Make sure it is a valid .docx file."] };
  }
  return parseQuestionText(text);
}

/** Reads a legacy Word (.doc) question paper and parses it as text. */
async function parseDocQuestions(file: File): Promise<ImportResult> {
  let text: string;
  try {
    const extractor = new WordExtractor();
    const document = await extractor.extract(Buffer.from(await file.arrayBuffer()));
    text = document.getBody();
  } catch {
    return { ok: false, errors: ["Could not read the Word document. Make sure it is a valid .doc file."] };
  }
  return parseQuestionText(text);
}

/** Reads a PDF question paper and parses the extracted text. */
async function parsePdfQuestions(file: File): Promise<ImportResult> {
  let text: string;
  try {
    const { text: extracted } = await extractText(new Uint8Array(await file.arrayBuffer()), {
      mergePages: true,
    });
    text = extracted;
  } catch {
    return { ok: false, errors: ["Could not read the PDF. Make sure it is a valid .pdf file."] };
  }
  return parseQuestionText(text);
}

/** Reads a Markdown (.md) or plain-text (.txt) question paper. */
async function parseTextFile(file: File): Promise<ImportResult> {
  return parseQuestionText(await file.text());
}

/** Reads a Google Docs / Word web-page export (.html/.htm) as text. */
async function parseHtmlFile(file: File): Promise<ImportResult> {
  return parseQuestionText(htmlToText(await file.text()));
}

/**
 * Converts an HTML document to plain text: strips scripts/styles, turns
 * block-level elements (paragraphs, headings, lists, table cells) into line
 * breaks and decodes common entities. Good enough for question papers
 * exported from Google Docs or Word — the page structure only matters as
 * line boundaries for the content parser.
 */
function htmlToText(html: string): string {
  // Script/style blocks contain CSS and JS, never question text — drop them
  // whole (Google Docs exports carry a large <style> block).
  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ");

  // Block-level elements become line breaks so paragraphs, headings and list
  // items arrive as separate lines.
  text = text
    .replace(
      /<\/(?:p|div|li|h[1-6]|tr|td|th|ul|ol|table|section|article|blockquote|pre|br)\s*>/gi,
      "\n"
    )
    .replace(
      /<(?:p|div|h[1-6]|ul|ol|table|section|article|blockquote|pre|br)\b[^>]*>/gi,
      "\n"
    )
    // …except list items, whose opening tag is dropped so the item text stays
    // on the line its closing </li> just broke.
    .replace(/<li\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, ""); // strip the remaining tags

  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

/**
 * Parses a free-form question paper (extracted from Word/PDF, or plain text /
 * Markdown) into validated questions.
 *
 * Questions are detected by content, so both common layouts work — each line
 * as its own paragraph or literal newlines inside a single paragraph:
 *
 *   What colour model is used for print?
 *   A) RGB
 *   B) CMYK
 *   C) HSV
 *   D) HSL
 *   Answer: B
 *   Points: 2
 *
 * A block with no option lines is treated as a written question. The correct
 * answer and points lines are optional. Multiple correct answers ("Answer:
 * A,C" or "Answer: A and C") produce a multiple-answer question. Points
 * default to 1 for option questions and 5 for written ones.
 *
 * Answer keys printed at the end of the paper ("ANSWER KEY", "Answers:
 * 1-B, 2-A…") are applied to the option questions that don't carry an inline
 * "Answer:" line, matched by question number when the paper is numbered and
 * otherwise in document order.
 *
 * Document structure is skipped instead of being imported as questions:
 * Markdown headings, page numbers, paper titles ("MODULE 1 EXAM"), section
 * headers ("SECTION A — Multiple Choice") and instruction lines ("Answer all
 * questions", "Duration: 1 hour").
 *
 * Markdown is otherwise tolerated: list bullets ("- A. RGB"), bold (**,**)
 * and backticks are stripped before parsing.
 */
export function parseQuestionText(text: string): ImportResult {
  const OPTION_LINE = /^([A-Fa-f])[).:]\s*(.+)$/;
  const ANSWER_LINE =
    /^(?:answer|ans|correct\s*answer|correct)\s*[::]?\s*([A-Fa-f](?:\s*(?:,|;|\/|and\s+|\s)\s*[A-Fa-f])*)$/i;
  const POINTS_LINE = /^points\s*[::]?\s*(\d+)$/i;
  // Page numbers / "Page 1 of 2" hints left in extracted text — never questions.
  const JUNK_LINE = /^(?:page\s*)?\d+(?:\s*(?:of|\/)\s*\d+)?$/i;
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    // Markdown headings (# / ## …) are document structure, never questions.
    .filter((raw) => !/^#{1,6}\s+/.test(raw.trim()))
    .map(cleanLine)
    .filter((line) => line !== "" && !JUNK_LINE.test(line));

  // Answers are often printed as a key at the end of the paper
  // ("ANSWER KEY", "Answers: 1-B, 2-A"). Everything from that header onwards
  // is answer rows, not questions.
  const keyStart = lines.findIndex(isAnswerKeyHeader);

  // Group by content: an option/answer/points line continues the current
  // question and any other line starts a new one.
  const blocks: { lines: string[]; start: number }[] = [];
  let current: string[] = [];
  let currentStart = 0;
  lines.forEach((line, index) => {
    const continuesQuestion =
      OPTION_LINE.test(line) || ANSWER_LINE.test(line) || POINTS_LINE.test(line);
    if (!continuesQuestion && current.length > 0) {
      blocks.push({ lines: current, start: currentStart });
      current = [];
    }
    if (current.length === 0) currentStart = index;
    current.push(line);
  });
  if (current.length > 0) blocks.push({ lines: current, start: currentStart });

  if (blocks.length === 0) return { ok: false, errors: ["The document does not contain any questions."] };
  if (blocks.length > MAX_QUESTIONS) {
    return { ok: false, errors: [`A maximum of ${MAX_QUESTIONS} questions per file is allowed.`] };
  }

  type ParsedQuestion = {
    label: string;
    prompt: string;
    optionLines: { letter: string; text: string }[];
    inlineLetters: string[] | null;
    points: number;
    questionNumber: number | null;
    keyLetters: string[] | null;
  };

  const parsed: ParsedQuestion[] = [];
  const errors: string[] = [];

  blocks.forEach((block, blockIndex) => {
    // Everything from the answer-key header onwards is answer rows.
    if (keyStart >= 0 && block.start >= keyStart) return;

    const optionLines: { letter: string; text: string }[] = [];
    const promptCandidates: { line: string; lineIndex: number }[] = [];
    let correct: string | null = null;
    let points: number | null = null;

    block.lines.forEach((line, lineIndex) => {
      const optionMatch = OPTION_LINE.exec(line);
      if (optionMatch) {
        optionLines.push({ letter: optionMatch[1].toUpperCase(), text: optionMatch[2].trim() });
        return;
      }
      const answerMatch = ANSWER_LINE.exec(line);
      if (answerMatch) {
        correct = answerMatch[1].toUpperCase();
        return;
      }
      const pointsMatch = POINTS_LINE.exec(line);
      if (pointsMatch) {
        points = Number(pointsMatch[1]);
        return;
      }
      promptCandidates.push({ line, lineIndex });
    });

    // Titles, section headers and instruction lines are document structure,
    // not questions — don't let them become spurious written questions.
    // Instructions are often numbered in the paper ("1. Answer ALL
    // questions."), so the question-number prefix is stripped before the
    // header/label/title checks; the stored prompt is stripped later anyway.
    const withoutNumber = (line: string) => {
      const match = QUESTION_NUMBER.exec(line);
      return match ? line.slice(match[0].length).trim() : line;
    };
    const promptLines = promptCandidates.filter(
      ({ line, lineIndex }) =>
        !isHeaderLine(withoutNumber(line)) &&
        !isLabelLine(withoutNumber(line)) &&
        !isOpeningTitle(withoutNumber(line), blockIndex, lineIndex)
    );

    let prompt: string | null = null;
    if (promptLines.length > 0) {
      prompt = promptLines[0].line;
    } else if (optionLines.length > 0) {
      // A malformed block like ["SECTION A", "A) One", "B) Two"] — keep the
      // original line so the import still reports something sensible.
      prompt = promptCandidates[0]?.line ?? null;
    } else {
      return; // the whole block was a title / header — skip it
    }
    if (!prompt) return;

    const label = `Question ${parsed.length + 1}`;
    const isObjective = optionLines.length >= 2;
    const resolvedPoints = points ?? (isObjective ? DEFAULT_OPTION_POINTS : DEFAULT_WRITTEN_POINTS);
    if (!Number.isInteger(resolvedPoints) || resolvedPoints < 1 || resolvedPoints > 100) {
      errors.push(`${label}: points must be a whole number between 1 and 100.`);
      return;
    }

    const numberMatch = QUESTION_NUMBER.exec(prompt);
    // The paper's own numbering ("1. ", "Q3) ", "Question 2: ") is dropped from
    // the stored text — the app numbers questions itself in the preview and
    // the exam player, so keeping it would show "1. 1. …".
    const storedPrompt = stripQuestionNumber(prompt);
    parsed.push({
      label,
      prompt: storedPrompt,
      optionLines,
      inlineLetters: correct ? parseAnswerLetters(correct) : null,
      points: resolvedPoints,
      questionNumber: numberMatch ? Number(numberMatch[1]) : null,
      keyLetters: null,
    });
  });

  // Apply the trailing answer key to option questions without an inline
  // answer — by question number when the paper is numbered, otherwise in
  // document order.
  if (keyStart >= 0) {
    const entries = parseAnswerKey(lines.slice(keyStart));
    const answered = new Set<number>();
    const paperIsNumbered = parsed.some((question) => question.questionNumber !== null);
    for (const entry of entries) {
      if (entry.number !== null) {
        const numbered = parsed.findIndex(
          (question) => question.questionNumber === entry.number && question.optionLines.length >= 2
        );
        if (numbered >= 0) {
          const question = parsed[numbered];
          // The numbered question is already answered inline or by an earlier
          // entry — the key row refers to it, so skip it entirely rather than
          // falling back to a different question.
          if (question.inlineLetters === null && !answered.has(numbered)) {
            parsed[numbered].keyLetters = entry.letters;
            answered.add(numbered);
          }
          continue;
        }
        // On a numbered paper an unmatched key row refers to a question that
        // isn't here — never quietly assign it to a different one.
        if (paperIsNumbered) continue;
        // Unnumbered paper: the entry numbers are just row markers, so fall
        // through and assign positionally.
      }
      const target = parsed.findIndex(
        (question, index) =>
          question.optionLines.length >= 2 && question.inlineLetters === null && !answered.has(index)
      );
      if (target >= 0) {
        parsed[target].keyLetters = entry.letters;
        answered.add(target);
      }
    }
  }

  const questions: ImportedQuestion[] = [];
  for (const question of parsed) {
    if (question.optionLines.length === 0) {
      questions.push({
        type: "written",
        prompt: question.prompt,
        options: null,
        correctOption: null,
        correctOptions: null,
        points: question.points,
      });
      continue;
    }

    // "Answer: B" → objective; "Answer: A,C" or "Answer: A and C" → multiple
    // (from the document's own answer line or the trailing answer key).
    const letters = question.inlineLetters ?? question.keyLetters;
    const indices = letters
      ? letters.map(
          (letter) => question.optionLines.findIndex((option) => option.letter === letter)
        )
      : [];
    if (!letters || letters.length === 0 || indices.some((index) => index < 0)) {
      errors.push(`${question.label}: the "Answer:" line must match one of the listed options (A–F).`);
      continue;
    }

    questions.push(
      indices.length >= 2
        ? {
            type: "multiple",
            prompt: question.prompt,
            options: question.optionLines.map((option) => option.text),
            correctOption: null,
            correctOptions: [...new Set(indices)].sort(),
            points: question.points,
          }
        : {
            type: "objective",
            prompt: question.prompt,
            options: question.optionLines.map((option) => option.text),
            correctOption: indices[0],
            correctOptions: null,
            points: question.points,
          }
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  if (questions.length === 0) return { ok: false, errors: ["No valid questions found in the document."] };
  return { ok: true, questions, imported: questions.length };
}

/**
 * True when a line starts the trailing answer-key section: "ANSWERS",
 * "ANSWER KEY", "Key:", "SECTION D: ANSWERS" or "Answers: 1-B, 2-A". Inline
 * "Answer: B" / "Answer: A,C" lines and instruction sentences like "Answer
 * the following questions." are deliberately not treated as key headers.
 */
function isAnswerKeyHeader(line: string): boolean {
  const match =
    /^(?:(?:section|part)\s+[A-Z0-9]+\s*[:\-–—]?\s*)?(?:answer\s*(?:key|sheet)|marking\s*(?:guide|scheme)|suggested\s*answers?|solutions?|answers?|key)([::\-–—]?)\s*([A-Fa-f]?)(.*)$/i.exec(
      line.trim()
    );
  if (!match) return false;
  const separator = match[1];
  const letter = match[2] ?? "";
  const rest = match[3] ?? "";
  // "Answer the following questions." / "Answer ALL questions." / "Answer
  // any THREE questions." — instructions, not key headers: no separator and
  // free text after the keyword. The letter group can grab the first letter
  // of that free text ("Answer all questions." → "A"), so without a
  // separator only a compact key ("ANSWERS 1-B, 2-C") is a key header — it
  // starts with a numbered answer entry. Anything else is an instruction.
  if (separator === "" && (letter + rest).trim() !== "") {
    return /^\d{1,3}\s*[-.):.]?\s*[A-Fa-f]\b/.test((letter + rest).trim());
  }
  // "Answer: B", "Answer: A,C" and "Answer: A and C" are inline answers for
  // the previous question — the remainder after the colon is nothing but
  // answer letters and separators. Real key headers carry numbers, question
  // references or plain text ("Answers: 1-B, 2-A").
  const remainder = (letter + rest).trim();
  if (
    remainder !== "" &&
    /^[A-Fa-f](?:\s*(?:,|;|&|\/|and\s+|\s)\s*[A-Fa-f])*$/.test(remainder)
  ) {
    return false;
  }
  return true;
}

/**
 * Parses answer rows like "1. B", "2-A", "3. A, C" or a one-line "Answers:
 * 1-B, 2-A" list. Falls back to bare letter lists ("A C B D") which map by
 * position when no numbered entries are present.
 */
function parseAnswerKey(region: string[]): { number: number | null; letters: string[] }[] {
  const entries: { number: number | null; letters: string[] }[] = [];
  const ENTRY =
    /(\d{1,3})\s*(?:[-.):.]\s*)?([A-Fa-f](?:\s*(?:,|;|&|\/|and\s+|\s)\s*[A-Fa-f])*)/g;
  const text = region.join(" ");
  let match: RegExpExecArray | null;
  while ((match = ENTRY.exec(text)) !== null) {
    entries.push({ number: Number(match[1]), letters: parseAnswerLetters(match[2]) });
  }

  if (entries.length === 0) {
    // A bare letter list — each row must be only letters and separators so
    // stray text ("THE END") can't become answers.
    for (const raw of region) {
      if (!/^[A-Fa-f][A-Fa-f\s,;]*$/.test(raw.trim())) continue;
      const letters = raw
        .split(/[\s,;]+/)
        .map((part) => part.trim())
        .filter((part) => /^[A-Fa-f]$/.test(part));
      for (const letter of letters) {
        entries.push({ number: null, letters: [letter.toUpperCase()] });
      }
    }
  }
  return entries;
}

/** Splits an answer value ("A", "A,C", "A and C") into individual letters. */
function parseAnswerLetters(raw: string): string[] {
  return raw
    .replace(/\s+and\s+/gi, ",")
    .split(/[\s,;/]+/)
    .map((letter) => letter.trim().toUpperCase())
    .filter((letter) => /^[A-F]$/.test(letter));
}

/**
 * Question-style openings ("What…", "Explain…", "List…") — used to tell real
 * questions apart from titles and section headers.
 */
const QUESTION_STARTER =
  /^(?:what|why|when|where|which|who|whose|how|is|are|was|were|do|does|did|can|could|should|would|will|state|write|define|explain|list|name|outline|describe|discuss|distinguish|compare|contrast|identify|enumerate|mention|give|draw|label|match|fill|complete|calculate|compute|evaluate|justify|show|prove|derive|convert|simplify|solve|find|differentiate)\b/i;

/**
 * Returns true when a line is document structure rather than a question:
 * instruction phrases ("Answer all questions", "Duration: 1 hour",
 * "Total marks: 40") and section/paper headers ("MODULE 1 EXAM",
 * "SECTION A — Multiple Choice", "PART TWO").
 */
function isHeaderLine(line: string): boolean {
  const text = line.trim();

  // A standalone question-header line ("Question 1", "QUESTION TWO",
  // "Question No. 3:") labels what follows — the actual question text is on
  // the next line, so the label itself is never a question. When the prompt
  // shares the line ("Question 1: What is...?") the number prefix is
  // stripped by stripQuestionNumber instead and the question is kept.
  if (
    /^question\s+(?:(?:no\.?|number|#)\s*)?(?:\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\b(?:\s*of\s+\d+)?\s*[.:…\u2013\u2014\-]?\s*$/i.test(
      text
    )
  ) {
    return true;
  }

  // Unambiguous instruction phrases — never questions.
  if (/^(?:answer|attempt|choose)\s+(?:all|any)\b/i.test(text)) return true;
  // "Answer any THREE questions." / "Answer three (3) questions from this
  // section." / "Attempt any two questions."
  if (
    /^(?:answer|attempt|choose)\s+(?:any\s+)?(?:all\s+the\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s*(?:\(\d+\))?\s+questions?\b/i.test(
      text
    )
  ) {
    return true;
  }
  if (/^(?:instructions?|duration|time\s+allowed|total\s+marks?|maximum\s+marks?)\b/i.test(text)) return true;
  if (/^(?:the end|end of (?:the )?(?:paper|examination|exam|test)|good luck)\b/i.test(text)) return true;
  // "Use blue or black pen." / "Use an HB pencil." — materials instructions.
  if (/^use\s+(?:only\s+)?(?:a|an|blue|black|dark|red|green|ballpoint|biro|pencil|ink)\b/i.test(text)) return true;
  // "All answers must be written in ink." / "All work must be shown."
  if (/^all\s+(?:answers?|work|questions?)\b/i.test(text)) return true;
  // "Write your name on the answer booklet."
  if (/^write\s+your\s+(?:name|full\s+name|registration\s+number|index\s+number)\b/i.test(text)) return true;

  // Full instruction sentences that are never questions ("For each question,
  // choose the best answer.", "Read the questions carefully.", …).
  if (
    /^(?:for|in)\s+(?:each|every)\s+question\b/i.test(text) ||
    /^(?:choose|select|pick|circle|underline|shade|tick)\s+(?:the\s+)?(?:best|most\s+appropriate|correct|right|answer|option|alternative|box|bubble)\b/i.test(text) ||
    /^(?:answer|attempt|write)\s+(?:the\s+)?(?:following\s+)?(?:questions?|items?)\b/i.test(text) ||
    /^(?:this|the)\s+(?:question\s+)?(?:exam|examination|test|paper|assessment|quiz)\s+(?:consists|comprises|has|contains|is\s+divided)\b/i.test(text) ||
    /^(?:each|every|all)\s+questions?\s+(?:carries|carry|are\s+worth|is\s+worth|worth|has|have)\b/i.test(text) ||
    /^(?:read|study)\s+(?:the\s+)?(?:questions?|instructions?|passage)\b/i.test(text) ||
    /^(?:write|provide|give)\s+your\s+(?:answers?|responses?)\b/i.test(text) ||
    /^(?:do\s+not|please\s+do\s+not)\s+(?:write|open|turn|touch|begin|unfold)\b/i.test(text) ||
    /^candidates?\s+(?:are\s+)?(?:required|advised|asked|expected|must|should|instructed)\b/i.test(text) ||
    /^there\s+(?:are|is)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:sections?|parts?|questions?)\b/i.test(text)
  ) {
    return true;
  }

  // Section/paper headers start with a header word…
  if (!/^(?:section|part|module|unit|paper|exam|examination|quiz|assessment|exercise|practical|comprehension|mock|assignment|objective|theory|written|essay|test)\b/i.test(text)) return false;

  // …but keep real questions that merely start with one of those words,
  // e.g. "Test the hypothesis…" or "Essay writing is…".
  if (/^test\b/i.test(text) && /\s(?:the|this|whether|if|that|for)\b/i.test(text)) return false;
  if (/^essay\b/i.test(text) && /\s(?:writing|is|are|about|on)\b/i.test(text)) return false;

  const allCaps = text === text.toUpperCase();
  // Title Case ("Section A", "Module 1 Quiz", "SECTION B — Theory") — every
  // word starts with a capital (punctuation-only tokens like em-dashes are OK).
  const titleCase = text
    .split(/\s+/)
    .every((token) => /^[A-Z0-9]/.test(token) || /^[^A-Za-z0-9]+$/.test(token));
  const containsNumber = /\d/.test(text);
  const endsWithColon = /:\s*$/.test(text);
  const mentionsQuestions = /\b(?:all|any|questions?|attempt)\b/i.test(text) && text.length <= 80;
  return allCaps || titleCase || containsNumber || endsWithColon || mentionsQuestions;
}

/** Returns true for label-style lines ending in ":" (e.g. "NB:", "Instructions:"). */
function isLabelLine(line: string): boolean {
  const text = line.trim();
  return /:\s*$/.test(text) && !QUESTION_STARTER.test(text);
}

/**
 * The very first line of a document is often the paper's title (e.g.
 * "Graphic Design Theory Examination"). Drop it when it reads like a caption:
 * short, no sentence punctuation, and not phrased as a question.
 */
function isOpeningTitle(line: string, blockIndex: number, lineIndex: number): boolean {
  if (blockIndex !== 0 || lineIndex !== 0) return false;
  const text = line.trim();
  if (QUESTION_STARTER.test(text)) return false;
  if (/[?.!]\s*$/.test(text)) return false;
  return text.length <= 100;
}

/** The shape validated by {@link validateImportedQuestions}. */
export type ValidatedQuestions =
  | { ok: true; questions: ImportedQuestion[] }
  | { ok: false; error: string };

/**
 * Validates questions submitted for import — the same set the preview step
 * showed the admin. The server never trusts the client, so every row is
 * re-checked (type, prompt, points, options, answer key) before saving.
 */
export function validateImportedQuestions(input: unknown): ValidatedQuestions {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: "No questions to import." };
  }
  if (input.length > MAX_QUESTIONS) {
    return { ok: false, error: `A maximum of ${MAX_QUESTIONS} questions per import is allowed.` };
  }

  const questions: ImportedQuestion[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const row = input[i] as Record<string, unknown> | null | undefined;
    const label = `Question ${i + 1}`;
    if (!row || typeof row !== "object") {
      return { ok: false, error: `${label}: invalid question.` };
    }

    const type = row.type;
    if (type !== "objective" && type !== "multiple" && type !== "written") {
      return { ok: false, error: `${label}: type must be "objective", "multiple" or "written".` };
    }
    const prompt = typeof row.prompt === "string" ? row.prompt.trim() : "";
    if (!prompt) return { ok: false, error: `${label}: missing the question text.` };
    const points = row.points;
    if (typeof points !== "number" || !Number.isInteger(points) || points < 1 || points > 100) {
      return { ok: false, error: `${label}: points must be a whole number between 1 and 100.` };
    }

    if (type === "written") {
      questions.push({ type, prompt, options: null, correctOption: null, correctOptions: null, points });
      continue;
    }

    const options = Array.isArray(row.options)
      ? row.options.map((option) => String(option ?? "").trim()).filter((option) => option !== "")
      : [];
    if (options.length < 2 || options.length > 6) {
      return { ok: false, error: `${label}: option questions need between 2 and 6 options.` };
    }

    if (type === "objective") {
      const correctOption = row.correctOption;
      if (
        typeof correctOption !== "number" ||
        !Number.isInteger(correctOption) ||
        correctOption < 0 ||
        correctOption >= options.length
      ) {
        return { ok: false, error: `${label}: the correct option must be one of the listed options.` };
      }
      questions.push({ type, prompt, options, correctOption, correctOptions: null, points });
    } else {
      const correctOptions = row.correctOptions;
      // At least one correct answer is required (the CSV import keeps the
      // stricter "two or more" rule, but the preview editor allows one).
      if (
        !Array.isArray(correctOptions) ||
        correctOptions.length < 1 ||
        correctOptions.some(
          (index) =>
            typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= options.length
        )
      ) {
        return { ok: false, error: `${label}: correct options must list valid option indexes.` };
      }
      questions.push({
        type,
        prompt,
        options,
        correctOption: null,
        correctOptions: [...new Set(correctOptions)].sort((a, b) => a - b),
        points,
      });
    }
  }

  return { ok: true, questions };
}

/**
 * Normalises one raw line for content parsing: trims, strips common Markdown
 * formatting (headings, blockquotes, list bullets, bold, code) and collapses
 * whitespace.
 */
function cleanLine(raw: string): string {
  let line = raw.replace(/\u00a0/g, " ").trim();
  line = line.replace(/^>\s?/, ""); // blockquote
  line = line.replace(/^[-*+]\s+/, ""); // list bullet
  line = line.replace(/\*\*/g, "").replace(/`/g, ""); // bold / code
  line = line.replace(/\s+/g, " ").trim();
  return line;
}