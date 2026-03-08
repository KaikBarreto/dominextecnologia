

# Plano: Renovação do Dashboard + Logo Centralizado no Mobile

## 1. Logo Centralizado no Header Mobile

**Arquivo:** `src/components/layout/AppLayout.tsx`

No `HeaderContent` (sidebar layout, usado em mobile), o logo está à esquerda ao lado do menu hamburger. Mudar para layout com 3 colunas: hamburger à esquerda, logo centralizado (`flex-1 flex justify-center`), ações à direita.

## 2. Dashboard Renovado — Bento Grid Inspirado no EcoSistema

**Arquivo:** `src/pages/Dashboard.tsx`

Redesign completo do dashboard com:

### 2.1 Stats Cards com Cores Sólidas (estilo EcoSistema)
- Cards com fundo colorido sólido (azul, verde, amarelo/warning, etc.) + `dark:bg-card dark:border-[color]/30`
- Layout mobile: centrado verticalmente; desktop: icon à direita, texto à esquerda
- 4 cards: OS Abertas (primary), Clientes (success), Faturamento (blue-500), Taxa Conclusão (warning)
- Grid: `grid-cols-2 lg:grid-cols-4`

### 2.2 Gráficos com Gradientes e Tooltips Estilizados
- **Fluxo de Caixa (BarChart):** Adicionar `<linearGradient>` para Entradas (verde) e Saídas (vermelho), tooltip com `contentStyle` usando cores do tema (`hsl(var(--card))`, border, borderRadius: 8px, boxShadow)
- **OS por Tipo (PieChart):** Trocar por donut chart com gradients por fatia, legendas listadas abaixo do gráfico em lista estilo EcoSistema (dot colorido + nome + percentual + valor)
- **Novo: Gráfico de Área — Evolução de OS Concluídas** por mês (AreaChart com gradient fill)

### 2.3 Bento Grid Layout
Desktop: grid assimétrico visualmente rico
```text
┌──────────────────┬──────────────────┐
│   Fluxo de Caixa │  OS por Tipo     │
│   (BarChart)      │  (Donut + List)  │
├──────────────────┼──────────────────┤
│ Evolução OS      │  Resumo Status   │
│ (AreaChart)       │  (Progress bars) │
├──────────────────┴──────────────────┤
│      OS Recentes (full width)        │
└─────────────────────────────────────┘
```

Mobile: tudo empilhado em coluna única, charts com `height={220}` reduzido, `-mx-2` para usar espaço lateral.

### 2.4 Melhorias Mobile Específicas
- Charts: `height={220}` em mobile vs `height={280}` em desktop
- Cards de OS recente: mais compactos com `p-3`
- Resumo por status: layout compacto sem icon circle em mobile
- Date filter: full-width em mobile

### 2.5 Adições de Estilo
- `Legend` nos gráficos com `wrapperStyle={{ fontSize: '12px' }}`
- `CartesianGrid` com `className="opacity-30"`
- Lazy load dos componentes pesados de Recharts (como no EcoSistema)

### 2.6 Novo dado: Evolução Mensal de OS
No hook `useDashboardStats`, computar OS concluídas por mês para alimentar o AreaChart.

**Arquivos impactados:**
- `src/components/layout/AppLayout.tsx` — logo centralizado
- `src/pages/Dashboard.tsx` — redesign completo
- `src/hooks/useDashboardStats.ts` — adicionar dados de evolução mensal de OS

