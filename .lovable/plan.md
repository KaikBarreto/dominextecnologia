

## Plano: Itens do Orçamento Profissional

### O que muda

Substituir o `QuoteItemsTable` atual (lista linear genérica) por uma estrutura profissional separada em **duas seções**: **Serviços / Mão de Obra** e **Materiais**, seguindo padrões de geradores de orçamento do mercado (ex: propostas técnicas de manutenção, orçamentos de construção).

### Estrutura visual

```text
┌─────────────────────────────────────────────────────┐
│ 🔧 SERVIÇOS E MÃO DE OBRA                    [+ Adicionar] │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [Buscar serviço pré-cadastrado ▼] ou livre      │ │
│ │ Descrição | Qtd | Valor Unit. | Total  | 🗑️    │ │
│ │ ─────────────────────────────────────────────── │ │
│ │ Manutenção Preventiva  | 2 | R$150 | R$300 | X │ │
│ │ Mão de obra técnica    | 4h| R$80  | R$320 | X │ │
│ │                         Subtotal Serviços: R$620│ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ 📦 MATERIAIS                                 [+ Adicionar] │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [Buscar material do estoque ▼] ou livre         │ │
│ │ Descrição | Qtd | Valor Unit. | Total  | 🗑️    │ │
│ │ ─────────────────────────────────────────────── │ │
│ │ Filtro de ar (SKU-001) | 2 | R$45  | R$90  | X │ │
│ │                        Subtotal Materiais: R$90 │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│          Subtotal Serviços: R$ 620,00               │
│          Subtotal Materiais: R$ 90,00               │
│          SUBTOTAL GERAL: R$ 710,00                  │
└─────────────────────────────────────────────────────┘
```

### Funcionalidades

1. **Seleção de serviços pré-cadastrados** — SearchableSelect com dados de `useServiceTypes()` (tipos de serviço ativos). Ao selecionar, preenche descrição automaticamente. Permite também digitação livre.

2. **Seleção de materiais do estoque** — SearchableSelect com dados de `useInventory()`. Ao selecionar, preenche descrição, valor unitário (`sale_price` ou `cost_price`), e vincula `inventory_id`. Permite também digitação livre.

3. **Mão de obra** — Fica na seção de serviços com `item_type = 'mao_de_obra'`, pode selecionar de serviços ou digitar livre (ex: "4 horas de técnico").

4. **Subtotais por seção** — Cada seção mostra seu subtotal independente. No rodapé, resumo com subtotal de serviços + subtotal de materiais = subtotal geral.

5. **Botões de adicionar separados** — Cada seção tem seu próprio botão "Adicionar" que já define o `item_type` correto.

### Alterações técnicas

**`src/components/quotes/QuoteItemsTable.tsx`** — Reescrever completamente:
- Importar `useServiceTypes` e `useInventory`
- Separar items em dois arrays filtrados: `servicos` (item_type = servico | mao_de_obra) e `materiais` (item_type = material)
- Cada seção renderiza seus itens com SearchableSelect para seleção rápida + Input de descrição editável
- Ao selecionar um serviço: preenche `description` e `service_type_id`
- Ao selecionar um material: preenche `description`, `unit_price`, `inventory_id`
- Calcular e exibir subtotais por seção

**`src/components/quotes/QuoteFormDialog.tsx`** — Ajustar o resumo financeiro para mostrar subtotal de serviços e materiais separadamente antes do desconto/total.

**Nenhuma alteração de banco** — Os campos `inventory_id` e `service_type_id` já existem na tabela `quote_items`. Apenas precisamos passar esses valores no `useQuotes.ts` createQuote/updateQuote mutations.

**`src/hooks/useQuotes.ts`** — Atualizar mutations para incluir `inventory_id` e `service_type_id` ao salvar items.

