import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { parseQuestionFile, questionTemplateCsv } from "@/lib/assessment-import";

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
 * Builds a .docx where each question is ONE paragraph whose lines are
 * separated by literal newlines. That is the layout the importer supports:
 * mammoth appends two newlines after every paragraph, so a question's lines
 * must live inside a single paragraph to end up in the same block.
 */
async function docxFile(questions: string[], name = "questions.docx"): Promise<File> {
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
      questions.map((q) => `<w:p><w:r><w:t>${escapeXml(q)}</w:t></w:r></w:p>`).join(""),
      "</w:body></w:document>",
    ].join("")
  );
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new File([bufferToArrayBuffer(buffer)], name);
}

describe("parseQuestionFile — file gating", () => {
  it("rejects unsupported file types", async () => {
    const result = await parseQuestionFile(new File(["hello"], "notes.txt"));
    expect(result).toEqual({
      ok: false,
      errors: ["Please upload a .csv, .xlsx, .xls or .docx file."],
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
        points: 2,
      },
      {
        type: "written",
        prompt: "Explain how a stacked bar chart differs from a grouped bar chart.",
        options: null,
        correctOption: null,
        points: 5,
      },
    ]);
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
      errors: ['Row 2: type must be "objective" or "written" (got "essay").'],
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
        points: 2,
      },
      {
        type: "written",
        prompt: "Explain how a stacked bar chart differs from a grouped bar chart.",
        options: null,
        correctOption: null,
        points: 1, // default when no Points line
      },
    ]);
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

describe("questionTemplateCsv", () => {
  it("starts with the expected header", () => {
    const lines = questionTemplateCsv().split("\n");
    expect(lines[0]).toBe(HEADER);
  });

  it("includes the example rows (one objective, one written, one animation)", () => {
    const lines = questionTemplateCsv().split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe(
      "objective,Which colour model is used for print?,RGB,CMYK,HSV,HSL,B,2"
    );
    expect(lines[2]).toBe(
      'objective,"In 2D animation, what does \'tweening\' mean?",Frames in between,Outlining,Colouring,Rendering,A,2'
    );
    expect(lines[3]).toBe(
      "written,Explain how a stacked bar chart differs from a grouped bar chart.,,,,,,5"
    );
  });
});
