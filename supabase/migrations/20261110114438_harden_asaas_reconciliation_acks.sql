-- =============================================================================
-- Hardening corretivo da reconciliação Asaas
--
-- A migration anterior já chegou a produção antes de entrar no repositório. Este
-- arquivo existe para alinhar o banco já migrado com a definição segura mantida na
-- migration original: sem escrita direta na trilha de auditoria e sem leitura global
-- das anomalias financeiras por usuários autenticados comuns.
-- =============================================================================

ALTER TABLE public.asaas_reconciliation_acks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin panel users insert asaas_reconciliation_acks"
  ON public.asaas_reconciliation_acks;
DROP POLICY IF EXISTS "Admin panel users update asaas_reconciliation_acks"
  ON public.asaas_reconciliation_acks;

CREATE OR REPLACE FUNCTION public.asaas_reconciliation_acknowledge(
  p_issue_type TEXT,
  p_ref        TEXT,
  p_note       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.asaas_reconciliation_acks
    (issue_type, ref, note, acknowledged_by, acknowledged_at)
  VALUES (p_issue_type, p_ref, p_note, auth.uid(), now())
  ON CONFLICT (issue_type, ref) DO UPDATE
    SET note            = COALESCE(EXCLUDED.note, public.asaas_reconciliation_acks.note),
        acknowledged_by = EXCLUDED.acknowledged_by,
        acknowledged_at = now(),
        revoked_at      = NULL,
        revoked_by      = NULL,
        updated_at      = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.asaas_reconciliation_unacknowledge(
  p_issue_type TEXT,
  p_ref        TEXT,
  p_note       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.asaas_reconciliation_acks
     SET revoked_at = now(),
         revoked_by = auth.uid(),
         note       = COALESCE(p_note, note),
         updated_at = now()
   WHERE issue_type = p_issue_type
     AND ref        = p_ref
     AND revoked_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.asaas_reconciliation_acknowledge(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.asaas_reconciliation_unacknowledge(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asaas_reconciliation_acknowledge(TEXT, TEXT, TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.asaas_reconciliation_unacknowledge(TEXT, TEXT, TEXT)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.asaas_reconciliation_check()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asaas_reconciliation_check()
  TO service_role;

COMMENT ON FUNCTION public.asaas_reconciliation_acknowledge(TEXT, TEXT, TEXT) IS
  'Reconhece anomalia de conciliacao Asaas. Gate explicito = is_admin_user; escrita direta permanece fechada.';
COMMENT ON FUNCTION public.asaas_reconciliation_unacknowledge(TEXT, TEXT, TEXT) IS
  'Revoga reconhecimento sem apagar a trilha. Gate explicito = is_admin_user; escrita direta permanece fechada.';
