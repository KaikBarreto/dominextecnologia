

## Plano: Sistema Modular de Assinatura com Feature Gating

### Visão Geral

Transformar o sistema de planos fixos (Starter/Pro/Enterprise) em um sistema modular onde cada empresa contrata módulos individuais e adicionais, com cálculo automático do valor da assinatura. Telas e funcionalidades são habilitadas/desabilitadas conforme os módulos contratados, com modal de upsell ao tentar acessar algo não contratado.

---

### Estrutura de Módulos e Preços (conforme imagens)

```text
MÓDULOS:
1) Módulo Básico ─────────── R$ 200  (OS, Agenda, 5 Usuários, Dashboard, Orçamentos, Serviços, Mapa, Clientes, Equipamentos, Estoque, Contratos/PMOC, Financeiro Básico)
2) Funcionários/RH ──────── R$ 100
3) CRM ──────────────────── R$  50
4) Emissão de Notas Fiscais  R$ 100

ADICIONAIS:
- Financeiro Avançado ────── R$  50  (DRE, Contas a Pagar/Receber)
- Precificação Avançada ──── R$  50  (BDI, Custos Globais)
- Portal do Cliente ─────── R$  50
- White Label ───────────── R$  50
- Usuário Extra ─────────── R$  50/cada

PLANOS PRÉ-MONTADOS:
- Essencial: Básico, 5 usuários ─────────── R$ 200
- Avançado: Básico + RH + Fin. Avançado ─── R$ 350
- Master: Tudo (exceto personalizado) ────── R$ 650
- Personalizado: Montagem livre ──────────── Calculado
```

---

### Etapas de Implementação

#### 1. Banco de Dados — Tabelas de Módulos

- Criar tabela `subscription_modules` com os módulos/adicionais (code, name, price, type: 'module'|'addon', description, is_active, sort_order)
- Criar tabela `company_modules` (company_id, module_code, quantity default 1, activated_at) — registro dos módulos ativos de cada empresa
- Adicionar coluna `extra_users` (int, default 0) na tabela `companies` para rastrear usuários extras contratados
- Refatorar `subscription_plans` para incluir campo `included_modules` (jsonb array de codes) representando os planos pré-montados
- Seed dos módulos e planos pré-montados

#### 2. Hook Central — `useCompanyModules`

- Busca os módulos ativos da empresa logada via `company_modules`
- Expõe funções: `hasModule(code)`, `modules`, `isLoading`
- Códigos dos módulos: `basic`, `rh`, `crm`, `nfe`, `finance_advanced`, `pricing_advanced`, `customer_portal`, `white_label`
- Disponibilizado no AuthContext ou como hook independente com cache

#### 3. Componente `ModuleGateModal`

- Modal reutilizável: "Você não tem acesso a este módulo"
- Mostra nome do módulo, descrição, preço
- Botão "Contratar Agora" → redireciona ao checkout/assinatura ou adiciona ao plano inline
- Estilo similar ao padrão do sistema (ResponsiveModal)

#### 4. Feature Gating — Financeiro

**Sem módulo `finance_advanced`:**
- Esconder abas "Contas" (Contas a Pagar/Receber) e "DRE" do Finance.tsx
- Manter apenas: Visão Geral, Receitas, Despesas, Histórico, Categorias
- Ao tentar acessar DRE/Contas via URL → ModuleGateModal

**Com módulo `finance_advanced`:**
- Comportamento atual completo

#### 5. Feature Gating — Precificação / Serviços / Orçamentos

**Sem módulo `pricing_advanced`:**
- Em Serviços: esconder aba "Custos dos Serviços" e "Custos Globais"
- Em Orçamentos: esconder aba de Precificação (PricingTab) nas configurações
- Orçamentos usam preço editável inline simples (sem BDI)
- Remover referências ao BDI no QuoteFormDialog/QuoteViewDialog

**Com módulo `pricing_advanced`:**
- Comportamento atual completo (BDI, custos globais, recursos)

#### 6. Feature Gating — Outros Módulos

- **CRM** (`crm`): Esconder item "CRM" do menu. ModuleGateModal se acessar `/crm`
- **Funcionários/RH** (`rh`): Esconder "Funcionários" do menu. Gate no `/funcionarios`
- **Portal do Cliente** (`customer_portal`): Desabilitar funcionalidade de portal público
- **White Label** (`white_label`): Esconder configurações de white label em Settings
- **Emissão NF** (`nfe`): Preparar gate (módulo futuro)

#### 7. Sidebar e Menu — Filtragem por Módulos

- `AppSidebar.tsx`: Além do filtro por permissões (`screenKey`), adicionar filtro por `moduleKey` nos itens de menu
- Itens sem o módulo ficam ocultos ou mostram cadeado com tooltip

#### 8. Checkout Modular

- Refatorar `Checkout.tsx`:
  - Etapa 1: Escolher plano pré-montado OU montar personalizado
  - Na montagem personalizada: listar módulos com checkboxes, slider de usuários extras
  - Cálculo automático: soma dos módulos + (extras * R$50)
  - Etapa 2: Pagamento (fluxo existente)
- Atualizar `Billing.tsx` para mostrar módulos ativos e permitir adicionar/remover módulos

#### 9. Admin — Gestão de Módulos por Empresa

- `AdminCompanyDetail.tsx` / `CompanyFormModal.tsx`: Seção para gerenciar módulos ativos da empresa
- `AdminSubscriptions.tsx`: Coluna mostrando módulos ativos
- Permitir admin ativar/desativar módulos individualmente

#### 10. Landing Page — Atualizar Pricing

- Refatorar `PricingSection.tsx` para exibir os 4 planos (Essencial, Avançado, Master, Personalizado)
- Mostrar tabela comparativa de módulos inclusos
- Plano Personalizado com CTA "Monte o Seu"

---

### Detalhes Técnicos

**Novas tabelas:**
```sql
CREATE TABLE public.subscription_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  price numeric DEFAULT 0,
  type text DEFAULT 'module', -- 'module' | 'addon'
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.company_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  module_code text NOT NULL,
  quantity int DEFAULT 1,
  activated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, module_code)
);
-- RLS: empresa só vê seus próprios módulos
```

**Alteração em subscription_plans:**
```sql
ALTER TABLE subscription_plans ADD COLUMN included_modules jsonb DEFAULT '[]';
```

**Hook `useCompanyModules`:**
```typescript
// Retorna { hasModule, modules, isLoading }
// hasModule('finance_advanced') → boolean
// Usado em Finance.tsx, Services.tsx, Quotes.tsx, AppSidebar.tsx
```

**Padrão de gate nas páginas:**
```typescript
const { hasModule } = useCompanyModules();
// Filtrar abas visíveis
const visibleTabs = allTabs.filter(t => {
  if (t.key === 'dre' || t.key === 'contas') return hasModule('finance_advanced');
  return true;
});
```

---

### Ordem de Execução Sugerida

1. Criar tabelas + seed de dados (migration)
2. Hook `useCompanyModules`
3. Componente `ModuleGateModal`
4. Feature gating: Financeiro (DRE, Contas)
5. Feature gating: Precificação (BDI, Custos Globais)
6. Feature gating: CRM, RH, White Label
7. Sidebar filtering
8. Checkout modular
9. Billing atualizado
10. Admin gestão de módulos
11. Landing page pricing

