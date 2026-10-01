# Primitivos mobile-first

Componentes compartilhados que adaptam o layout via `useIsMobile()`. Props idênticas mobile/desktop.

- **StatCarousel** — Stats de listagem. Mobile: carrossel horizontal de chips. Desktop: grid auto-fit.
- **FilterSheet** — Filtros. Mobile: botão + sheet bottom com footer Limpar/Aplicar. Desktop: renderiza children inline. `triggerClassName` alinha a altura do gatilho com a toolbar (`h-10`).
- **MobileListToolbar** — Toolbar das listagens no mobile: busca sozinha na 1ª linha, filtros/ações na 2ª (`children`) e alternador de visualização encostado à direita (`trailing`). Regras de uso no topo do arquivo.
- **MobilePageHeader** — Header de página. Mobile: 56px compacto. Desktop: delega para `PageHeader`.
- **FABButton** — Floating Action Button fixo (mobile, acima da bottom nav). Desktop: botão inline.
- **MobileListItem** — Linha estilo app nativo (leading/title/subtitle/trailing). Divisor automático.
- **EmptyState** — Tela vazia padrão com ícone, título, descrição e ação opcional.
