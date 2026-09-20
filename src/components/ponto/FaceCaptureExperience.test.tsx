import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FaceCaptureExperience, type FaceCaptureCopy } from './FaceCaptureExperience';
import { FACE_EMBEDDING_DIMENSION } from '@/lib/face/faceCapture';
import { detectFaceFrame, loadFaceApiModels } from '@/lib/face/faceApiClient';

vi.mock('@/lib/face/faceApiClient', () => ({
  detectFaceFrame: vi.fn(),
  loadFaceApiModels: vi.fn(),
}));

const copy: FaceCaptureCopy = {
  preparing: 'Preparando',
  requestingCamera: 'Pedindo câmera',
  captureLabel: 'Captura {current} de {total}',
  poses: {
    front: 'Olhe de frente',
    first_side: 'Vire de lado',
    opposite_side: 'Vire para o outro lado',
  },
  guidance: {
    ready: 'Fique parado',
    no_face: 'Posicione o rosto',
    multiple_faces: 'Apenas uma pessoa',
    move_closer: 'Aproxime',
    move_away: 'Afaste',
    center_face: 'Centralize',
    look_forward: 'Olhe de frente',
    keep_head_level: 'Cabeça reta',
    turn_to_one_side: 'Vire para um lado',
    turn_to_other_side: 'Vire para o outro lado',
    hold_still: 'Fique parado',
  },
  captured: 'Capturado',
  privacy: 'Nenhuma foto é armazenada.',
  cameraDenied: 'Câmera bloqueada.',
  cameraMissing: 'Câmera ausente.',
  genericError: 'Falha genérica.',
  tryAgain: 'Tentar novamente',
  cancel: 'Voltar',
  closeAria: 'Fechar leitura',
};

const embedding = Array.from(
  { length: FACE_EMBEDDING_DIMENSION },
  () => 1 / Math.sqrt(FACE_EMBEDDING_DIMENSION),
);

const readyFrame = {
  metrics: {
    faceCount: 1,
    detectionScore: 0.96,
    box: { x: 180, y: 75, width: 280, height: 330 },
    frameWidth: 640,
    frameHeight: 480,
    yaw: 0,
    pitch: 0,
    roll: 0,
  },
  embedding,
};

let stopTrack: ReturnType<typeof vi.fn>;

beforeEach(() => {
  stopTrack = vi.fn();
  vi.mocked(loadFaceApiModels).mockResolvedValue({} as never);
  vi.mocked(detectFaceFrame).mockResolvedValue(readyFrame);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: stopTrack }],
      }),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FaceCaptureExperience', () => {
  it('modo de verificacao captura uma vez, para a camera e nunca envia imagem', async () => {
    const onComplete = vi.fn();
    render(
      <FaceCaptureExperience
        accentColor="#00c684"
        copy={copy}
        mode="verification"
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByText('Captura 1 de 1')).toBeInTheDocument();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 3500 });
    const captures = onComplete.mock.calls[0][0];
    expect(captures).toHaveLength(1);
    expect(Object.keys(captures[0]).sort()).toEqual(['embedding', 'quality_score']);
    expect(captures[0].embedding).toHaveLength(128);
    expect(stopTrack).toHaveBeenCalled();
  });

  it('permissao negada mostra fallback e permite voltar sem concluir', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new DOMException('denied', 'NotAllowedError'),
    );
    const onCancel = vi.fn();
    const onComplete = vi.fn();
    render(
      <FaceCaptureExperience
        accentColor="#00c684"
        copy={copy}
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    );

    expect(await screen.findByText('Câmera bloqueada.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('botao fechar interrompe a camera e nao conclui depois do cancelamento', async () => {
    const onCancel = vi.fn();
    const onComplete = vi.fn();
    render(
      <FaceCaptureExperience
        accentColor="#00c684"
        copy={copy}
        mode="verification"
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    );

    await screen.findByText('Captura 1 de 1');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar leitura' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(onComplete).not.toHaveBeenCalled();
  });
});
