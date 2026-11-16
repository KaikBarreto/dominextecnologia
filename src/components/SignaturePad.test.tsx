import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SignaturePad } from './SignaturePad';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('SignaturePad', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 320,
      height: 144,
      top: 0,
      right: 320,
      bottom: 144,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      scale: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      lineCap: 'round',
      lineJoin: 'round',
      lineWidth: 2.5,
      strokeStyle: '#000000',
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,assinatura');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('persiste o traço assim que ele termina e mantém a edição aberta', () => {
    const onChange = vi.fn();
    const { container } = render(<SignaturePad onChange={onChange} />);
    const canvas = container.querySelector('canvas');

    expect(canvas).not.toBeNull();
    fireEvent.mouseDown(canvas!, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas!, { clientX: 40, clientY: 30 });
    fireEvent.mouseUp(canvas!);

    expect(onChange).toHaveBeenLastCalledWith('data:image/png;base64,assinatura');
    expect(screen.getByRole('button', { name: 'Concluir' })).toBeInTheDocument();
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});
