// Regra de acesso a funil no select "mover de funil" do card da oportunidade
// (pedido do CEO: "sempre respeitando e mostrando só as options que o usuário
// foi configurado pra poder ver").
//
// A segurança de verdade é a RLS (`public.can_access_pipeline` + policies
// RESTRICTIVE em crm_pipelines/crm_stages/leads, migration 20260918110000).
// Estes testes prendem o ESPELHO no client, que é quem impede o usuário de
// clicar num destino que o banco recusaria em silêncio.
import { describe, it, expect } from 'vitest';
import { canAccessPipelineClient, filterAccessiblePipelines } from './crmPipelineAccess';
import { firstStageOfPipeline } from './crmPipelineMove';

const PIPELINES = [
  { id: 'p-aberto', name: 'Funil de Vendas' },
  { id: 'p-restrito', name: 'Licitação' },
  { id: 'p-meu', name: 'Pós-venda' },
];

// ACL: "Licitação" é restrito a outra pessoa; "Pós-venda" é restrito e EU
// estou na lista; "Funil de Vendas" não tem nenhuma linha (aberto).
const ACCESS_ROWS_ADMIN_VIEW = [
  { pipeline_id: 'p-restrito', user_id: 'user-outro' },
  { pipeline_id: 'p-meu', user_id: 'user-eu' },
];

describe('acesso a funil no client — espelho de can_access_pipeline', () => {
  it('funil SEM nenhuma linha de ACL é aberto pra empresa toda', () => {
    expect(
      canAccessPipelineClient('p-aberto', {
        accessRows: ACCESS_ROWS_ADMIN_VIEW,
        userId: 'user-eu',
        canManageCrm: false,
      }),
    ).toBe(true);
  });

  it('funil restrito a OUTRA pessoa não entra no select', () => {
    const visiveis = filterAccessiblePipelines(PIPELINES, {
      accessRows: ACCESS_ROWS_ADMIN_VIEW,
      userId: 'user-eu',
      canManageCrm: false,
    });
    expect(visiveis.map((p) => p.id)).toEqual(['p-aberto', 'p-meu']);
    expect(visiveis.some((p) => p.id === 'p-restrito')).toBe(false);
  });

  it('quem tem fn:manage_crm enxerga todos, inclusive os restritos', () => {
    const visiveis = filterAccessiblePipelines(PIPELINES, {
      accessRows: ACCESS_ROWS_ADMIN_VIEW,
      userId: 'user-gestor',
      canManageCrm: true,
    });
    expect(visiveis.map((p) => p.id)).toEqual(['p-aberto', 'p-restrito', 'p-meu']);
  });

  it('usuário sem sessão não passa em funil restrito', () => {
    expect(
      canAccessPipelineClient('p-restrito', {
        accessRows: ACCESS_ROWS_ADMIN_VIEW,
        userId: null,
        canManageCrm: false,
      }),
    ).toBe(false);
  });

  it('a lista de entrada é a régua: funil que a RLS já removeu nunca reaparece', () => {
    // Um usuário comum só LÊ as próprias linhas de crm_pipeline_access, então
    // "Licitação" chegaria aqui sem nenhuma linha visível e pareceria aberto.
    // Como a entrada é a lista JÁ RECORTADA pela RLS (sem "Licitação"), o
    // funil restrito continua fora do select.
    const listaVindaDoBanco = PIPELINES.filter((p) => p.id !== 'p-restrito');
    const visiveis = filterAccessiblePipelines(listaVindaDoBanco, {
      accessRows: [{ pipeline_id: 'p-meu', user_id: 'user-eu' }],
      userId: 'user-eu',
      canManageCrm: false,
    });
    expect(visiveis.map((p) => p.id)).toEqual(['p-aberto', 'p-meu']);
  });
});

describe('para onde a oportunidade cai ao mudar de funil', () => {
  const STAGES = [
    { id: 's3', name: 'Resolvido', pipeline_id: 'p-meu', position: 12 },
    { id: 's1', name: 'Recebido', pipeline_id: 'p-meu', position: 10 },
    { id: 's2', name: 'Em atendimento', pipeline_id: 'p-meu', position: 11 },
    { id: 's9', name: 'Leads', pipeline_id: 'p-aberto', position: 0 },
  ];

  it('entra na PRIMEIRA etapa do funil de destino, por position', () => {
    expect(firstStageOfPipeline(STAGES, 'p-meu')?.id).toBe('s1');
  });

  it('nunca pega etapa de outro funil', () => {
    expect(firstStageOfPipeline(STAGES, 'p-aberto')?.id).toBe('s9');
  });

  it('funil sem nenhuma etapa devolve null (a tela avisa em vez de mover)', () => {
    expect(firstStageOfPipeline(STAGES, 'p-restrito')).toBeNull();
  });
});
