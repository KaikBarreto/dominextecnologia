export const FACE_MODEL_VERSION = 'face-api@1.7.15/dlib-128d-v1';
export const FACE_EMBEDDING_DIMENSION = 128;
export const FACE_REQUIRED_CAPTURES = 3;

export type FaceCapturePose = 'front' | 'first_side' | 'opposite_side';

export type FaceCaptureGuidance =
  | 'ready'
  | 'no_face'
  | 'multiple_faces'
  | 'move_closer'
  | 'move_away'
  | 'center_face'
  | 'look_forward'
  | 'keep_head_level'
  | 'turn_to_one_side'
  | 'turn_to_other_side'
  | 'hold_still';

export interface FaceFrameMetrics {
  faceCount: number;
  detectionScore: number;
  box: { x: number; y: number; width: number; height: number } | null;
  frameWidth: number;
  frameHeight: number;
  yaw: number | null;
  pitch: number | null;
  roll: number | null;
}

export interface FaceFrameEvaluation {
  ready: boolean;
  guidance: FaceCaptureGuidance;
  qualityScore: number;
  /** Sinal normalizado usado para exigir que a terceira captura seja oposta. */
  yawSign: -1 | 0 | 1;
}

export interface FaceFrameEvaluationOptions {
  /**
   * Tolera pequenas oscilacoes de enquadramento durante uma leitura ao vivo.
   * O cadastro permanece estrito para nao degradar os templates persistidos.
   */
  tolerateMotion?: boolean;
}

export interface FaceTemplatePayload {
  embedding: number[];
  quality_score: number;
}

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

// O `angle.yaw` do @vladmandic/face-api nao e um angulo em graus. Na pratica,
// rostos realmente frontais ficam com |yaw / largura| perto de 0.10-0.18 em
// cameras comuns. O limite antigo (0.065) rejeitava essas leituras e deixava a
// primeira etapa presa para sempre. Mantemos uma folga frontal conservadora e
// exigimos um giro nitido, fora dessa faixa, nas capturas laterais.
const FRONT_MAX_YAW_RATIO = 0.2;
const SIDE_MIN_YAW_RATIO = 0.22;

export function evaluateFaceFrame(
  metrics: FaceFrameMetrics,
  pose: FaceCapturePose,
  firstSideSign: -1 | 0 | 1 = 0,
  options: FaceFrameEvaluationOptions = {},
): FaceFrameEvaluation {
  const fail = (guidance: FaceCaptureGuidance): FaceFrameEvaluation => ({
    ready: false,
    guidance,
    qualityScore: 0,
    yawSign: 0,
  });

  if (metrics.faceCount === 0 || !metrics.box) return fail('no_face');
  if (metrics.faceCount > 1) return fail('multiple_faces');
  if (metrics.frameWidth <= 0 || metrics.frameHeight <= 0) return fail('hold_still');
  const minDetectionScore = options.tolerateMotion ? 0.62 : 0.68;
  const minWidthRatio = options.tolerateMotion ? 0.18 : 0.22;
  const maxWidthRatio = options.tolerateMotion ? 0.76 : 0.72;
  const maxOffsetX = options.tolerateMotion ? 0.2 : 0.16;
  const maxOffsetY = options.tolerateMotion ? 0.24 : 0.2;
  const maxRoll = options.tolerateMotion ? 20 : 16;
  const maxPitch = options.tolerateMotion ? 26 : 22;

  if (!Number.isFinite(metrics.detectionScore) || metrics.detectionScore < minDetectionScore) {
    return fail('hold_still');
  }

  const widthRatio = metrics.box.width / metrics.frameWidth;
  if (widthRatio < minWidthRatio) return fail('move_closer');
  if (widthRatio > maxWidthRatio) return fail('move_away');

  const centerX = metrics.box.x + metrics.box.width / 2;
  const centerY = metrics.box.y + metrics.box.height / 2;
  const offsetX = Math.abs(centerX / metrics.frameWidth - 0.5);
  const offsetY = Math.abs(centerY / metrics.frameHeight - 0.48);
  if (offsetX > maxOffsetX || offsetY > maxOffsetY) return fail('center_face');

  if (metrics.roll !== null && Math.abs(metrics.roll) > maxRoll) return fail('keep_head_level');
  if (metrics.pitch !== null && Math.abs(metrics.pitch) > maxPitch) return fail('keep_head_level');

  // O yaw fornecido pelo face-api e proporcional ao tamanho do rosto, nao um
  // angulo real. Normalizar pela largura deixa o limiar estavel entre cameras.
  const yawRatio = metrics.yaw === null ? 0 : metrics.yaw / metrics.box.width;
  const yawSign: -1 | 0 | 1 = yawRatio >= SIDE_MIN_YAW_RATIO
    ? 1
    : yawRatio <= -SIDE_MIN_YAW_RATIO
      ? -1
      : 0;

  if (pose === 'front' && Math.abs(yawRatio) > FRONT_MAX_YAW_RATIO) return fail('look_forward');
  if (pose === 'first_side' && Math.abs(yawRatio) < SIDE_MIN_YAW_RATIO) {
    return fail('turn_to_one_side');
  }
  if (
    pose === 'opposite_side' &&
    (Math.abs(yawRatio) < SIDE_MIN_YAW_RATIO || firstSideSign === 0 || yawSign === firstSideSign)
  ) {
    return fail('turn_to_other_side');
  }

  const sizeQuality = Math.max(0, 1 - Math.abs(widthRatio - 0.48) / 0.28);
  const centerQuality = Math.max(0, 1 - (offsetX / maxOffsetX + offsetY / maxOffsetY) / 2);
  const qualityScore = round4(
    Math.min(1, metrics.detectionScore * 0.65 + sizeQuality * 0.2 + centerQuality * 0.15),
  );

  return { ready: true, guidance: 'ready', qualityScore, yawSign };
}

export function isValidFaceEmbedding(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length !== FACE_EMBEDDING_DIMENSION) return false;
  if (!value.every((coordinate) =>
    typeof coordinate === 'number' && Number.isFinite(coordinate) && Math.abs(coordinate) <= 4
  )) return false;
  const norm = Math.sqrt(value.reduce((sum, coordinate) => sum + coordinate * coordinate, 0));
  return Number.isFinite(norm) && norm >= 0.5 && norm <= 2;
}
