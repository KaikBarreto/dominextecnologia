-- Tarefa 1 — Modelo SDR/Closer para o time comercial Auctus.
--
-- Por quê: hoje salespeople não distingue SDR de Closer, e cada venda
-- (salesperson_sales) registra uma única comissão para um único vendedor.
-- Passamos a suportar dupla atribuição: o salesperson_id continua sendo o
-- CLOSER (quem fecha), e adicionamos um SDR opcional (quem prospecta), com
-- comissões separadas. A view salespeople_basic ganha a coluna role para a UI
-- filtrar SDR/Closer nos dropdowns.

-- 1) Tipo do vendedor (SDR x Closer). Linhas existentes viram 'closer' pelo default.
ALTER TABLE public.salespeople
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'closer';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.salespeople'::regclass
      AND conname = 'salespeople_role_check'
  ) THEN
    ALTER TABLE public.salespeople
      ADD CONSTRAINT salespeople_role_check CHECK (role IN ('sdr', 'closer'));
  END IF;
END $$;

-- 2) Dupla atribuição na venda. salesperson_id permanece como o CLOSER.
ALTER TABLE public.salesperson_sales
  ADD COLUMN IF NOT EXISTS sdr_id uuid NULL REFERENCES public.salespeople(id),
  ADD COLUMN IF NOT EXISTS closer_commission numeric,
  ADD COLUMN IF NOT EXISTS sdr_commission numeric;

-- Backfill: a comissão histórica era integralmente do closer.
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.salesperson_sales
     SET closer_commission = commission_amount,
         sdr_commission = 0
   WHERE closer_commission IS NULL
      OR sdr_commission IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Tarefa 1 backfill salesperson_sales: % linhas atualizadas (closer_commission/sdr_commission).', v_count;
END $$;

-- 3) Recria a view salespeople_basic adicionando a coluna role.
--    Mantém security_invoker=true e as demais colunas inalteradas.
DROP VIEW IF EXISTS public.salespeople_basic;
CREATE VIEW public.salespeople_basic
  WITH (security_invoker = true) AS
  SELECT
    id,
    name,
    email,
    referral_code,
    is_active,
    user_id,
    photo_url,
    role
  FROM public.salespeople;
