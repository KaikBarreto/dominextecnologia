

## Plano: Estrutura SaaS B2B Multiempresa — Cadastro, Assinatura e Admin

Este é um projeto estrutural grande que transforma o Dominex de single-tenant para multi-tenant SaaS B2B. Vou dividir em fases claras.

---

### Fase 1: Estrutura de Banco de Dados Multi-Empresa

**Migração SQL — Tabela `companies`:**
```sql
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cnpj text,
  email text,
  phone text,
  address text,
  contact_name text,
  origin text,
  subscription_status text NOT NULL DEFAULT 'testing', -- testing, active, inactive
  subscription_plan text DEFAULT 'starter',
  subscription_value numeric DEFAULT 0,
  subscription_expires_at timestamptz,
  billing_cycle text DEFAULT 'monthly',
  max_users integer DEFAULT 5,
  trial_days integer DEFAULT 14,
  notes text,
  logo_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
-- RLS: admin global pode tudo, users autenticados veem sua empresa
```

**Migração SQL — Tabela `company_origins`:**
```sql
CREATE TABLE public.company_origins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text DEFAULT 'Globe',
  color text DEFAULT '#6B7280',
  created_at timestamptz DEFAULT now()
);
-- Seed com: Google, Site, Instagram, Indicação, etc.
```

**Migração SQL — Tabela `subscription_plans`:**
```sql
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  max_users integer DEFAULT 5,
  description text,
  features jsonb DEFAULT '[]',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
-- Seed: starter (R$197), pro (R$497), enterprise (sob consulta)
```

**Modificar `profiles`:** Adicionar coluna `company_id uuid REFERENCES companies(id)` para vincular cada usuário a uma empresa.

**Atualizar RLS de todas as tabelas operacionais** (service_orders, customers, equipment, etc.) para filtrar por `company_id` do usuário logado, usando uma function `get_user_company_id()`.

---

### Fase 2: Edge Function `self-register`

**Criar `supabase/functions/self-register/index.ts`:**
- Recebe: `company_name`, `contact_name`, `company_email`, `company_phone`, `password`, `origin`
- Verifica se email já existe
- Cria company com `subscription_status = 'testing'`, trial de 14 dias
- Cria auth user com `email_confirm: true`
- Atualiza profile com `company_id`
- Insere role `admin` para o primeiro usuário da empresa
- Retorna sucesso + auto-login

---

### Fase 3: Tela de Cadastro estilo EcoSistema

**Refatorar `src/pages/Registration.tsx`:**
- Fluxo multi-step: **Dados da Empresa** → **Origem** → **Acesso** → **Sucesso**
- Step 1 (Dados): Nome da Empresa*, Responsável*, Email*, Telefone*, CNPJ (opcional)
- Step 2 (Origem): Grid de cards com ícones coloridos (Google, Instagram, Site, Indicação, etc.) — buscados da tabela `company_origins`
- Step 3 (Acesso): Mostrar email, campos Senha + Confirmar Senha, box informativo "14 dias grátis"
- Step 4 (Sucesso): Ícone confete, mensagem, redirect para dashboard
- Visual: DarkVeil background, card glassmorphism escuro, step indicators idênticos à EcoSistema
- Suporte a `?origem=Google` na URL para pré-selecionar origem

**Modificar CTAs da Landing Page:**
- `HeroSection.tsx`: Link `"/cadastro"` → `"/cadastro?origem=Site"`
- `PricingSection.tsx`: Links → `"/cadastro?origem=Site"`
- `CtaFinalSection.tsx`: Links → `"/cadastro?origem=Site"`

---

### Fase 4: Tela de Assinatura (Billing)

**Criar `src/pages/Billing.tsx`:**
- Rota `/assinatura`
- Hero com gradiente primary: nome da empresa, plano atual, status (Ativa/Testando/Vencida), dias restantes, valor mensal
- Se `testing`: CTA "Ativar Assinatura" redirecionando para `/checkout`
- Badge de status dinâmico (verde ativa, laranja vencendo, vermelho vencida)
- Cards de resumo: valor mensal + vencimento
- Histórico de pagamentos (tabela paginada)

**Criar `src/pages/Checkout.tsx`:**
- Seleção de plano (cards com features)
- Toggle mensal/anual (20% desconto)
- Resumo do pedido
- Placeholder para integração de pagamento futura (PIX/Boleto/Cartão)

---

### Fase 5: Admin — Gestão de Empresas

**Criar `src/pages/admin/AdminCompanies.tsx`:**
- Rota `/admin/empresas` (acessível apenas para super_admin)
- Tabela com colunas: Nome, CNPJ, Email, Status (badge), Plano, Vencimento, Origem, Ações
- Filtros: busca textual, status, origem, vencimento, plano
- Botão "Nova Empresa" abre modal de criação
- View toggle: Lista / Kanban (por status)

**Criar `src/pages/admin/AdminCompanyDetail.tsx`:**
- Rota `/admin/empresas/:id`
- Cards: Info Geral (CNPJ, telefone, email, endereço, responsável, data cadastro), Assinatura (plano, valor, status, vencimento)
- Ações: Editar, Excluir (com confirmação por nome), botão WhatsApp
- Observações inline editáveis
- Histórico de pagamentos

**Criar `src/components/admin/CompanyFormModal.tsx`:**
- Form para criar/editar empresa: nome, CNPJ, email, telefone, endereço, status, plano, valor, vencimento, max_users, notas

**Criar `src/components/admin/CompanyTable.tsx`:**
- Tabela responsiva com sorting e badges de status

**Criar role `super_admin`:**
- Nova role no enum `app_role` para distinguir admin de empresa vs admin da plataforma
- Guard em rotas admin

---

### Fase 6: Navegação e Roteamento

**Modificar `src/App.tsx`:**
- Adicionar rotas: `/assinatura`, `/checkout`, `/admin/empresas`, `/admin/empresas/:id`
- Rotas admin protegidas por `super_admin` role

**Modificar `src/components/layout/AppSidebar.tsx` e `TopbarLayout.tsx`:**
- Adicionar item "Assinatura" com ícone `CreditCard`
- Menu admin condicional para `super_admin`: seção "Admin" com "Empresas"

---

### Fase 7: Data Isolation (Multi-Tenancy)

**Criar function SQL `get_user_company_id()`:**
```sql
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id
$$;
```

**Adicionar `company_id` nas tabelas operacionais** (service_orders, customers, equipment, teams, etc.) e atualizar RLS para filtrar por empresa.

> **Nota**: Esta fase é a mais crítica e impacta todas as tabelas. A implementação será incremental — primeiro as tabelas core, depois as auxiliares.

---

### Arquivos a Criar
- `supabase/functions/self-register/index.ts`
- `src/pages/Billing.tsx`
- `src/pages/Checkout.tsx`
- `src/pages/admin/AdminCompanies.tsx`
- `src/pages/admin/AdminCompanyDetail.tsx`
- `src/components/admin/CompanyFormModal.tsx`
- `src/components/admin/CompanyTable.tsx`

### Arquivos a Modificar
- `src/pages/Registration.tsx` (refatorar completo)
- `src/App.tsx` (rotas)
- `src/components/layout/AppSidebar.tsx` (menu)
- `src/components/layout/TopbarLayout.tsx` (menu)
- `src/components/landing/HeroSection.tsx` (CTA links)
- `src/components/landing/PricingSection.tsx` (CTA links)
- `src/components/landing/CtaFinalSection.tsx` (CTA links)
- `src/contexts/AuthContext.tsx` (company_id no contexto)
- `src/types/database.ts` (novos tipos)

### Migrações SQL
1. Tabelas `companies`, `company_origins`, `subscription_plans` com RLS
2. Coluna `company_id` em `profiles`
3. Function `get_user_company_id()`
4. Coluna `company_id` + RLS atualizado em tabelas operacionais (incremental)
5. Seed data para origins e plans
6. Nova role `super_admin` no enum

> **Escopo desta implementação**: Farei as fases 1-6 agora. A fase 7 (data isolation completa) será implementada de forma incremental nas próximas iterações para evitar quebrar funcionalidades existentes.

