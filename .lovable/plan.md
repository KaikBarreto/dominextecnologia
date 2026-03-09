
# Implementação do Módulo BDI de Precificação e Orçamentos

## Análise do Estado Atual

O sistema já possui:
- Módulo de orçamentos básico (`src/pages/Quotes.tsx`)
- Sistema de tipos de serviços (`src/hooks/useServiceTypes.ts`)
- Sistema de estoque/inventário (`src/hooks/useInventory.ts`)
- Estrutura de tabelas para quotes, quote_items
- Integração com Supabase e RLS configurado

## Estrutura de Implementação

### 1. Database Migrations (6 novas tabelas)

**`pricing_settings`** - Configurações BDI por empresa
- Campos: company_id, tax_rate, admin_indirect_rate, default_profit_rate, km_cost, card_discount_rate, card_installments
- RLS: por company_id usando `get_user_company_id()`

**`service_costs`** - Custos de cada serviço (HH + extras)
- Campos: service_id, hourly_rate, hours, labor_cost (calculated), extra_costs (jsonb)
- RLS: por company_id 

**`service_materials`** - Insumos vinculados a serviços
- Campos: service_id, stock_item_id, item_name, quantity, purchase_price, sale_price
- RLS: por company_id

**Atualização das tabelas existentes:**
- `quotes`: adicionar campos BDI (tax_rate, admin_indirect_rate, profit_rate, bdi, distance_km, km_cost, displacement_cost)
- `quote_items`: adicionar campos de custo detalhado (unit_hourly_rate, unit_hours, unit_labor_cost, unit_materials_cost, profit_rate, bdi)
- `quote_item_materials`: nova tabela para materiais editáveis no orçamento

### 2. Hook Central `useBDICalculator`

Implementar em `src/hooks/useBDICalculator.ts`:
- Fórmula BDI: `(100 - (taxRate + adminRate + profitRate)) / 100`
- Preço final: `totalCost / BDI`
- Lucro médio ponderado
- Cálculos de deslocamento
- Valores à vista e parcelado

Interface:
```typescript
interface BDIInput {
  taxRate: number;
  adminRate: number; 
  profitRate: number;
  items: Array<{totalCost: number; profitRate: number}>;
  distanceKm: number;
  kmCost: number;
}
```

### 3. Aba "Precificação" em Orçamentos

Modificar `src/pages/Quotes.tsx` para incluir:
- Tabs: [ Orçamentos ] [ Precificação ]
- Card de configuração das taxas BDI
- Preview em tempo real do cálculo
- Campos: Taxa Imposto, Taxa Adm Indireta, Lucro Padrão, Custo/Km
- Configurações de pagamento (desconto à vista, parcelas)

### 4. Aba "Custos" em Serviços

Criar componente `src/components/service-orders/ServiceCostsTab.tsx`:
- **Bloco 1**: Mão de obra (custo/hora × horas + custos extras)
- **Bloco 2**: Materiais vinculados (busca no estoque + manual)
- **Bloco 3**: Resumo de custo total + previsão de preço BDI
- Interface para gerenciar service_costs e service_materials

### 5. Modal de Novo Orçamento Aprimorado

Atualizar `src/components/quotes/QuoteFormDialog.tsx`:
- **Cabeçalho**: Cliente, título, validade, configurações BDI
- **Serviços**: Adicionar serviços com custos pré-calculados
- **Materiais editáveis**: Por linha de serviço
- **Deslocamento**: Campo km + custo automático
- **Resumo BDI**: Custo total, BDI, preço final, lucro ponderado
- **Override manual**: Toggle para preço customizado
- **Pagamento**: À vista e parcelado calculados

### 6. Hooks Adicionais

Criar hooks para gerenciar as novas entidades:
- `src/hooks/usePricingSettings.ts` - Configurações BDI
- `src/hooks/useServiceCosts.ts` - Custos de serviços
- `src/hooks/useServiceMaterials.ts` - Materiais de serviços
- Atualizar `src/hooks/useQuotes.ts` - Incluir cálculos BDI

### 7. Componentes de UI Especializados

- `src/components/pricing/BDIPreviewCard.tsx` - Preview em tempo real
- `src/components/pricing/PricingConfigForm.tsx` - Formulário de configurações
- `src/components/service-orders/ServiceMaterialsList.tsx` - Lista editável de materiais
- `src/components/quotes/BDISummaryCard.tsx` - Resumo de cálculo no orçamento

### 8. Conversão Orçamento → OS

Implementar funcionalidade para converter orçamentos aprovados em ordens de serviço:
- Mapear quote_items para service_order_items
- Mapear quote_item_materials para inventory_movements
- Criar service_order com valor final do orçamento
- Atualizar status do orçamento

### 9. Validações e Regras de Negócio

- BDI mínimo para evitar divisão por zero
- Validação de lucro negativo
- Recálculo automático ao alterar taxas
- Sincronização entre custos de serviço e orçamento

### 10. Melhorias na Listagem

Atualizar tabela de orçamentos para exibir:
- Coluna BDI
- Custo vs Preço
- Margem de lucro
- KPIs aprimorados com dados BDI

## Fórmulas Implementadas (Exatamente como especificado)

1. **BDI**: `(100 - (taxa_imposto + taxa_adm_indireta + lucro)) / 100`
2. **Custo serviço**: `custo_hh + custo_insumos + custo_brindes`
3. **Custo deslocamento**: `km × custo_por_km`
4. **Custo total**: `(custo_servico × quantidade) + custo_deslocamento_total`
5. **Preço final**: `custo_total_orcamento / BDI`
6. **Valor à vista**: `preco_final × 0.94` (6% desconto)
7. **Parcela cartão**: `preco_final / 10`
8. **Lucro ponderado**: `soma(lucro_item × proporcao_item_no_total)`

## Tecnologias e Padrões

- **Frontend**: React + TypeScript + TailwindCSS
- **Backend**: Supabase (PostgreSQL + RLS)
- **Estado**: TanStack Query + React Hooks
- **UI**: shadcn/ui components
- **Validação**: Zod schemas
- **Mobile**: Responsive design with drawer modals

## Sequência de Implementação

1. Migrations das novas tabelas
2. Hook `useBDICalculator` 
3. Hooks de dados (pricing, service costs, materials)
4. Aba Precificação em Orçamentos
5. Aba Custos em Serviços  
6. Modal de orçamento aprimorado
7. Conversão orçamento → OS
8. Testes e validações

## Resultado Esperado

Sistema completo de precificação BDI integrado ao módulo de orçamentos, permitindo:
- Configuração centralizada de taxas
- Gestão de custos por serviço
- Cálculo automático de preços via BDI
- Orçamentos profissionais com múltiplos serviços
- Conversão direta para ordens de serviço
- KPIs de margem e rentabilidade
