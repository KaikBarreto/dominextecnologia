

## Plano: Melhorias no Sistema e Landing Page

### 1. Renomear "Usuários" para "Usuários e Permissões"

**Arquivos**: `AppSidebar.tsx`, `MobileMenu.tsx`, `Users.tsx`
- Alterar o título no menu lateral, menu mobile e no cabeçalho da página de `Usuários` para `Usuários e Permissões`

### 2. Criar Tela "Equipes" dentro do submenu Serviços

**Banco de dados** — nova tabela `teams` e `team_members`:

```sql
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  color text DEFAULT '#3b82f6',
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage teams" ON public.teams
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage team_members" ON public.team_members
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
```

Adicionar coluna `team_id` na tabela `service_orders`:
```sql
ALTER TABLE public.service_orders ADD COLUMN team_id uuid REFERENCES public.teams(id);
```

**Novos arquivos**:
- `src/pages/Teams.tsx` — Página com listagem de equipes em cards, busca, e botão de criar
- `src/components/teams/TeamFormDialog.tsx` — Dialog para criar/editar equipe com nome, descrição, cor, e seleção de membros (multi-select de usuários/profiles)
- `src/hooks/useTeams.ts` — Hook com queries para teams e team_members (CRUD completo)

**Arquivos modificados**:
- `src/App.tsx` — Adicionar rota `/equipes`
- `src/components/layout/AppSidebar.tsx` — Adicionar item "Equipes" dentro do submenu "Serviços" com ícone `UsersRound`
- `src/pages/MobileMenu.tsx` — Adicionar "Equipes" ao menu

### 3. Atribuir Técnico OU Equipe na OS

**Arquivo**: `src/components/service-orders/ServiceOrderFormDialog.tsx`
- Alterar o campo "Técnico" para um Select com optgroups:
  - **Grupo "Técnicos"**: lista de perfis individuais (como já existe)
  - **Grupo "Equipes"**: lista de equipes ativas
- Valor salvo: se for equipe, salvar em `team_id` e limpar `technician_id`; se for técnico, salvar em `technician_id` e limpar `team_id`
- Usar prefixo no value do select: `user:UUID` ou `team:UUID` para distinguir
- Importar e usar `useTeams` para buscar equipes

**Arquivo**: `src/hooks/useServiceOrders.ts` — garantir que `team_id` é enviado nas mutations de criar/editar OS

### 4. Logo no Header (versão escura)

**Arquivo**: `src/components/layout/AppLayout.tsx`
- No `HeaderContent`, substituir o ícone `Snowflake` + "Sistema" por `<img src={logoDark} />` usando `src/assets/logo-dark.png`
- Manter visível apenas em mobile (quando `isMobile`)

### 5. Landing Page Responsiva

Revisão de responsividade em todos os componentes da landing:

- **HeroSection**: Já usa `grid lg:grid-cols-2`. Verificar padding, tamanhos de fonte e mockup em telas < 375px.
- **FeaturesGrid**: Já usa `useIsMobile`. Garantir layout correto.
- **PricingSection**: Garantir stack vertical mobile com scroll.
- **ProductMockup**: O mockup simulado já esconde sidebar em mobile. Verificar overflow.
- **ProblemSolutionSection**: Garantir stack vertical em mobile.
- **TestimonialsSection**: Já tem carousel mobile.
- **SegmentsSection**: Garantir wrap correto dos chips.
- **HowItWorks**: Garantir cards empilham em mobile.
- **FaqSection**, **CtaFinalSection**, **LandingFooter**: Verificar padding e font-size.

Ajustes específicos:
- Reduzir font-size do H1 hero em mobile (`text-3xl` em vez de `text-4xl`)
- Garantir que botões CTA ficam full-width em mobile
- Padding horizontal consistente (`px-4` em mobile)
- Footer: stack vertical em mobile com spacing adequado

### Arquivos Totais

**Criar**:
- `src/pages/Teams.tsx`
- `src/components/teams/TeamFormDialog.tsx`
- `src/hooks/useTeams.ts`

**Modificar**:
- `src/App.tsx` — nova rota
- `src/components/layout/AppSidebar.tsx` — menu + renomear
- `src/components/layout/AppLayout.tsx` — logo no header
- `src/pages/MobileMenu.tsx` — renomear + equipes
- `src/pages/Users.tsx` — renomear título
- `src/components/service-orders/ServiceOrderFormDialog.tsx` — select técnico/equipe
- Landing page components (ajustes responsivos)

**Migração SQL**: 2 tabelas + 1 coluna nova

