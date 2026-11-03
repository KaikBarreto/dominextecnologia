import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileText, Settings } from 'lucide-react';
import { SettingsSidebarLayout } from './SettingsSidebarLayout';

const useIsMobileMock = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: useIsMobileMock }));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
});

beforeEach(() => {
  useIsMobileMock.mockReturnValue(false);
});

const tabs = [
  { value: 'orcamentos', label: 'Orçamentos', icon: FileText },
  { value: 'precificacao', label: 'Precificação', icon: Settings },
];

describe('SettingsSidebarLayout', () => {
  it('usa underline horizontal como padrão e troca a aba com semântica acessível', () => {
    const onTabChange = vi.fn();

    render(
      <SettingsSidebarLayout
        tabs={tabs}
        activeTab="orcamentos"
        onTabChange={onTabChange}
      >
        <p>Conteúdo da aba</p>
      </SettingsSidebarLayout>,
    );

    const tablist = screen.getByRole('tablist');
    const activeTab = screen.getByRole('tab', { name: 'Orçamentos' });
    const nextTab = screen.getByRole('tab', { name: 'Precificação' });

    expect(tablist).toHaveClass('overflow-x-auto', 'border-b');
    expect(activeTab).toHaveAttribute('aria-selected', 'true');
    expect(activeTab).toHaveClass('font-bold');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();

    fireEvent.click(nextTab);
    expect(onTabChange).toHaveBeenCalledWith('precificacao');
  });

  it('preserva a sidebar somente quando pedida explicitamente', () => {
    render(
      <SettingsSidebarLayout
        variant="sidebar"
        tabs={tabs}
        activeTab="orcamentos"
        onTabChange={() => undefined}
      >
        <p>Conteúdo da aba</p>
      </SettingsSidebarLayout>,
    );

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('alinha as ações da tela na mesma faixa da navegação underline', () => {
    render(
      <SettingsSidebarLayout
        tabs={tabs}
        activeTab="orcamentos"
        onTabChange={() => undefined}
        actions={<button type="button">Novo orçamento</button>}
      >
        <p>Conteúdo da aba</p>
      </SettingsSidebarLayout>,
    );

    const action = screen.getByRole('button', { name: 'Novo orçamento' });
    const navigationRow = action.parentElement?.parentElement;

    expect(navigationRow).toHaveClass('flex', 'items-end', 'border-b');
    expect(navigationRow).toContainElement(screen.getByRole('tablist'));
  });

  it('mantém as ações de desktop fora da navegação mobile', () => {
    useIsMobileMock.mockReturnValue(true);

    render(
      <SettingsSidebarLayout
        tabs={tabs}
        activeTab="orcamentos"
        onTabChange={() => undefined}
        actions={<button type="button">Novo orçamento</button>}
      >
        <p>Conteúdo da aba</p>
      </SettingsSidebarLayout>,
    );

    expect(screen.queryByRole('button', { name: 'Novo orçamento' })).not.toBeInTheDocument();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
