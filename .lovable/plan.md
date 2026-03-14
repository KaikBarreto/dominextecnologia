

## Plano: Substituir UpdateBanner por Notificação de Versão no Dashboard + Melhorias Gerais

### 1. Remover o UpdateBanner fixo do topo

**Arquivo:** `src/App.tsx`
- Remover o import e o componente `<UpdateBanner />` do render global.

**Arquivo:** `src/components/pwa/UpdateBanner.tsx`
- Pode ser mantido mas não será mais usado (ou removido).

### 2. Criar hook `useVersionUpdate`

**Novo arquivo:** `src/hooks/useVersionUpdate.ts`

Lógica (baseada no EcoSistema):
- Ao montar, compara `localStorage.getItem('app_version')` com `APP_VERSION` de `config/version.ts`.
- Se a versão armazenada existir e for diferente da atual, e a notificação ainda não foi mostrada para essa versão (`notification_shown_version`), ativa `showUpdateNotification = true`.
- Salva `APP_VERSION` no localStorage.
- Expõe `dismissNotification()` para fechar.

### 3. Criar componente `VersionUpdateNotification`

**Novo arquivo:** `src/components/pwa/VersionUpdateNotification.tsx`

- Usa `useVersionUpdate` + `toast.custom()` do Sonner.
- Exibe um toast estilizado no `top-center` com:
  - Ícone `Sparkles` + título "Sistema Atualizado!"
  - Texto: "O Dominex foi atualizado para a versão X.X.X"
  - Botão "Ver Novidades" → navega para `/changelog`
  - Botão X para fechar
- Duração: 10 segundos, auto-dismiss.
- Renderiza `null` (componente invisível, só dispara o toast).

### 4. Integrar no AppLayout

**Arquivo:** `src/components/layout/AppLayout.tsx`
- Importar e renderizar `<VersionUpdateNotification />` dentro do layout autenticado (não na landing page nem no login).

### 5. Sugestões de melhorias adicionais

Além da tarefa principal, identifico estas oportunidades de melhoria que posso apresentar como sugestões após a implementação:

- **Tratamento de erros globais**: Feedback visual consistente em falhas de rede.
- **Empty states**: Vários módulos não têm empty states adequados (estoque, CRM, contratos).
- **Acessibilidade**: Faltam `aria-labels` em botões de ícone, skip-links, e focus trapping nos modais.
- **Performance**: Lazy loading de rotas com `React.lazy()` + `Suspense` para reduzir bundle inicial.
- **Validação de formulários**: Alguns formulários não têm feedback de erro inline.

