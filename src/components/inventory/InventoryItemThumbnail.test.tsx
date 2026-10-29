import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryItemThumbnail } from './InventoryItemThumbnail';

const resolveStorageUrl = vi.fn();

vi.mock('@/hooks/useSignedUrl', () => ({
  resolveStorageUrl: (url: string | null | undefined) => resolveStorageUrl(url),
}));

describe('InventoryItemThumbnail', () => {
  beforeEach(() => {
    resolveStorageUrl.mockReset();
  });

  it('mostra a URL assinada da foto armazenada no bucket privado', async () => {
    const storedUrl = 'https://example.supabase.co/storage/v1/object/public/inventory-photos/company/material.png';
    const signedUrl = 'https://example.supabase.co/storage/v1/object/sign/inventory-photos/company/material.png?token=assinatura';
    resolveStorageUrl.mockResolvedValue(signedUrl);

    render(
      <InventoryItemThumbnail
        name="Tubulação de cobre"
        imageUrl={storedUrl}
      />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Foto de Tubulação de cobre' }))
      .toHaveAttribute('src', signedUrl);
    expect(resolveStorageUrl).toHaveBeenCalledWith(storedUrl);
  });

  it('usa o ícone de fallback quando o arquivo resolvido falha ao carregar', async () => {
    resolveStorageUrl.mockResolvedValue('https://example.supabase.co/storage/v1/object/sign/inventory-photos/material.png?token=assinatura');

    const { container } = render(
      <InventoryItemThumbnail
        name="Tubulação de cobre"
        imageUrl="https://example.supabase.co/storage/v1/object/public/inventory-photos/material.png"
      />,
    );

    fireEvent.error(await screen.findByRole('img', { name: 'Foto de Tubulação de cobre' }));

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('usa o ícone de fallback quando não consegue resolver a URL privada', async () => {
    resolveStorageUrl.mockResolvedValue(null);

    const { container } = render(
      <InventoryItemThumbnail
        name="Tubulação de cobre"
        imageUrl="https://example.supabase.co/storage/v1/object/public/inventory-photos/material.png"
      />,
    );

    await waitFor(() => expect(resolveStorageUrl).toHaveBeenCalledOnce());
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('permite fallback simples sem fundo colorido', () => {
    const { container } = render(
      <InventoryItemThumbnail
        name="Tubulação de cobre"
        accentColor="#16a34a"
        fallbackVariant="plain"
      />,
    );

    expect(container.firstChild).toHaveClass('border-transparent', 'bg-transparent');
    expect(container.querySelector('svg')).toHaveClass('text-foreground');
  });
});
