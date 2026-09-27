import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ open, title, children }: { open: boolean; title: string; children: ReactNode }) => (
    open ? <div><h1>{title}</h1>{children}</div> : null
  ),
}));

vi.mock('@/components/SettingsSidebarLayout', () => ({
  SettingsSidebarLayout: ({ tabs, activeTab, onTabChange, children }: {
    tabs: Array<{ value: string; label: string }>;
    activeTab: string;
    onTabChange: (value: string) => void;
    children: ReactNode;
  }) => (
    <div>
      <nav>
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={activeTab === tab.value}
            onClick={() => onTabChange(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {children}
    </div>
  ),
}));

vi.mock('@/components/admin/AdminPipelineManagerDialog', () => ({
  AdminPipelineManagerDialog: ({ embedded, initialExpandedPipelineId }: { embedded: boolean; initialExpandedPipelineId: string }) => (
    <div data-testid="pipelines">{`${embedded}:${initialExpandedPipelineId}`}</div>
  ),
}));

import { AdminCrmSettingsDialog } from './AdminCrmSettingsDialog';

describe('AdminCrmSettingsDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('abre na configuração de funis com o funil selecionado expandido', () => {
    render(
      <AdminCrmSettingsDialog
        open
        onOpenChange={() => undefined}
        pipelineId="pipeline-1"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Configurações do CRM/Kanban' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Estágios' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Funis' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('pipelines').textContent).toBe('true:pipeline-1');
  });

  it('mantém somente o CRUD de funis dentro da tela', () => {
    render(
      <AdminCrmSettingsDialog
        open
        onOpenChange={() => undefined}
        pipelineId="pipeline-1"
        initialSection="pipelines"
      />,
    );

    expect(screen.getByTestId('pipelines').textContent).toBe('true:pipeline-1');
    expect(screen.queryByTestId('stages')).toBeNull();
  });
});
