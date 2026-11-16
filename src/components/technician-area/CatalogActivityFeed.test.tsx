import { act, cleanup, fireEvent, render as renderUi, screen, within } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EquipmentModel } from '@/hooks/useEquipmentCatalog';
import { catalogActivityKey, getCatalogActivitySnapshot, recordCatalogView, toggleCatalogFavorite } from '@/lib/catalogActivity';
import { CatalogActivityFeed } from './CatalogActivityFeed';

const { auth } = vi.hoisted(() => ({ auth: { user: { id: 'user-one' }, profile: { user_id: 'user-one', company_id: 'company-one' }, loading: false, profileLoading: false } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => {
    const builder = { select: () => builder, eq: () => builder, order: () => builder,
      range: () => builder, abortSignal: async () => ({ data: [], error: null }) };
    return builder;
  },
  rpc: async (_name: string, args: { p_model_id: string; p_is_favorite: boolean; p_expected_revision: number; p_operation_id: string }) => ({
    data: [{ applied: true, model_id: args.p_model_id, is_favorite: args.p_is_favorite,
      revision: args.p_expected_revision + 1, last_operation_id: args.p_operation_id, updated_at: new Date().toISOString() }], error: null,
  }),
} }));
let queryClient: QueryClient;
let scopeNumber = 0;
const render = (ui: ReactElement) => renderUi(ui, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> });

const models = Array.from({ length: 13 }, (_, index) => ({ id: `model-${index}`, brand_id: 'brand', code: `MODEL${index}`, name: `Equipamento MODEL${index}`, domain: 'ar_condicionado', category_id: null, image_url: 'https://example.org/model.jpg', manual_url: null, refrigerant: null, potencia_w: null, consumo_kwh_mes: null, created_at: '', brand: { id: 'brand', name: 'Fabricante', logo_url: null } }) as EquipmentModel);
const key = () => catalogActivityKey(auth.user.id, auth.profile.company_id)!;

beforeEach(() => {
  localStorage.clear();
  auth.user.id = `user-${++scopeNumber}`; auth.profile.user_id = auth.user.id; auth.profile.company_id = 'company-one';
  auth.loading = false; auth.profileLoading = false;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); queryClient.clear(); });

describe('atalhos pessoais do catálogo', () => {
  it('orienta a primeira consulta sem inventar recentes ou popularidade', () => {
    render(<CatalogActivityFeed models={models} onOpen={vi.fn()} />);
    expect(screen.getByText(/Abra um equipamento ou toque na estrela/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Abrir equipamento/ })).not.toBeInTheDocument();
    expect(getCatalogActivitySnapshot(key()).recentIds).toEqual([]);
  });

  it('oferece os básicos antes dos avançados sem fabricar histórico pessoal', () => {
    const basic = { ...models[0], category: { id: 'hiwall', name: 'Split Hi-Wall' } };
    const advanced = { ...models[1], category: { id: 'chiller', name: 'Chiller industrial' } };
    render(<CatalogActivityFeed models={[advanced, basic]} onOpen={vi.fn()} />);
    const everyday = within(screen.getByRole('region', { name: 'Para o dia a dia' }));
    expect(everyday.getByRole('button', { name: 'Abrir equipamento: Fabricante MODEL0' })).toBeInTheDocument();
    expect(everyday.queryByRole('button', { name: 'Abrir equipamento: Fabricante MODEL1' })).not.toBeInTheDocument();
    expect(getCatalogActivitySnapshot(key()).recentIds).toEqual([]);
  });

  it('prioriza os atalhos de quem já consulta, mantendo os básicos logo depois', () => {
    recordCatalogView(key(), models[0].id);
    const basic = { ...models[0], category: { id: 'hiwall', name: 'Split Hi-Wall' } };
    render(<CatalogActivityFeed models={[basic]} onOpen={vi.fn()} />);
    const recent = screen.getByRole('region', { name: 'Vistos recentemente' });
    const everyday = screen.getByRole('region', { name: 'Para o dia a dia' });
    expect(recent.compareDocumentPosition(everyday) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('preserva a ordem recente, mostra lista curta e abre o modelo canônico', () => {
    models.slice(0, 7).forEach(model => recordCatalogView(key(), model.id));
    const onOpen = vi.fn();
    render(<CatalogActivityFeed models={models} onOpen={onOpen} />);
    const recent = within(screen.getByRole('region', { name: 'Vistos recentemente' }));
    const shortcuts = recent.getAllByRole('button', { name: /Abrir equipamento/ });
    expect(shortcuts).toHaveLength(3);
    expect(shortcuts[0]).toHaveAccessibleName('Abrir equipamento: Fabricante MODEL6');
    fireEvent.click(shortcuts[0]);
    expect(onOpen).toHaveBeenCalledWith(models[6]);
    expect(getCatalogActivitySnapshot(key()).recentIds).toHaveLength(7);
    fireEvent.click(recent.getByRole('button', { name: 'Ver todos (7)' }));
    expect(recent.getAllByRole('button', { name: /Abrir equipamento/ })).toHaveLength(7);
    fireEvent.click(recent.getByRole('button', { name: 'Ver menos' }));
    expect(recent.getAllByRole('button', { name: /Abrir equipamento/ })).toHaveLength(3);
  });

  it('favorita sem navegar e alterna Recentes/Favoritos em uma única área', () => {
    recordCatalogView(key(), models[0].id);
    const onOpen = vi.fn();
    render(<CatalogActivityFeed models={models} onOpen={onOpen} />);
    const recent = within(screen.getByRole('region', { name: 'Vistos recentemente' }));
    expect(screen.queryByRole('region', { name: 'Favoritos' })).not.toBeInTheDocument();
    fireEvent.click(recent.getByRole('button', { name: 'Adicionar aos favoritos: MODEL0' }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(recent.getByRole('button', { name: 'Remover dos favoritos: MODEL0' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /^Favoritos/ }));
    const favorites = within(screen.getByRole('region', { name: 'Favoritos' }));
    expect(screen.queryByRole('region', { name: 'Vistos recentemente' })).not.toBeInTheDocument();
    expect(favorites.getByRole('button', { name: 'Abrir equipamento: Fabricante MODEL0' })).toBeInTheDocument();
    fireEvent.click(favorites.getByRole('button', { name: 'Remover dos favoritos: MODEL0' }));
    expect(favorites.getByText(/Toque na estrela de um equipamento/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /^Recentes/ }));
    expect(screen.getByRole('region', { name: 'Vistos recentemente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar aos favoritos: MODEL0' })).toBeInTheDocument();
  });

  it('pagina listas completas sem esconder os favoritos restantes', () => {
    models.forEach(model => toggleCatalogFavorite(key(), model.id));
    render(<CatalogActivityFeed models={models} onOpen={vi.fn()} />);
    const favorites = within(screen.getByRole('region', { name: 'Favoritos' }));
    fireEvent.click(favorites.getByRole('button', { name: 'Ver todos (13)' }));
    expect(favorites.getAllByRole('button', { name: /Abrir equipamento/ })).toHaveLength(10);
    // jsdom não implementa a rolagem visual.
    Element.prototype.scrollIntoView = vi.fn();
    fireEvent.click(favorites.getByRole('button', { name: 'Próxima' }));
    expect(favorites.getAllByRole('button', { name: /Abrir equipamento/ })).toHaveLength(3);
  });

  it('não mostra favoritos de outra empresa e não apaga IDs não resolvidos', () => {
    toggleCatalogFavorite(key(), 'not-in-current-domain');
    recordCatalogView(key(), models[0].id);
    const { rerender } = render(<CatalogActivityFeed models={models} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Abrir equipamento/ })).toBeInTheDocument();
    expect(getCatalogActivitySnapshot(key()).favoriteIds).toContain('not-in-current-domain');
    act(() => { auth.profile.company_id = 'another-company'; });
    rerender(<CatalogActivityFeed models={models} onOpen={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Abrir equipamento/ })).not.toBeInTheDocument();
  });

  it('aguarda o contexto autenticado antes de anunciar atalhos vazios', () => {
    auth.profileLoading = true;
    const { container } = render(<CatalogActivityFeed models={models} onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
