

## Plano: CEP Lookup + Logo Upload aprimorado + Módulo Funcionários

### 1. CEP Lookup nos Dados da Empresa

**Criar edge function** `supabase/functions/cep-lookup/index.ts`
- Consulta a API ViaCEP (`https://viacep.com.br/ws/{cep}/json/`)
- Retorna logradouro, bairro, cidade, UF
- CORS headers padrão

**Criar componente** `src/components/CepLookup.tsx`
- Input com máscara `00000-000`, botão de busca com ícone `Search`
- Auto-busca ao digitar 8 dígitos
- Chama edge function `cep-lookup`
- Callback `onAddressFound` preenche campos de endereço

**Modificar** `src/pages/Settings.tsx` (aba Empresa)
- Substituir campos de endereço individual por fluxo estruturado:
  - Campo CEP com `CepLookup` → ao encontrar, preenche automaticamente logradouro, bairro, cidade, estado
  - Campos: CEP, Logradouro, Número, Complemento, Bairro, Cidade, Estado
- Adaptar `handleSaveCompany` para montar endereço completo a partir dos campos estruturados

**Migração DB**: Adicionar colunas `neighborhood` e `complement` na tabela `company_settings` (ou armazenar no campo `address` concatenado).

---

### 2. Logo Upload/Substituição/Remoção estilo EcoSistema

**Modificar** `src/pages/Settings.tsx` (seção logo na aba Empresa)
- Se logo existe: exibir imagem com preview clicável + botões "Substituir" e "Remover"
- Se não existe: área de upload com borda tracejada, ícone de upload e texto "Nenhum logo enviado"
- Botão "Remover" abre `AlertDialog` de confirmação antes de deletar
- Ao substituir: deletar logo antigo do storage antes de fazer upload do novo
- Validação: tipo de arquivo (image/*), tamanho máximo 5MB

---

### 3. Módulo Funcionários Completo

#### 3a. Banco de Dados (migrações)

**Criar tabela `employees`:**
- `id` uuid PK
- `name` text NOT NULL
- `cpf` text
- `phone` text
- `email` text
- `position` text (cargo)
- `salary` numeric
- `hire_date` date
- `address` text
- `pix_key` text
- `photo_url` text
- `created_at`, `updated_at` timestamps
- RLS: authenticated users can CRUD

**Criar tabela `employee_movements`:**
- `id` uuid PK
- `employee_id` uuid FK → employees
- `type` text (vale, bonus, falta, pagamento, ajuste)
- `amount` numeric
- `balance_after` numeric
- `description` text
- `payment_method` text (dinheiro, pix)
- `payment_details` jsonb
- `created_by` uuid
- `created_at` timestamp
- RLS: authenticated users can CRUD

**Criar bucket** `employee-photos` (public)

#### 3b. Utilitários e Hooks

**Criar** `src/utils/employeeCalculations.ts`
- `calculateEmployeeBalance(movements, salary)` — calcula totais de vales, bônus, faltas e saldo atual
- `recalculateBalances(movements, salary)` — recalcula `balance_after` após exclusão
- `formatMovementType()` e `getMovementBadgeVariant()`

**Criar hooks:**
- `src/hooks/useEmployeeMovements.ts` — query movimentações por employee_id
- `src/hooks/useEmployeeBalance.ts` — combina employee data + movements → calcula saldo
- `src/hooks/useEmployeeMetrics.ts` — métricas agregadas para dashboard (total, folha, média, gráficos)

#### 3c. Componentes

**Criar** `src/components/employees/EmployeeCard.tsx`
- Card com avatar, nome, cargo, salário, saldo atual (verde/vermelho)
- Info de contato (telefone, email, endereço, data admissão)
- Botões de ação: Vale, Bônus, Falta, Pagamento
- Botão "Ver Extrato" com destaque
- Botão editar/excluir com confirmação

**Criar** `src/components/employees/EmployeeFormDialog.tsx`
- Formulário com react-hook-form + zod
- Upload de foto com avatar preview
- Campos: nome*, CPF (máscara), telefone, email, cargo, salário* (máscara R$), data admissão, endereço, chave PIX
- Ao editar salário, criar movimentação de ajuste automaticamente

**Criar** `src/components/employees/EmployeeMovementModal.tsx`
- Modal para registrar Vale, Bônus ou Falta
- Exibe saldo atual do funcionário
- Campo de valor com máscara de moeda
- Campo de descrição opcional
- Para Vale: seleção de forma de pagamento (Dinheiro/PIX) — simplificado (sem integração com caixa, diferente da EcoSistema)

**Criar** `src/components/employees/EmployeePaymentModal.tsx`
- Modal de pagamento com resumo: salário + bônus - vales - faltas = valor a pagar
- Campo para ajustar desconto de vales
- Forma de pagamento (Dinheiro/PIX)
- Ao confirmar: cria movimentação "pagamento" zerando saldo, depois "ajuste" resetando para salário

**Criar** `src/components/employees/EmployeeExtract.tsx`
- Dialog/modal com extrato completo do funcionário
- Resumo: cards de Bônus, Vales, Faltas, Saldo Atual
- Tabela de movimentações com data, tipo (badge colorido), descrição, valor, saldo, ação de excluir
- Paginação
- Ao excluir: recalcula balances de todas as movimentações restantes

**Criar** `src/components/employees/EmployeesDashboard.tsx`
- Cards: Total Funcionários, Folha Salarial, Salário Médio, Saldo Total
- Gráfico de barras: movimentações por tipo/mês (recharts)
- Gráfico de pizza: distribuição por cargo
- Gráfico de área: evolução da folha

#### 3d. Página e Roteamento

**Criar** `src/pages/Employees.tsx`
- Usa `SettingsSidebarLayout` com 2 abas: "Funcionários" e "Dashboard"
- Busca por nome/cargo, ordenação (mais antigo, mais novo, A-Z)
- Grid de cards (1-3 colunas responsivo)
- Botão "Novo Funcionário"

**Modificar** `src/App.tsx` — adicionar rota `/funcionarios`

**Modificar** `src/components/layout/AppSidebar.tsx` — adicionar item "Funcionários" com ícone `Briefcase`

**Modificar** `src/components/layout/TopbarLayout.tsx` — adicionar item correspondente

**Modificar** `src/components/layout/MobileNav.tsx` (se existir) — adicionar item

---

### Arquivos a Criar
- `supabase/functions/cep-lookup/index.ts`
- `src/components/CepLookup.tsx`
- `src/utils/employeeCalculations.ts`
- `src/hooks/useEmployeeMovements.ts`
- `src/hooks/useEmployeeBalance.ts`
- `src/hooks/useEmployeeMetrics.ts`
- `src/components/employees/EmployeeCard.tsx`
- `src/components/employees/EmployeeFormDialog.tsx`
- `src/components/employees/EmployeeMovementModal.tsx`
- `src/components/employees/EmployeePaymentModal.tsx`
- `src/components/employees/EmployeeExtract.tsx`
- `src/components/employees/EmployeesDashboard.tsx`
- `src/pages/Employees.tsx`

### Arquivos a Modificar
- `src/pages/Settings.tsx` (CEP lookup + logo upload aprimorado)
- `src/App.tsx` (rota)
- `src/components/layout/AppSidebar.tsx` (menu)
- `src/components/layout/TopbarLayout.tsx` (menu)

### Migrações SQL
1. Tabelas `employees` e `employee_movements` com RLS
2. Bucket `employee-photos`

