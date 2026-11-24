import { CatalogNavigationProvider } from './CatalogNavigationProvider';
import { AppRouteTransition } from '@/components/layout/AppRouteTransition';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCatalogListState, useCatalogNavigation, useCatalogPagination, useCatalogScrollRestore, useCatalogSearchParams } from './CatalogNavigationContext';

const identity = vi.hoisted(() => ({ user: { id: 'user-a' }, profile: { user_id: 'user-a', company_id: 'company-a' }, loading: false, profileLoading: false }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => identity }));
const ROOT = '/area-tecnico/catalogo/ar_condicionado';
const LIST = `${ROOT}/marca/daikin`;
const DETAIL = `${LIST}/modelo/split`;
const items = Array.from({ length: 30 }, (_, index) => `model-${index + 1}`);
let visitState: unknown;

function Shell({ children }: { children: React.ReactNode }) {
  return <main data-testid="scroller"><AppRouteTransition ownerKey="authenticated-test-session">{children}</AppRouteTransition></main>;
}

function List() {
  const [params, setParams] = useCatalogSearchParams();
  const [filters, setFilters] = useCatalogListState<string[]>('filters', []);
  const [selected, setSelected] = useCatalogListState<string | null>('selected', null);
  const pagination = useCatalogPagination(items, 'models');
  const { open, back } = useCatalogNavigation();
  useCatalogScrollRestore(true);
  return <div>
    <span>filters:{filters.join(',')}</span><span>selected:{selected ?? '-'}</span><span>page:{pagination.page}</span><span>query:{params.get('busca')}</span>
    <button onClick={() => setFilters(['R-32'])}>Filter</button>
    <button onClick={() => { pagination.setPage(2); setSelected('model-15'); }}>Page and preview</button>
    <button onClick={() => setParams(current => { const next = new URLSearchParams(current); next.set('busca', 'split'); return next; }, { replace: true })}>Search</button>
    <button onClick={() => open(DETAIL)}>Open</button>
    <button onClick={() => back(ROOT)}>Back to brands</button>
  </div>;
}

function Detail() {
  const location = useLocation();
  visitState = location.state;
  const { back } = useCatalogNavigation();
  return <button onClick={() => back(ROOT)}>Back</button>;
}

function GoParent() {
  const { open } = useCatalogNavigation();
  const location = useLocation();
  return <><span>root query:{location.search}</span><button onClick={() => open(LIST)}>Choose brand</button></>;
}

function Harness({ entries = [LIST], index }: { entries?: React.ComponentProps<typeof MemoryRouter>['initialEntries']; index?: number }) {
  return <MemoryRouter initialEntries={entries} initialIndex={index}><Shell><CatalogNavigationProvider><Routes>
    <Route path={LIST} element={<List />} />
    <Route path={DETAIL} element={<Detail />} />
    <Route path={ROOT} element={<GoParent />} />
    <Route path="*" element={<span>Outside catalog</span>} />
  </Routes></CatalogNavigationProvider></Shell></MemoryRouter>;
}

describe('catalog list return context', () => {
  beforeEach(() => {
    identity.user = { id: 'user-a' };
    identity.profile = { user_id: 'user-a', company_id: 'company-a' };
    identity.loading = false;
    identity.profileLoading = false;
    visitState = undefined;
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('keeps filters, page, preview, URL search/category/family and scroll after detail back', async () => {
    render(<Harness entries={[`${LIST}?categoria=split&familia=hi-wall`]} />);
    fireEvent.click(screen.getByText('Filter'));
    fireEvent.click(screen.getByText('Page and preview'));
    fireEvent.click(screen.getByText('Search'));
    screen.getByTestId('scroller').scrollTop = 640;
    fireEvent.click(screen.getByText('Open'));
    expect((visitState as { catalogReturn: { to: string } }).catalogReturn.to).toContain('categoria=split&familia=hi-wall&busca=split');
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('filters:R-32')).toBeInTheDocument();
    expect(screen.getByText('page:2')).toBeInTheDocument();
    expect(screen.getByText('selected:model-15')).toBeInTheDocument();
    expect(screen.getByText('query:split')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('scroller').scrollTop).toBe(640));
  });

  it('reconstructs the scoped return snapshot after a reload on the detail route', async () => {
    const app = render(<Harness />);
    fireEvent.click(screen.getByText('Filter'));
    fireEvent.click(screen.getByText('Page and preview'));
    screen.getByTestId('scroller').scrollTop = 480;
    fireEvent.click(screen.getByText('Open'));
    const saved = structuredClone(visitState);
    app.unmount();
    render(<Harness entries={[LIST, { pathname: DETAIL, state: saved }]} index={1} />);
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('filters:R-32')).toBeInTheDocument();
    expect(screen.getByText('page:2')).toBeInTheDocument();
    expect(screen.getByText('selected:model-15')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('scroller').scrollTop).toBe(480));
  });

  it('query replacement keeps the original brand return path', () => {
    render(<Harness entries={[`${ROOT}?busca=original`]} />);
    fireEvent.click(screen.getByText('Choose brand'));
    fireEvent.click(screen.getByText('Search'));
    fireEvent.click(screen.getByText('Open'));
    expect((visitState as { catalogReturn: { to: string } }).catalogReturn.to).toBe(`${LIST}?busca=split`);
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Back to brands'));
    expect(screen.getByText('root query:?busca=original')).toBeInTheDocument();
  });

  it('direct links without an app origin use the safe catalog parent', () => {
    render(<Harness entries={['/external', DETAIL]} index={1} />);
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Choose brand')).toBeInTheDocument();
    expect(screen.queryByText('Outside catalog')).not.toBeInTheDocument();
  });

  it('drops all cached searches and filters on company/user changes', () => {
    const app = render(<Harness />);
    fireEvent.click(screen.getByText('Filter'));
    fireEvent.click(screen.getByText('Page and preview'));
    identity.profile = { user_id: 'user-a', company_id: 'company-b' };
    app.rerender(<Harness />);
    expect(screen.getByText('filters:')).toBeInTheDocument();
    expect(screen.getByText('page:1')).toBeInTheDocument();
    expect(screen.getByText('selected:-')).toBeInTheDocument();
    identity.user = { id: 'user-b' };
    app.rerender(<Harness />);
    expect(screen.getByText('filters:')).toBeInTheDocument();
  });

  it('does not hydrate another company’s history state, or malformed state', () => {
    const state = { catalogReturn: { owner: 'user-a:company-b', to: LIST, originKey: 'previous', values: [[`${LIST}#filters`, ['R-32']]], scroll: { window: 0, containers: [400] } } };
    const app = render(<Harness entries={[LIST, { pathname: DETAIL, state }]} index={1} />);
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Choose brand')).toBeInTheDocument();
    app.unmount();
    render(<Harness entries={[{ pathname: DETAIL, state: { catalogReturn: { ...state.catalogReturn, owner: 'user-a:company-a', values: [null] } } }]} />);
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Choose brand')).toBeInTheDocument();
  });
});
