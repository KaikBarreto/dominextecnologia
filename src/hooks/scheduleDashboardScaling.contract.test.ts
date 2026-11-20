import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

async function readSource(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

describe('contrato de escala da Agenda e do Dashboard', () => {
  it('pagina consultas extensas e limita listas de resumo do Dashboard', async () => {
    const source = await readSource('./useDashboardStats.ts');

    expect(source).toContain('fetchAllPaginated<DashboardOrder>');
    expect(source).toContain('fetchAllPaginated<DashboardFinancialRow>');
    expect(source.match(/count: 'exact'/g)).toHaveLength(3);
    expect(source.match(/\.limit\(5\)/g)).toHaveLength(2);
    expect(source).toContain('chunks.slice(index, index + 4)');
  });

  it('recorta o financeiro à janela visível e protege filtros IN grandes', async () => {
    const source = await readSource('./useFinancialScheduleEvents.ts');

    expect(source).toContain(".gte('due_date', window.startDate)");
    expect(source).toContain(".lte('due_date', window.endDate)");
    expect(source).toContain('index += 100');
    expect(source).toContain('accountChunks.slice(index, index + 4)');
    expect(source).toContain('fetchAllPaginated');
  });

  it('carrega o histórico completo somente na busca e com paginação', async () => {
    const [scheduleSource, serviceOrdersSource] = await Promise.all([
      readSource('../pages/Schedule.tsx'),
      readSource('./useServiceOrders.ts'),
    ]);

    expect(scheduleSource).toContain('useServiceOrders({ enabled: isSearchModalOpen })');
    expect(serviceOrdersSource).toContain('fetchAllPaginated');
    expect(serviceOrdersSource).toContain('chunks.slice(index, index + 4)');
  });

  it('recupera automaticamente a Agenda após uma oscilação curta', async () => {
    const [hookSource, scheduleSource] = await Promise.all([
      readSource('./useScheduleOrders.ts'),
      readSource('../pages/Schedule.tsx'),
    ]);

    // A recuperação é seletiva desde a 1.41.24: só repete falha de rede ou do
    // servidor, e no máximo duas vezes (comportamento coberto em useScheduleOrders.test.tsx).
    expect(hookSource).toContain('retry: shouldRetryScheduleRead');
    expect(hookSource).toContain("refetchOnReconnect: 'always'");
    expect(hookSource).toContain('refetch: query.refetch');
    expect(scheduleSource).toContain('<ToastAction');
    expect(scheduleSource).toContain('refetchSchedule()');
  });
});
