

# O que falta implementar do plano BDI

## Analise do que ja esta feito

| Item do Plano | Status |
|---|---|
| 1. Database Migrations (pricing_settings, service_costs, service_materials, quote_item_materials, campos BDI em quotes/quote_items) | Feito |
| 2. Hook useBDICalculator | Feito |
| 3. Hooks de dados (usePricingSettings, useServiceCosts, useServiceMaterials) | Feito |
| 4. Aba Precificacao em Orcamentos (sidebar + PricingTab) | Feito |
| 5. Aba Custos em Servicos (sidebar + ServiceCostsTab + LaborCalculatorModal + ExtraCostModal) | Feito |
| 6. Modal de orcamento aprimorado (QuoteFormDialog com BDI completo) | Feito |
| 7. Conversao orcamento -> OS (useQuoteConversion) | Feito |
| 8. BDISummaryCard (dark gradient) | Feito, mas **nao usado** em lugar nenhum |
| 9. Melhorias na listagem (colunas BDI, Custo vs Preco, Margem) | **NAO FEITO** |
| 10. Validacoes e regras de negocio (BDI minimo, lucro negativo, recalculo) | Parcialmente feito (clamp 0.01) |

## O que falta

### A) Usar o BDISummaryCard no QuoteFormDialog
O componente `BDISummaryCard` com estilo dark gradient existe, mas o form usa um resumo inline simples (linhas 666-698). Substituir pelo componente profissional.

### B) Melhorias na listagem de orcamentos
A tabela atual mostra apenas: Numero, Cliente, Data, Validade, Valor, Status. Falta:
- Coluna **Custo** (total_cost)
- Coluna **BDI** (fator)
- Coluna **Margem** (preco - custo)
- Exibir `final_price` ao inves de `total_value` como valor principal quando disponivel
- KPIs aprimorados com dados BDI (margem media, custo medio)

### C) Validacoes visuais no formulario
- Alerta quando BDI fica negativo ou muito baixo (< 20%)
- Alerta quando lucro calculado e negativo
- Indicador visual de margens saudaveis vs perigosas

### D) Recalculo automatico de precos ao alterar taxas BDI
Quando o usuario altera taxRate, adminRate ou profitRate no formulario, os precos unitarios dos servicos ja adicionados **nao sao recalculados**. Implementar recalculo automatico.

---

## Plano de implementacao

### 1. QuoteFormDialog - Substituir resumo BDI inline pelo BDISummaryCard
- Importar e usar `BDISummaryCard` na secao 6 do formulario
- Remover o bloco inline atual (linhas 666-698)

### 2. QuoteFormDialog - Recalculo automatico ao alterar taxas
- Adicionar useEffect que, ao mudar taxRate/adminRate/profitRate, recalcula `unit_price` e `total_price` de cada item de servico baseado no novo bdiFactor

### 3. QuoteFormDialog - Alertas de validacao BDI
- Badge vermelho quando bdiFactor < 0.20
- Tooltip explicativo

### 4. Quotes.tsx - Colunas extras na listagem
- Adicionar colunas: Custo, BDI, Margem (desktop)
- Exibir `final_price ?? total_value` como valor
- Novos KPIs: Margem media, Custo total

### 5. Quotes.tsx - KPIs aprimorados
- Adicionar cards: Margem Media (%), Custo Total dos orcamentos

## Arquivos modificados

| Arquivo | Mudanca |
|---|---|
| `src/components/quotes/QuoteFormDialog.tsx` | Usar BDISummaryCard, recalculo auto, alertas |
| `src/pages/Quotes.tsx` | Colunas BDI na tabela, KPIs extras |
| `src/hooks/useQuotes.ts` | Incluir campos BDI no select e nos KPIs |

