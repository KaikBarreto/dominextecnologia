import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CenteredSelfieCapture, type CenteredSelfieCopy } from './CenteredSelfieCapture';

vi.mock('@/lib/face/faceApiClient', () => ({
  detectFaceFrame: vi.fn(() => new Promise(() => undefined)),
  loadFaceApiModels: vi.fn().mockResolvedValue({}),
}));

const copy: CenteredSelfieCopy = {
  title: 'Centralize o rosto no círculo', preparing: 'Preparando',
  guidance: {
    ready: 'Fique parado', no_face: 'Posicione o rosto', multiple_faces: 'Uma pessoa',
    move_closer: 'Aproxime', move_away: 'Afaste', center_face: 'Centralize o rosto',
    look_forward: 'Olhe de frente', keep_head_level: 'Cabeça reta',
    turn_to_one_side: 'Vire', turn_to_other_side: 'Outro lado', hold_still: 'Fique parado',
  },
  captureNow: 'Tirar foto agora', useDeviceCamera: 'Abrir câmera',
  cameraDenied: 'Câmera bloqueada', cameraMissing: 'Câmera ausente',
  genericError: 'Falha na câmera', privacy: 'Selfie protegida', cancel: 'Cancelar',
  closeAria: 'Fechar',
};

let stopTrack: ReturnType<typeof vi.fn>;

beforeEach(() => {
  stopTrack = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(480);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) },
  });
  const canvasContext = {
    translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((
    (contextId: string) => contextId === '2d' ? canvasContext : null
  ) as typeof HTMLCanvasElement.prototype.getContext);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob(['selfie'], { type: 'image/jpeg' }));
  });
});

afterEach(() => vi.restoreAllMocks());

describe('CenteredSelfieCapture', () => {
  it('permite captura manual centralizada sem depender do detector facial', async () => {
    const onCapture = vi.fn();
    render(<CenteredSelfieCapture accentColor="#00c684" copy={copy} onCapture={onCapture} onCancel={vi.fn()} />);

    const button = await screen.findByRole('button', { name: 'Tirar foto agora' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    expect(onCapture.mock.calls[0][0]).toBeInstanceOf(File);
    expect(onCapture.mock.calls[0][0].type).toBe('image/jpeg');
    expect(stopTrack).toHaveBeenCalled();
  });

  it('camera bloqueada oferece a camera nativa como contingencia', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new DOMException('denied', 'NotAllowedError'),
    );
    render(<CenteredSelfieCapture accentColor="#00c684" copy={copy} onCapture={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText('Câmera bloqueada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir câmera' })).toBeInTheDocument();
  });
});
