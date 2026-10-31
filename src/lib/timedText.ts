export type TimedTextCue = { start: number; end: number; text: string };

function toSeconds(value: string) {
  const parts = value.trim().replace(",", ".").split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}
export function parseTimedText(source: string): TimedTextCue[] {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
  if (!normalized) return [];
  const blocks = normalized.replace(/^WEBVTT[^\n]*\n+/, "").split(/\n{2,}/);
  const cues: TimedTextCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const [rawStart, rawEndWithSettings] = lines[timingIndex].split("-->");
    const rawEnd = rawEndWithSettings?.trim().split(/\s+/)[0];
    const start = toSeconds(rawStart ?? "");
    const end = toSeconds(rawEnd ?? "");
    if (start === null || end === null || end <= start) continue;
    const text = lines.slice(timingIndex + 1).join("\n").replace(/<[^>]*>/g, "").trim();
    if (text) cues.push({ start, end, text });
  }
  return cues.sort((a, b) => a.start - b.start);
}
