-- NPS settings por empresa: cada tenant edita o texto da pergunta 0-10 e se as
-- estrelas (qualidade/pontualidade/profissionalismo) sao obrigatorias.
-- Painel interno le/escreve (authenticated, isolado por empresa).
-- O link publico de avaliacao le via get_public_os (SECURITY DEFINER) — anon
-- NAO tem acesso direto a esta tabela.
--
-- Decisao CEO: require_stars default false (estrelas OPCIONAIS).
-- Nome conferido contra colisao com tabela tenant homonima: livre.

-- 1) Tabela ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nps_settings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  question      text NOT NULL DEFAULT 'De 0 a 10, qual a chance de recomendar nosso serviço?',
  require_stars boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 1 linha por empresa (UNIQUE por company_id e correto, nao e vazamento).
CREATE UNIQUE INDEX IF NOT EXISTS nps_settings_company_id_key
  ON public.nps_settings (company_id);

-- 2) Trigger de updated_at (helper canonico do projeto) -------------------
DROP TRIGGER IF EXISTS set_nps_settings_updated_at ON public.nps_settings;
CREATE TRIGGER set_nps_settings_updated_at
  BEFORE UPDATE ON public.nps_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3) RLS ------------------------------------------------------------------
ALTER TABLE public.nps_settings ENABLE ROW LEVEL SECURITY;

-- service_role: acesso total (edges/cron).
DROP POLICY IF EXISTS "service_role_full_access_nps_settings" ON public.nps_settings;
CREATE POLICY "service_role_full_access_nps_settings"
  ON public.nps_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- authenticated: SELECT/INSERT/UPDATE/DELETE so da config da propria empresa.
-- Padrao canonico do projeto (igual service_ratings): company helper + super_admin.
DROP POLICY IF EXISTS "Users manage own nps_settings" ON public.nps_settings;
CREATE POLICY "Users manage own nps_settings"
  ON public.nps_settings FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

-- anon: SEM policy = SEM acesso direto. A leitura publica passa por get_public_os.

COMMENT ON TABLE public.nps_settings IS
  'Config de pesquisa NPS por empresa (pergunta 0-10 + estrelas obrigatorias). Leitura publica via get_public_os.';
