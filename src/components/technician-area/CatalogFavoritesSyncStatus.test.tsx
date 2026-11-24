import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { useCatalogActivity } from '@/hooks/useCatalogActivity';
import { CatalogFavoritesSyncStatus } from './CatalogFavoritesSyncStatus';

vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
const activity = (overrides: Record<string, unknown> = {}) => ({
  isReady: true, favoritesSyncStatus: 'synced', favoritesSyncError: null,
  favoritesLocalBackup: null, localFavoritesToImport: [],
  favoritesOffline: false, favoritesPendingCount: 0,
  retryFavoritesSync: vi.fn(), importLocalFavorites: vi.fn(), ...overrides,
} as unknown as ReturnType<typeof useCatalogActivity>);

describe('acompanhamento dos favoritos da conta', () => {
  it('só anuncia salvo na conta no estado confirmado', () => {
    const { rerender } = render(<CatalogFavoritesSyncStatus activity={activity({ favoritesSyncStatus: 'saving' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Sincronizando favoritos');
    expect(screen.queryByText(/Favoritos salvos na sua conta/)).not.toBeInTheDocument();
    rerender(<CatalogFavoritesSyncStatus activity={activity()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Favoritos salvos na sua conta.');
  });

  it('distingue backup do navegador de pendência só na sessão e permite tentar de novo', () => {
    const pending = activity({ favoritesSyncStatus: 'error', favoritesLocalBackup: 'saved' });
    const { rerender } = render(<CatalogFavoritesSyncStatus activity={pending} />);
    expect(screen.getByRole('status')).toHaveTextContent('Alterações guardadas neste navegador.');
    expect(screen.queryByText(/Favoritos salvos na sua conta/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(pending.retryFavoritesSync).toHaveBeenCalledTimes(1);
    rerender(<CatalogFavoritesSyncStatus activity={activity({ favoritesSyncStatus: 'error', favoritesLocalBackup: 'memory' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Alterações pendentes nesta sessão.');
    expect(screen.queryByText(/guardadas neste navegador/)).not.toBeInTheDocument();
  });

  it('leva os favoritos locais à conta somente por ação explícita', () => {
    const local = activity({ localFavoritesToImport: ['one', 'two'] });
    render(<CatalogFavoritesSyncStatus activity={local} />);
    expect(screen.queryByText(/Favoritos salvos na sua conta/)).not.toBeInTheDocument();
    expect(local.importLocalFavorites).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Levar favoritos à conta (2)' }));
    expect(local.importLocalFavorites).toHaveBeenCalledTimes(1);
  });

  it('não anuncia conta nem oferece importar durante troca de identidade', () => {
    const { container } = render(<CatalogFavoritesSyncStatus activity={activity({ isReady: false, localFavoritesToImport: ['private'] })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('avisa da pendência offline e de backup só na sessão sem anunciar salvo', () => {
    render(<CatalogFavoritesSyncStatus activity={activity({ favoritesSyncStatus: 'local', favoritesOffline: true, favoritesPendingCount: 1, favoritesLocalBackup: 'memory' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Sem conexão.');
    expect(screen.getByRole('status')).toHaveTextContent('Alterações pendentes nesta sessão.');
    expect(screen.queryByText(/Favoritos salvos na sua conta/)).not.toBeInTheDocument();
  });
});
