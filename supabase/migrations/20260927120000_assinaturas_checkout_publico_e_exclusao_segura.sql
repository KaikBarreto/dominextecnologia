-- Assinaturas: checkout hospedado, link publico de consentimento e exclusao segura.
--
-- A tabela continua sendo um espelho escrito apenas por service_role. O cliente
-- autenticado recebe SELECT tenant-safe; anon nunca le a tabela diretamente.

ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS public_short_code text,
  ADD COLUMN IF NOT EXISTS gateway_correlation_ref text,
  ADD COLUMN IF NOT EXISTS checkout_id text,
  ADD COLUMN IF NOT EXISTS checkout_status text,
  ADD COLUMN IF NOT EXISTS checkout_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS pix_auto_qr_code text,
  ADD COLUMN IF NOT EXISTS pix_auto_copy_paste text,
  ADD COLUMN IF NOT EXISTS max_payments integer,
  ADD COLUMN IF NOT EXISTS fine_type text,
  ADD COLUMN IF NOT EXISTS fine_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.tenant_subscriptions
  DROP CONSTRAINT IF EXISTS tenant_subscriptions_public_short_code_check,
  ADD CONSTRAINT tenant_subscriptions_public_short_code_check
    CHECK (public_short_code IS NULL OR public_short_code ~ '^[abcdefghjklmnpqrstuvwxyz23456789]{12}$'),
  DROP CONSTRAINT IF EXISTS tenant_subscriptions_max_payments_check,
  ADD CONSTRAINT tenant_subscriptions_max_payments_check
    CHECK (max_payments IS NULL OR max_payments BETWEEN 1 AND 120),
  DROP CONSTRAINT IF EXISTS tenant_subscriptions_fine_type_check,
  ADD CONSTRAINT tenant_subscriptions_fine_type_check
    CHECK (fine_type IS NULL OR fine_type IN ('PERCENTAGE', 'FIXED')),
  DROP CONSTRAINT IF EXISTS tenant_subscriptions_fine_value_check,
  ADD CONSTRAINT tenant_subscriptions_fine_value_check
    CHECK (fine_value IS NULL OR fine_value >= 0),
  DROP CONSTRAINT IF EXISTS tenant_subscriptions_deleted_pair_check,
  ADD CONSTRAINT tenant_subscriptions_deleted_pair_check
    CHECK (deleted_at IS NOT NULL OR deleted_by IS NULL);

UPDATE public.tenant_subscriptions
   SET fine_type = 'PERCENTAGE',
       fine_value = fine_percent
 WHERE fine_percent IS NOT NULL
   AND fine_type IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_subscriptions_public_short_code_uq
  ON public.tenant_subscriptions (public_short_code)
  WHERE public_short_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_subscriptions_checkout_id_uq
  ON public.tenant_subscriptions (checkout_id)
  WHERE checkout_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_subscriptions_gateway_correlation_uq
  ON public.tenant_subscriptions (gateway_correlation_ref)
  WHERE gateway_correlation_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_subscriptions_company_visible_idx
  ON public.tenant_subscriptions (company_id, created_at DESC)
  WHERE archived_at IS NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.tenant_subscriptions.public_short_code IS
  'Codigo publico aleatorio de 12 caracteres usado somente pela edge allowlist do checkout. Nao e um ID interno.';
COMMENT ON COLUMN public.tenant_subscriptions.gateway_correlation_ref IS
  'Referencia opaca unica persistida antes de chamar o gateway; correlaciona webhooks que chegam antes da resposta da criacao.';
COMMENT ON COLUMN public.tenant_subscriptions.checkout_id IS
  'ID opaco do checkout hospedado Asaas. Nunca exposto no endpoint publico.';
COMMENT ON COLUMN public.tenant_subscriptions.checkout_status IS
  'Ultimo status conhecido do checkout/consentimento, usado como espelho e atualizado por webhook.';
COMMENT ON COLUMN public.tenant_subscriptions.checkout_expires_at IS
  'Expiracao do checkout ou do QR de consentimento. Depois dela o endpoint publico nao serve artefatos pagaveis.';
COMMENT ON COLUMN public.tenant_subscriptions.checkout_url IS
  'URL hospedada retornada pelo Asaas no checkout de cartao. Para Pix Auto o link publico e derivado de public_short_code.';
COMMENT ON COLUMN public.tenant_subscriptions.pix_auto_qr_code IS
  'Imagem/base64 do QR de consentimento Pix Automatico. Sem SELECT para authenticated; exposicao somente pela edge publica com short code.';
COMMENT ON COLUMN public.tenant_subscriptions.pix_auto_copy_paste IS
  'Payload copia-e-cola do consentimento Pix Automatico. Sem SELECT para authenticated; exposicao somente pela edge publica com short code.';
COMMENT ON COLUMN public.tenant_subscriptions.max_payments IS
  'Numero maximo de ciclos configurado. NULL significa assinatura continua.';
COMMENT ON COLUMN public.tenant_subscriptions.fine_type IS
  'Tipo fiel da multa enviada ao gateway: PERCENTAGE ou FIXED.';
COMMENT ON COLUMN public.tenant_subscriptions.fine_value IS
  'Valor fiel da multa no tipo escolhido (percentual ou reais). NULL/zero significa sem multa.';
COMMENT ON COLUMN public.tenant_subscriptions.deleted_at IS
  'Tombstone de exclusao segura. So preenchido depois de confirmar ausencia de cobrancas/historico local e remoto.';
COMMENT ON COLUMN public.tenant_subscriptions.deleted_by IS
  'Usuario que solicitou a exclusao segura; sempre acompanhado de deleted_at.';

-- Lista de gestao: preserva a relacao direta tenant_subscriptions -> customers no
-- hook atual e acrescenta apenas contadores por uma RPC separada. A funcao usa o
-- company_id do JWT, nunca um argumento controlado pelo client.
CREATE OR REPLACE FUNCTION public.get_tenant_subscription_delete_capabilities()
RETURNS TABLE (
  subscription_id uuid,
  charge_count bigint,
  can_delete boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
  SELECT
    s.id AS subscription_id,
    count(c.id)::bigint AS charge_count,
    (count(c.id) = 0 AND s.deleted_at IS NULL) AS can_delete
  FROM public.tenant_subscriptions s
  LEFT JOIN public.tenant_charges c
    ON c.subscription_id = s.id
   AND c.company_id = s.company_id
  WHERE s.company_id = public.get_user_company_id((SELECT auth.uid()))
    AND s.deleted_at IS NULL
  GROUP BY s.id, s.deleted_at;
$fn$;

COMMENT ON FUNCTION public.get_tenant_subscription_delete_capabilities() IS
  'Retorna charge_count/can_delete apenas das assinaturas da empresa do usuario autenticado. can_delete e dica de UX; a edge revalida local e gateway antes do tombstone.';

REVOKE ALL ON FUNCTION public.get_tenant_subscription_delete_capabilities() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tenant_subscription_delete_capabilities() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_subscription_delete_capabilities() TO authenticated;

-- Passo local da exclusao, chamado somente DEPOIS do gateway. O lock + NOT EXISTS
-- fecham a corrida entre a contagem feita pela edge e um webhook materializando
-- uma cobranca atrasada.
CREATE OR REPLACE FUNCTION public.tombstone_tenant_subscription_if_empty(
  p_company_id uuid,
  p_subscription_id uuid,
  p_deleted_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_sub public.tenant_subscriptions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_sub
    FROM public.tenant_subscriptions
   WHERE id = p_subscription_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'not_found');
  END IF;
  IF v_sub.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('deleted', true, 'already_deleted', true, 'deleted_at', v_sub.deleted_at);
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.tenant_charges c
     WHERE c.company_id = p_company_id
       AND c.subscription_id = p_subscription_id
  ) THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'has_financial_history');
  END IF;

  UPDATE public.tenant_subscriptions
     SET status = 'cancelled',
         checkout_status = CASE WHEN checkout_id IS NOT NULL THEN 'CANCELLED' ELSE checkout_status END,
         deleted_at = v_now,
         deleted_by = p_deleted_by,
         archived_at = COALESCE(archived_at, v_now),
         updated_at = v_now
   WHERE id = p_subscription_id
     AND company_id = p_company_id
     AND deleted_at IS NULL;

  RETURN jsonb_build_object('deleted', true, 'already_deleted', false, 'deleted_at', v_now);
END;
$fn$;

COMMENT ON FUNCTION public.tombstone_tenant_subscription_if_empty(uuid, uuid, uuid) IS
  'Aplica o tombstone local de uma assinatura apenas se ainda nao existir nenhuma tenant_charge. Chamada service_role depois da remocao no gateway.';

REVOKE ALL ON FUNCTION public.tombstone_tenant_subscription_if_empty(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tombstone_tenant_subscription_if_empty(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.tombstone_tenant_subscription_if_empty(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tombstone_tenant_subscription_if_empty(uuid, uuid, uuid) TO service_role;

-- Reafirma a fronteira: nada publico ou autenticado acessa os artefatos sensiveis
-- diretamente fora da RLS/edge. Escritas continuam exclusivas de service_role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tenant_subscriptions FROM authenticated;
REVOKE ALL ON public.tenant_subscriptions FROM anon;
REVOKE SELECT ON public.tenant_subscriptions FROM authenticated;

-- O gestor precisa dos campos de administracao, mas nunca dos artefatos que
-- autorizam o pagamento. RLS limita as LINHAS; este grant limita as COLUNAS.
-- QR/copia-e-cola, public_short_code, checkout_id, correlacao do gateway e
-- token de cartao continuam exclusivos de service_role/edges.
GRANT SELECT (
  id,
  company_id,
  customer_id,
  asaas_subscription_id,
  cycle,
  value,
  billing_type,
  next_due_date,
  status,
  fine_percent,
  interest_percent,
  description,
  created_by,
  created_at,
  updated_at,
  source_type,
  source_id,
  archived_at,
  pix_auto_authorization_id,
  pix_auto_status,
  category,
  cost_center_id,
  max_payments,
  fine_type,
  fine_value,
  checkout_url,
  checkout_status,
  checkout_expires_at,
  deleted_at
) ON public.tenant_subscriptions TO authenticated;

REVOKE SELECT (
  public_short_code,
  gateway_correlation_ref,
  checkout_id,
  pix_auto_qr_code,
  pix_auto_copy_paste,
  credit_card_token_name,
  credit_card_last4,
  credit_card_brand,
  deleted_by
) ON public.tenant_subscriptions FROM authenticated;
