

## Plano: Portar EcoFlix → Domiflix

### Escopo
Replicar 100% o módulo EcoFlix do projeto EcoSistema para este projeto, renomeando para **Domiflix**, mantendo logo Dominex (já existe em `src/assets/`) onde a marca aparece. Toda a lógica, telas, banco e admin permanecem idênticos.

### 1. Banco de dados (migration única)
Criar tabelas com prefixo `domiflix_` (espelhando ecoflix):
- `domiflix_titles` (séries / lives)
- `domiflix_seasons`
- `domiflix_episodes`
- `domiflix_user_progress` (progresso por usuário)
- `domiflix_watchlist` (minha lista)
- `domiflix_user_preferences` (avatar URL, display name)
- `domiflix_sections` + `domiflix_section_titles` (curadoria de carrosséis)
- Trigger `update_updated_at_column` nas tabelas relevantes
- Seed inicial de 2 seções: "Módulos" e "Lives"
- RLS: leitura para `authenticated`, gestão para `super_admin`/`admin`

### 2. Storage
- Bucket público novo `domiflix-thumbnails` (capas de títulos/episódios) com RLS para upload por admins.

### 3. Assets a copiar do EcoSistema
- Fontes Netflix Sans (4 .otf) → `src/assets/fonts/`
- `ecoflix-intro.mp3` → `src/assets/domiflix-intro.mp3`
- Ícones do player (`src/assets/ecoflix/*.svg`) → `src/assets/domiflix/`
- Substituir `ecoflix-logo*` pelo logo Dominex existente (`src/assets/logo-*`)

### 4. Hooks (copiar/renomear `EcoFlix` → `Domiflix`)
- `useDomiflix.ts` (titles, episódios, progresso, watchlist)
- `useDomiflixAvatar.ts`
- `useDomiflixDisplayName.ts`
- `useDomiflixPreferences.ts`
- `useDomiflixSections.ts`
- `lib/domiflixIntroSound.ts`
- `lib/slugify.ts` (se ainda não existir)

### 5. Componentes (`src/components/domiflix/`)
- `DomiflixLayout.tsx` (header full-screen, search, avatar, footer)
- `DomiflixHero.tsx` (banner do destaque)
- `DomiflixCarousel.tsx`
- `DomiflixCard.tsx`
- `DomiflixPlayer.tsx`
- `DomiflixSearchResults.tsx`
- `DomiflixFooter.tsx`
- `DomiflixSkeletons.tsx`
- `PlayerIcons.tsx`

### 6. Páginas
- `src/pages/Domiflix.tsx` (home — antiga `Tutoriais.tsx` do Eco)
- `src/pages/DomiflixTitle.tsx`
- `src/pages/DomiflixWatch.tsx`
- `src/pages/DomiflixMinhaLista.tsx`
- `src/pages/DomiflixAvatarPicker.tsx`
- **Admin**: `src/pages/admin/AdminDomiflix.tsx` + `src/components/admin/AdminDomiflixSections.tsx` (gestão de títulos, temporadas, episódios e seções com drag-and-drop)

### 7. Roteamento (`App.tsx`)
Novas rotas em layout independente (full-screen, sem AppSidebar):
- `/domiflix` (index)
- `/domiflix/minha-lista`
- `/domiflix/perfil`
- `/domiflix/:titleSlug`
- `/domiflix/assistir/:titleSlug/:episodeNumber`
- `/admin/domiflix` (dentro do AdminLayout existente)
- Redirect legado: `/tutoriais` → `/domiflix`

### 8. Permissões e Menu
- Adicionar permissão de tela `screen_domiflix` (ou reutilizar mecanismo atual)
- Item "Domiflix" no menu lateral (`AppSidebar`) substituindo/somando ao "Tutoriais"
- Item "Domiflix" no `AdminSidebarNav` (rota admin)
- Atualizar `usePageTitle.ts` com títulos das novas rotas
- Adicionar em `CommandPalette` se existir

### 9. Marca
- "EcoFlix" → "Domiflix" em todo texto/UI
- Logo: usar `src/assets/logo-horizontal-light.png` (ou equivalente Dominex) onde aparecia logo do EcoFlix
- Fonte Netflix Sans aplicada via `index.css` (escopada para rotas Domiflix com classe wrapper)
- Cor de fundo preta padrão Netflix mantida; CTAs em teal Dominex (#00C597) substituindo o verde do Eco

### 10. Versão
Bump `src/config/version.ts` → **1.8.0** com nota: "Novo módulo Domiflix: plataforma de tutoriais estilo Netflix com séries, episódios, progresso, minha lista, avatares e gestão completa no admin."

### Considerações
- Volume grande (≈25 arquivos novos + migration + assets). Implementação em uma rodada, sem quebrar nada existente.
- Mantenho a estrutura de permissões atual do Dominex (não copio o sistema de permissões do Eco).
- Logos do EcoFlix originais NÃO serão copiadas — apenas o logo Dominex será usado.

