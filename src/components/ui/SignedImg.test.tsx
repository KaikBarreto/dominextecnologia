import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignedImg } from './SignedImg';

const imageState = vi.hoisted(() => ({ resolved: 'https://example.invalid/raw-photo.png' as string | null }));
vi.mock('@/hooks/useSignedUrl', () => ({ useSignedUrl: () => imageState.resolved }));

describe('SignedImg com troca para URL protegida', () => {
  beforeEach(() => { imageState.resolved = 'https://example.invalid/raw-photo.png'; });

  it('não substitui a foto válida por um erro atrasado da tentativa anterior', () => {
    const { rerender } = render(<SignedImg src="https://example.invalid/raw-photo.png" alt="Produto" />);
    const previousAttempt = screen.getByRole('img', { name: 'Produto' });
    imageState.resolved = 'https://example.invalid/protected-photo.png';
    rerender(<SignedImg src="https://example.invalid/raw-photo.png" alt="Produto" />);
    fireEvent.error(previousAttempt);
    expect(screen.getByRole('img', { name: 'Produto' })).toHaveAttribute('src', imageState.resolved);
    expect(screen.queryByText('Imagem indisponível')).not.toBeInTheDocument();
  });

  it('mantém o aviso quando a tentativa atual realmente falha', () => {
    render(<SignedImg src="https://example.invalid/raw-photo.png" alt="Produto" />);
    fireEvent.error(screen.getByRole('img', { name: 'Produto' }));
    expect(screen.getByText('Imagem indisponível')).toBeVisible();
  });
});
