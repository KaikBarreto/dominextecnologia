import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FileText, Settings } from 'lucide-react';
import { SettingsSidebarLayout } from './SettingsSidebarLayout';

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
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
});
