-- ============================================================================
-- Múltiplos anexos por transação financeira (Glacial Cold)
-- ----------------------------------------------------------------------------
-- Cliente quer anexar múltiplos comprovantes / NFs por lançamento.
-- Hoje há apenas `financial_transactions.receipt_url` (single-string),
-- que segue existindo durante a transição. Esta migration adiciona uma
-- tabela dedicada com metadados (file_name, mime, size) + RLS espelhada
-- da tabela mãe (multi-tenant via get_user_company_id).
-- ============================================================================

-- 1. Tabela ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_transaction_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  uuid NOT NULL REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  storage_path    text NOT NULL,
  file_name       text NOT NULL,
  mime_type       text,
  size_bytes      bigint,
  uploaded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_transaction_attachments_transaction_id
  ON public.financial_transaction_attachments(transaction_id);

-- 2. RLS -------------------------------------------------------------------
ALTER TABLE public.financial_transaction_attachments ENABLE ROW LEVEL SECURITY;

-- Policies espelham as da tabela mãe `financial_transactions`:
--   SELECT/INSERT/UPDATE: company_id = get_user_company_id(auth.uid()) OR is_super_admin
--   DELETE:               idem + can_manage_system (mesmo padrão da mãe)
-- Como o anexo não tem `company_id` próprio, derivamos via EXISTS na mãe.

DROP POLICY IF EXISTS "Users view own company financial_transaction_attachments" ON public.financial_transaction_attachments;
CREATE POLICY "Users view own company financial_transaction_attachments"
  ON public.financial_transaction_attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.financial_transactions ft
      WHERE ft.id = financial_transaction_attachments.transaction_id
        AND (ft.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users insert own company financial_transaction_attachments" ON public.financial_transaction_attachments;
CREATE POLICY "Users insert own company financial_transaction_attachments"
  ON public.financial_transaction_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.financial_transactions ft
      WHERE ft.id = financial_transaction_attachments.transaction_id
        AND (ft.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users update own company financial_transaction_attachments" ON public.financial_transaction_attachments;
CREATE POLICY "Users update own company financial_transaction_attachments"
  ON public.financial_transaction_attachments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.financial_transactions ft
      WHERE ft.id = financial_transaction_attachments.transaction_id
        AND (ft.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.financial_transactions ft
      WHERE ft.id = financial_transaction_attachments.transaction_id
        AND (ft.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Managers delete own company financial_transaction_attachments" ON public.financial_transaction_attachments;
CREATE POLICY "Managers delete own company financial_transaction_attachments"
  ON public.financial_transaction_attachments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.financial_transactions ft
      WHERE ft.id = financial_transaction_attachments.transaction_id
        AND ft.company_id = get_user_company_id(auth.uid())
        AND can_manage_system(auth.uid())
    )
    OR is_super_admin(auth.uid())
  );

-- 3. service_role full access (padrão do projeto pra integrações server-side)
DROP POLICY IF EXISTS "service_role full access financial_transaction_attachments" ON public.financial_transaction_attachments;
CREATE POLICY "service_role full access financial_transaction_attachments"
  ON public.financial_transaction_attachments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
