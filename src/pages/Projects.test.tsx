// Onda 1 de "Projetos" (gestão de obras, 2026-10-17). Prova, na tela real
// (não só no helper puro de src/lib/projectProgress.test.ts):
//   1) a lista renderiza os projetos (código, nome, cliente, prazo, status);
//   2) o KPI "Atrasados" conta certo — end_date no passado e status não
//      concluída/cancelada, NUNCA concluída/cancelada mesmo com prazo vencido;
//   3) a busca filtra por nome/código/cliente (fuzzyIncludesAny);
//   4) projeto SEM frente (sem linha na RPC de progresso) mostra "—", nunca
//      "0%" — é o bug mais fácil de cometer em silêncio no contrato do CEO.
//
// Todos os hooks de dado (useProjects/useProjectProgress/useCustomers/
// useUsers) são mockados: isto é teste de TELA (composição/cálculo/i18n),
// não de rede/RLS. `useCountUp` (dashboard/KPICard) é mockado pra devolver o
// valor final direto — sem isso o teste leria "0" no meio da animação de
// contagem (requestAnimationFrame), não o valor real.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Project } from '@/hooks/useProjects';
import type { ProjectProgressRow } from '@/hooks/useProjectProgress';

vi.mock('@/hooks/use-mobile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-mobile')>();
  return { ...actual, useIsMobile: () => false };
});

vi.mock('@/components/dashboard/useCountUp', () => ({
  useCountUp: (end: number) => end,
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAdminOrGestor: () => true,
    hasPermission: () => true,
  }),
}));

const PROJECTS: Project[] = [
  {
    id: 'proj-1',
    company_id: 'company-1',
    code: 1,
    name: 'Instalação Indústria X',
    customer_id: 'cust-1',
    responsible_user_id: null,
    status: 'em_andamento',
    start_date: null,
    end_date: '2099-01-01', // futuro — nunca atrasado
    description: null,
    color: '#2563EB',
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as Project,
  {
    id: 'proj-2',
    company_id: 'company-1',
    code: 2,
    name: 'Reforma Loja 3',
    customer_id: null, // projeto interno
    responsible_user_id: null,
    status: 'em_andamento',
    start_date: null,
    end_date: '2020-01-01', // passado + não concluída/cancelada => ATRASADO
    description: null,
    color: '#F97316',
    created_by: null,
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  } as Project,
  {
    id: 'proj-3',
    company_id: 'company-1',
    code: 3,
    name: 'Expansão Filial Sul',
    customer_id: 'cust-2',
    responsible_user_id: null,
    status: 'concluida',
    start_date: null,
    end_date: '2020-01-01', // passado, mas CONCLUÍDA => NÃO conta como atrasado
    description: null,
    color: '#22C55E',
    created_by: null,
    created_at: '2026-01-03T00:00:00Z',
    updated_at: '2026-01-03T00:00:00Z',
  } as Project,
];

const CUSTOMERS = [
  { id: 'cust-1', customer_type: 'pessoa_fisica', name: 'Indústria X' },
  { id: 'cust-2', customer_type: 'pessoa_fisica', name: 'Comércio Filial Sul' },
];

// proj-1: 3 ganhos / 5 ativos (ganhos inclusos) = 60%.
// proj-2: SEM NENHUMA linha na RPC (projeto sem frente nenhuma ainda) => "—".
// proj-3: 100% concluído.
const PROGRESS_BY_ID: Record<string, ProjectProgressRow> = {
  'proj-1': { project_id: 'proj-1', done_count: 3, active_count: 5, lost_count: 2, has_won_stage: true },
  'proj-3': { project_id: 'proj-3', done_count: 5, active_count: 5, lost_count: 0, has_won_stage: true },
};

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({
    projects: PROJECTS,
    isLoading: false,
    createProject: { mutate: vi.fn(), isPending: false },
    updateProject: { mutate: vi.fn(), isPending: false },
    deleteProject: { mutate: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/hooks/useProjectProgress', () => ({
  useProjectProgress: () => ({
    rows: Object.values(PROGRESS_BY_ID),
    isLoading: false,
    getProgress: (id: string) => PROGRESS_BY_ID[id] ?? null,
  }),
}));

vi.mock('@/hooks/useCustomers', () => ({
  useCustomers: () => ({
    customers: CUSTOMERS,
    isLoading: false,
    createCustomer: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
    updateCustomer: { mutate: vi.fn(), isPending: false },
    deleteCustomer: { mutate: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/hooks/useUsers', () => ({
  useUsers: () => ({ users: [], isLoading: false }),
}));

import Projects from './Projects';

// A lista navega pro detalhe (`useNavigate`), então precisa de Router no teste.
// Clicar na linha ABRE o projeto — a tela de detalhe era inalcançável pela
// interface antes disso (achado no QA de navegador em 2026-10-17).
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderList = () => render(<Projects />, { wrapper: MemoryRouter });

describe('Projects (lista)', () => {
  it('renderiza os projetos com código, nome, cliente e prazo', () => {
    renderList();

    expect(screen.getByText('Instalação Indústria X')).toBeInTheDocument();
    expect(screen.getByText('Reforma Loja 3')).toBeInTheDocument();
    expect(screen.getByText('Expansão Filial Sul')).toBeInTheDocument();

    // Código exibido como #<n>, sem zero-padding (mesmo padrão de quote_number).
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();

    // Cliente do projeto; projeto sem customer_id mostra "Projeto interno".
    expect(screen.getByText('Indústria X')).toBeInTheDocument();
    expect(screen.getByText('Comércio Filial Sul')).toBeInTheDocument();
    expect(screen.getByText('Projeto interno')).toBeInTheDocument();
  });

  it('KPI "Atrasados" conta só quem tem prazo vencido e não está concluído/cancelado', () => {
    renderList();

    // Só proj-2 é atrasado: proj-1 tem prazo no futuro, proj-3 tem prazo
    // vencido mas está "concluida" (a régua exclui concluída/cancelada do
    // atraso mesmo com end_date no passado).
    const overdueTitle = screen.getByText('Atrasados');
    const overdueCard = overdueTitle.parentElement as HTMLElement;
    expect(within(overdueCard).getByText('1')).toBeInTheDocument();

    // "Projetos" aparece duas vezes (título <h1> da página + título do KPI
    // card) — escopa pelo <p> do KPICard (o <h1> da PageHeader não é <p>).
    const totalTitle = screen.getByText('Projetos', { selector: 'p' });
    const totalCard = totalTitle.parentElement as HTMLElement;
    expect(within(totalCard).getByText('3')).toBeInTheDocument();

    const doneTitle = screen.getByText('Concluídos');
    const doneCard = doneTitle.parentElement as HTMLElement;
    expect(within(doneCard).getByText('1')).toBeInTheDocument();
  });

  it('busca filtra por nome, código e cliente (fuzzyIncludesAny)', () => {
    renderList();

    const search = screen.getByPlaceholderText('Buscar por nome, código ou cliente...');
    fireEvent.change(search, { target: { value: 'industria x' } });

    expect(screen.getByText('Instalação Indústria X')).toBeInTheDocument();
    expect(screen.queryByText('Reforma Loja 3')).not.toBeInTheDocument();
    expect(screen.queryByText('Expansão Filial Sul')).not.toBeInTheDocument();
  });

  it('projeto sem frente (sem linha na RPC) mostra "—", nunca "0%"', () => {
    renderList();

    const row = screen.getByText('Reforma Loja 3').closest('tr') as HTMLElement;
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(within(row).queryByText('0%')).not.toBeInTheDocument();

    // proj-1 (60%) e proj-3 (100%) seguem mostrando o percentual de verdade —
    // prova que o "—" é específico de quem não tem linha de progresso, e não
    // um bug que esconde todo mundo.
    const row1 = screen.getByText('Instalação Indústria X').closest('tr') as HTMLElement;
    expect(within(row1).getByText('60%')).toBeInTheDocument();
    const row3 = screen.getByText('Expansão Filial Sul').closest('tr') as HTMLElement;
    expect(within(row3).getByText('100%')).toBeInTheDocument();
  });
});

describe('Projects (lista) — abrir o projeto', () => {
  it('clicar na linha navega pro detalhe, e não abre o modal de edição', () => {
    mockNavigate.mockClear();
    renderList();

    fireEvent.click(screen.getByText('Instalação Indústria X'));

    // A rota do detalhe, com o id do projeto clicado.
    expect(mockNavigate).toHaveBeenCalledWith('/projetos/proj-1');
    // E NÃO o modal de edição: antes do conserto, clicar na linha editava
    // (mobile) ou não fazia nada (desktop), e a tela de detalhe — onde moram as
    // frentes, o progresso e as tarefas — ficava inalcançável pela interface.
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
