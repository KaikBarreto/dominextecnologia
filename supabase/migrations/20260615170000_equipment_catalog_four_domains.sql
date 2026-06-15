-- FASE 0: estrutura do catálogo de equipamentos em 4 domínios.
-- Catálogo é GLOBAL (sem company_id). Não há conteúdo aqui — só schema.
-- Domínios: ar_condicionado (default/legado), compressor, linha_branca, controle_remoto.
-- Por quê: a "Ferramentas do Técnico" passa a cobrir 4 famílias de equipamento;
-- modelos e categorias precisam saber a que família pertencem; compressor e
-- controle remoto têm specs próprias (1:1 com o modelo).

-- ============================================================
-- 1) Coluna domain em equipment_models e equipment_model_categories
-- ============================================================

-- Modelos: DEFAULT já faz backfill das 110 linhas existentes -> 'ar_condicionado'.
ALTER TABLE public.equipment_models
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'ar_condicionado';

COMMENT ON COLUMN public.equipment_models.domain IS
  'Família do equipamento no catálogo global: ar_condicionado | compressor | linha_branca | controle_remoto. Linhas legadas migram para ar_condicionado.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_models_domain_chk'
  ) THEN
    ALTER TABLE public.equipment_models
      ADD CONSTRAINT equipment_models_domain_chk
      CHECK (domain IN ('ar_condicionado','compressor','linha_branca','controle_remoto'));
  END IF;
END $$;

-- Categorias: existentes viram 'ar_condicionado' via DEFAULT.
ALTER TABLE public.equipment_model_categories
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'ar_condicionado';

COMMENT ON COLUMN public.equipment_model_categories.domain IS
  'Família do equipamento a que esta categoria pertence: ar_condicionado | compressor | linha_branca | controle_remoto. Categorias legadas migram para ar_condicionado.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_model_categories_domain_chk'
  ) THEN
    ALTER TABLE public.equipment_model_categories
      ADD CONSTRAINT equipment_model_categories_domain_chk
      CHECK (domain IN ('ar_condicionado','compressor','linha_branca','controle_remoto'));
  END IF;
END $$;

-- ============================================================
-- 2) Categorias novas por domínio (idempotente por nome+domain)
--    equipment_model_categories só tem PK em id (sem UNIQUE em name),
--    então não há risco de colisão de constraint.
-- ============================================================

DO $$
DECLARE
  v_pairs text[][] := ARRAY[
    ['Geladeira','linha_branca'],
    ['Freezer','linha_branca'],
    ['Lavadora','linha_branca'],
    ['Lava e Seca','linha_branca'],
    ['Hermético','compressor'],
    ['Rotativo','compressor'],
    ['Scroll','compressor'],
    ['Semi-hermético','compressor'],
    ['Universal','controle_remoto'],
    ['Original','controle_remoto']
  ];
  v_row text[];
  v_inserted int := 0;
BEGIN
  FOREACH v_row SLICE 1 IN ARRAY v_pairs LOOP
    INSERT INTO public.equipment_model_categories (name, domain)
    SELECT v_row[1], v_row[2]
    WHERE NOT EXISTS (
      SELECT 1 FROM public.equipment_model_categories
      WHERE name = v_row[1] AND domain = v_row[2]
    );
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'categoria % (%): % inserida(s)', v_row[1], v_row[2], v_inserted;
  END LOOP;
END $$;

-- ============================================================
-- 3) compressor_specs (1:1 com equipment_models domain='compressor')
--    Gás do compressor reusa equipment_models.refrigerant.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.compressor_specs (
  model_id uuid PRIMARY KEY REFERENCES public.equipment_models(id) ON DELETE CASCADE,
  hp text,
  capacidade_btu text,
  aplicacao text,
  tensao text,
  frequencia text,
  deslocamento_cm3 text,
  rla numeric,
  lra numeric,
  capacitor_trabalho text,
  capacitor_partida text,
  rele_protetor text,
  oleo text,
  conexoes text,
  equivalencias text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compressor_specs IS
  'Especificações técnicas 1:1 do compressor (equipment_models.domain = compressor). Gás reusa equipment_models.refrigerant.';

-- ============================================================
-- 4) remote_configs (1:1 com equipment_models domain='controle_remoto')
-- ============================================================

CREATE TABLE IF NOT EXISTS public.remote_configs (
  model_id uuid PRIMARY KEY REFERENCES public.equipment_models(id) ON DELETE CASCADE,
  instrucoes text,
  codigo_universal text,
  reset text,
  desbloqueio text,
  modos text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.remote_configs IS
  'Configurações 1:1 do controle remoto (equipment_models.domain = controle_remoto).';

-- ============================================================
-- 5) RLS — mesmo padrão do catálogo (leitura authenticated, escrita super_admin)
-- ============================================================

ALTER TABLE public.compressor_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remote_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view compressor_specs" ON public.compressor_specs;
CREATE POLICY "Authenticated can view compressor_specs"
  ON public.compressor_specs FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "super_admin manage compressor_specs" ON public.compressor_specs;
CREATE POLICY "super_admin manage compressor_specs"
  ON public.compressor_specs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Authenticated can view remote_configs" ON public.remote_configs;
CREATE POLICY "Authenticated can view remote_configs"
  ON public.remote_configs FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "super_admin manage remote_configs" ON public.remote_configs;
CREATE POLICY "super_admin manage remote_configs"
  ON public.remote_configs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
