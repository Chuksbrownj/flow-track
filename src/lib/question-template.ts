/**
 * Builds the CSV template text shown/downloaded to trainers. Kept in its own
 * module so client components can import it without pulling in the
 * server-side question parsers (mammoth / xlsx / word-extractor / unpdf).
 *
 * Points follow the app defaults: 1 for option questions, 5 for written.
 */
export function questionTemplateCsv(): string {
  const header = ["type", "question", "optionA", "optionB", "optionC", "optionD", "correct", "points"];
  const examples = [
    ["objective", "Which colour model is used for print?", "RGB", "CMYK", "HSV", "HSL", "B", "1"],
    ["multiple", "Which of these are primary colours?", "Red", "Green", "Blue", "Yellow", "A,C", "1"],
    ["written", "Explain how a stacked bar chart differs from a grouped bar chart.", "", "", "", "", "", "5"],
  ];
  const escape = (value: string) => {
    if (/[\",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };
  const lines = [header.join(","), ...examples.map((row) => row.map(escape).join(","))];
  return lines.join("\n");
}