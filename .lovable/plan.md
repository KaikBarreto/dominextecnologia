
# Plan: Correções do Módulo BDI e Melhorias de UI

## Diagnóstico dos Problemas

### 1. Erro ao Adicionar Material
**Causa**: A coluna `subtotal` na tabela `service_materials` é **GENERATED** (`purchase_price * quantity`), não pode receber valores diretamente.
**Solução**: Remover `subtotal` dos payloads de INSERT/UPDATE em `useServiceMaterials.ts`.

### 2. Preço Unitário Zerado em Serviços  
**Causa**: Não há registro em `service_costs` para o tipo de serviço "Instalação", então todos os custos vêm como 0.
**Solução**: É necessário configurar os custos em **Serviços → Custos** primeiro. Adicionarei feedback visual indicando quando um serviço não tem custos configurados.

### 3. Coluna `labor_cost` também é GENERATED
A tabela `service_costs` possui `labor_cost` como coluna gerada (`hourly_rate * hours`). Verificar que o hook não tenta inserir esse valor.

---

## Implementações

### A) Fix: useServiceMaterials.ts
Remover campo `subtotal` das operações de insert/update (é coluna computada).

### B) Fix: useServiceCosts.ts  
Remover campo `labor_cost` das operações (é coluna computada).

### C) BDI Summary Card - Estilo Dark Gradient
Aplicar:
- Background: gradiente escuro (`from-slate-900 via-slate-800 to-slate-900`)
- Textos: brancos
- Ícones: brancos
- Badges: outline claro

### D) Modal "Calcular" em Mão de Obra
Novo componente `LaborCalculatorModal.tsx`:
- Inputs: Salário mensal do funcionário, Horas/mês trabalhadas
- Cálculo: Custo/hora = Salário ÷ Horas/mês
- Botão "Aplicar" preenche o campo custo/hora automaticamente

### E) Modal de Custos Extras
Novo componente `ExtraCostModal.tsx`:
- Tipos pré-definidos: Carro, Ferramentas, Equipamentos, EPI, Combustível, Outros
- Campo descrição customizada quando "Outros"
- Campo valor
- Botão adicionar

### F) Feedback em Orçamentos
Quando serviço não tem custos configurados:
- Mostrar badge de aviso: "Sem custos configurados"
- Sugerir ir para Serviços → Custos

---

## Arquivos Modificados/Criados

| Arquivo | Ação |
|---------|------|
| `src/hooks/useServiceMaterials.ts` | Remover `subtotal` do payload |
| `src/hooks/useServiceCosts.ts` | Remover `labor_cost` do payload |
| `src/components/quotes/BDISummaryCard.tsx` | Estilo dark gradient |
| `src/components/service-orders/LaborCalculatorModal.tsx` | **Novo** - Modal cálculo HH |
| `src/components/service-orders/ExtraCostModal.tsx` | **Novo** - Modal custos extras |
| `src/components/service-orders/ServiceCostsTab.tsx` | Integrar modais |
| `src/components/quotes/QuoteFormDialog.tsx` | Feedback serviço sem custo |
