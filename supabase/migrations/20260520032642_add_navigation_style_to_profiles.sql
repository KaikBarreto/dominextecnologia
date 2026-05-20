-- Adiciona preferência de navegação (sidebar lateral vs barra superior) ao perfil do usuário.
-- Default 'sidebar' alinhado com o comportamento atual do app.
-- Substitui persistência em localStorage do hook useNavigationPreference.

ALTER TABLE public.profiles
  ADD COLUMN navigation_style text NOT NULL DEFAULT 'sidebar'
    CHECK (navigation_style IN ('sidebar', 'topbar'));

COMMENT ON COLUMN public.profiles.navigation_style IS
  'Preferência de layout de navegação do usuário no desktop: sidebar (padrão) ou topbar (alternativo).';
