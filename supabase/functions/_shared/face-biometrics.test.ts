import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  calibrationAllowedKeys,
  FACE_EMBEDDING_DIMENSION,
  FACE_MODEL_VERSION,
  hasOnlyKeys,
  isValidEmbedding,
  isValidEnrollmentToken,
  isValidFaceCalibrationPayload,
  parseFaceTemplates,
} from "./face-biometrics.ts";

const embedding = () =>
  Array.from({ length: FACE_EMBEDDING_DIMENSION }, () => 1 / Math.sqrt(128));
const template = () => ({ embedding: embedding(), quality_score: 0.92 });

Deno.test("token de cadastro exige exatamente 256 bits hexadecimais minusculos", () => {
  assert(isValidEnrollmentToken("a".repeat(64)));
  assertEquals(isValidEnrollmentToken("A".repeat(64)), false);
  assertEquals(isValidEnrollmentToken("a".repeat(63)), false);
  assertEquals(isValidEnrollmentToken("g".repeat(64)), false);
});

Deno.test("embedding aceita somente 128 coordenadas finitas, limitadas e com norma util", () => {
  assert(isValidEmbedding(embedding()));
  assertEquals(isValidEmbedding(embedding().slice(1)), false);
  assertEquals(isValidEmbedding([...embedding().slice(0, 127), Number.NaN]), false);
  assertEquals(isValidEmbedding([...embedding().slice(0, 127), Number.POSITIVE_INFINITY]), false);
  assertEquals(isValidEmbedding([...embedding().slice(0, 127), 4.01]), false);
  assertEquals(isValidEmbedding(Array.from({ length: 128 }, () => 0)), false);
  assertEquals(isValidEmbedding(Array.from({ length: 128 }, () => 1)), false);
});

Deno.test("cadastro exige exatamente tres capturas e rejeita chaves extras", () => {
  assertEquals(parseFaceTemplates([template(), template(), template()])?.length, 3);
  assertEquals(parseFaceTemplates([template(), template()]), null);
  assertEquals(parseFaceTemplates([template(), template(), template(), template()]), null);
  assertEquals(parseFaceTemplates([
    { ...template(), photo_base64: "proibido" },
    template(),
    template(),
  ]), null);
});

Deno.test("qualidade, modelo e dimensao invalidos nunca entram na calibracao", () => {
  const valid = {
    model_version: FACE_MODEL_VERSION,
    embedding: embedding(),
    quality_score: 0.8,
  };
  assert(isValidFaceCalibrationPayload(valid));
  assertEquals(isValidFaceCalibrationPayload({ ...valid, model_version: "outro" }), false);
  assertEquals(isValidFaceCalibrationPayload({ ...valid, quality_score: -0.1 }), false);
  assertEquals(isValidFaceCalibrationPayload({ ...valid, quality_score: 1.1 }), false);
  assertEquals(isValidFaceCalibrationPayload({ ...valid, quality_score: Number.NaN }), false);
});

Deno.test("allowlist diferencia link pessoal de quiosque e barra campos forjados", () => {
  const personal = {
    action: "calibrate_face",
    slug: "capability",
    model_version: FACE_MODEL_VERSION,
    embedding: embedding(),
    quality_score: 0.9,
  };
  assert(hasOnlyKeys(personal, calibrationAllowedKeys("personal")));
  assertEquals(
    hasOnlyKeys({ ...personal, employee_id: crypto.randomUUID() }, calibrationAllowedKeys("personal")),
    false,
  );

  const kiosk = {
    action: "calibrate_face",
    kiosk_slug: "empresa",
    employee_id: crypto.randomUUID(),
    model_version: FACE_MODEL_VERSION,
    embedding: embedding(),
    quality_score: 0.9,
  };
  assert(hasOnlyKeys(kiosk, calibrationAllowedKeys("kiosk")));
  assertEquals(hasOnlyKeys({ ...kiosk, company_id: crypto.randomUUID() }, calibrationAllowedKeys("kiosk")), false);
});
