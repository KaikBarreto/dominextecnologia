

## Plano: Módulo de Orçamentos

### Onde colocar

O módulo de **Orçamentos** se encaixa naturalmente no grupo **Operacional** do sidebar, logo abaixo de "Ordens de Serviço", pois o fluxo típico é: Lead/Cliente → Orçamento → Aprovação → OS.

```text
Operacional
├── Ordens de Serviço
├── Orçamentos          ← NOVO
├── Serviços
├── Equipes
├── ...
```

Rota: `/orcamentos` e `/orcamentos/:id` (detalhe)

### Estrutura do banco

**Tabela `quotes`** (orçamento principal):
- `id`, `quote_number` (sequencial), `customer_id` FK, `status` (rascunho, enviado, aprovado, rejeitado, expirado)
- `valid_until` (data de validade), `discount_type` (percentual/valor), `discount_value`
- `subtotal`, `discount_amount`, `total_value` (calculados)
- `notes`, `terms` (condições/observações)
- `assigned_to` (vendedor/técnico responsável)
- `created_by`, `created_at`, `updated_at`

**Tabela `quote_items`** (itens do orçamento):
- `id`, `quote_id` FK, `position` (ordem)
- `item_type` (servico, material, mao_de_obra)
- `description`, `quantity`, `unit_price`, `total_price`
- `inventory_id` FK nullable (link ao estoque)
- `service_type_id` FK nullable (link ao tipo de serviço)

### Integrações com módulos existentes

1. **CRM → Orçamentos**: Botão "Gerar Orçamento" no lead, pré-preenchendo cliente e valor
2. **Orçamentos → OS**: Ao aprovar, botão "Converter em OS" que cria a ordem de serviço automaticamente com os dados do orçamento
3. **Orçamentos → Financeiro**: Ao aprovar, opção de gerar transação financeira (conta a receber)
4. **Estoque**: Itens do orçamento podem referenciar produtos do estoque (puxa nome e preço)
5. **Clientes**: Seletor de cliente no formulário, exibe histórico de orçamentos na tela de detalhe do cliente

### Componentes e páginas

| Arquivo | Descrição |
|---------|-----------|
| `src/pages/Quotes.tsx` | Listagem com filtros (status, cliente, data), cards de KPI (total em aberto, taxa de conversão) |
| `src/pages/QuoteDetail.tsx` | Visualização completa + PDF/impressão do orçamento |
| `src/components/quotes/QuoteFormDialog.tsx` | Modal de criação/edição com itens dinâmicos (adicionar/remover linhas) |
| `src/components/quotes/QuoteItemsTable.tsx` | Tabela editável de itens com cálculo automático de totais |
| `src/components/quotes/QuotePDF.tsx` | Template de impressão/PDF com dados da empresa |
| `src/hooks/useQuotes.ts` | Hook CRUD + cálculos de totais e conversão |

### Funcionalidades principais

- **Listagem** com filtros por status, cliente, período e busca textual
- **Formulário** com adição dinâmica de itens (tipo, descrição, qtd, valor unitário, subtotal automático), desconto global (% ou R$), observações e condições
- **Fluxo de status**: Rascunho → Enviado → Aprovado/Rejeitado, com expiração automática baseada na validade
- **Conversão em OS**: Um clique para transformar orçamento aprovado em ordem de serviço
- **PDF/Impressão**: Gerar documento profissional com logo da empresa, dados do cliente e itens detalhados
- **Envio por link**: Página pública (como a de avaliação) onde o cliente visualiza e aprova/rejeita o orçamento
- **KPIs**: Total em aberto, taxa de conversão (aprovados/total), ticket médio

### Fluxo resumido

```text
Cliente/Lead → Criar Orçamento → Enviar ao cliente
                                       ↓
                              Cliente aprova/rejeita
                                       ↓
                              Se aprovado → Gerar OS + Conta a Receber
```

