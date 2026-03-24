

# Análise: O que falta no módulo Financeiro

## O que já existe (bem implementado)
- CRUD de receitas e despesas com categorias customizáveis
- Visão geral com gráfico de pizza por categoria
- Contas a pagar/receber com alertas de vencimento
- DRE com classificação por dre_group (impostos, CMV, OPEX)
- Categorias com ícones/cores, sistema de seed por tenant
- Recorrência em contas (semanal, mensal, anual)
- Exclusão em massa, filtro por período, paginação
- Exportação do DRE em HTML

---

## O que falta — Funcionalidades

### 1. Fluxo de Caixa mensal (gráfico de barras)
O componente `DashboardCashFlow` já existe no Dashboard, mas **não existe dentro do módulo Financeiro**. A Visão Geral deveria ter um gráfico de barras entradas vs saídas por mês, não só o pizza de categorias.

### 2. Anexo de comprovantes
A tabela já tem `receipt_url` mas **o formulário não permite upload de comprovante/nota fiscal**. Falta:
- Campo de upload de arquivo no `TransactionFormDialog`
- Visualização do comprovante na listagem (ícone clicável)
- Bucket de storage para comprovantes financeiros

### 3. Exportação de dados
- Exportar listagem de transações em **CSV/Excel**
- Exportar relatório de contas a pagar/receber

### 4. Método de pagamento
- Campo para registrar **forma de pagamento** (PIX, boleto, cartão, dinheiro, transferência)
- Filtro por método de pagamento na listagem

### 5. Centro de custo / Conta bancária
- Poder categorizar transações por **conta bancária** (Caixa, Banco X, Banco Y)
- Saldo por conta
- Transferências entre contas

### 6. Parcelamento
- Ao criar uma despesa/receita, permitir **parcelar em N vezes**
- Gerar automaticamente N transações com vencimentos mensais
- Agrupar parcelas visualmente (ex: "2/6")

### 7. Notas / Observações visíveis
- O campo `notes` existe na tabela mas **não aparece no formulário nem na listagem**

---

## O que falta — UI/UX

### 8. Gráfico de evolução na Visão Geral
- Linha temporal mostrando evolução do saldo ao longo do tempo
- Cards de "A Pagar" e "A Receber" na visão geral (existem no summary mas não como cards clicáveis)

### 9. Indicadores de tendência
- Comparação com período anterior (ex: "receitas +12% vs mês passado")
- Seta de tendência nos cards de resumo

### 10. Filtro por categoria na listagem
- Além da busca textual, ter um **dropdown de filtro por categoria**
- Filtro por status (pago/pendente) nas abas de receitas e despesas

### 11. Valor formatado no input
- O campo de valor usa `type="number"` — deveria usar **máscara monetária** (R$ 1.234,56)

### 12. Vinculação visível com OS/Contrato/Cliente
- Na listagem, mostrar badges linkáveis para OS, contrato ou cliente vinculado
- Poder filtrar por cliente

### 13. Confirmação de pagamento mais rica
- Ao marcar como pago, permitir informar **data do pagamento** e **método** (hoje marca com data atual automaticamente)

---

## Priorização sugerida (impacto x esforço)

| Prioridade | Item | Esforço |
|------------|------|---------|
| Alta | Fluxo de caixa na visão geral | Baixo |
| Alta | Anexo de comprovantes | Médio |
| Alta | Parcelamento | Médio |
| Alta | Máscara monetária no input | Baixo |
| Alta | Campo de notas no formulário | Baixo |
| Média | Filtro por categoria | Baixo |
| Média | Exportação CSV | Baixo |
| Média | Método de pagamento | Médio |
| Média | Indicadores de tendência | Médio |
| Baixa | Centro de custo / contas bancárias | Alto |
| Baixa | Transferências entre contas | Alto |

---

## Plano de implementação

Posso implementar em ordem de prioridade. Sugiro começar pelo bloco de **quick wins** (fluxo de caixa, máscara monetária, notas, filtro por categoria) e depois partir para os médios (comprovantes, parcelamento, método de pagamento).

Qual bloco você quer que eu implemente primeiro?

