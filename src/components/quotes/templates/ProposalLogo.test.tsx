import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProposalLogo } from './ProposalLogo';

afterEach(() => vi.restoreAllMocks());

describe('ProposalLogo', () => {
  it('aplica contraste ao carregar e limpa o resultado ao trocar a marca', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]) }),
    } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
    const { rerender } = render(<ProposalLogo src="/marca-original.png" alt="Empresa demonstração" height={56} />);
    const image = screen.getByRole('img', { name: 'Empresa demonstração' });
    Object.defineProperties(image, { naturalWidth: { value: 400 }, naturalHeight: { value: 100 } });
    fireEvent.load(image);
    expect(image.parentElement).toHaveStyle({ backgroundColor: '#111815' });
    expect(image).toHaveAttribute('src', '/marca-original.png');
    expect(image).toHaveStyle({ height: '56px' });
    rerender(<ProposalLogo src="/outra-marca.png" alt="Empresa demonstração" height={56} />);
    expect(image.parentElement?.style.backgroundColor).toBe('');
  });
});
