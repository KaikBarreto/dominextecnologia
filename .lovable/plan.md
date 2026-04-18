

## Plano: Segmento de empresa + correção planos Master + dashboard com ordem do Eco + zoom map

### 1. Banco — adicionar coluna `segment`

Migration: `ALTER TABLE companies ADD COLUMN segment text` + corrigir valor de empresas Master:
```sql
UPDATE companies SET subscription_value = 650
WHERE subscription_plan = 'master' AND subscription_value = 199;
```
(2 empresas afetadas: ArcTech Refrigeração e Minha Empresa Tutorial.)

### 2. Lista de segmentos (constante compartilhada)

Novo arquivo `src/utils/companySegments.ts` com:
- Refrigeração e Climatização
- Instalações Elétricas
- Energia Solar
- Telecomunicações / Provedores
- CFTV e Segurança Eletrônica
- Construção Civil
- Engenharia
- Elevadores
- Automação Industrial
- Limpeza e Conservação
- Dedetização
- Manutenção Predial
- Outro

Cada segmento com cor (paleta variada: emerald, blue, amber, violet, rose, cyan, etc.) e ícone (Lucide) — usados no card kanban e gráfico.

### 3. Cadastro/Edição de empresa (`CompanyFormModal.tsx`)

- Adicionar `segment: ''` no `formData` inicial e ao carregar empresa existente.
- Incluir no payload de `update` e `invoke('create-company')`.
- Na aba **Comercial**, dentro do grid `Origem / Vendedor`, adicionar um terceiro Select **Segmento** ao lado de Origem (transformando em grid com 3 colunas no desktop / 1 no mobile), com itens da constante.

Edge function `create-company` (`supabase/functions/create-company/index.ts`): ler `segment` do body e gravar na inserção da `companies`.

### 4. Card do Kanban (`CompanyKanbanCard.tsx`)

Logo abaixo do badge "Origem" exibir uma linha "Segmento:" com Badge colorido conforme a constante (mesma estética de Origem).

### 5. Tabela de Empresas (`CompanyTable.tsx`)

Adicionar coluna **Segmento** entre "Origem" e "Plano":
- Inline `Select` (mesmo padrão do `origin`) que atualiza `segment` via `updateCompanyMutation`.
- Renderiza Badge colorido com ícone do segmento.

### 6. Dashboard Admin — ordem espelhada do Eco

Reordenar `AdminDashboard.tsx` exatamente como o EcoSistema:
1. `AdminDashboardStats`
2. **Pies (Origem + Forma de Pagamento)** — dentro de `AdminDashboardCharts`
3. *(Pular NPS — não existe no admin do Dominex)*
4. **Funil de Retenção** — dentro de `AdminDashboardCharts`
5. **Mapa do Brasil** (`AdminBrazilMapChart`)
6. **Top 3 Clientes LTV** + **Clientes por Plano** (lado a lado)
7. **Evolução da Receita** (Mensal/Semanal)
8. **Taxa de Churn Mensal**
9. **NOVO: Clientes por Segmento** (último — pizza/donut igual aos demais)

Em `AdminDashboardCharts.tsx`, garantir que a ordem interna seja: Pies → Funil → Receita → Churn (separar Receita+Churn em renders condicionais ou reorganizar). Adicionar prop/seção para colocar TopLTV + ClientsByPlan **entre** Mapa e Receita (esses já estão no `AdminDashboard.tsx` — basta reordenar a chamada lá).

### 7. Novo componente `AdminSegmentDistributionChart.tsx`

Card pizza/donut com Recharts, agrupando `companies` por `segment` (filtrando ativas + testing). Cores da constante. Legenda lateral com contadores e percentuais. Renderiza placeholder vazio se não houver dados (igual aos outros).

### 8. Mapa Brasil — drilldown com zoom in/out

Refatorar `AdminBrazilMapChart.tsx` para espelhar a lógica do Eco:
- Adicionar estados `zoomTarget` e `zoomOutFrom`.
- Função `getStateZoomOrigin(stateCode)` que calcula `transformOrigin` em % usando `STATE_LABEL_POSITIONS`.
- `handleStateClick`: setar `zoomTarget`, esperar 450ms (animação `scale: 2.2 + opacity: 0` com `transformOrigin` no estado clicado), depois trocar para `selectedState`.
- `handleBackToMap`: setar `zoomOutFrom`, animar entrada do mapa com `initial={{ scale: 2.2, opacity: 0 }} → { scale: 1, opacity: 1 }` no `transformOrigin` do estado anterior.
- Toggle Map/List no drilldown (botões `Map` e `List`).
- Lista de cidades com barras gradientes verde-claro→verde-escuro (índice 0 = mais escuro).
- Manter compatível com `companies` que possuem `state` e `city` estruturados (já temos via migração anterior).

*Não vou portar `StateMapView.tsx` (mapa municipal por IBGE) porque é complexo (370 linhas + carregamento dinâmico de geojson IBGE) e o usuário pediu "mesma lógica de zoom in/out" — a view de cidades já mostra as cidades em barras, com toggle Map/List. Se quiser o mapa municipal real depois, abro como follow-up.*

### 9. Versão e changelog

Bump para `1.7.2` com entrada: "Campo Segmento em empresas, gráfico de Clientes por Segmento, drilldown do mapa com zoom animado, correção de valores Master".

### Arquivos

**Novos:**
- `src/utils/companySegments.ts`
- `src/components/admin/AdminSegmentDistributionChart.tsx`
- `supabase/migrations/<ts>_companies_segment_and_master_fix.sql`

**Editados:**
- `src/components/admin/CompanyFormModal.tsx` (campo segmento na aba Comercial)
- `src/components/admin/CompanyKanbanCard.tsx` (linha Segmento)
- `src/components/admin/CompanyTable.tsx` (coluna Segmento inline-editável)
- `src/components/admin/AdminBrazilMapChart.tsx` (zoom in/out + toggle Map/List)
- `src/components/admin/AdminDashboardCharts.tsx` (reordenar internamente)
- `src/pages/admin/AdminDashboard.tsx` (reordenar componentes + adicionar SegmentChart no fim)
- `supabase/functions/create-company/index.ts` (aceitar `segment`)
- `src/config/version.ts` + `src/pages/Changelog.tsx`

