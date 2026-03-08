

## Plano: CEP no Cadastro de Cliente, Sessões, Soft Delete de Cliente

### 1. Integrar CepLookup no formulário de cliente

**Arquivo**: `src/components/customers/CustomerFormDialog.tsx`
- Substituir o campo CEP simples (linha 242-248) pelo componente `CepLookup` existente
- No `onAddressFound`, preencher automaticamente `address` (logradouro), `city`, `state` via `form.setValue()`
- Manter campos editáveis após preenchimento automático

### 2. Soft Delete de Clientes

**Problema**: `service_orders.customer_id` tem FK com `RESTRICT` — impede exclusão quando há OS vinculada.

**Migração SQL**:
- Adicionar coluna `is_deleted boolean DEFAULT false` e `deleted_at timestamptz` na tabela `customers`
- Não alterar a FK — manter integridade referencial

**Arquivo**: `src/hooks/useCustomers.ts`
- Alterar `deleteCustomer` para fazer UPDATE (`is_deleted = true, deleted_at = now()`) em vez de DELETE
- Alterar query de listagem para filtrar `is_deleted = false`

**Arquivo**: `src/pages/Customers.tsx`
- O erro de FK desaparece pois não tentamos mais DELETE
- A mensagem de sucesso continua "Cliente excluído com sucesso"

**Resultado**: Cliente "desaparece" da listagem, mas o histórico de OS continua mostrando o nome do cliente normalmente.

### 3. Corrigir Sessões Ativas (login)

**Problema atual**: O fluxo de sessão usa `as any` para contornar tipos e pode ter race conditions. A lógica no `Auth.tsx` está correta em estrutura mas precisa de ajustes:

**Arquivo**: `src/pages/Auth.tsx`
- No `handleSessionContinue`: após o usuário confirmar, re-autenticar (pois a sessão auth já existe), registrar nova sessão e DEPOIS desconectar as outras (se checkbox marcado) — mesma ordem da EcoSistema
- No `handleSessionCancel`: chamar `supabase.auth.signOut()` para limpar a sessão auth que foi criada durante a verificação
- Garantir que a navegação para `/dashboard` aconteça APÓS o registro da sessão

**Arquivo**: `src/hooks/useForcedLogout.ts`
- Já está correto — monitora DELETE em `active_sessions` e faz signOut se a sessão atual é removida

**Arquivo**: `src/contexts/AuthContext.tsx`
- Já limpa sessão no signOut — correto

O principal ajuste é garantir que `handleLogin` não navegue antes de registrar a sessão, e que o dialog funcione sem ficar preso.

### Arquivos a Modificar
- `src/components/customers/CustomerFormDialog.tsx` (integrar CepLookup)
- `src/hooks/useCustomers.ts` (soft delete)
- `src/pages/Auth.tsx` (corrigir fluxo de sessão)

### Migração SQL
1. Adicionar `is_deleted` e `deleted_at` na tabela `customers`

