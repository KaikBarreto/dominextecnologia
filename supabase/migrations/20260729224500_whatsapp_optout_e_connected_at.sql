-- =============================================================================
-- Add-on "Avisos de WhatsApp" — Complemento (só banco)
-- =============================================================================
-- As edge functions (whatsapp-connect/send/webhook), já escritas, dependem de
-- 2 estruturas que a migration base (20260729220814) NÃO criou:
--
--   1) connected_at em company_whatsapp_settings — base do "aquecimento" do
--      número. O webhook grava o timestamp quando a conexão vira 'connected'.
--
--   2) whatsapp_opt_outs — cliente final que pediu para não receber avisos.
--      Guarda TELEFONE (dado pessoal / LGPD): RLS ESTRITA, isolamento por
--      company_id (incidente 1.8.4). Escrita só pela edge (service_role);
--      o tenant só LÊ os opt-outs da própria empresa.
--
-- RLS espelha EXATAMENTE o shape de whatsapp_events da migration base:
--   - service_role FOR ALL (USING/CHECK true)
--   - SELECT authenticated isolado por get_user_company_id(auth.uid())
--   - INSERT/UPDATE/DELETE sem policy authenticated (só via edge)
--
-- Migration ADITIVA (1 coluna + 1 tabela). Idempotente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) connected_at — quando a conexão virou 'connected' (base do aquecimento)
-- ---------------------------------------------------------------------------
ALTER TABLE public.company_whatsapp_settings
  ADD COLUMN IF NOT EXISTS connected_at timestamptz NULL;

-- ---------------------------------------------------------------------------
-- 2) whatsapp_opt_outs — telefones que pediram para não receber avisos (LGPD)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_opt_outs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone         text NOT NULL,
  opted_out_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone)   -- índice (company_id, phone) já coberto pelo UNIQUE
);

ALTER TABLE public.whatsapp_opt_outs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_whatsapp_opt_outs" ON public.whatsapp_opt_outs;
CREATE POLICY "service_role_full_access_whatsapp_opt_outs"
  ON public.whatsapp_opt_outs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view whatsapp opt-outs from their company" ON public.whatsapp_opt_outs;
CREATE POLICY "Users can view whatsapp opt-outs from their company"
  ON public.whatsapp_opt_outs FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
-- INSERT/UPDATE/DELETE: sem policy authenticated (escrita só via edge service_role).

-- Fim da migration.
