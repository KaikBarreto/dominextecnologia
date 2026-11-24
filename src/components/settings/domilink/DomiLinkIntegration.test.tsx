import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomiLinkIntegrationContent } from './DomiLinkIntegrationContent';
import { DomiLinkDeviceShortcut } from './DomiLinkDeviceShortcut';
import { SettingsDomiLinkRoute } from './SettingsDomiLinkRoute';
import { DOMILINK_SETTINGS_QUERY } from './useDomiLinkAccess';

const mocks = vi.hoisted(() => ({
  screens: [] as string[], modules: [] as string[], loading: false, profileLoading: false,
  modulesLoading: false, status: 'disabled', connection: vi.fn(), card: vi.fn(),
  locale: 'pt-br' as 'pt-br' | 'en',
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  loading: mocks.loading, profileLoading: mocks.profileLoading,
  hasScreenAccess: (key: string) => mocks.screens.includes(key),
}) }));
vi.mock('@/hooks/useCompanyModules', () => ({ useCompanyModules: () => ({
  isLoading: mocks.modulesLoading, hasScreen: (key: string) => mocks.modules.includes(key),
}) }));
vi.mock('@/hooks/useDomiLink', () => ({ useDomiLink: () => {
  mocks.connection(); return { status: mocks.status };
} }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: mocks.locale }) }));
vi.mock('@/components/pdv/domilink/DomiLinkSettingsCard', () => ({ DomiLinkSettingsCard: () => {
  mocks.card(); return <div>Formulário canônico do DomiLink</div>;
} }));
vi.mock('@/components/layout/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/mobile/MobilePillTabs', () => ({ MobilePillTabs: ({ tabs }: { tabs: Array<{ value: string; label: string }> }) => <nav>{tabs.map(tab => <span key={tab.value}>{tab.label}</span>)}</nav> }));

beforeEach(() => {
  mocks.screens = ['screen:inventory']; mocks.modules = ['screen:inventory'];
  mocks.loading = false; mocks.profileLoading = false; mocks.modulesLoading = false;
  mocks.status = 'disabled'; mocks.connection.mockClear(); mocks.card.mockClear();
  mocks.locale = 'pt-br';
});

describe('acesso à integração DomiLink', () => {
  it('abre para Estoque com módulo base, mesmo sem contratar PDV', () => {
    render(<DomiLinkIntegrationContent />);
    expect(screen.getByText('Formulário canônico do DomiLink')).toBeVisible();
  });

  it('preserva acesso de quem possui somente Configurações do PDV e seu módulo', () => {
    mocks.screens = ['screen:pdv_settings']; mocks.modules = ['screen:pdv_settings'];
    render(<DomiLinkIntegrationContent />);
    expect(screen.getByText('Formulário canônico do DomiLink')).toBeVisible();
  });

  it.each([
    ['sem permissão', [], ['screen:inventory', 'screen:pdv_settings']],
    ['sem módulo', ['screen:inventory', 'screen:pdv_settings'], []],
    ['permissão e módulo de telas diferentes', ['screen:pdv_settings'], ['screen:inventory']],
  ])('bloqueia %s sem montar formulário nem acessar equipamento', (_label, screens, modules) => {
    mocks.screens = screens; mocks.modules = modules;
    render(<><DomiLinkIntegrationContent /><DomiLinkDeviceShortcut /></>);
    expect(screen.queryByText('Formulário canônico do DomiLink')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(mocks.card).not.toHaveBeenCalled(); expect(mocks.connection).not.toHaveBeenCalled();
  });

  it.each(['loading', 'profileLoading', 'modulesLoading'] as const)('falha fechado durante %s', field => {
    mocks[field] = true;
    render(<DomiLinkIntegrationContent />);
    expect(screen.getByRole('status', { name: 'Carregando acesso ao DomiLink' })).toBeVisible();
    expect(mocks.card).not.toHaveBeenCalled();
  });
});

describe('atalho no PDV', () => {
  it('preserva o idioma da rota ao abrir a configuração', () => {
    mocks.locale = 'en';
    render(<MemoryRouter><DomiLinkDeviceShortcut /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Configurar DomiLink' })).toHaveAttribute('href', `/settings${DOMILINK_SETTINGS_QUERY}`);
  });

  it.each([
    ['disabled', 'Desligado'], ['checking', 'Procurando DomiLink…'],
    ['offline', 'Não conectado'], ['pairing', 'Pareamento necessário'],
    ['connected', 'Conectado'], ['error', 'Conexão indisponível'],
  ])('mostra estado %s sem duplicar formulário', (status, label) => {
    mocks.status = status;
    render(<MemoryRouter><DomiLinkDeviceShortcut /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent(label);
    expect(screen.getByRole('link', { name: 'Configurar DomiLink' })).toHaveAttribute('href', `/configuracoes${DOMILINK_SETTINGS_QUERY}`);
    expect(mocks.card).not.toHaveBeenCalled();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('leva o operador ao mesmo formulário canônico sem montar configurações gerais', () => {
    function Flow() {
      const location = useLocation();
      return location.pathname === '/pdv/configuracoes'
        ? <DomiLinkDeviceShortcut />
        : <SettingsDomiLinkRoute><div>Configurações gerais protegidas</div></SettingsDomiLinkRoute>;
    }
    render(<MemoryRouter initialEntries={['/pdv/configuracoes']}><Flow /></MemoryRouter>);
    fireEvent.click(screen.getByRole('link', { name: 'Configurar DomiLink' }));
    expect(screen.getByText('Formulário canônico do DomiLink')).toBeVisible();
    expect(screen.queryByText('Configurações gerais protegidas')).not.toBeInTheDocument();
  });
});

describe('exceção restrita da rota Configurações', () => {
  function RouteProbe() {
    const navigate = useNavigate();
    return <><button onClick={() => navigate('/configuracoes?tab=empresa')}>Ir para empresa</button><SettingsDomiLinkRoute><div>Gate original de Configurações</div></SettingsDomiLinkRoute></>;
  }

  it('não concede acesso a outras abas ao alterar a URL', () => {
    render(<MemoryRouter initialEntries={[`/configuracoes${DOMILINK_SETTINGS_QUERY}`]}><RouteProbe /></MemoryRouter>);
    expect(screen.getByText('Formulário canônico do DomiLink')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ir para empresa' }));
    expect(screen.queryByText('Formulário canônico do DomiLink')).not.toBeInTheDocument();
    expect(screen.getByText('Gate original de Configurações')).toBeVisible();
  });

  it('preserva a tela completa para quem possui screen:settings', () => {
    mocks.screens.push('screen:settings');
    render(<MemoryRouter initialEntries={[`/configuracoes${DOMILINK_SETTINGS_QUERY}`]}><RouteProbe /></MemoryRouter>);
    expect(screen.getByText('Gate original de Configurações')).toBeVisible();
    expect(mocks.card).not.toHaveBeenCalled();
  });

  it('não permite que a query sozinha conceda acesso ao equipamento', () => {
    mocks.screens = [];
    render(<MemoryRouter initialEntries={[`/configuracoes${DOMILINK_SETTINGS_QUERY}`]}><RouteProbe /></MemoryRouter>);
    expect(screen.getByText(/solicite acesso ao Estoque/)).toBeVisible();
    expect(mocks.card).not.toHaveBeenCalled();
  });
});
