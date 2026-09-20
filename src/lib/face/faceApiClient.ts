import {
  FACE_EMBEDDING_DIMENSION,
  isValidFaceEmbedding,
  type FaceFrameMetrics,
} from './faceCapture';

const MODEL_PATH = '/models/face-api';

type FaceApiModule = typeof import('@vladmandic/face-api');

let faceApiPromise: Promise<FaceApiModule> | null = null;

export interface DetectedFaceFrame {
  metrics: FaceFrameMetrics;
  embedding: number[] | null;
}

export function loadFaceApiModels(): Promise<FaceApiModule> {
  if (!faceApiPromise) {
    faceApiPromise = import('@vladmandic/face-api').then(async (faceapi) => {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_PATH),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_PATH),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_PATH),
      ]);
      return faceapi;
    }).catch((error) => {
      faceApiPromise = null;
      throw error;
    });
  }
  return faceApiPromise;
}

export async function detectFaceFrame(video: HTMLVideoElement): Promise<DetectedFaceFrame> {
  const faceapi = await loadFaceApiModels();
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.55,
  });
  const results = await faceapi
    .detectAllFaces(video, options)
    .withFaceLandmarks(true)
    .withFaceDescriptors();

  const first = results[0];
  const embedding = first ? Array.from(first.descriptor) : null;
  return {
    metrics: {
      faceCount: results.length,
      detectionScore: first?.detection.score ?? 0,
      box: first ? {
        x: first.detection.box.x,
        y: first.detection.box.y,
        width: first.detection.box.width,
        height: first.detection.box.height,
      } : null,
      frameWidth: video.videoWidth,
      frameHeight: video.videoHeight,
      yaw: first?.angle.yaw ?? null,
      pitch: first?.angle.pitch ?? null,
      roll: first?.angle.roll ?? null,
    },
    embedding:
      embedding?.length === FACE_EMBEDDING_DIMENSION && isValidFaceEmbedding(embedding)
        ? embedding
        : null,
  };
}
