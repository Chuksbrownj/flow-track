import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { parseQuestionFile, validateImportedQuestions } from "@/lib/assessment-import";
import { questionTemplateCsv } from "@/lib/question-template";

const HEADER = "type,question,optionA,optionB,optionC,optionD,correct,points";

/** Buffer → ArrayBuffer so the value is assignable to BlobPart under strict TS. */
function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function csvFile(content: string, name = "questions.csv"): File {
  return new File([content], name, { type: "text/csv" });
}

function xlsxFile(
  rows: (string | number)[][],
  bookType: "xlsx" | "xls" = "xlsx",
  name = `questions.${bookType}`
): File {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType }) as Buffer;
  return new File([bufferToArrayBuffer(buffer)], name);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Builds a .docx from a list of paragraphs (one <w:p> per entry, blank for
 * empty paragraphs). Pass each line as its own paragraph to mimic standard
 * Word documents, or join a question's lines with "\n" inside one paragraph
 * for the literal-newline layout.
 */
async function docxFile(paragraphs: string[], name = "questions.docx"): Promise<File> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      "</Types>",
    ].join("")
  );
  zip.file(
    "word/document.xml",
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      paragraphs.map((p) => `<w:p><w:r><w:t>${escapeXml(p)}</w:t></w:r></w:p>`).join(""),
      "</w:body></w:document>",
    ].join("")
  );
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new File([bufferToArrayBuffer(buffer)], name);
}

describe("parseQuestionFile — file gating", () => {
  it("rejects unsupported file types", async () => {
    const result = await parseQuestionFile(new File(["hello"], "notes.png"));
    expect(result).toEqual({
      ok: false,
      errors: [
        "Please upload a .csv, .xlsx, .xls, .docx, .doc, .pdf, .md, .txt or .html file.",
      ],
    });
  });

  it("rejects files over 5 MB", async () => {
    const big = csvFile("a".repeat(5 * 1024 * 1024 + 1));
    const result = await parseQuestionFile(big);
    expect(result).toEqual({
      ok: false,
      errors: ["The file is too large (maximum 5 MB)."],
    });
  });
});

describe("parseQuestionFile — CSV", () => {
  it("parses objective and written questions", async () => {
    const content = [
      HEADER,
      "objective,Which colour model is used for print?,RGB,CMYK,HSV,HSL,B,2",
      "written,Explain how a stacked bar chart differs from a grouped bar chart.,,,,,,5",
    ].join("\n");

    const result = await parseQuestionFile(csvFile(content));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions).toEqual([
      {
        type: "objective",
        prompt: "Which colour model is used for print?",
        options: ["RGB", "CMYK", "HSV", "HSL"],
        correctOption: 1, // B
        correctOptions: null,
        points: 2,
      },
      {
        type: "written",
        prompt: "Explain how a stacked bar chart differs from a grouped bar chart.",
        options: null,
        correctOption: null,
        correctOptions: null,
        points: 5,
      },
    ]);
  });

  it("parses multiple-answer questions (correct lists several letters)", async () => {
    const content = [
      HEADER,
      // The correct column holds a comma, so it must be quoted (as the template does).
      'multiple,"Which of these are primary colours?",Red,Green,Blue,Yellow,"A,C",2',
    ].join("\n");

    const result = await parseQuestionFile(csvFile(content));

    expect(result.ok).toBe(true);
    expect(result.questions).toEqual([
      {
        type: "multiple",
        prompt: "Which of these are primary colours?",
        options: ["Red", "Green", "Blue", "Yellow"],
        correctOption: null,
        correctOptions: [0, 2], // A, C
        points: 2,
      },
    ]);
  });

  it("accepts numeric lists and mixed separators for multiple-answer correct", async () => {
    const content = [
      HEADER,
      "multiple,Which?,Alpha,Beta,Gamma,,1;3,1",
    ].join("\n");
    const result = await parseQuestionFile(csvFile(content));
    expect(result.ok).toBe(true);
    expect(result.questions?.[0].correctOptions).toEqual([0, 2]);
  });

  it("rejects multiple-answer correct with fewer than two valid letters", async () => {
    const content = [HEADER, "multiple,Which?,A,B,,,A,1"].join("\n");
    const result = await parseQuestionFile(csvFile(content));
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toContain('"correct" must list at least two valid letters');
  });

  it("handles quoted values containing commas", async () => {
    const content = [
      HEADER,
      'objective,"A question, with a comma?",Option A,Option B,,,A,1',
    ].join("\n");

    const result = await parseQuestionFile(csvFile(content));

    expect(result.ok).toBe(true);
    expect(result.questions?.[0].prompt).toBe("A question, with a comma?");
    expect(result.questions?.[0].options).toEqual(["Option A", "Option B"]);
  });

  it("accepts 'mcq' as an alias for objective", async () => {
    const content = [HEADER, "mcq,Which?,Alpha,Beta,,,B,1"].join("\n");
    const result = await parseQuestionFile(csvFile(content));
    expect(result.ok).toBe(true);
    expect(result.questions?.[0].type).toBe("objective");
  });

  it("strips leading question numbers pasted into the question column", async () => {
    const content = [
      HEADER,
      "objective,1. Which colour model is used for print?,RGB,CMYK,HSV,HSL,B,2",
      "written,2. Explain a concept.,,,,,,5",
    ].join("\n");
    const result = await parseQuestionFile(csvFile(content));
    expect(result.ok).toBe(true);
    expect(result.questions?.[0].prompt).toBe("Which colour model is used for print?");
    expect(result.questions?.[1].prompt).toBe("Explain a concept.");
  });

  it("accepts a numeric correct answer (1-based)", async () => {
    const content = [HEADER, "objective,Which?,Alpha,Beta,,,2,1"].join("\n");
    const result = await parseQuestionFile(csvFile(content));
    expect(result.ok).toBe(true);
    expect(result.questions?.[0].correctOption).toBe(1);
  });

  it("reports an empty file", async () => {
    const result = await parseQuestionFile(csvFile(""));
    expect(result).toEqual({ ok: false, errors: ["The file is empty."] });
  });

  it("rejects more than 200 questions", async () => {
    const lines = [HEADER];
    for (let i = 0; i < 201; i += 1) lines.push(`objective,Question ${i}?,A,B,A,1`);
    const result = await parseQuestionFile(csvFile(lines.join("\n")));
    expect(result).toEqual({
      ok: false,
      errors: ["A maximum of 200 questions per file is allowed."],
    });
  });

  it("rejects an unknown question type", async () => {
    const content = [HEADER, "essay,What is your opinion?,A,B,,,A,1"].join("\n");
    const result = await parseQuestionFile(csvFile(content));
    expect(result).toEqual({
      ok: false,
      errors: ['Row 2: type must be "objective", "multiple" or "written" (got "essay").'],
    });
  });

  it("requires at least two options for objective questions", async () => {
    const content = [HEADER, "objective,Which?,Only one,,,,A,1"].join("\n");
    const result = await parseQuestionFile(csvFile(content));
    expect(result).toEqual({
      ok: false,
      errors: ["Row 2: objective questions need at least two options (optionA–optionF)."],
    });
  });

  it("rejects a correct answer that does not match an option", async () => {
    const content = [HEADER, "objective,Which?,A,B,,,D,1"].join("\n");
    const result = await parseQuestionFile(csvFile(content));
    expect(result).toEqual({
      ok: false,
      errors: ['Row 2: "correct" must be a letter (A–F) or number (1–6) matching one of the options.'],
    });
  });

  it("rejects points outside 1–100", async () => {
    const content = [HEADER, "objective,Which?,A,B,,,A,0"].join("\n");
    const result = await parseQuestionFile(csvFile(content));
    expect(result).toEqual({
      ok: false,
      errors: ["Row 2: points must be a whole number between 1 and 100."],
    });
  });

  it("defaults points by type when the points column is blank (option 1, written 5)", async () => {
    const content = [
      HEADER,
      "objective,Which?,Alpha,Beta,,,A,",
      "written,Explain a concept.,,,,,",
    ].join("\n");
    const result = await parseQuestionFile(csvFile(content));
    expect(result.ok).toBe(true);
    expect(result.questions?.[0]?.points).toBe(1);
    expect(result.questions?.[0]?.type).toBe("objective");
    expect(result.questions?.[1]?.points).toBe(5);
    expect(result.questions?.[1]?.type).toBe("written");
  });
});

describe("parseQuestionFile — Excel", () => {
  const rows = [
    ["type", "question", "optionA", "optionB", "optionC", "optionD", "correct", "points"],
    ["objective", "Which colour model is used for print?", "RGB", "CMYK", "HSV", "HSL", "B", "2"],
    ["written", "Explain how a stacked bar chart differs from a grouped bar chart.", "", "", "", "", "", "5"],
  ];

  it("parses .xlsx files", async () => {
    const result = await parseQuestionFile(xlsxFile(rows, "xlsx"));
    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({
      type: "objective",
      options: ["RGB", "CMYK", "HSV", "HSL"],
      correctOption: 1,
      points: 2,
    });
    expect(result.questions?.[1]).toMatchObject({ type: "written", points: 5 });
  });

  it("parses legacy .xls files", async () => {
    const result = await parseQuestionFile(xlsxFile(rows, "xls"));
    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
  });

  it("reports a corrupt Excel file", async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "broken.xlsx");
    const result = await parseQuestionFile(file);
    expect(result).toEqual({
      ok: false,
      errors: ["Could not read the file. Make sure it is a valid CSV or Excel file."],
    });
  });
});

describe("parseQuestionFile — Word (.docx)", () => {
  it("parses objective and written questions", async () => {
    const file = await docxFile([
      [
        "What colour model is used for print?",
        "A) RGB",
        "B) CMYK",
        "C) HSV",
        "D) HSL",
        "Answer: B",
        "Points: 2",
      ].join("\n"),
      "Explain how a stacked bar chart differs from a grouped bar chart.",
    ]);

    const result = await parseQuestionFile(file);

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions).toEqual([
      {
        type: "objective",
        prompt: "What colour model is used for print?",
        options: ["RGB", "CMYK", "HSV", "HSL"],
        correctOption: 1,
        correctOptions: null,
        points: 2,
      },
      {
        type: "written",
        prompt: "Explain how a stacked bar chart differs from a grouped bar chart.",
        options: null,
        correctOption: null,
        correctOptions: null,
        points: 5, // written questions default to 5 when no Points line
      },
    ]);
  });

  it("parses standard Word documents with one paragraph per line", async () => {
    const file = await docxFile([
      "What colour model is used for print?",
      "A) RGB",
      "B) CMYK",
      "C) HSV",
      "D) HSL",
      "Answer: B",
      "Points: 2",
      "", // blank paragraph between questions
      "Explain how a stacked bar chart differs from a grouped bar chart.",
    ]);

    const result = await parseQuestionFile(file);

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions).toEqual([
      {
        type: "objective",
        prompt: "What colour model is used for print?",
        options: ["RGB", "CMYK", "HSV", "HSL"],
        correctOption: 1,
        correctOptions: null,
        points: 2,
      },
      {
        type: "written",
        prompt: "Explain how a stacked bar chart differs from a grouped bar chart.",
        options: null,
        correctOption: null,
        correctOptions: null,
        points: 5,
      },
    ]);
  });

  it("groups consecutive paragraphs into questions without blank separators", async () => {
    const file = await docxFile([
      "What colour model is used for print?",
      "A) RGB",
      "B) CMYK",
      "C) HSV",
      "D) HSL",
      "Answer: B",
      "Points: 2",
      "Explain how a stacked bar chart differs from a grouped bar chart.",
    ]);

    const result = await parseQuestionFile(file);

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({
      type: "objective",
      options: ["RGB", "CMYK", "HSV", "HSL"],
      correctOption: 1,
      points: 2,
    });
    expect(result.questions?.[1]).toMatchObject({
      type: "written",
      prompt: "Explain how a stacked bar chart differs from a grouped bar chart.",
    });
  });

  it("rejects a question whose Answer does not match an option", async () => {
    const file = await docxFile(["Which is correct?\nA) One\nB) Two"]);
    const result = await parseQuestionFile(file);
    expect(result).toEqual({
      ok: false,
      errors: ['Question 1: the "Answer:" line must match one of the listed options (A–F).'],
    });
  });

  it("reports a corrupt Word file", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "broken.docx");
    const result = await parseQuestionFile(file);
    expect(result).toEqual({
      ok: false,
      errors: ["Could not read the Word document. Make sure it is a valid .docx file."],
    });
  });
});

/**
 * Builds a PDF with one text line per entry (via pdf-lib). Long papers span
 * multiple pages (~25 lines each) so text is never drawn off-page.
 */
async function pdfFile(lines: string[], name = "questions.pdf"): Promise<File> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const linesPerPage = 25;
  for (let start = 0; start < lines.length; start += linesPerPage) {
    const page = doc.addPage([612, 792]);
    lines.slice(start, start + linesPerPage).forEach((line, index) => {
      page.drawText(line, { x: 50, y: 740 - index * 24, size: 14, font });
    });
  }
  const bytes = await doc.save();
  return new File([bufferToArrayBuffer(bytes as unknown as Buffer)], name);
}

describe("parseQuestionFile — Markdown and plain text", () => {
  it("parses Markdown question papers (bullets, bold, headings, multiple answers)", async () => {
    const content = [
      "# Graphic Design Module 1 Quiz",
      "",
      "**1. What colour model is used for print?**",
      "- A. RGB",
      "- B. CMYK",
      "- C. HSV",
      "- D. HSL",
      "**Answer:** B",
      "",
      "2. Which of these are primary colours?",
      "- A. Red",
      "- B. Green",
      "- C. Blue",
      "- D. Yellow",
      "**Answer:** A and C",
      "",
      "3. Explain how a stacked bar chart differs from a grouped bar chart.",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "questions.md"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(3);
    expect(result.questions).toEqual([
      {
        type: "objective",
        prompt: "What colour model is used for print?",
        options: ["RGB", "CMYK", "HSV", "HSL"],
        correctOption: 1,
        correctOptions: null,
        points: 1, // option questions default to 1
      },
      {
        type: "multiple",
        prompt: "Which of these are primary colours?",
        options: ["Red", "Green", "Blue", "Yellow"],
        correctOption: null,
        correctOptions: [0, 2], // A, C
        points: 1,
      },
      {
        type: "written",
        prompt: "Explain how a stacked bar chart differs from a grouped bar chart.",
        options: null,
        correctOption: null,
        correctOptions: null,
        points: 5, // written questions default to 5
      },
    ]);
  });

  it("parses plain text (.txt) question papers", async () => {
    const content = `What colour model is used for print?
A) RGB
B) CMYK
C) HSV
D) HSL
Answer: B
Points: 2

Explain how a stacked bar chart differs from a grouped bar chart.`;

    const result = await parseQuestionFile(new File([content], "questions.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({
      type: "objective",
      options: ["RGB", "CMYK", "HSV", "HSL"],
      correctOption: 1,
      points: 2,
    });
    expect(result.questions?.[1]).toMatchObject({
      type: "written",
      points: 5,
    });
  });

  it("drops page numbers and supports \"Answer: A,C\" for multiple answers", async () => {
    const content = `Page 1
Which two are primary colours?
A) Red
B) Green
C) Blue
D) Yellow
Answer: A,C
1
Which is the odd one out?
A) Red
B) Green
C) Blue
D) Yellow
Answer: B`;

    const result = await parseQuestionFile(new File([content], "questions.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({ type: "multiple", correctOptions: [0, 2] });
    expect(result.questions?.[1]).toMatchObject({ type: "objective", correctOption: 1 });
  });
});

describe("parseQuestionFile — document structure is skipped", () => {
  it("skips the paper title, section headers and instruction lines", async () => {
    const content = [
      "MODULE 1 EXAM",
      "SECTION A: Multiple Choice Questions",
      "What colour model is used for print?",
      "A) RGB",
      "B) CMYK",
      "C) HSV",
      "D) HSL",
      "Answer: B",
      "SECTION B — Theory",
      "Explain how a stacked bar chart differs from a grouped bar chart.",
      "DURATION: 1 HOUR",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions).toEqual([
      {
        type: "objective",
        prompt: "What colour model is used for print?",
        options: ["RGB", "CMYK", "HSV", "HSL"],
        correctOption: 1,
        correctOptions: null,
        points: 1,
      },
      {
        type: "written",
        prompt: "Explain how a stacked bar chart differs from a grouped bar chart.",
        options: null,
        correctOption: null,
        correctOptions: null,
        points: 5,
      },
    ]);
  });

  it("skips common exam instruction sentences", async () => {
    const content = [
      "For each question, choose the best answer.",
      "Read the questions carefully.",
      "Answer the following questions.",
      "Each question carries 1 mark.",
      "This exam consists of 15 questions.",
      "Write your answers in the space provided.",
      "1. What colour model is used for print?",
      "A) RGB",
      "B) CMYK",
      "C) HSV",
      "D) HSL",
      "Answer: B",
      "2. Explain how a stacked bar chart differs from a grouped bar chart.",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({
      type: "objective",
      prompt: "What colour model is used for print?", // leading "1. " stripped
      options: ["RGB", "CMYK", "HSV", "HSL"],
      correctOption: 1,
    });
    expect(result.questions?.[1]).toMatchObject({
      type: "written",
      prompt: "Explain how a stacked bar chart differs from a grouped bar chart.", // "2. " stripped
    });
  });

  it("keeps written questions that merely begin with an instruction word", async () => {
    const result = await parseQuestionFile(
      new File(["Choose one of the following and discuss its importance."], "paper.txt")
    );
    expect(result.ok).toBe(true);
    expect(result.imported).toBe(1);
    expect(result.questions?.[0]).toMatchObject({
      type: "written",
      prompt: "Choose one of the following and discuss its importance.",
    });
  });

  it("drops a lower-case caption-style opening title", async () => {
    const result = await parseQuestionFile(
      new File(["Graphic Design Theory Examination\nDefine the term kerning."], "paper.txt")
    );
    expect(result.ok).toBe(true);
    expect(result.imported).toBe(1);
    expect(result.questions?.[0]).toMatchObject({
      type: "written",
      prompt: "Define the term kerning.",
    });
  });

  it("skips closing lines like THE END", async () => {
    const content = [
      "Define the term kerning.",
      "THE END",
      "Good luck!",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(1);
    expect(result.questions?.[0]).toMatchObject({ prompt: "Define the term kerning." });
  });

  it("keeps written questions that begin like sentences", async () => {
    const content = [
      "Write short notes on the types of computers.",
      "Essay writing is an important skill.",
      "Test the hypothesis that demand falls when price rises.",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(3);
    expect(result.questions?.map((question) => question.type)).toEqual([
      "written",
      "written",
      "written",
    ]);
  });

  it("rejects a file that only contains titles", async () => {
    const result = await parseQuestionFile(
      new File(["MODULE 1 EXAM\nSECTION A"], "paper.txt")
    );
    expect(result).toEqual({
      ok: false,
      errors: ["No valid questions found in the document."],
    });
  });

  it("parses a paper with more than 12 questions (up to 100)", async () => {
    const lines = [
      "MODULE 1 EXAMINATION",
      "INSTRUCTIONS TO CANDIDATES",
      "1. Answer ALL questions.",
      "2. Use blue or black pen.",
      "SECTION A: OBJECTIVE QUESTIONS",
    ];
    for (let i = 1; i <= 60; i += 1) {
      lines.push(`${i}. What is the answer to question ${i}?`);
      lines.push("A) Alpha");
      lines.push("B) Beta");
      lines.push("C) Gamma");
      lines.push("D) Delta");
      lines.push(`Answer: ${String.fromCharCode(64 + ((i % 4) + 1))}`);
    }
    lines.push("THE END");

    const result = await parseQuestionFile(new File([lines.join("\n")], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(60);
    // The paper's own numbering is stripped, not duplicated in the preview.
    expect(result.questions?.[59]).toMatchObject({
      type: "objective",
      prompt: "What is the answer to question 60?",
    });
  });

  it("does not truncate the paper at mid-paper instruction lines", async () => {
    const lines = ["SECTION A: MULTIPLE CHOICE"];
    for (let i = 1; i <= 12; i += 1) {
      lines.push(`${i}. Question ${i}?`);
      lines.push("A) One");
      lines.push("B) Two");
      lines.push(`Answer: ${i % 2 === 0 ? "B" : "A"}`);
    }
    lines.push("SECTION B — THEORY");
    lines.push("Answer any THREE questions.");
    lines.push("Answer three (3) questions from this section.");
    for (let i = 13; i <= 20; i += 1) {
      lines.push(`${i}. Explain question ${i}.`);
    }

    const result = await parseQuestionFile(new File([lines.join("\n")], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(20);
  });

  it("drops instruction lines instead of importing them as numbered questions", async () => {
    const content = [
      "Use blue or black pen.",
      "Write your name on the answer booklet.",
      "Answer three (3) questions from this section.",
      "Answer any THREE questions.",
      "Answer ALL questions in the spaces provided.",
      "1. Answer all questions in this section.",
      "2. Use only a blue pen.",
      "All answers must be written in ink.",
      "This question paper has two sections.",
      "What is the capital of France?",
      "A) Paris",
      "B) London",
      "Answer: A",
      "Which is red?",
      "A) Apple",
      "B) Banana",
      "Answer: A",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions).toEqual([
      expect.objectContaining({ prompt: "What is the capital of France?" }),
      expect.objectContaining({ prompt: "Which is red?" }),
    ]);
  });

  it("drops more common instruction sentences", async () => {
    const content = [
      "Candidates should answer all questions.",
      "Shade the correct answer.",
      "Tick the correct answer.",
      "Do not open this booklet until you are told to do so.",
      "There are two sections in this paper.",
      "Each question has four options.",
      "1. What is the capital of France?",
      "A) Paris",
      "B) London",
      "Answer: A",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(1);
    expect(result.questions?.[0]).toMatchObject({
      type: "objective",
      prompt: "What is the capital of France?",
      correctOption: 0,
    });
  });

  it("drops standalone Question N header lines instead of numbering them as questions", async () => {
    const content = [
      "Question 1",
      "What is the capital of France?",
      "A) Paris",
      "B) London",
      "Answer: A",
      "Question 2",
      "What is 2 + 2?",
      "A) 3",
      "B) 4",
      "Answer: B",
      "QUESTION THREE",
      "Explain photosynthesis.",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(3);
    expect(result.questions?.map((question) => [question.type, question.prompt])).toEqual([
      ["objective", "What is the capital of France?"],
      ["objective", "What is 2 + 2?"],
      ["written", "Explain photosynthesis."],
    ]);
  });

  it("keeps the prompt when it shares the line with the header (Question 1: …)", async () => {
    const content = [
      "Question 1: What is the capital of France?",
      "A) Paris",
      "B) London",
      "Answer: A",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(1);
    expect(result.questions?.[0]).toMatchObject({
      type: "objective",
      prompt: "What is the capital of France?",
      correctOption: 0,
    });
  });

  it("imports a full 100-question paper with headers between every question", async () => {
    const lines: string[] = [];
    for (let i = 1; i <= 100; i += 1) {
      lines.push(`Question ${i}`);
      lines.push(`${i}. What is the answer to question ${i}?`);
      lines.push("A) Alpha");
      lines.push("B) Beta");
      lines.push("C) Gamma");
      lines.push("D) Delta");
      lines.push(`Answer: ${String.fromCharCode(64 + ((i % 4) + 1))}`);
    }

    const result = await parseQuestionFile(new File([lines.join("\n")], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(100);
    expect(result.questions?.[0]).toMatchObject({
      type: "objective",
      prompt: "What is the answer to question 1?",
    });
    expect(result.questions?.[99]).toMatchObject({
      type: "objective",
      prompt: "What is the answer to question 100?",
    });
  });
});

describe("parseQuestionFile — HTML", () => {
  it("parses a Google Docs-style web page export (.html)", async () => {
    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>.c2 { font-weight: 700; }</style>
<script>(function(){ /* analytics */ })();</script>
</head><body>
<p class="c0"><span>MODULE 1 EXAM</span></p>
<p>What colour model is used for print?</p>
<ul><li><span>A) RGB</span></li><li>B) CMYK</li><li>C) HSV</li><li>D) HSL</li></ul>
<p>Answer: B</p>
<p>R&amp;D costs are covered in this course.</p>
</body></html>`;

    const result = await parseQuestionFile(new File([html], "exam.html"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({
      type: "objective",
      prompt: "What colour model is used for print?",
      options: ["RGB", "CMYK", "HSV", "HSL"],
      correctOption: 1,
      points: 1,
    });
    expect(result.questions?.[1]).toMatchObject({
      type: "written",
      prompt: "R&D costs are covered in this course.",
      points: 5,
    });
  });

  it("accepts .htm files with paragraphs on a single line", async () => {
    const html =
      "<html><body>" +
      "<h2>SECTION A</h2>" +
      "<p>Which two are primary colours?</p>" +
      "<ul><li>A) Red</li><li>B) Green</li><li>C) Blue</li><li>D) Yellow</li></ul>" +
      "<p>Answer: A,C</p>" +
      "<p>Explain the difference between RAM &amp; ROM.</p>" +
      "</body></html>";

    const result = await parseQuestionFile(new File([html], "exam.htm"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({ type: "multiple", correctOptions: [0, 2] });
    expect(result.questions?.[1]).toMatchObject({
      type: "written",
      prompt: "Explain the difference between RAM & ROM.",
    });
  });
});

describe("parseQuestionFile — trailing answer key", () => {
  it("applies a numbered answer key to questions without inline answers", async () => {
    const content = [
      "1. What colour model is used for print?",
      "A) RGB",
      "B) CMYK",
      "C) HSV",
      "D) HSL",
      "",
      "2. Which is the odd one out?",
      "A) Red",
      "B) Green",
      "C) Blue",
      "D) Yellow",
      "",
      "ANSWER KEY",
      "1. B",
      "2. C",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({ type: "objective", correctOption: 1 });
    expect(result.questions?.[1]).toMatchObject({ type: "objective", correctOption: 2 });
  });

  it("parses a one-line key and multiple-answer entries", async () => {
    const content = [
      "1. What colour model is used for print?",
      "A) RGB",
      "B) CMYK",
      "C) HSV",
      "D) HSL",
      "",
      "2. Which of these are primary colours?",
      "A) Red",
      "B) Green",
      "C) Blue",
      "D) Yellow",
      "",
      "Answers: 1-B, 2-A,C",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({ type: "objective", correctOption: 1 });
    expect(result.questions?.[1]).toMatchObject({ type: "multiple", correctOptions: [0, 2] });
  });

  it("maps a key positionally when questions are unnumbered", async () => {
    const content = [
      "What colour model is used for print?",
      "A) RGB",
      "B) CMYK",
      "C) HSV",
      "D) HSL",
      "",
      "Which of these are primary colours?",
      "A) Red",
      "B) Green",
      "C) Blue",
      "D) Yellow",
      "",
      "Key:",
      "1. B",
      "2. A, C",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({ type: "objective", correctOption: 1 });
    expect(result.questions?.[1]).toMatchObject({ type: "multiple", correctOptions: [0, 2] });
  });

  it("keeps inline answers and does not apply the key to those questions", async () => {
    const content = [
      "1. What colour model is used for print?",
      "A) RGB",
      "B) CMYK",
      "C) HSV",
      "D) HSL",
      "Answer: A",
      "",
      "2. Which is the odd one out?",
      "A) Red",
      "B) Green",
      "C) Blue",
      "D) Yellow",
      "",
      "ANSWERS",
      "1. B",
      "2. C",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({ type: "objective", correctOption: 0 }); // inline wins
    expect(result.questions?.[1]).toMatchObject({ type: "objective", correctOption: 2 });
  });

  it("does not spread key rows that refer to missing questions", async () => {
    const content = [
      "1. What colour model is used for print?",
      "A) RGB",
      "B) CMYK",
      "C) HSV",
      "D) HSL",
      "",
      "ANSWER KEY",
      "1. B",
      "5. D", // refers to a question that isn't in the paper
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(1);
    expect(result.questions?.[0]).toMatchObject({ type: "objective", correctOption: 1 });
  });

  it("applies a compact key without a colon (single line, dashes)", async () => {
    const content = [
      "1. What colour model is used for print?",
      "A) RGB",
      "B) CMYK",
      "C) HSV",
      "D) HSL",
      "",
      "2. Which is the odd one out?",
      "A) Red",
      "B) Green",
      "C) Blue",
      "D) Yellow",
      "",
      "ANSWERS 1-B, 2-C",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({ type: "objective", correctOption: 1 });
    expect(result.questions?.[1]).toMatchObject({ type: "objective", correctOption: 2 });
  });

  it("applies a compact key without a colon (single line, dotted entries)", async () => {
    const content = [
      "1. What colour model is used for print?",
      "A) RGB",
      "B) CMYK",
      "C) HSV",
      "D) HSL",
      "",
      "2. Which is the odd one out?",
      "A) Red",
      "B) Green",
      "C) Blue",
      "D) Yellow",
      "",
      "ANSWERS 1. B 2. C",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({ type: "objective", correctOption: 1 });
    expect(result.questions?.[1]).toMatchObject({ type: "objective", correctOption: 2 });
  });

  it("applies a one-line key with a colon (multiple answers)", async () => {
    const content = [
      "1. Which of these are primary colours?",
      "A) Red",
      "B) Green",
      "C) Blue",
      "D) Yellow",
      "",
      "2. Which is the odd one out?",
      "A) Red",
      "B) Green",
      "C) Blue",
      "D) Yellow",
      "",
      "Answers: 1-A,C, 2-B",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({ type: "multiple", correctOptions: [0, 2] });
    expect(result.questions?.[1]).toMatchObject({ type: "objective", correctOption: 1 });
  });

  it("does not mistake instruction sentences for answer keys and still applies a real key", async () => {
    const content = [
      "Answer ALL questions.",
      "1. What colour model is used for print?",
      "A) RGB",
      "B) CMYK",
      "C) HSV",
      "D) HSL",
      "",
      "2. Which is the odd one out?",
      "A) Red",
      "B) Green",
      "C) Blue",
      "D) Yellow",
      "",
      "ANSWER KEY",
      "1. B",
      "2. C",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({ type: "objective", correctOption: 1 });
    expect(result.questions?.[1]).toMatchObject({ type: "objective", correctOption: 2 });
  });

  it("keeps inline answers and does not apply the key to those questions", async () => {
    const content = [
      "1. What colour model is used for print?",
      "A) RGB",
      "B) CMYK",
      "C) HSV",
      "D) HSL",
      "Answer: A",
      "",
      "2. Which is the odd one out?",
      "A) Red",
      "B) Green",
      "C) Blue",
      "D) Yellow",
      "",
      "ANSWERS 1-B, 2-C",
    ].join("\n");

    const result = await parseQuestionFile(new File([content], "paper.txt"));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions?.[0]).toMatchObject({ type: "objective", correctOption: 0 }); // inline wins
    expect(result.questions?.[1]).toMatchObject({ type: "objective", correctOption: 2 });
  });
});

describe("parseQuestionFile — PDF", () => {
  it("extracts and parses objective and written questions from a PDF", async () => {
    const file = await pdfFile([
      "Page 1",
      "What colour model is used for print?",
      "A) RGB",
      "B) CMYK",
      "C) HSV",
      "D) HSL",
      "Answer: B",
      "Points: 2",
      "Explain how a stacked bar chart differs from a grouped bar chart.",
    ]);

    const result = await parseQuestionFile(file);

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.questions).toEqual([
      {
        type: "objective",
        prompt: "What colour model is used for print?",
        options: ["RGB", "CMYK", "HSV", "HSL"],
        correctOption: 1,
        correctOptions: null,
        points: 2,
      },
      {
        type: "written",
        prompt: "Explain how a stacked bar chart differs from a grouped bar chart.",
        options: null,
        correctOption: null,
        correctOptions: null,
        points: 5,
      },
    ]);
  });

  it("reports a corrupt PDF file", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "broken.pdf");
    const result = await parseQuestionFile(file);
    expect(result).toEqual({
      ok: false,
      errors: ["Could not read the PDF. Make sure it is a valid .pdf file."],
    });
  });
});

describe("parseQuestionFile — Word (.doc)", () => {
  it("reports a corrupt legacy Word file", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "broken.doc");
    const result = await parseQuestionFile(file);
    expect(result).toEqual({
      ok: false,
      errors: ["Could not read the Word document. Make sure it is a valid .doc file."],
    });
  });
});

/**
 * Lines of a realistic 100-question paper: headers and numbered instructions
 * up front (which must be dropped), then 100 numbered objective questions.
 */
function hundredQuestionPaperLines(): string[] {
  const lines = [
    "MODULE 1 EXAMINATION",
    "INSTRUCTIONS TO CANDIDATES",
    "1. Answer ALL questions.",
    "2. Use blue or black pen.",
    "SECTION A: OBJECTIVE QUESTIONS",
  ];
  for (let i = 1; i <= 100; i += 1) {
    lines.push(`${i}. What is the answer to question ${i}?`);
    lines.push("A) Alpha");
    lines.push("B) Beta");
    lines.push("C) Gamma");
    lines.push("D) Delta");
    lines.push(`Answer: ${String.fromCharCode(64 + ((i % 4) + 1))}`);
  }
  lines.push("THE END");
  return lines;
}

describe("parseQuestionFile — large papers (100 questions)", () => {
  it("parses a 100-question .docx paper end to end", async () => {
    // One paragraph per line, like a standard Word document.
    const file = await docxFile(hundredQuestionPaperLines());
    const result = await parseQuestionFile(file);

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(100);
    expect(result.questions).toHaveLength(100);
    // Headers and instructions are dropped — only real questions come through.
    expect(result.questions?.every((question) => question.type === "objective")).toBe(true);
    expect(result.questions?.[0]).toMatchObject({
      type: "objective",
      prompt: "What is the answer to question 1?", // paper numbering stripped
      options: ["Alpha", "Beta", "Gamma", "Delta"],
      correctOption: 1, // B
    });
    expect(result.questions?.[99]).toMatchObject({
      type: "objective",
      prompt: "What is the answer to question 100?",
      correctOption: 0, // A
    });
  });

  it("parses a 100-question .pdf paper end to end", async () => {
    const file = await pdfFile(hundredQuestionPaperLines());
    const result = await parseQuestionFile(file);

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(100);
    expect(result.questions).toHaveLength(100);
    expect(result.questions?.[0]).toMatchObject({
      type: "objective",
      prompt: "What is the answer to question 1?",
      correctOption: 1, // B
    });
    expect(result.questions?.[99]).toMatchObject({
      type: "objective",
      prompt: "What is the answer to question 100?",
      correctOption: 0, // A
    });
  });
});

describe("validateImportedQuestions", () => {
  it("accepts valid objective, multiple and written questions", async () => {
    const result = validateImportedQuestions([
      {
        type: "objective",
        prompt: "Which colour model is used for print?",
        options: ["RGB", "CMYK", "HSV", "HSL"],
        correctOption: 1,
        correctOptions: null,
        points: 1,
      },
      {
        type: "multiple",
        prompt: "Which of these are primary colours?",
        options: ["Red", "Green", "Blue", "Yellow"],
        correctOption: null,
        correctOptions: [0, 2],
        points: 1,
      },
      {
        type: "multiple",
        prompt: "Pick the odd one out?",
        options: ["Red", "Green", "Blue", "Yellow"],
        correctOption: null,
        correctOptions: [1], // a single correct answer is allowed after editing
        points: 1,
      },
      {
        type: "written",
        prompt: "Explain a concept.",
        options: null,
        correctOption: null,
        correctOptions: null,
        points: 5,
      },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.questions).toHaveLength(4);
      expect(result.questions[1].correctOptions).toEqual([0, 2]);
      expect(result.questions[2].correctOptions).toEqual([1]);
    }
  });

  it("rejects an empty list", () => {
    expect(validateImportedQuestions([])).toEqual({ ok: false, error: "No questions to import." });
  });

  it("rejects unknown types, blank prompts and bad points", () => {
    expect(validateImportedQuestions([{ type: "essay", prompt: "X", options: null, correctOption: null, correctOptions: null, points: 1 }])).toEqual({
      ok: false,
      error: 'Question 1: type must be "objective", "multiple" or "written".',
    });
    expect(
      validateImportedQuestions([{ type: "written", prompt: " ", options: null, correctOption: null, correctOptions: null, points: 5 }])
    ).toEqual({ ok: false, error: "Question 1: missing the question text." });
    expect(
      validateImportedQuestions([{ type: "written", prompt: "X", options: null, correctOption: null, correctOptions: null, points: 0 }])
    ).toEqual({ ok: false, error: "Question 1: points must be a whole number between 1 and 100." });
  });

  it("rejects out-of-range correct options and missing answer keys", () => {
    expect(
      validateImportedQuestions([
        { type: "objective", prompt: "Q", options: ["A", "B"], correctOption: 5, correctOptions: null, points: 1 },
      ])
    ).toEqual({ ok: false, error: "Question 1: the correct option must be one of the listed options." });
    expect(
      validateImportedQuestions([
        { type: "multiple", prompt: "Q", options: ["A", "B", "C"], correctOption: null, correctOptions: [0, 5], points: 1 },
      ])
    ).toEqual({ ok: false, error: "Question 1: correct options must list valid option indexes." });
  });
});

describe("questionTemplateCsv", () => {
  it("starts with the expected header", () => {
    const lines = questionTemplateCsv().split("\n");
    expect(lines[0]).toBe(HEADER);
  });

  it("includes the example rows (objective, multiple, written)", () => {
    const lines = questionTemplateCsv().split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe(
      "objective,Which colour model is used for print?,RGB,CMYK,HSV,HSL,B,1"
    );
    expect(lines[2]).toBe(
      'multiple,Which of these are primary colours?,Red,Green,Blue,Yellow,"A,C",1'
    );
    expect(lines[3]).toBe(
      "written,Explain how a stacked bar chart differs from a grouped bar chart.,,,,,,5"
    );
  });
});
