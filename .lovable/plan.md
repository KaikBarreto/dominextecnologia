

## Diagnóstico: O que falta no módulo de Orçamentos

Analisei todo o código atual. Segue o que **existe** e o que **falta** para o módulo ser completo:

### O que JA funciona
- CRUD de orçamentos com itens (serviços + materiais)
- Prospect sem cliente cadastrado
- Link publico para aprovacao/rejeicao pelo cliente
- KPIs basicos (total em aberto, taxa de conversao, ticket medio)
- Filtros por status e busca textual

### O que FALTA (10 itens)

| # | Funcionalidade | Impacto |
|---|---|---|
| 1 | **Visualizar orçamento (detalhe interno)** -- Nao existe pagina/modal de visualizacao completa. So tem editar e excluir. | Alto |
| 2 | **PDF / Impressao** -- Nao existe geracao de PDF com logo da empresa, dados do cliente, itens. Planejado no plano original mas nunca implementado. | Alto |
| 3 | **Converter orçamento aprovado em OS** -- Botao "Gerar OS" que cria service_order a partir do orcamento. Integracao central do fluxo. | Alto |
| 4 | **Converter orçamento aprovado em transacao financeira** -- Gerar conta a receber no modulo financeiro ao aprovar. | Medio |
| 5 | **Duplicar orçamento** -- Copiar orcamento existente como novo rascunho (muito comum no mercado). | Medio |
| 6 | **Expiração automatica** -- Orcamentos com `valid_until` no passado devem virar status "expirado" automaticamente. | Medio |
| 7 | **Carregar itens ao editar** -- O `quotesQuery` nao faz `select('*, quote_items(*)')`, entao ao editar um orcamento os itens nao carregam. | Critico (bug) |
| 8 | **Envio por WhatsApp/E-mail** -- Botao para compartilhar o link publico via WhatsApp ou copiar mensagem formatada. | Medio |
| 9 | **Historico de status** -- Registrar quando mudou de status e por quem (audit trail). | Baixo |
| 10 | **Pagina publica com dados da empresa** -- A pagina publica nao mostra logo, nome da empresa, contato. Parece generica. | Medio |

### Plano de implementacao

**1. Corrigir bug critico: carregar itens na edicao**
- Em `useQuotes.ts`, alterar query principal para incluir `quote_items(*)` no select.

**2. Modal de visualizacao do orcamento**
- Criar `QuoteViewDialog.tsx` com layout profissional mostrando dados do cliente/prospect, itens separados por secao, totais, condicoes/termos.
- Conectar o botao `Eye` que ja esta importado mas nao utilizado na listagem.

**3. Geracao de PDF**
- Criar `QuotePDF.tsx` usando `jspdf` (ja instalado) + `html2canvas-pro` (ja instalado).
- Template com logo da empresa (via `useCompanySettings`), dados do cliente, tabela de itens, totais, condicoes.
- Botao "Baixar PDF" no dialog de visualizacao.

**4. Converter em OS**
- Botao "Gerar OS" visivel em orcamentos com status `aprovado`.
- Abre `ServiceOrderFormDialog` pre-preenchido com `customer_id`, itens do orcamento mapeados para `parts_used`, e valor total.

**5. Gerar conta a receber**
- Ao converter/aprovar, opcao de criar `financial_transaction` com type `receita`, valor do orcamento, cliente vinculado.

**6. Duplicar orcamento**
- Botao na listagem que cria novo orcamento como rascunho copiando todos os campos e itens.

**7. Expiracao automatica**
- Adicionar logica no `quotesQuery` ou no banco (trigger/cron) que marca orcamentos com `valid_until < today` e `status = 'enviado'` como `expirado`.

**8. Compartilhar via WhatsApp**
- Botao que abre `https://wa.me/?text=...` com mensagem formatada incluindo link publico.

**9. Pagina publica melhorada**
- Buscar `company_settings` para exibir logo, nome da empresa, telefone e endereco na pagina publica.

**10. Historico de status (opcional)**
- Tabela `quote_status_history` com `quote_id`, `old_status`, `new_status`, `changed_by`, `changed_at`.

### Ordem de prioridade sugerida
1. Bug dos itens na edicao (#7)
2. Visualizacao (#1) + PDF (#2) + Pagina publica melhorada (#9)
3. Converter em OS (#3) + Financeiro (#4)
4. Duplicar (#5) + WhatsApp (#8) + Expiracao (#6)
5. Historico (#10)

### Nenhuma alteracao de banco necessaria para itens 1-8
Exceto item 10 (historico) que precisaria de nova tabela, e item 6 (expiracao) que pode ser feito via trigger ou no frontend.

