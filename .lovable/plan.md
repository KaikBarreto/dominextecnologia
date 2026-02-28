
# Plano: Gestao de PMOC + Assinaturas em OS

## Visao Geral

Refatorar completamente o modulo PMOC para funcionar como um sistema de geracao automatica de OS recorrentes, com planos vinculados a equipamentos. Adicionar toggles de assinatura no wizard de OS.

---

## Parte 1: Modelagem de Dados (Migracao SQL)

### Novas tabelas

**pmoc_plans** - Define o plano de manutencao recorrente
- `id` uuid PK
- `customer_id` uuid NOT NULL (FK customers)
- `name` text NOT NULL (nome do plano)
- `frequency_months` integer NOT NULL DEFAULT 1 (intervalo em meses)
- `next_generation_date` date NOT NULL
- `status` text NOT NULL DEFAULT 'ativo' (ativo/pausado)
- `contract_id` uuid (FK pmoc_contracts, opcional - vincula ao contrato financeiro)
- `technician_id` uuid (tecnico padrao)
- `service_type_id` uuid (tipo de servico padrao)
- `form_template_id` uuid (questionario padrao)
- `notes` text
- `created_by` uuid
- `created_at`, `updated_at` timestamps
- RLS: authenticated users can CRUD

**pmoc_items** - Equipamentos vinculados ao plano
- `id` uuid PK
- `plan_id` uuid NOT NULL (FK pmoc_plans)
- `equipment_id` uuid NOT NULL (FK equipment)
- `created_at` timestamp
- UNIQUE(plan_id, equipment_id)
- RLS: authenticated users can CRUD

**pmoc_generated_os** - Historico de OS geradas automaticamente
- `id` uuid PK
- `plan_id` uuid NOT NULL (FK pmoc_plans)
- `service_order_id` uuid NOT NULL (FK service_orders)
- `generated_at` timestamp DEFAULT now()
- `scheduled_for` date NOT NULL
- RLS: authenticated users can view

### Alteracoes em tabelas existentes

**service_orders** - Adicionar campos de assinatura:
- `require_tech_signature` boolean DEFAULT false
- `require_client_signature` boolean DEFAULT false
- `tech_signature` text (base64 da assinatura)
- (client_signature ja existe)

### Funcao de banco para geracao automatica

Criar uma funcao `generate_pmoc_orders()` que:
1. Busca todos os `pmoc_plans` onde `status = 'ativo'` AND `next_generation_date <= CURRENT_DATE`
2. Para cada plano, busca equipamentos ativos em `pmoc_items` JOIN `equipment` (WHERE equipment existe e status = 'active')
3. Cria uma `service_order` para cada equipamento com os dados do plano
4. Registra em `pmoc_generated_os`
5. Atualiza `next_generation_date` = `next_generation_date + frequency_months months`

### Cron Job (pg_cron)

Agendar execucao diaria da funcao `generate_pmoc_orders()` via pg_cron + pg_net chamando uma edge function.

---

## Parte 2: Edge Function - generate-pmoc-orders

Criar `supabase/functions/generate-pmoc-orders/index.ts`:
- Busca planos ativos com `next_generation_date <= hoje`
- Para cada plano, busca equipamentos vinculados (ativos)
- Cria OS para cada equipamento
- Atualiza `next_generation_date`
- Registra historico em `pmoc_generated_os`
- Configurar cron para executar diariamente

---

## Parte 3: Interface PMOC Reformulada

### Pagina principal (`src/pages/PMOC.tsx`)

Renomear titulo para "Gestao de PMOC". Reorganizar em abas:

**Aba "Planos"** (principal):
- Tabela com planos: Nome, Cliente, Frequencia, Proxima geracao, Equipamentos vinculados (contagem), Status (ativo/pausado), Acoes
- Botao "Novo Plano" (azul)
- Busca por cliente/nome

**Aba "Contratos"** (financeiro):
- Manter tabela atual de contratos PMOC (vinculo financeiro)

**Aba "Cronograma"**:
- Timeline visual das proximas 12 geracoes previstas
- Indicador de conformidade (verde = em dia, vermelho = atrasado)
- Historico de OS geradas com link para a OS

### Dialog de Novo/Editar Plano (`src/components/pmoc/PmocPlanFormDialog.tsx`)

Campos:
- Nome do plano
- Cliente (SearchableSelect)
- Frequencia (select: Mensal/Bimestral/Trimestral/Semestral/Anual)
- Data da proxima geracao
- Tecnico padrao (select)
- Tipo de servico (select)
- Questionario padrao (select)
- Contrato vinculado (select, opcional)
- Multi-select de equipamentos do cliente (checkboxes, como no wizard de OS)
- Status ativo/pausado (switch)
- Observacoes

### Hook `usePmocPlans.ts`

CRUD para pmoc_plans + pmoc_items com queries relacionais.

---

## Parte 4: Assinaturas no Wizard de OS

### Step 3 "Detalhes" do `ServiceOrderFormDialog.tsx`

Adicionar 2 toggles (Switch) apos os campos de questionario:

1. **"Assinatura do Tecnico"** - visivel somente quando `technician_id` esta preenchido
2. **"Assinatura do Cliente"** - visivel somente quando `customer_id` esta preenchido (sempre, pois e obrigatorio)

Valores salvos em `require_tech_signature` e `require_client_signature` na tabela `service_orders`.

Para OS criadas via PMOC, `require_tech_signature` sera `true` por padrao.

### Tela do Tecnico (`TechnicianOS.tsx`)

Se `require_tech_signature = true`, exibir campo de assinatura (canvas de desenho) antes do check-out, bloqueando o check-out sem assinatura.

Se `require_client_signature = true`, exibir campo de assinatura do cliente igualmente.

Usar um componente `SignaturePad` simples (canvas HTML5 para desenho, salva como base64).

### Visualizacao da OS (`ServiceOrderViewDialog.tsx`)

Exibir assinaturas capturadas (imagem base64) na secao de detalhes quando existirem.

---

## Parte 5: Relatorio da OS Finalizada (TechnicianOS)

Quando a OS estiver com status `concluida`, transformar a tela em modo de visualizacao/relatorio:
- Cabecalho com dados da empresa (de `company_settings`)
- Dados do cliente, equipamento, tipo de servico
- Check-in/check-out com timestamps e geolocalizacao
- Fotos organizadas por etapa (antes/durante/depois)
- Respostas do questionario formatadas
- Diagnostico, solucao, observacoes
- Valores financeiros
- Assinaturas (tecnico e cliente) quando existirem
- Layout otimizado para impressao

---

## Sequencia de Implementacao

1. Migracao SQL (novas tabelas + campos de assinatura)
2. Hook `usePmocPlans.ts`
3. Edge function `generate-pmoc-orders`
4. Cron job (pg_cron)
5. Componente `PmocPlanFormDialog.tsx`
6. Refatorar `PMOC.tsx` com abas e planos
7. Componente `SignaturePad.tsx`
8. Toggles de assinatura no `ServiceOrderFormDialog.tsx`
9. Assinaturas no `TechnicianOS.tsx`
10. Modo relatorio no `TechnicianOS.tsx`
11. Exibir assinaturas no `ServiceOrderViewDialog.tsx`

---

## Detalhes Tecnicos

- **Tabelas antigas**: `pmoc_contracts` e `pmoc_schedules` continuam existindo para o modulo financeiro/contratos, mas a logica de geracao de OS migra para `pmoc_plans` + `pmoc_items`
- **Soft delete de equipamentos**: A query de geracao faz JOIN com `equipment` filtrando por `status = 'active'`, garantindo que equipamentos inativos/excluidos nao geram OS
- **SignaturePad**: Componente canvas HTML5 puro, sem dependencia externa, salvando como data URL base64
- **Cron**: Usar `pg_cron` + `pg_net` para chamar a edge function diariamente as 06:00 UTC
