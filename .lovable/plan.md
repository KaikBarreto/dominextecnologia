

# Plano: Auto-criar usuário ao cadastrar funcionário + Opção de exclusividade em tipos de resposta múltiplos

## 1. Auto-criar usuário ao criar funcionário

### Abordagem
Quando o admin cria um funcionário com **email** preenchido, automaticamente chamar a edge function `create-user` para criar um usuário no sistema com role `tecnico` e senha temporária gerada.

### Mudanças

**`src/pages/Employees.tsx`** — Alterar `handleCreateOrUpdate`:
- Após `createEmployee.mutate` com sucesso, se o funcionário tem email, chamar a edge function `create-user` com:
  - `email`: email do funcionário
  - `password`: senha temporária (ex: primeiros 6 dígitos do CPF ou gerar aleatória)
  - `full_name`: nome do funcionário
  - `phone`: telefone do funcionário
  - `role`: `'tecnico'`
- Exibir toast com a senha temporária gerada para o admin anotar
- Vincular o `user_id` retornado ao funcionário (requer coluna `user_id` na tabela `employees`)

**Migration SQL** — Adicionar coluna `user_id` à tabela `employees`:
```sql
ALTER TABLE public.employees ADD COLUMN user_id uuid REFERENCES auth.users(id);
```

**`src/hooks/useEmployees.ts`** — Adicionar `user_id` ao tipo `Employee`

**`src/components/employees/EmployeeFormDialog.tsx`** — Adicionar toggle/checkbox "Criar acesso ao sistema" (visível apenas na criação, quando email estiver preenchido). Adicionar campo de senha opcional (com geração automática).

**`src/pages/Employees.tsx`** — Na função `handleCreateOrUpdate`, após criar o employee com sucesso:
1. Se "criar acesso" está ativado e tem email
2. Gerar senha aleatória de 8 chars
3. Chamar edge function `create-user`
4. Atualizar o employee com o `user_id` retornado
5. Mostrar toast/modal com email + senha temporária

---

## 2. Opção de exclusividade entre tipos de resposta

### Problema atual
Quando uma pergunta tem 2+ tipos de resposta, ao responder por um tipo os outros são ocultados automaticamente (comportamento fixo "uma anula a outra"). O usuário quer poder escolher se os tipos são **exclusivos** (um anula o outro) ou **cumulativos** (pode responder ambos).

### Mudanças

**Migration SQL** — Adicionar coluna `answer_mode` à tabela `form_questions`:
```sql
ALTER TABLE public.form_questions ADD COLUMN answer_mode text DEFAULT 'exclusive';
-- 'exclusive' = uma resposta anula as outras
-- 'combined' = pode responder por múltiplas formas
```

**`src/pages/QuestionnaireDetail.tsx`**:
- Quando `selectedAnswerTypes.length >= 2`, mostrar toggle/radio:
  - "Exclusivo: responder por um tipo oculta os demais"
  - "Cumulativo: o técnico pode responder por múltiplas formas"
- Salvar no campo `answer_mode` ao criar/editar pergunta
- Exibir badge na listagem: "Exclusivo" ou "Cumulativo"

**`src/components/technician/DynamicFormQuestions.tsx`**:
- Ler `answer_mode` de cada question
- Se `exclusive`: comportamento atual (oculta os outros ao responder)
- Se `combined`: renderiza todos os tipos sempre visíveis, sem ocultar

**`src/types/database.ts`** — Atualizar tipo `FormQuestion` com `answer_mode`

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---|---|
| Migration SQL | Adicionar `user_id` em employees + `answer_mode` em form_questions |
| `src/hooks/useEmployees.ts` | Adicionar `user_id` ao tipo |
| `src/components/employees/EmployeeFormDialog.tsx` | Toggle "Criar acesso" + campo senha |
| `src/pages/Employees.tsx` | Lógica de chamar create-user após criar employee |
| `src/pages/QuestionnaireDetail.tsx` | Toggle exclusivo/cumulativo quando 2+ tipos |
| `src/components/technician/DynamicFormQuestions.tsx` | Respeitar `answer_mode` |

