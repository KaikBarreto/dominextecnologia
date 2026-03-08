

## Diagnóstico

A investigação revelou **dois problemas distintos** que causam as inconsistências:

### Problema 1: Usuário "Glacial Cold Brasil" sem `company_id`

O perfil desse usuário tem `company_id = NULL`. A tabela `contracts` filtra via `company_id = get_user_company_id(auth.uid())`, e como `NULL = NULL` é sempre falso em SQL, **nenhum contrato aparece** para ele. Já "Kaik Barreto" tem `company_id` preenchido corretamente.

**Correção:** Atribuir o `company_id` correto ao perfil de "Glacial Cold Brasil" (mesma empresa de Kaik Barreto).

### Problema 2: Políticas RLS inconsistentes em ~15 tabelas

Muitas tabelas usam `is_admin_or_gestor()` para gerenciamento, mas **não consideram** usuários com acesso total via permissões (como Glacial Cold Brasil, que não tem role mas tem 27+ permissões). Isso causa bloqueios silenciosos em várias telas.

**Tabelas afetadas (escrita/gerenciamento usa apenas `is_admin_or_gestor`):**
- `company_settings`
- `equipment_categories`
- `equipment_field_config`
- `financial_categories`
- `form_questions`
- `form_templates`
- `os_config`
- `os_required_fields`
- `os_sla_config`
- `os_statuses`
- `service_types`
- `proposal_templates`
- `profiles` (UPDATE de outros perfis)
- `inventory_movements` (INSERT admin)
- `technician_locations` (SELECT all)

**Tabelas já corrigidas** (usam `can_manage_users`): `user_permissions`, `user_roles`, `permission_presets`.

### Problema 3: Políticas duplicadas em `user_roles`

A tabela `user_roles` tem políticas antigas (`is_admin_or_gestor`) E novas (`can_manage_users`) lado a lado, criando confusão.

---

## Plano de implementação

### A. Corrigir company_id do usuário Glacial Cold Brasil
- UPDATE no perfil para atribuir `company_id = '478ee686-12dd-40a8-880a-a7375764a5a0'`

### B. Criar função SQL centralizada `can_manage_system`
Similar a `can_manage_users`, mas para gerenciamento geral do sistema:
```sql
CREATE FUNCTION public.can_manage_system(_user_id uuid) RETURNS boolean
-- Retorna true se: is_admin_or_gestor OR has_full_permissions OR has specific relevant permission
```

### C. Migração para atualizar RLS de todas as tabelas afetadas
Substituir `is_admin_or_gestor(auth.uid())` por `can_manage_system(auth.uid())` nas policies de escrita de:
- `company_settings`, `equipment_categories`, `equipment_field_config`, `financial_categories`, `form_questions`, `form_templates`, `os_config`, `os_required_fields`, `os_sla_config`, `os_statuses`, `service_types`, `proposal_templates`
- `profiles` (UPDATE de outros)
- `inventory_movements` (INSERT admin)
- `technician_locations` (SELECT all)

### D. Limpar políticas duplicadas em `user_roles`
Remover as políticas antigas que usam `is_admin_or_gestor`, mantendo apenas as `can_manage_users`.

### Arquivos/ações
1. **Data fix** (insert tool): UPDATE profile de Glacial Cold Brasil
2. **Migration SQL**: criar `can_manage_system()` + atualizar ~30 policies + limpar duplicatas

### Detalhe técnico
A função `can_manage_system` será `SECURITY DEFINER` e verificará:
- `is_admin_or_gestor(_user_id)` — role explícita
- `has_full_permissions(_user_id)` — 27+ permissões ativas
- Fallback: permissão específica `fn:manage_settings` para quem tem permissões granulares

Isso garante que **qualquer usuário com acesso total** tenha as mesmas capacidades de um admin/gestor em todas as telas, sem inconsistências.

