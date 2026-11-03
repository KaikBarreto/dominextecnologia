import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvProductImagePreview } from '@/components/pdv/PdvProductImagePreview';

vi.mock('@/components/ui/SignedImg', () => ({
  SignedImg: ({ src, fallbackLabel, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { src?: string | null; fallbackLabel: string }) =>
    src ? <img src={src} alt="" {...props} /> : <span>{fallbackLabel}</span>,
}));

describe('PdvProductImagePreview', () => {
  it('abre e fecha a foto em tela cheia por um botão nomeado', () => {
    render(
      <PdvProductImagePreview
        imageUrl="blob:produto"
        name="Compressor 1/3 HP"
        fallbackLabel="Sem foto"
        openLabel="Ver foto de {name} em tela cheia"
        viewerDescription="Visualização em tela cheia."
        className="h-10 w-10"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ver foto de Compressor 1/3 HP em tela cheia' }));
    expect(screen.getByRole('dialog', { name: 'Ver foto de Compressor 1/3 HP em tela cheia' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sem foto exibe apenas o placeholder, sem ação vazia', () => {
    render(
      <PdvProductImagePreview
        imageUrl={null}
        name="Item sem foto"
        fallbackLabel="Sem foto"
        openLabel="Ver foto de {name} em tela cheia"
        viewerDescription="Visualização em tela cheia."
      />,
    );

    expect(screen.getByText('Sem foto')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('mostra skeleton até a miniatura terminar de carregar', () => {
    const { container } = render(
      <PdvProductImagePreview
        imageUrl="https://cdn.exemplo/produto.png"
        name="Produto"
        fallbackLabel="Sem foto"
        openLabel="Ver foto de {name} em tela cheia"
        viewerDescription="Visualização em tela cheia."
      />,
    );

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    fireEvent.load(container.querySelector('img')!);
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });
});
