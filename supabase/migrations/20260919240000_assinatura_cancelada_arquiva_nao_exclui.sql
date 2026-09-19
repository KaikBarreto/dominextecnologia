-- Arquivar assinatura cancelada — "some da lista", NÃO excluir.
--
-- Por quê ARQUIVAR e não DELETE:
--   `tenant_subscriptions` é ESPELHO de um gateway externo (Asaas). DELETE é
--   irreversível e apaga a pista de uma linha que pode ter consentimento vivo do
--   outro lado. O gestor pediu "sumir da lista", não "destruir o histórico".
--   `archived_at` é reversível (unarchive), some da lista e preserva a trilha.
--
-- Por quê RPC SECURITY DEFINER + edge e NÃO GRANT UPDATE ao client:
--   mesmo desenho de `delete_tenant_charge_local` (20260919160000). `authenticated`
--   segue SELECT-only em `tenant_subscriptions` (20260912180000); toda escrita passa
--   por service_role. Dar UPDATE ao client reabriria a porta de mexer em status,
--   valor e ids do gateway via PostgREST.
--
-- Gate que vale mais que a feature (PIX Automático):
--   cancelar a assinatura AQUI não revoga o consentimento de Pix Automático LÁ.
--   Arquivar uma assinatura cujo consentimento segue vivo esconderia do gestor
--   exatamente a linha que pode voltar a debitar o cliente dele. Por isso, quando
--   existe `pix_auto_authorization_id`, só arquiva com
--   `pix_auto_status IN ('cancelled','expired','rejected')`.
--
-- Nada de RAISE EXCEPTION pra caso de negócio: as RPCs devolvem jsonb com
-- `archived`/`reason`/`message` pra edge distinguir "arquivada" de "recusada e por quê".

-- ────────────────────────────────────────────────────────────────────────────
-- 1) CHECK do pix_auto_status precisa aceitar 'rejected'
-- ────────────────────────────────────────────────────────────────────────────
-- `mapPixAutoStatus` (tenant-asaas-webhook/index.ts:421) devolve 'rejected' pra
-- evento REJECT/DENIED, mas o CHECK atual só aceitava pending|authorized|cancelled|
-- expired. O UPDATE do webhook carrega pix_auto_status E status no MESMO patch:
-- violado o CHECK, o patch inteiro é perdido — a assinatura continua marcada como
-- se o consentimento estivesse vivo. Além do dado errado, o predicado de arquivamento
-- abaixo depende desse valor EXISTIR. Corrigido aqui.
ALTER TABLE public.tenant_subscriptions
  DROP CONSTRAINT IF EXISTS tenant_subscriptions_pix_auto_status_check;

ALTER TABLE public.tenant_subscriptions
  ADD CONSTRAINT tenant_subscriptions_pix_auto_status_check
  CHECK (
    pix_auto_status IS NULL
    OR pix_auto_status IN ('pending','authorized','cancelled','expired','rejected')
  );

COMMENT ON COLUMN public.tenant_subscriptions.pix_auto_status IS
  'Status da autorização (consentimento) de Pix Automático na Asaas: pending | authorized | cancelled | expired | rejected. NULL quando a assinatura não é PIX_AUTO. Só cancelled/expired/rejected significam "não debita mais".';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Coluna archived_at
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

COMMENT ON COLUMN public.tenant_subscriptions.archived_at IS
  'Quando o gestor tirou esta assinatura da LISTA do sistema. NÃO é cancelamento (isso é status=cancelled) e NÃO é exclusão: a linha continua no banco e o vínculo com o gateway (Asaas) é exatamente o mesmo. Só é possível arquivar assinatura já cancelada e sem consentimento Pix Automático vivo. Reversível via unarchive_tenant_subscription.';

-- Lista do gestor filtra archived_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_company_not_archived
  ON public.tenant_subscriptions (company_id)
  WHERE archived_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) RPC archive_tenant_subscription
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.archive_tenant_subscription(
  p_company_id uuid,
  p_subscription_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_sub     public.tenant_subscriptions%ROWTYPE;
  v_updated integer := 0;
BEGIN
  IF p_company_id IS NULL OR p_subscription_id IS NULL THEN
    RETURN jsonb_build_object(
      'archived', false, 'found', false, 'reason', 'invalid_arguments',
      'message', 'Identificador da empresa e da assinatura são obrigatórios.'
    );
  END IF;

  -- Posse: a linha só existe pra esta RPC se for da empresa informada.
  SELECT * INTO v_sub
    FROM public.tenant_subscriptions
   WHERE id = p_subscription_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'archived', false, 'found', false, 'reason', 'not_found',
      'message', 'Assinatura não encontrada nesta empresa.'
    );
  END IF;

  -- Idempotente: arquivar de novo não erra.
  IF v_sub.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'archived', true, 'found', true, 'already_archived', true,
      'archived_at', v_sub.archived_at, 'reason', 'already_archived',
      'message', 'Esta assinatura já estava arquivada.'
    );
  END IF;

  IF COALESCE(v_sub.status, '') <> 'cancelled' THEN
    RETURN jsonb_build_object(
      'archived', false, 'found', true, 'reason', 'not_cancelled',
      'status', v_sub.status,
      'message', 'Só é possível arquivar uma assinatura já cancelada. Cancele a assinatura antes.'
    );
  END IF;

  -- Consentimento de Pix Automático vivo => NÃO esconde da lista.
  IF v_sub.pix_auto_authorization_id IS NOT NULL
     AND COALESCE(v_sub.pix_auto_status, '') NOT IN ('cancelled','expired','rejected') THEN
    RETURN jsonb_build_object(
      'archived', false, 'found', true, 'reason', 'pix_auto_consent_live',
      'pix_auto_status', v_sub.pix_auto_status,
      'message', 'Esta assinatura ainda tem uma autorização de Pix Automático ativa no banco do cliente. Cancele a autorização antes de arquivar, senão a cobrança pode voltar a ser debitada sem aparecer na sua lista.'
    );
  END IF;

  -- Posse e gates REAPLICADOS no UPDATE (não confiar só no SELECT anterior).
  UPDATE public.tenant_subscriptions
     SET archived_at = now()
   WHERE id         = p_subscription_id
     AND company_id = p_company_id
     AND status     = 'cancelled'
     AND archived_at IS NULL
     AND (
           pix_auto_authorization_id IS NULL
           OR COALESCE(pix_auto_status, '') IN ('cancelled','expired','rejected')
         );
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RETURN jsonb_build_object(
      'archived', false, 'found', true, 'reason', 'state_changed',
      'message', 'O estado da assinatura mudou durante a operação. Atualize a tela e tente de novo.'
    );
  END IF;

  RETURN jsonb_build_object(
    'archived', true, 'found', true, 'already_archived', false,
    'subscription_id', p_subscription_id,
    'message', 'Assinatura arquivada. Ela saiu da lista, mas continua no histórico.'
  );
END;
$fn$;

COMMENT ON FUNCTION public.archive_tenant_subscription(uuid, uuid) IS
  'Tira uma assinatura CANCELADA da lista do gestor (archived_at = now()). Não exclui e não fala com a Asaas. Recusa assinatura não cancelada, de outra empresa, ou com consentimento de Pix Automático ainda vivo. Idempotente. Só service_role (chamada via edge).';

-- ────────────────────────────────────────────────────────────────────────────
-- 4) RPC unarchive_tenant_subscription — arquivar sem volta seria excluir com
--    outro nome.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unarchive_tenant_subscription(
  p_company_id uuid,
  p_subscription_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_sub     public.tenant_subscriptions%ROWTYPE;
  v_updated integer := 0;
BEGIN
  IF p_company_id IS NULL OR p_subscription_id IS NULL THEN
    RETURN jsonb_build_object(
      'unarchived', false, 'found', false, 'reason', 'invalid_arguments',
      'message', 'Identificador da empresa e da assinatura são obrigatórios.'
    );
  END IF;

  SELECT * INTO v_sub
    FROM public.tenant_subscriptions
   WHERE id = p_subscription_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'unarchived', false, 'found', false, 'reason', 'not_found',
      'message', 'Assinatura não encontrada nesta empresa.'
    );
  END IF;

  IF v_sub.archived_at IS NULL THEN
    RETURN jsonb_build_object(
      'unarchived', true, 'found', true, 'already_visible', true,
      'reason', 'not_archived',
      'message', 'Esta assinatura já aparece na lista.'
    );
  END IF;

  UPDATE public.tenant_subscriptions
     SET archived_at = NULL
   WHERE id         = p_subscription_id
     AND company_id = p_company_id
     AND archived_at IS NOT NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RETURN jsonb_build_object(
      'unarchived', false, 'found', true, 'reason', 'state_changed',
      'message', 'O estado da assinatura mudou durante a operação. Atualize a tela e tente de novo.'
    );
  END IF;

  RETURN jsonb_build_object(
    'unarchived', true, 'found', true, 'already_visible', false,
    'subscription_id', p_subscription_id,
    'message', 'Assinatura de volta à lista.'
  );
END;
$fn$;

COMMENT ON FUNCTION public.unarchive_tenant_subscription(uuid, uuid) IS
  'Devolve à lista uma assinatura arquivada (archived_at = NULL). Idempotente. Só service_role (chamada via edge).';

-- ────────────────────────────────────────────────────────────────────────────
-- 5) ACL — SECURITY DEFINER nasce com EXECUTE pra PUBLIC; fechar é obrigatório.
-- ────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.archive_tenant_subscription(uuid, uuid)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_tenant_subscription(uuid, uuid)   FROM anon;
REVOKE ALL ON FUNCTION public.archive_tenant_subscription(uuid, uuid)   FROM authenticated;
GRANT EXECUTE ON FUNCTION public.archive_tenant_subscription(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.unarchive_tenant_subscription(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unarchive_tenant_subscription(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.unarchive_tenant_subscription(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.unarchive_tenant_subscription(uuid, uuid) TO service_role;

-- Reafirma o contrato de 20260912180000: client NUNCA escreve nesta tabela.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tenant_subscriptions FROM authenticated;
REVOKE ALL ON public.tenant_subscriptions FROM anon;
GRANT SELECT ON public.tenant_subscriptions TO authenticated;
