// Prova da armadilha documentada no briefing da Onda 1 de "Projetos" (gestão
// de obras, 2026-10-17): criar uma frente de trabalho tem que gerar o funil
// com `tracks_value: false` EXPLÍCITO (o default do banco é `true`) e semear
// as 4 etapas do template de PROJETO (nunca o comercial) com `pipeline_id`
// EXPLÍCITO em cada linha — se alguém reusar `seedDefaultStages`
// (useCrmStages.ts) sem passar o id, o gatilho `trg_crm_stages_resolve_pipeline`
// manda as etapas pro funil comercial padrão da empresa, e o card de uma
// frente sem etapa cai no quadro de /crm por engano.
import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pipelineInsert, stagesInsert, pipelineDelete, toast, getCurrentUserCompanyId } = vi.hoisted(() => ({
  pipelineInsert: vi.fn(),
  stagesInsert: vi.fn(),
  pipelineDelete: vi.fn(),
  toast: vi.fn(),
  getCurrentUserCompanyId: vi.fn().mockResolvedValue('company-1'),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'crm_pipelines') {
        return {
          select: () => ({
            eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
          }),
          insert: (payload: any) => {
            pipelineInsert(payload);
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: 'pipeline-new', ...payload },
                    error: null,
                  }),
              }),
            };
          },
          update: (payload: any) => ({
            eq: () => ({
              select: () => ({ single: () => Promise.resolve({ data: { id: 'pipeline-1', ...payload }, error: null }) }),
            }),
          }),
          delete: () => ({
            eq: (_col: string, id: string) => {
              pipelineDelete(id);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === 'crm_stages') {
        return {
          insert: (rows: any) => {
            stagesInsert(rows);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      throw new Error(`tabela inesperada no teste: ${table}`);
    },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('@/hooks/useUserCompany', () => ({
  getCurrentUserCompanyId,
}));

import { useProjectPipelines, DEFAULT_PROJECT_STAGES } from './useProjectPipelines';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  pipelineInsert.mockClear();
  stagesInsert.mockClear();
  pipelineDelete.mockClear();
  toast.mockClear();
});

describe('useProjectPipelines — criação de frente (prova da armadilha do gatilho)', () => {
  it('cria o funil com tracks_value:false e semeia as 4 etapas do template de PROJETO com pipeline_id explícito', async () => {
    const { result } = renderHook(() => useProjectPipelines('project-1'), { wrapper: wrapper() });

    await act(async () => {
      await result.current.createProjectPipeline.mutateAsync({ name: 'Elétrica' });
    });

    // O funil nasce com project_id preenchido e tracks_value FALSE explícito
    // (o default do banco é true — funil de projeto nunca soma R$).
    expect(pipelineInsert).toHaveBeenCalledTimes(1);
    expect(pipelineInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Elétrica',
        project_id: 'project-1',
        tracks_value: false,
        is_default: false,
      }),
    );

    // As 4 etapas do template de PROJETO (nunca "Fechado (Ganho)" comercial),
    // cada uma com pipeline_id EXPLÍCITO apontando pro funil recém-criado —
    // é essa linha que falha se alguém trocar por seedDefaultStages sem id.
    expect(stagesInsert).toHaveBeenCalledTimes(1);
    const rows = stagesInsert.mock.calls[0][0] as any[];
    expect(rows).toHaveLength(4);
    rows.forEach((row) => expect(row.pipeline_id).toBe('pipeline-new'));

    expect(rows.map((r) => r.name)).toEqual(['A fazer', 'Em execução', 'Concluído', 'Cancelado']);
    expect(rows.find((r) => r.name === 'Concluído')?.is_won).toBe(true);
    expect(rows.find((r) => r.name === 'Cancelado')?.is_lost).toBe(true);
    expect(rows.find((r) => r.name === 'A fazer')?.is_won).toBe(false);
    expect(rows.find((r) => r.name === 'A fazer')?.is_lost).toBe(false);

    // Template exportado também bate com o que foi de fato inserido —
    // trava a fonte única usada pela UI (ex: StageManagerDialog) se alguém
    // mudar um sem mudar o outro.
    expect(DEFAULT_PROJECT_STAGES).toHaveLength(4);
  });

  it('exclusão de frente NÃO guarda contra "última frente" (projeto pode ficar com zero)', async () => {
    const { result } = renderHook(() => useProjectPipelines('project-1'), { wrapper: wrapper() });

    await act(async () => {
      await result.current.deleteProjectPipeline.mutateAsync('pipeline-1');
    });

    expect(pipelineDelete).toHaveBeenCalledWith('pipeline-1');
  });
});
