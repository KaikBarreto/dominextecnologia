-- PMOC por equipamento — Fase 1 (schema + backfill)
-- Adiciona rotina PMOC por equipamento em contract_items:
--   pmoc_scope:        'ac' (só condicionadores) | 'full' (toda a norma — grande porte)
--   pmoc_start_visit:  posição inicial no ciclo de 12 visitas (1/3/6/12); default 12 = começa na anual
-- Por quê: hoje o escopo da norma e a periodicidade valem pro contrato inteiro; o cliente precisa
-- definir por máquina (ex.: split segue só AC, Chiller/VRF segue toda a norma).
-- Defaults preservam o comportamento atual (start=12 → no mês 0 a posição do ciclo é 12 = M+T+S+A).

-- Colunas (idempotente)
ALTER TABLE public.contract_items
  ADD COLUMN IF NOT EXISTS pmoc_scope text NOT NULL DEFAULT 'ac',
  ADD COLUMN IF NOT EXISTS pmoc_start_visit smallint NOT NULL DEFAULT 12;

-- CHECKs (idempotente: dropa antes de recriar)
ALTER TABLE public.contract_items
  DROP CONSTRAINT IF EXISTS contract_items_pmoc_scope_chk;
ALTER TABLE public.contract_items
  ADD CONSTRAINT contract_items_pmoc_scope_chk CHECK (pmoc_scope IN ('ac','full'));

ALTER TABLE public.contract_items
  DROP CONSTRAINT IF EXISTS contract_items_pmoc_start_visit_chk;
ALTER TABLE public.contract_items
  ADD CONSTRAINT contract_items_pmoc_start_visit_chk CHECK (pmoc_start_visit BETWEEN 1 AND 12);

-- Backfill: inferir escopo por contrato a partir do plano salvo e propagar pros itens.
-- Itens de contratos PMOC cujo plano tenha QUALQUER atividade com section não-nula
-- e diferente de 'condicionadores' → pmoc_scope = 'full'. Os demais ficam no default 'ac'.
-- pmoc_start_visit fica no default 12 para todos (preserva comportamento atual).
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.contract_items ci
  SET pmoc_scope = 'full'
  FROM public.contracts c
  WHERE ci.contract_id = c.id
    AND c.is_pmoc = true
    AND ci.pmoc_scope <> 'full'
    AND EXISTS (
      SELECT 1 FROM public.contract_plan_activities pa
      WHERE pa.contract_id = c.id
        AND pa.section IS NOT NULL
        AND pa.section <> 'condicionadores'
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Backfill PMOC por equipamento: % contract_items marcados como pmoc_scope=full', v_count;
END $$;
