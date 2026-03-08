

## Plano: Correções e Melhorias (Foto Funcionário, Saldo, Extrato, Assinatura, Sessões, Cadastro, Admin)

### 1. Foto de Funcionário — upload/substituição no card

**Arquivo**: `src/components/employees/EmployeeCard.tsx`
- Adicionar um `<label>` com `<input type="file" hidden>` envolvendo o Avatar
- Overlay com ícone Camera ao hover (igual ao form)
- Ao selecionar arquivo: upload para `employee-photos` bucket, depois chamar `onUpdatePhoto(url)` callback

**Arquivo**: `src/pages/Employees.tsx`
- Adicionar prop `onUpdatePhoto` no EmployeeCard que chama `updateEmployee.mutate({ id, photo_url })`

---

### 2. Saldo do card não atualiza após movimentação

**Problema**: `balanceMap` em `Employees.tsx` (linha 47-53) calcula saldo com `[]` (movements vazio) para todos os funcionários — ignora movimentações reais.

**Solução**: Buscar todas as movimentações de todos os funcionários de uma vez. Modificar `useEmployeeMovements` para aceitar chamada sem filtro (buscar tudo), ou criar query separada.

**Arquivo**: `src/pages/Employees.tsx`
- Criar query `useQuery(['all-employee-movements'])` que busca todos os `employee_movements`
- Agrupar por `employee_id` e calcular `calculateEmployeeBalance` para cada
- Invalidar essa query junto com `employee-movements` quando uma movimentação é criada/deletada

**Arquivo**: `src/hooks/useEmployeeMovements.ts`
- No `onSuccess` de `addMovement` e `deleteMovement`, também invalidar `['all-employee-movements']`

---

### 3. Modal de Extrato — largura e paginação

**Arquivo**: `src/components/employees/EmployeeExtract.tsx`
- Passar `className="sm:max-w-[900px]"` ao `ResponsiveModal` para largura adequada
- Importar e usar `useDataPagination` + `DataTablePagination` para paginar movimentações (25 por padrão)
- Remover `max-h-[400px]` do container da tabela (paginação controla)

---

### 4. "Nenhuma empresa vinculada" na Assinatura

**Problema**: O usuário `kaikchaides123@gmail.com` não tem `company_id` no profile (não se registrou via self-register).

**Arquivo**: `src/pages/Billing.tsx`
- Melhorar fallback: se não há empresa, mostrar mensagem com CTA para "Vincular empresa" ou explicar que o admin precisa vincular
- Adicionar verificação alternativa: se `company_id` é null, tentar fallback buscando empresa pelo email

**Ação SQL (insert tool)**: Vincular o perfil do usuário à empresa correta (update `profiles` set `company_id`). Preciso verificar qual empresa pertence.

---

### 5. Sessões Ativas (estilo EcoSistema)

**Migração SQL**: Criar tabela `active_sessions`:
```sql
CREATE TABLE public.active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token text NOT NULL,
  device_info text,
  last_activity timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
-- RLS + realtime
```

**Criar**: `src/components/SessionConfirmDialog.tsx`
- Dialog/Drawer responsivo mostrando sessões ativas com ícone Desktop/Mobile
- Checkbox "Desconectar outros acessos ao entrar"
- Botões Cancelar / Continuar

**Criar**: `src/hooks/useForcedLogout.ts`
- Escuta realtime em `active_sessions` DELETE events
- Se a sessão atual é deletada, exibe toast e faz signOut
- Atualiza `last_activity` a cada 2 minutos

**Modificar**: `src/pages/Auth.tsx`
- Após login bem-sucedido, registrar sessão (insert em `active_sessions`)
- Verificar sessões ativas existentes do mesmo `user_id`
- Se existirem sessões recentes (<60min), mostrar `SessionConfirmDialog`
- Se checkbox marcado, deletar outras sessões ao confirmar
- Gerar `session_token` único e salvar em `localStorage`
- Funções auxiliares `generateSessionToken()` e `getDeviceInfo()`

**Modificar**: `src/contexts/AuthContext.tsx`
- No `signOut`, deletar sessão ativa atual

---

### 6. Remover CNPJ do cadastro (exceto link de venda)

**Arquivo**: `src/pages/Registration.tsx`
- Remover o campo CNPJ do step 1 (linhas 289-302)
- O campo será re-adicionado futuramente com flag `?venda=true`

---

### 7. Footer escuro na tela de cadastro

**Arquivo**: `src/pages/Registration.tsx` (linha 431)
- Alterar `<SystemFooter />` para `<SystemFooter variant="dark" />` para que o texto fique visível sobre fundo escuro

---

### 8. Criar usuário admin super_admin

**Ação**: Usar edge function `create-user` ou SQL insert tool para:
1. Criar auth user com email `dominextecnologia@gmail.com` e senha `Dominex2026.+-`
2. Criar profile com `full_name: 'Admin Dominex'`
3. Inserir role `super_admin` em `user_roles`

Isso será feito via edge function call ou insert tool após a implementação.

---

### Arquivos a Criar
- `src/components/SessionConfirmDialog.tsx`
- `src/hooks/useForcedLogout.ts`

### Arquivos a Modificar
- `src/components/employees/EmployeeCard.tsx` (upload foto)
- `src/pages/Employees.tsx` (saldo real + prop onUpdatePhoto)
- `src/components/employees/EmployeeExtract.tsx` (largura + paginação)
- `src/hooks/useEmployeeMovements.ts` (invalidar all-employee-movements)
- `src/pages/Billing.tsx` (fallback melhor)
- `src/pages/Auth.tsx` (sessões ativas)
- `src/contexts/AuthContext.tsx` (cleanup sessão no signOut)
- `src/pages/Registration.tsx` (remover CNPJ, footer dark)

### Migrações SQL
1. Tabela `active_sessions` com RLS e realtime

### Data Operations (insert tool)
1. Vincular profile do usuário à empresa (se possível identificar)
2. Criar admin user `dominextecnologia@gmail.com` com role `super_admin`

