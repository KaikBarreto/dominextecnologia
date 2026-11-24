import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SignaturePad } from './SignaturePad';

let resizeObserverCallback: ResizeObserverCallback | null = null;

class ResizeObserverStub {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('SignaturePad', () => {
  let canvasWidth = 320;
  let canvasHeight = 144;
  let context: {
    beginPath: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    stroke: ReturnType<typeof vi.fn>;
    scale: ReturnType<typeof vi.fn>;
    clearRect: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
    lineCap: CanvasLineCap;
    lineJoin: CanvasLineJoin;
    lineWidth: number;
    strokeStyle: string;
  };

  beforeEach(() => {
    canvasWidth = 320;
    canvasHeight = 144;
    resizeObserverCallback = null;
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      width: canvasWidth,
      height: canvasHeight,
      top: 0,
      right: canvasWidth,
      bottom: canvasHeight,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));
    context = {
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
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
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
    fireEvent.pointerDown(canvas!, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas!, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 40, clientY: 30 });
    fireEvent.pointerUp(canvas!, { pointerId: 1, pointerType: 'touch', isPrimary: true });

    expect(onChange).toHaveBeenLastCalledWith('data:image/png;base64,assinatura');
    expect(screen.getByRole('button', { name: 'Concluir' })).toBeInTheDocument();
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('não reinicializa o canvas quando o primeiro movimento do toque atualiza o estado', () => {
    const { container } = render(<SignaturePad onChange={vi.fn()} />);
    const canvas = container.querySelector('canvas')!;

    expect(context.scale).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(canvas, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 30, clientY: 20 });
    fireEvent.pointerMove(canvas, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 60, clientY: 35 });

    expect(context.scale).toHaveBeenCalledTimes(1);
    expect(context.lineTo).toHaveBeenCalledTimes(2);
  });

  it('adia um resize real até o dedo sair do canvas', () => {
    const { container } = render(<SignaturePad onChange={vi.fn()} />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.pointerDown(canvas, { pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10 });
    canvasWidth = 360;
    act(() => {
      resizeObserverCallback?.([], {} as ResizeObserver);
    });

    expect(context.scale).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(canvas, { pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: 70, clientY: 40 });
    fireEvent.pointerUp(canvas, { pointerId: 9, pointerType: 'touch', isPrimary: true });

    expect(context.scale).toHaveBeenCalledTimes(2);
  });

  it('encerra pelo pointerleave quando o navegador não oferece pointer capture', () => {
    const onChange = vi.fn();
    const { container } = render(<SignaturePad onChange={onChange} />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.pointerDown(canvas, { pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: 30, clientY: 20 });
    fireEvent.pointerLeave(canvas, { pointerId: 11, pointerType: 'touch', isPrimary: true });

    // O ponteiro anterior foi liberado; um novo traço não fica bloqueado.
    fireEvent.pointerDown(canvas, { pointerId: 12, pointerType: 'touch', isPrimary: true, clientX: 40, clientY: 30 });
    fireEvent.pointerMove(canvas, { pointerId: 12, pointerType: 'touch', isPrimary: true, clientX: 70, clientY: 50 });
    fireEvent.pointerUp(canvas, { pointerId: 12, pointerType: 'touch', isPrimary: true });

    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
