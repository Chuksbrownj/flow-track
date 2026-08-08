export const TOPICS = [
  { key: "graphicDesign", label: "Graphic Design" },
  { key: "animation", label: "2D & 3D Animation" },
  { key: "dataAnalysis", label: "Data Analysis" },
  { key: "hpLife", label: "HP LIFE" },
] as const;

export const TOPIC_LABELS = TOPICS.map((topic) => topic.label);

export function isValidTopic(value: string): boolean {
  return (TOPIC_LABELS as readonly string[]).includes(value);
}
