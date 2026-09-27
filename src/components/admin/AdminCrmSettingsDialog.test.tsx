import { fireEvent, render, screen } from '@testing-library/react';
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

vi.mock('@/components/admin/AdminStageManagerDialog', () => ({
  AdminStageManagerDialog: ({ pipelineId, pipelineName, embedded }: {
    pipelineId: string;
    pipelineName: string;
    embedded: boolean;
  }) => <div data-testid="stages">{`${pipelineName}:${pipelineId}:${embedded}`}</div>,
}));

vi.mock('@/components/admin/AdminPipelineManagerDialog', () => ({
  AdminPipelineManagerDialog: ({ embedded }: { embedded: boolean }) => (
    <div data-testid="pipelines">{String(embedded)}</div>
  ),
}));

import { AdminCrmSettingsDialog } from './AdminCrmSettingsDialog';

describe('AdminCrmSettingsDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('abre nas configurações de estágios do funil selecionado', () => {
    render(
      <AdminCrmSettingsDialog
        open
        onOpenChange={() => undefined}
        pipelineId="pipeline-1"
        pipelineName="Funil da Dominex"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Configurações do CRM/Kanban' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Estágios' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('stages').textContent).toBe('Funil da Dominex:pipeline-1:true');
  });

  it('troca para o CRUD de funis dentro da mesma tela', () => {
    render(
      <AdminCrmSettingsDialog
        open
        onOpenChange={() => undefined}
        pipelineId="pipeline-1"
        initialSection="pipelines"
      />,
    );

    expect(screen.getByTestId('pipelines').textContent).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Estágios' }));
    expect(screen.getByTestId('stages')).toBeTruthy();
  });
});
