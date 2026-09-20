// Contrato puro dos payloads faciais publicos. Fica separado das edges para
// que dimensao, faixa, norma e allowlist tenham prova automatizada sem banco.

export const FACE_MODEL_VERSION = "face-api@1.7.15/dlib-128d-v1";
export const FACE_EMBEDDING_DIMENSION = 128;
export const FACE_REQUIRED_CAPTURES = 3;
export const FACE_MATCH_MAX_DISTANCE = 0.48;
export const FACE_MATCH_MIN_MARGIN = 0.08;
export const FACE_MATCH_CANDIDATE_DISTANCE = 0.62;

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

export function isValidFaceMatchPayload(body: Record<string, unknown>): boolean {
  return body.model_version === FACE_MODEL_VERSION &&
    isValidEmbedding(body.embedding) &&
    isValidQuality(body.quality_score);
}

export function faceMatchAllowedKeys(): readonly string[] {
  return ["action", "kiosk_slug", "model_version", "embedding", "quality_score"];
}

export type FaceDistanceDecision = "matched" | "ambiguous" | "not_recognized" | "unavailable";

/**
 * Espelho puro da decisao aplicada pela RPC. Quanto menor a distancia, mais
 * parecidos os rostos. A margem protege contra escolher a pessoa errada quando
 * os dois primeiros candidatos estao muito proximos.
 */
export function classifyFaceDistances(distances: readonly number[]): FaceDistanceDecision {
  const ordered = distances.filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const best = ordered[0];
  if (best === undefined) return "unavailable";
  const second = ordered[1];
  if (
    best <= FACE_MATCH_MAX_DISTANCE &&
    (second === undefined || second - best >= FACE_MATCH_MIN_MARGIN)
  ) return "matched";
  if (best <= FACE_MATCH_CANDIDATE_DISTANCE) return "ambiguous";
  return "not_recognized";
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
