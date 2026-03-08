

## Plano: Nova aba "Relatório" em Ordens de Serviço

### Objetivo
Criar uma aba de relatório analítico completo dentro do módulo de Ordens de Serviço, com métricas, gráficos e tabelas resumidas.

### Componente novo: `src/components/service-orders/OsReportDashboard.tsx`

Conteúdo da aba:

**1. Cards de resumo (topo)**
- Total de OS no período
- OS concluídas / taxa de conclusão (%)
- Tempo médio de atendimento (diferença check-in → check-out)
- Faturamento total (soma de `total_value` das OS concluídas)

**2. Gráficos**
- **OS por status** — PieChart com cores dos status configurados
- **OS por tipo de serviço** — BarChart horizontal com cor de cada service_type
- **OS ao longo do tempo** — LineChart mensal/semanal mostrando volume de OS criadas
- **Faturamento ao longo do tempo** — BarChart com valores das OS concluídas por mês

**3. Rankings / tabelas**
- **Top 10 clientes** — tabela com cliente, qtd de OS, valor total
- **Top técnicos** — tabela com técnico, qtd de OS concluídas, tempo médio
- **OS por dia da semana** — mini bar chart (seg-dom)

**4. Filtro de data**
- Reutilizar `DateRangeFilter` já existente, filtrando por `scheduled_date`

### Integração na página

Adicionar ao array `sidebarTabs` em `ServiceOrders.tsx`:
```
{ value: 'report', label: 'Relatório', icon: BarChart3 }
```

Renderizar `<OsReportDashboard />` quando `activeTab === 'report'`.

O componente usa os dados já carregados por `useServiceOrders()` e `useProfiles()` para calcular tudo client-side com `useMemo`, sem necessidade de queries adicionais ou mudanças no banco.

### Arquivos
- **Criar**: `src/components/service-orders/OsReportDashboard.tsx`
- **Editar**: `src/pages/ServiceOrders.tsx` (adicionar tab + renderização)

Sem migrações de banco.

