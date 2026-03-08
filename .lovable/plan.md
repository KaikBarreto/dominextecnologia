
Objetivo: corrigir o deslocamento vertical da sidebar (aparecendo “lá embaixo”) e ajustar o comportamento no modo collapsed para que, ao clicar em item pai (ex.: Operacional/Gestão), a sidebar expanda já com os subitens abertos.

1) Diagnóstico do deslocamento (causa raiz)
- Arquivo: `src/components/layout/AppSidebar.tsx`
- Hoje a sidebar é renderizada com:
  - `<Sidebar ... className="... relative h-svh">`
- O componente base `Sidebar` (`src/components/ui/sidebar.tsx`) já aplica `position: fixed` internamente no container desktop.
- Como `className` é injetado no mesmo nó e contém `relative`, ocorre conflito de utilitários de posição; em Tailwind, `relative` pode sobrescrever `fixed`.
- Efeito prático: a sidebar sai do fluxo fixo e passa a ser posicionada no fluxo normal, ficando deslocada para baixo.

2) Correção do posicionamento (sem alterar layout expandido)
- Em `AppSidebar.tsx`:
  - Remover `relative` do `className` passado para `<Sidebar>`.
  - Manter apenas classes visuais/altura/borda necessárias (`border`, `bg`, `h-svh`).
- Para não perder o posicionamento do botão toggle (que hoje depende de `absolute`):
  - Criar um wrapper interno com `relative h-full` envolvendo `SidebarContent` + botão toggle.
  - Assim o botão continua “na borda” da sidebar, mas sem quebrar o `fixed` do container principal.
- Resultado esperado: sidebar volta a ficar ancorada no topo da viewport, ocupando a altura inteira, sem “descer” na página.

3) Comportamento do collapsed para itens pai
- Estado atual (collapsed): clicar em pai apenas chama `toggleSidebar()`.
- Ajuste:
  - Criar handler específico para item pai no collapsed, ex.:
    - adiciona o título do grupo em `openMenus` (se não existir);
    - depois chama `toggleSidebar()`.
- Aplicar esse handler nos botões de grupo (`item.children`) no bloco collapsed.
- Resultado esperado:
  - Clique em “Operacional”/“Gestão” no collapsed => sidebar expande e o grupo já aparece aberto com subitens visíveis.

4) Preservações obrigatórias
- Não alterar menu expandido atual (visual e estrutura).
- Não mostrar subitens no collapsed (continua somente ícones de itens pai).
- Não mexer em rotas, permissões (`filterByAccess`) e menu de super admin.
- Não alterar backend/banco (não é necessário).

5) Validação após implementação
- Sidebar desktop inicia no topo (sem deslocamento vertical) em qualquer rota com scroll.
- Collapse/expand mantém transição normal.
- No collapsed:
  - aparecem apenas ícones dos itens pai;
  - clicar em item pai expande sidebar e abre seus subitens.
- Itens simples (sem filhos) continuam navegando normalmente.
- Botão de toggle continua na borda direita da sidebar.

Detalhes técnicos (resumo)
- Arquivo principal: `src/components/layout/AppSidebar.tsx`
- Ajustes-chave:
  - remover `relative` do `className` do `<Sidebar>`
  - introduzir wrapper interno `relative`
  - adicionar `handleCollapsedParentClick(groupTitle)`
  - usar esse handler nos botões de grupos no collapsed
