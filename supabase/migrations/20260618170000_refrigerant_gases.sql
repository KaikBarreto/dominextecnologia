-- Catálogo GLOBAL de fluidos refrigerantes (Ferramentas do Técnico > nova subaba).
-- Sem company_id: é catálogo único compartilhado por todos os tenants, no mesmo
-- modelo de equipment_brands/equipment_models. Leitura para qualquer usuário
-- logado; escrita só super_admin. Seed virá em migration separada.

CREATE TABLE IF NOT EXISTS public.refrigerant_gases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,            -- "R-410A"
  name text,                            -- nome/descrição comercial
  composicao text,                      -- "R-32/R-125 (50/50)"
  tipo text,                            -- HFC|HFO|HCFC|CFC|HC|Natural|Blend
  gwp numeric,
  odp numeric,
  ponto_ebulicao_c numeric,
  glide_k numeric,
  classe_seguranca text,                -- A1|A2L|A3|B2L...
  oleo text,                            -- óleo compatível
  substitui text,                       -- qual gás substitui/retrofit
  aplicacao text,
  cor text,                             -- hex da cor do gás (régua de cor)
  observacoes text,
  ficha_url text,                       -- PDF de ficha técnica NOSSA (gerado)
  guia_oficial_url text,                -- PDF oficial do fabricante (nullable)
  sort integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.refrigerant_gases ENABLE ROW LEVEL SECURITY;

-- Espelha exatamente o shape de equipment_brands:
--   SELECT: qualquer authenticated lê (catálogo global)
--   ALL:    apenas super_admin escreve (qual + with_check has_role)
DROP POLICY IF EXISTS "Authenticated can view refrigerant_gases" ON public.refrigerant_gases;
CREATE POLICY "Authenticated can view refrigerant_gases"
  ON public.refrigerant_gases FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "super_admin manage refrigerant_gases" ON public.refrigerant_gases;
CREATE POLICY "super_admin manage refrigerant_gases"
  ON public.refrigerant_gases FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
