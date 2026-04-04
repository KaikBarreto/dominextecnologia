

# Plano v1.5.16 — Mega atualização

## 1. Correção CRÍTICA: Saldo dos funcionários (calculateEmployeeBalance)

**Problema**: A função `calculateEmployeeBalance` soma TODOS os movimentos históricos, ignorando que pagamentos+ajustes resetam o ciclo. Thiago mostra saldo R$ 814,29 quando deveria ser R$ 1.500,00.

**Solução**: Alterar `calculateEmployeeBalance` em `src/utils/employeeCalculations.ts` para considerar apenas movimentos APÓS o último `ajuste` (que representa o reset para salário base). Se houver um ajuste, somente movimentos após ele entram no cálculo.

```text
Lógica:
1. Encontrar o último "ajuste" na lista de movimentos (ordenado por data)
2. Se existir, usar balance_after do ajuste como base e somar apenas movimentos posteriores
3. Se não existir ajuste, manter lógica atual (salary + bonus - vales - faltas)
```

**Arquivo**: `src/utils/employeeCalculations.ts`

---

## 2. Sidebar: Nome da empresa + plano no topo

Abaixo do logo, exibir o nome da empresa e o badge do plano (ex: "Plano Master"). Dados vêm de `useCompanySettings` (nome) e de uma query à tabela `companies` (campo `subscription_plan`).

**Arquivo**: `src/components/layout/AppSidebar.tsx`
- Adicionar seção compacta entre o logo e o menu
- Quando collapsed, mostrar apenas um ícone ou ocultar

---

## 3. Tema no popover do usuário

Adicionar item "Tema" no popover do rodapé da sidebar com toggle claro/escuro inline (ícone Sol/Lua), usando a mesma lógica de `SettingsAppearanceContent`.

**Arquivo**: `src/components/layout/AppSidebar.tsx`

---

## 4. Central de Ajuda (Drawer lateral)

Adicionar item "Central de Ajuda" no popover (acima de Suporte). Ao clicar, abre um `Sheet` (drawer pela direita) com FAQ/dúvidas comuns sobre o sistema em formato accordion.

**Arquivos**:
- Novo: `src/components/layout/HelpCenterDrawer.tsx` — Sheet com Accordion de perguntas frequentes
- Editar: `src/components/layout/AppSidebar.tsx` — adicionar item e state

---

## 5. Registro de Falta: Sugestão de valor + opção DSR + banco de horas

### 5a. Sugestão de valor por hora
No modal de registrar falta (`EmployeeMovementModal`), quando `type === 'falta'`:
- Calcular horas diárias do funcionário: buscar `time_schedules` do employee → horas por dia útil. Fallback: `time_settings` da empresa. Fallback final: 176h/mês ÷ 22 = 8h.
- Valor sugerido = salário ÷ horas mensais × horas do dia
- Pré-preencher o campo valor com essa sugestão

### 5b. Opção de desconto (salário vs banco de horas)
Adicionar RadioGroup com 2 opções:
- **Descontar do salário** — registra como `falta` normal (desconta do saldo)
- **Descontar do banco de horas** — registra como `falta_banco` (não desconta do saldo financeiro, mas registra horas negativas no time tracking)

### 5c. DSR (Descanso Semanal Remunerado)
Quando a opção for "Descontar do salário":
- Checkbox "Aplicar perda de DSR" (ativado por padrão)
- Se ativado, o valor final = valor da falta × 2 (dia faltado + domingo perdido)
- Descrição automática inclui "Falta + DSR"

**Arquivos**:
- `src/components/employees/EmployeeMovementModal.tsx` — Props adicionais (employeeId, salary), RadioGroup, DSR checkbox, sugestão de valor
- `src/pages/Employees.tsx` — Passar employeeId e salary ao modal
- `src/utils/employeeCalculations.ts` — Helper para calcular valor-hora do funcionário

**Queries necessárias**: Buscar `time_schedules` e `time_settings` para calcular horas

---

## 6. Exportar extrato em HTML/PDF

Adicionar botão "Exportar" no modal de extrato do funcionário. Gera HTML formatado com os dados do extrato + botão "Salvar em PDF" (usa `window.print()`).

**Arquivo**: `src/components/employees/EmployeeExtract.tsx`
- Botão "Exportar" no header do modal
- Função que abre nova janela com HTML estilizado + `window.print()`

---

## 7. Landing Page: Novos planos de preço

Substituir os planos atuais (Starter/Pro/Enterprise) pelos planos reais:

| Plano | Preço | Módulos |
|-------|-------|---------|
| Essencial | R$ 200/mês | Módulo Básico, 5 usuários |
| Avançado | R$ 350/mês | Básico + Funcionários/RH + Financeiro Avançado |
| Master | R$ 650/mês | Básico + RH + CRM + NFe + Financeiro Avançado + Precificação Avançada + Portal do Cliente |
| Personalizado | Sob consulta | Todos os módulos + personalização |

**Arquivo**: `src/components/landing/PricingSection.tsx`

---

## 8. Versão 1.5.16

**Arquivo**: `src/config/version.ts`
- `APP_VERSION = "1.5.16"`
- `VERSION_NOTES` atualizado

---

## Correção manual de dados

Inserir movimentos de ajuste para os funcionários cujos saldos estão incorretos:
- **Rayellen**: salary 1.200, sem movimentos → OK (saldo = salary)
- **Ramon**: salary 3.500, vales 25.80 → saldo deveria ser 3.474,20 — a função corrigida resolverá automaticamente
- **Thiago**: A correção de código resolverá (último ajuste = 1.500, sem movimentos depois)
- **Diego**: Último ajuste = 3.200, sem movimentos depois do ajuste → OK

A correção de código no `calculateEmployeeBalance` resolverá todos os casos sem precisar inserir dados manuais.

---

## Resumo de arquivos

| Arquivo | Ação |
|---------|------|
| `src/utils/employeeCalculations.ts` | Corrigir calculateEmployeeBalance + helper valor-hora |
| `src/components/layout/AppSidebar.tsx` | Empresa+plano no topo, tema toggle, central de ajuda |
| `src/components/layout/HelpCenterDrawer.tsx` | Novo — drawer FAQ |
| `src/components/employees/EmployeeMovementModal.tsx` | Sugestão valor, DSR, banco de horas |
| `src/components/employees/EmployeeExtract.tsx` | Botão exportar HTML/PDF |
| `src/components/landing/PricingSection.tsx` | Novos planos |
| `src/pages/Employees.tsx` | Passar props adicionais ao modal de falta |
| `src/config/version.ts` | v1.5.16 |
| `src/components/admin/AdminSidebarNav.tsx` | Tema toggle + central ajuda (paridade) |

