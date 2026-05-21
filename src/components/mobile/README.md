# Primitivos mobile-first

Componentes compartilhados que adaptam o layout via `useIsMobile()`. Props idênticas mobile/desktop.

- **StatCarousel** — Stats de listagem. Mobile: carrossel horizontal de chips. Desktop: grid auto-fit.
- **FilterSheet** — Filtros. Mobile: botão + sheet bottom com footer Limpar/Aplicar. Desktop: renderiza children inline.
- **MobilePageHeader** — Header de página. Mobile: 56px compacto. Desktop: delega para `PageHeader`.
- **FABButton** — Floating Action Button fixo (mobile, acima da bottom nav). Desktop: botão inline.
- **MobileListItem** — Linha estilo app nativo (leading/title/subtitle/trailing). Divisor automático.
- **EmptyState** — Tela vazia padrão com ícone, título, descrição e ação opcional.
