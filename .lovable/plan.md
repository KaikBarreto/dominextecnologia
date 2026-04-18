

# Plano: Empresas estilo EcoSistema + Vendedores + Afiliados + UTM

## Visão geral

Replicar do EcoSistema:
1. **Tela Empresas** com cards detalhados no Kanban (origem, vendedor, valor, vencimento, indicador de promo/preço custom).
2. **Tela detalhe da Empresa** com tabs (Informações / Histórico de Plano / Atividade), histórico de pagamentos, vendedor ligado, observações inline.
3. **Tela Vendedores** (`/admin/vendedores`) com dashboard, KPIs, gráficos, tabela de performance.
4. **Tela detalhe Vendedor** (`/admin/vendedores/:id`) com Visão Geral, Vendas, Vales, Pagamento mensal (salário + comissão − vales).
5. **Modal Gerar Link de Afiliado** (no header de Empresas) gerando URLs com `origem` + `vendedor` + `tipo` + plano travado.
6. **Tracking UTM na LP/Cadastro**: `utm_source`/`origem`/`vendedor`/`ref` capturados, persistidos via sessionStorage e enviados ao `self-register`. Default = "Site/Google".
7. **Link UTM pronto** Facebook/Instagram para bio.

Tudo seguindo visual Dominex (teal, Montserrat, Drawer mobile, dark mode).

## Fase 1 — Banco de Dados (migration)

**Adicionar em `companies`:**
- `salesperson_id uuid REFERENCES salespeople(id) ON DELETE SET NULL`
- `custom_price numeric` (preço personalizado)
- `custom_price_months int` (meses promocionais)
- `custom_price_payments_made int DEFAULT 0`

**Novas tabelas:**

```sql
-- salespeople
id uuid PK, name text, email text UNIQUE NULL, phone text,
salary numeric DEFAULT 0, monthly_goal int DEFAULT 30,
is_active boolean DEFAULT true, no_commission boolean DEFAULT false,
referral_code text UNIQUE,  -- slug curto p/ link de afiliado
created_at, updated_at

-- salesperson_sales
id, salesperson_id FK, company_id FK NULL,
customer_name, customer_origin, customer_company,
amount numeric, paid_amount numeric, commission_amount numeric,
billing_cycle text ('monthly'|'annual'), created_at, created_by

-- salesperson_advances (vales)
id, salesperson_id FK, amount numeric, description text, created_at, created_by

-- salesperson_payments (pagamentos mensais)
id, salesperson_id FK, salary_amount, commission_amount,
advances_deducted, total_amount, reference_month date, paid_at, created_by
```

**RLS**: somente `super_admin` (já existe `is_super_admin`). Isolamento global.

**Comissão**: 50% do valor mensal / 20% se anual (igual EcoSistema; ajustável depois).

## Fase 2 — Hooks & Tipos

- `src/hooks/useSalespersonData.ts` portado: `useSalespeople`, `useSalesperson`, `useSalespersonSales/Advances/Payments`, `useAllSalesperson*`, `useSaveSalesperson`, `useCreateSale`, `useCreateAdvance`, `useCreatePayment`, `useDeleteSalesperson/Sale/Advance`, `calculateCommission`.
- Auto-criação de `salesperson_sale` quando empresa é cadastrada via link com `vendedor` + `tipo=venda` (no `self-register` edge function).

## Fase 3 — UI Empresas (atualizar)

**`AdminCompanies.tsx`:**
- Adicionar filtro **Vendedor** (Select) e **Período de cadastro** (DateRangeFilter já existe).
- Botão **"Gerar Link"** ao lado de "Nova Empresa" (abre `GenerateLinkModal`).
- Carregar `salespeople` na query e passar pro Kanban.

**`CompanyKanbanCard.tsx`** (rebuild):
- Mostrar plano abaixo do nome (cor primária).
- Linhas: Valor (mensal/anual), Origem (badge colorida com ícone), Vendedor (badge primária com ícone User).
- Indicador no canto sup-direito (Gift/Tag) se promo ou custom price (com tooltip).
- Manter ações WhatsApp/Edit/Delete + status de vencimento.

**`CompanyFormModal.tsx`** (atualizar):
- Adicionar campo **Vendedor** (Select com salespeople ativos) e **Observações**.
- Adicionar campos **Preço personalizado** + **Meses promocionais** + **Permanente**.

## Fase 4 — Detalhe Empresa

**`AdminCompanyDetail.tsx`** (refatorar):
- Tabs: **Informações** | **Histórico de Plano** | **Atividade**.
- Card "Informações Gerais": adicionar Vendedor (badge) e Observações inline (já tem).
- Tab **Histórico de Plano**: nova `PaymentHistoryTable` lendo `company_payments` (`payment_date`, `amount`, `plan`, `cycle`, `notes`, ações).
- Tab **Atividade**: lista cronológica de mudanças (status, plano, valor) — opcional MVP, pode usar últimos updates do `companies` ou criar `company_activity_log` simples.
- Botão **Forçar Atualização** (já temos pattern via realtime channel) e **Cancelar Assinatura**.

## Fase 5 — Vendedores (novo módulo)

**Rotas a registrar em `App.tsx`:**
- `/admin/vendedores` → `AdminSalespeople`
- `/admin/vendedores/:id` → `AdminSalespersonDetail`

**Componentes a criar em `src/components/admin/salesperson/`:**
- `SalespersonFormDialog.tsx` (nome, email, telefone, salário, meta, ativo, sem comissão, **gerar referral_code automático**)
- `SalespersonDashboardStats.tsx` (Total vendedores, Vendas no período, Comissões pagas, % meta)
- `SalespersonCharts.tsx` (PieChart por vendedor, BarChart vendas/mês)
- `SalespersonPerformanceTable.tsx` (vendedor → vendas, comissão, meta, ações)
- `SalespersonDetailStats.tsx`, `SalespersonDetailCharts.tsx`
- `SalespersonSalesList.tsx`, `SalespersonAdvancesList.tsx`, `SalespersonAdvanceForm.tsx`
- `SalespersonPaymentControl.tsx` + `SalespersonPaymentConfirmModal.tsx`

**Adicionar item no `AdminSidebarNav.tsx`:**
```
{ label: 'Vendedores', path: '/admin/vendedores', icon: Users }
```

## Fase 6 — Modal Gerar Link de Afiliado

**`src/components/admin/GenerateLinkModal.tsx`** (novo):
- Tabs **Geral** e **Comercial**.
- Geral: tipo (`teste`/`venda`), dias trial, **Origem**, **Vendedor**.
- Comercial: modo (`livre`/`plano`/`personalizado`), seleção de plano (start/avancado/master), preço custom + meses promo.
- Gera URL: `${origin}/cadastro?origem=...&vendedor=<referral_code>&tipo=...&plano=...&ciclo=...&bloqueado=1&preco=...&meses_promo=...`
- Botão Copiar com feedback.

## Fase 7 — UTM Tracking na LP + Cadastro

**Comportamento:**
1. **LP** (`Landing.tsx` / `HeroSection` / `CtaFinalSection`): no mount, lê `searchParams`:
   - `utm_source`, `utm_medium`, `origem`, `vendedor` (referral_code), `ref` (alias).
   - Salva em `sessionStorage.utm_data = { origem, vendedor }`.
   - Mapeia `utm_source` → origem:
     - `facebook`/`instagram`/`fb`/`ig` → "Facebook/Instagram"
     - `google`/`site` → "Site/Google"
     - `whatsapp` → "WhatsApp"
     - `youtube` → "YouTube"
     - outros → "Tráfego Pago"
   - Se `origem` (param explícito) presente, sobrepõe `utm_source`.
   - Default = "Site/Google" se nada.
2. **Todos os botões "/cadastro"** anexam `?origem=...&vendedor=...` automaticamente via util `buildCadastroUrl()`.
3. **`Registration.tsx`**: lê params + sessionStorage, exibe origem pré-selecionada, envia ao `self-register`.
4. **`self-register/index.ts`**: aceita `salesperson_referral_code`, busca `salespeople` por `referral_code`, popula `companies.salesperson_id`. Se `tipo=venda`, cria registro em `salesperson_sales` com `commission_amount` calculado.

## Fase 8 — Link UTM pronto

Após implantação, gero e entrego o link para Bio do Instagram:
```
https://dominex.app/?utm_source=instagram&utm_medium=bio
```
Resultado: pessoa vê LP → clica em "Criar conta" → cadastro com origem **"Facebook/Instagram"**, sem vendedor.

## Considerações técnicas

- **Edge functions**: atualizar `self-register` (sem mexer em validações de segurança feitas).
- **RLS** novas tabelas: `USING (is_super_admin(auth.uid()))`.
- **Seed**: criar campo `referral_code` automaticamente para qualquer salesperson novo (slug do nome + 4 chars random).
- **Backfill**: empresas existentes ficam com `salesperson_id = NULL` e mantêm origem atual (sem alterações).
- **Mobile**: todos modais usam `ResponsiveModal` (Drawer no mobile já existente).
- **Validação**: zod nos forms novos; valores monetários BRL via `parseBRNumber`.
- **Paginação**: `fetchAllPaginated` em vendas/vales (escalam).

## Ordem de execução (modo step-by-step, validar entre fases)

1. **Migration** (tabelas + colunas + RLS + referral_code helper).
2. **Hook `useSalespersonData`** + tipos.
3. **Sidebar + rotas** (`/admin/vendedores`, `/admin/vendedores/:id`).
4. **Páginas Vendedores** + componentes.
5. **CompanyFormModal** atualizado (vendedor, custom price).
6. **CompanyKanbanCard** redesenhado.
7. **AdminCompanies** (filtros + botão Gerar Link).
8. **GenerateLinkModal**.
9. **AdminCompanyDetail** com tabs + PaymentHistoryTable.
10. **UTM tracking** + util `buildCadastroUrl` + atualização dos CTAs LP.
11. **`self-register`** vinculação salesperson + criação de venda automática se `tipo=venda`.
12. **Entregar link Instagram pronto**.

Pausa a cada bloco para validação.

