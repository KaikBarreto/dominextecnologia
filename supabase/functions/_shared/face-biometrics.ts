// Contrato puro dos payloads faciais publicos. Fica separado das edges para
// que dimensao, faixa, norma e allowlist tenham prova automatizada sem banco.

export const FACE_MODEL_VERSION = "face-api@1.7.15/dlib-128d-v1";
export const FACE_EMBEDDING_DIMENSION = 128;
export const FACE_REQUIRED_CAPTURES = 3;

export type FaceTemplate = { embedding: number[]; quality_score: number };

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function isValidEnrollmentToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function isValidEmbedding(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length !== FACE_EMBEDDING_DIMENSION) return false;
  if (!value.every((coordinate) =>
    typeof coordinate === "number" &&
    Number.isFinite(coordinate) &&
    Math.abs(coordinate) <= 4
  )) return false;

  const norm = Math.sqrt(
    value.reduce((sum, coordinate) => sum + coordinate * coordinate, 0),
  );
  return Number.isFinite(norm) && norm >= 0.5 && norm <= 2;
}

export function isValidQuality(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1;
}

export function parseFaceTemplates(value: unknown): FaceTemplate[] | null {
  if (!Array.isArray(value) || value.length !== FACE_REQUIRED_CAPTURES) return null;

  const parsed: FaceTemplate[] = [];
  for (const item of value) {
    if (!isPlainObject(item) || !hasOnlyKeys(item, ["embedding", "quality_score"])) {
      return null;
    }
    if (!isValidEmbedding(item.embedding) || !isValidQuality(item.quality_score)) {
      return null;
    }
    parsed.push({ embedding: item.embedding, quality_score: item.quality_score });
  }
  return parsed;
}

export function isValidFaceCalibrationPayload(body: Record<string, unknown>): boolean {
  return body.model_version === FACE_MODEL_VERSION &&
    isValidEmbedding(body.embedding) &&
    isValidQuality(body.quality_score);
}

export function calibrationAllowedKeys(kind: "personal" | "kiosk"): readonly string[] {
  return kind === "personal"
    ? ["action", "slug", "pin", "model_version", "embedding", "quality_score"]
    : [
      "action",
      "kiosk_slug",
      "employee_id",
      "pin",
      "model_version",
      "embedding",
      "quality_score",
    ];
}
