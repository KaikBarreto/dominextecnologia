
Objetivo: resolver definitivamente (1) overflow horizontal na tela de Clientes no mobile e (2) erro de RLS ao editar permissões de usuário.

Do I know what the issue is? Sim.

1) Diagnóstico consolidado

- Clientes (mobile): o layout ainda “vaza” horizontalmente em cenários específicos e o conteúdo da área de ações fica cortado (ex.: botão “Excluir”). Hoje existem `overflow-hidden` em pontos que acabam mascarando/recortando o problema em vez de impedir a expansão.
- Permissões de usuário: a UI permite gerenciamento para quem tem `fn:manage_users` (ou acesso total), mas as policies de `user_permissions`/`user_roles` ainda aceitam basicamente `admin/gestor`. Resultado: `upsert`/`update` dispara “new row violates row-level security policy”.

2) Plano de implementação

A. Blindar largura global da aplicação (viewport containment)
- Ajustar `src/index.css` para garantir:
  - `html, body, #root { width: 100%; max-width: 100vw; overflow-x: clip/hidden; }`
- Ajustar wrappers de layout em `src/components/layout/AppLayout.tsx`:
  - adicionar `min-w-0 max-w-full` nos containers de topo/inset/main para impedir que filhos forcem largura maior que a viewport.

B. Corrigir layout da tela Clientes para não cortar ações
- Arquivo: `src/pages/Customers.tsx`
- Mudanças:
  - manter container principal com `w-full max-w-full min-w-0`.
  - remover/evitar `overflow-hidden` em pontos que cortam conteúdo útil do card.
  - no card mobile:
    - reforçar `min-w-0` em blocos de texto.
    - ações em linha resiliente: `w-full flex flex-wrap gap-2` com botões que não “escapem”.
    - botões “Editar/Excluir” com comportamento responsivo (ex.: `flex-1 sm:flex-none`, `min-w-0`) para nunca ficarem truncados fora da tela.
  - garantir truncamento consistente de textos longos (nome/empresa/email/documento).

C. Corrigir RLS para alinhar backend com regra já usada na UI
- Criar migration SQL:
  1. Função `public.can_manage_users(_user_id uuid)` (`SECURITY DEFINER`, `stable`) retornando true quando:
     - `is_admin_or_gestor(_user_id)` OR
     - permissões ativas contêm `fn:manage_users` OR
     - `has_full_permissions(_user_id)`.
  2. Atualizar policy de `public.user_permissions` (ALL) para usar `can_manage_users(auth.uid())` em `USING` e `WITH CHECK`.
  3. Atualizar policies de escrita em `public.user_roles` (INSERT/UPDATE/DELETE) para `can_manage_users(auth.uid())` (mantendo bootstrap do primeiro admin intacto).
  4. (Recomendado para consistência) atualizar `permission_presets` para mesma regra, já que a tela de usuários mexe em cargos/perfis.
- Resultado: quem tem permissão real de gerenciar usuários para de cair em RLS violation.

D. Alinhar funções de backend com a nova regra centralizada
- Arquivos:
  - `supabase/functions/create-user/index.ts`
  - `supabase/functions/manage-user/index.ts`
- Substituir checagem duplicada hardcoded (admin/gestor + length>=27) por chamada central à regra única (`can_manage_users`) para evitar divergência futura entre UI, RLS e funções.

3) Validação pós-implementação

- Mobile (390x844 e 360x800) em `/clientes`:
  - sem scroll horizontal da página;
  - card com margens corretas;
  - botões Editar/Excluir 100% visíveis.
- Fluxo de permissões:
  - usuário com `fn:manage_users` consegue salvar edição sem erro de RLS.
  - usuário sem permissão continua bloqueado.
- Regressão:
  - criação/edição de usuário e vínculo com funcionário continuam funcionando.

4) Arquivos previstos

- `src/index.css`
- `src/components/layout/AppLayout.tsx`
- `src/pages/Customers.tsx`
- `supabase/migrations/<new_migration>.sql`
- `supabase/functions/create-user/index.ts`
- `supabase/functions/manage-user/index.ts`

5) Detalhe técnico (resumo)

- Causa raiz do erro de permissões: mismatch entre autorização da UI e policies RLS.
- Causa raiz do mobile: combinação de containers flex + conteúdo com largura mínima implícita + recorte por `overflow-hidden`.
- Estratégia: centralizar autorização em função SQL única + reforçar constraints de largura no layout base e no card mobile.
