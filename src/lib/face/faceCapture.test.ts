import { describe, expect, it } from 'vitest';
import {
  evaluateFaceFrame,
  FACE_EMBEDDING_DIMENSION,
  isValidFaceEmbedding,
  type FaceFrameMetrics,
} from './faceCapture';

const base: FaceFrameMetrics = {
  faceCount: 1,
  detectionScore: 0.95,
  box: { x: 192, y: 80, width: 256, height: 330 },
  frameWidth: 640,
  frameHeight: 480,
  yaw: 0,
  pitch: 0,
  roll: 0,
};

describe('evaluateFaceFrame', () => {
  it('aceita rosto frontal centralizado e com tamanho util', () => {
    const result = evaluateFaceFrame(base, 'front');
    expect(result.ready).toBe(true);
    expect(result.guidance).toBe('ready');
    expect(result.qualityScore).toBeGreaterThan(0.8);
  });

  it('aceita a variacao de yaw observada em um rosto realmente frontal', () => {
    // O face-api retorna uma medida proporcional ao rosto, nao graus. Esta
    // proporcao (~0.17) foi observada em amostras frontais reais.
    expect(evaluateFaceFrame({ ...base, yaw: 44 }, 'front').ready).toBe(true);
    expect(evaluateFaceFrame({ ...base, yaw: -44 }, 'front').ready).toBe(true);
  });

  it('recusa zero ou mais de um rosto', () => {
    expect(evaluateFaceFrame({ ...base, faceCount: 0, box: null }, 'front').guidance).toBe('no_face');
    expect(evaluateFaceFrame({ ...base, faceCount: 2 }, 'front').guidance).toBe('multiple_faces');
  });

  it('orienta distancia e centralizacao antes de capturar', () => {
    expect(evaluateFaceFrame({ ...base, box: { ...base.box!, width: 100 } }, 'front').guidance).toBe('move_closer');
    expect(evaluateFaceFrame({ ...base, box: { ...base.box!, width: 520 } }, 'front').guidance).toBe('move_away');
    expect(evaluateFaceFrame({ ...base, box: { ...base.box!, x: 0 } }, 'front').guidance).toBe('center_face');
  });

  it('recusa score fraco, frame invalido e rosto inclinado', () => {
    expect(evaluateFaceFrame({ ...base, detectionScore: 0.67 }, 'front').guidance).toBe('hold_still');
    expect(evaluateFaceFrame({ ...base, detectionScore: Number.NaN }, 'front').guidance).toBe('hold_still');
    expect(evaluateFaceFrame({ ...base, frameWidth: 0 }, 'front').ready).toBe(false);
    expect(evaluateFaceFrame({ ...base, roll: 17 }, 'front').guidance).toBe('keep_head_level');
    expect(evaluateFaceFrame({ ...base, pitch: -23 }, 'front').guidance).toBe('keep_head_level');
  });

  it('exige olhar frontal na primeira captura', () => {
    expect(evaluateFaceFrame({ ...base, yaw: 56 }, 'front').guidance).toBe('look_forward');
    expect(evaluateFaceFrame({ ...base, yaw: -56 }, 'front').guidance).toBe('look_forward');
  });

  it('exige lados opostos nas capturas laterais', () => {
    const first = evaluateFaceFrame({ ...base, yaw: 60 }, 'first_side');
    expect(first.ready).toBe(true);
    expect(first.yawSign).toBe(1);

    expect(evaluateFaceFrame({ ...base, yaw: 60 }, 'opposite_side', first.yawSign).guidance)
      .toBe('turn_to_other_side');
    expect(evaluateFaceFrame({ ...base, yaw: -60 }, 'opposite_side', first.yawSign).ready)
      .toBe(true);
  });

  it('nao aceita pose lateral sem giro ou sem referencia do primeiro lado', () => {
    expect(evaluateFaceFrame({ ...base, yaw: 0 }, 'first_side').guidance).toBe('turn_to_one_side');
    expect(evaluateFaceFrame({ ...base, yaw: -60 }, 'opposite_side', 0).guidance)
      .toBe('turn_to_other_side');
  });

  it('mantem qualidade normalizada entre zero e um', () => {
    const result = evaluateFaceFrame(base, 'front');
    expect(result.qualityScore).toBeGreaterThanOrEqual(0);
    expect(result.qualityScore).toBeLessThanOrEqual(1);
  });
});

describe('isValidFaceEmbedding', () => {
  it('aceita descriptor dlib 128d normalizado', () => {
    const value = Array.from({ length: FACE_EMBEDDING_DIMENSION }, () => 1 / Math.sqrt(128));
    expect(isValidFaceEmbedding(value)).toBe(true);
  });

  it('recusa dimensao, NaN e vetor vazio', () => {
    expect(isValidFaceEmbedding([1, 2])).toBe(false);
    expect(isValidFaceEmbedding(Array.from({ length: 128 }, () => Number.NaN))).toBe(false);
    expect(isValidFaceEmbedding(Array.from({ length: 128 }, () => 0))).toBe(false);
  });

  it('recusa infinito, coordenada fora da faixa e norma excessiva', () => {
    expect(isValidFaceEmbedding([
      ...Array.from({ length: 127 }, () => 1 / Math.sqrt(128)),
      Number.POSITIVE_INFINITY,
    ])).toBe(false);
    expect(isValidFaceEmbedding([
      ...Array.from({ length: 127 }, () => 1 / Math.sqrt(128)),
      4.01,
    ])).toBe(false);
    expect(isValidFaceEmbedding(Array.from({ length: 128 }, () => 1))).toBe(false);
  });
});
