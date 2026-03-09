
# Plano: Sistema de Custos Globais (Centro de Custos)

## Objetivo
Implementar cadastro único de recursos (veículos, ferramentas, EPIs, brindes) com rateio automático por hora nos serviços, integrado como nova aba "Custos Globais" na página `/servicos`.

## Estrutura do Banco de Dados

### Novas Tabelas

```sql
-- 1. Recursos globais de custo
CREATE TABLE cost_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) NOT NULL,
  category text NOT NULL CHECK (category IN ('vehicle','tool','gift','epi','other')),
  name text NOT NULL,
  is_active boolean DEFAULT true,
  monthly_hours integer DEFAULT 176,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Componentes de custo de cada recurso
CREATE TABLE cost_resource_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid REFERENCES cost_resources(id) ON DELETE CASCADE,
  name text NOT NULL,
  value numeric(10,2) NOT NULL DEFAULT 0,
  is_monthly boolean DEFAULT true,
  annual_value numeric(10,2),
  sort_order integer DEFAULT 0
);

-- 3. Vinculação recurso ↔ serviço
CREATE TABLE service_cost_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES service_types(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES cost_resources(id) ON DELETE CASCADE,
  override_value numeric(10,2),
  UNIQUE(service_id, resource_id)
);

-- 4. Brindes por execução do serviço
CREATE TABLE service_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES service_types(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES cost_resources(id),
  name text NOT NULL,
  unit_cost numeric(10,2) DEFAULT 0,
  quantity numeric(6,2) DEFAULT 1,
  subtotal numeric(10,2) GENERATED ALWAYS AS (unit_cost * quantity) STORED
);

-- 5. View calculada de custo/hora
CREATE VIEW cost_resources_with_rate AS
SELECT r.*,
  COALESCE(SUM(i.value), 0) AS total_monthly_cost,
  COALESCE(SUM(i.value), 0) / r.monthly_hours AS hourly_rate
FROM cost_resources r
LEFT JOIN cost_resource_items i ON i.resource_id = r.id
GROUP BY r.id;
```

### RLS Policies
- `cost_resources`: company_id = get_user_company_id(auth.uid())
- `cost_resource_items`: via resource_id join
- `service_cost_resources` e `service_gifts`: authenticated users

---

## Arquitetura de Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `src/hooks/useCostResources.ts` | Hook para CRUD de recursos globais com KPIs |
| `src/hooks/useServiceCostResources.ts` | Hook para vincular recursos a serviços |
| `src/components/service-orders/GlobalCostsTab.tsx` | Nova aba "Custos Globais" |
| `src/components/service-orders/CostResourceCard.tsx` | Card de recurso com componentes |
| `src/components/service-orders/CostResourceFormSheet.tsx` | Sheet lateral para criar/editar |
| `src/pages/Services.tsx` | Adicionar nova aba |
| `src/components/service-orders/ServiceCostsTab.tsx` | Integrar seleção de recursos globais |

---

## UI: Nova Aba "Custos Globais"

### Header
- Título: "Centro de Custos"
- Subtítulo: "Cadastre veículos, ferramentas e recursos. O custo/hora é rateado automaticamente."

### KPIs (4 cards)
1. Custo/hora Veículos (soma hourly_rate)
2. Custo/hora Ferramentas
3. Custo/hora EPIs
4. Custo mensal Brindes

### Tabs de Categoria
`[ Veículos | Ferramentas | Brindes | EPIs | Outros ]`

### Card de Recurso
```
┌─────────────────────────────────────────────────┐
│ 🚗 Spin 2024                     [Editar] [🗑]  │
│ ────────────────────────────────────────────── │
│ Depreciação mensal         R$ 1.874,88         │
│ Manutenção + Combustível   R$ 1.300,00         │
│ Seguro (anual ÷ 12)        R$ 1.589,00         │
│ ────────────────────────────────────────────── │
│ Total: R$ 4.983,13  ÷  176h  =  R$ 28,31/h     │
└─────────────────────────────────────────────────┘
```

### Sheet de Formulário
- **Campos comuns**: Nome, Horas mensais (176), Ativo, Observações
- **Componentes dinâmicos**: Lista de itens (nome + valor + toggle "anual ÷ 12")
- **Preview em tempo real**: Total mensal ÷ horas = R$/hora
- **Veículo**: Calculadora de depreciação (valor 0km - valor 2 anos) ÷ 24
- **Brinde**: Lista de itens com qtd × preço unitário (sem rateio por hora)

---

## UI: Integração em "Custos dos Serviços"

Seção "Recursos Vinculados" na aba mão de obra:

```
┌─── Veículos ──────────────────────────────────────┐
│ ☑ Spin 2024      R$ 28,31/h                       │
│   2h × R$ 28,31 = R$ 56,62   [sobrescrever: ___]  │
├─── Ferramentas ───────────────────────────────────┤
│ ☑ Manômetro      R$ 4,17/h                        │
│   2h × R$ 4,17 = R$ 8,34                          │
├─── Brindes (por execução) ────────────────────────┤
│ ☑ Kit Brinde     R$ 51,69 / execução              │
└───────────────────────────────────────────────────┘
```

### Aba Resumo Atualizada
Incluir breakdown: Mão de obra + Materiais + Veículo + Ferramentas + EPIs + Brindes = Custo Total

---

## Hook: useCostResources

```typescript
export function useCostResources() {
  // Query com view cost_resources_with_rate
  // Agrupamento por categoria
  // KPIs calculados
  // Mutations: create, update, delete resource
  // Mutations: add/remove/update items
}
```

---

## Fluxo de Dados

1. **Centro de Custos**: Cadastra recursos globais uma única vez
2. **Custos do Serviço**: Vincula recursos ao serviço (checkbox)
3. **Cálculo automático**: custo/hora × horas_do_serviço
4. **Orçamento**: Herda custos dos recursos vinculados
5. **Propagação**: Alterar custo no Centro reflete em todos os serviços

---

## Atualização da Página Services.tsx

```typescript
const tabs = [
  { value: 'types', label: 'Tipos de Serviços', icon: Settings },
  { value: 'costs', label: 'Custos dos Serviços', icon: DollarSign },
  { value: 'global', label: 'Custos Globais', icon: Boxes },
];
```

---

## Checklist
- [ ] Migrations: 4 tabelas + 1 view + RLS
- [ ] Hook useCostResources com KPIs
- [ ] Hook useServiceCostResources
- [ ] GlobalCostsTab com tabs por categoria
- [ ] CostResourceCard com lista de componentes
- [ ] CostResourceFormSheet com campos dinâmicos
- [ ] Calculadora de depreciação para veículos
- [ ] Toggle "valor anual ÷ 12"
- [ ] Integração em ServiceCostsTab (recursos vinculados)
- [ ] Aba Resumo com breakdown completo
- [ ] Preview custo/hora em tempo real
