-- ============================================================================
-- Fundação da feature "rodízio de vendedores + lead self-service" (Fase 1).
-- Portada da EcoSistema (validada em produção) para a Dominex.
--
-- Adiciona colunas dormentes (não mudam comportamento até vendedores terem
-- telefone e a UI de rodízio existir), constraint de status em salesperson_sales,
-- o helper current_salesperson_id() (usado pelas policies self-scope) e três RPCs:
--   - assign_next_lead_salesperson()  → rodízio justo (service_role)
--   - mark_lead_worked_and_release()  → marca lead trabalhado + libera comissão
--   - get_landing_whatsapp_numbers()  → números do rodízio p/ landing (anon)
--
-- Idempotente (ADD COLUMN IF NOT EXISTS, DO-block p/ constraint, CREATE OR
-- REPLACE, DROP FUNCTION não usado). Seguro rodar 2x.
--
-- NOTA de schema Dominex vs Eco: salesperson_sales NÃO tem transaction_at (só
-- created_at). Logo mark_lead_worked_and_release reancora released_at + created_at
-- (não há transaction_at pra reancorar aqui).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Colunas de rodízio no vendedor.
-- ----------------------------------------------------------------------------
ALTER TABLE public.salespeople
  ADD COLUMN IF NOT EXISTS in_rotation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_lead_assigned_at timestamptz;

-- ----------------------------------------------------------------------------
-- 2) Colunas de lead self-service na empresa.
--    is_self_service = lead entrou pela landing sem passar por vendedor.
--    lead_worked_at / lead_worked_by = quando/quem "trabalhou" o lead (clicou
--    Falar no WhatsApp), o que LIBERA a comissão segurada.
-- ----------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_self_service boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_worked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lead_worked_by uuid;

-- ----------------------------------------------------------------------------
-- 3) Status da comissão em salesperson_sales.
--    'confirmed'    = comissão vale (comportamento de hoje).
--    'pending_work' = comissão segurada (lead self-service ainda não trabalhado).
-- ----------------------------------------------------------------------------
ALTER TABLE public.salesperson_sales
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'salesperson_sales_status_check'
  ) THEN
    ALTER TABLE public.salesperson_sales
      ADD CONSTRAINT salesperson_sales_status_check
      CHECK (status IN ('confirmed','pending_work'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4) Helper: resolve o salesperson_id do usuário logado.
--    SECURITY DEFINER p/ ler public.salespeople de dentro da avaliação de RLS
--    de outras tabelas sem recursão de policy. Retorna NULL p/ não-vendedores
--    (col = NULL nunca é TRUE → não vazam linhas extras).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_salesperson_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.salespeople WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_salesperson_id() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5) RPC de rodízio justo: escolhe o próximo vendedor elegível (ativo, no
--    rodízio, com telefone) pelo menos-recentemente-atribuído, trava a linha
--    (SKIP LOCKED p/ concorrência) e carimba last_lead_assigned_at.
--    Só service_role executa (chamada pela edge/landing server-side).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_next_lead_salesperson()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.salespeople
  WHERE is_active = true AND in_rotation = true
    AND phone IS NOT NULL AND btrim(phone) <> ''
  ORDER BY last_lead_assigned_at ASC NULLS FIRST, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NOT NULL THEN
    UPDATE public.salespeople SET last_lead_assigned_at = now() WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.assign_next_lead_salesperson() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_next_lead_salesperson() TO service_role;

-- ----------------------------------------------------------------------------
-- 6) RPC: marca o lead como trabalhado e LIBERA a comissão segurada.
--    Autorização: admin de plataforma (is_admin_user) OU o vendedor dono do
--    lead (companies.salesperson_id = current_salesperson_id()).
--    Idempotente no lead_worked_at (COALESCE — só carimba a 1ª vez).
--    Libera pending_work → confirmed reancorando released_at + created_at = now()
--    (Dominex NÃO tem transaction_at em salesperson_sales; só created_at).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_lead_worked_and_release(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_company        RECORD;
  v_is_admin       boolean;
  v_is_owner       boolean;
  v_released_count integer := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  SELECT id, salesperson_id, lead_worked_at
    INTO v_company
    FROM public.companies
   WHERE id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'company_not_found');
  END IF;

  v_is_admin := COALESCE(public.is_admin_user(auth.uid()), false);
  v_is_owner := COALESCE(
    v_company.salesperson_id IS NOT NULL
    AND v_company.salesperson_id = public.current_salesperson_id(),
    false
  );

  IF NOT (v_is_admin OR v_is_owner) THEN
    RAISE EXCEPTION 'acesso_negado';
  END IF;

  -- Idempotente: só carimba lead_worked_at/lead_worked_by na primeira vez.
  IF v_company.lead_worked_at IS NULL THEN
    UPDATE public.companies
       SET lead_worked_at = now(),
           lead_worked_by = auth.uid()
     WHERE id = p_company_id;
  END IF;

  -- Libera as comissões seguradas desta empresa. Reancora released_at + created_at
  -- pra que a comissão "conte" a partir de agora (o trabalho de fato aconteceu hoje).
  UPDATE public.salesperson_sales
     SET status     = 'confirmed',
         released_at = now(),
         created_at  = now()
   WHERE company_id = p_company_id
     AND status = 'pending_work';

  GET DIAGNOSTICS v_released_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'company_id', p_company_id,
    'released_count', v_released_count
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.mark_lead_worked_and_release(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7) RPC pública: números de WhatsApp do rodízio, p/ a landing distribuir o
--    contato entre vendedores elegíveis. Normaliza DDI 55, filtra ativos/no
--    rodízio/com telefone, ordena por nome (estável). anon + authenticated.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_landing_whatsapp_numbers()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(
      CASE
        WHEN regexp_replace(phone, '\D', '', 'g') LIKE '55%'
          THEN regexp_replace(phone, '\D', '', 'g')
        ELSE '55' || regexp_replace(phone, '\D', '', 'g')
      END
      ORDER BY name
    ),
    '{}'::text[]
  )
  FROM public.salespeople
  WHERE is_active = true
    AND in_rotation = true
    AND phone IS NOT NULL
    AND btrim(phone) <> '';
$$;

GRANT EXECUTE ON FUNCTION public.get_landing_whatsapp_numbers() TO anon, authenticated;
