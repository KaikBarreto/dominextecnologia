import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryIdentifierCameraScanner } from './InventoryIdentifierCameraScanner';

describe('InventoryIdentifierCameraScanner', () => {
  const originalDetector = Object.getOwnPropertyDescriptor(window, 'BarcodeDetector');
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  const originalPlay = HTMLMediaElement.prototype.play;
  const trackStop = vi.fn();
  const detect = vi.fn(() => new Promise<never>(() => undefined));

  beforeEach(() => {
    trackStop.mockClear();
    detect.mockClear();
    Object.defineProperty(window, 'BarcodeDetector', {
      configurable: true,
      value: class { detect = detect; },
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }),
      },
    });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalDetector) Object.defineProperty(window, 'BarcodeDetector', originalDetector);
    else delete (window as Window & { BarcodeDetector?: unknown }).BarcodeDetector;
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    else delete (navigator as unknown as { mediaDevices?: MediaDevices }).mediaDevices;
    HTMLMediaElement.prototype.play = originalPlay;
  });

  it('fecha a câmera quando a tela fica bloqueada e não mantém leitura ao fundo', async () => {
    const onScan = vi.fn();
    const { rerender } = render(<InventoryIdentifierCameraScanner onScan={onScan} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ler com a câmera' }));
    await screen.findByRole('button', { name: 'Fechar câmera' });
    rerender(<InventoryIdentifierCameraScanner onScan={onScan} disabled />);

    await waitFor(() => expect(trackStop).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Fechar câmera' })).not.toBeInTheDocument();
    expect(onScan).not.toHaveBeenCalled();
  });
});
