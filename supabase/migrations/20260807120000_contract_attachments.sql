-- =============================================================================
-- Anexos externos de contrato (upload manual pelo tenant)
-- =============================================================================
-- Por quê: permitir que o usuário anexe arquivos (PDF, imagens, docs) a um
-- contrato manualmente, guardados em bucket privado por tenant.
--
-- Diferença do pmoc-documents (precedente espelhado):
--   pmoc-documents = artefato GERADO por edge (service_role) → INSERT/UPDATE/
--   DELETE negados pra authenticated. AQUI é upload MANUAL → liberado pro
--   tenant dono (gating por company_id na 1ª pasta do path).
--
-- Path storage: {company_id}/{contract_id}/{uuid}_{filename}
--
-- Funções auxiliares confirmadas (grep nas migrations):
--   get_user_company_id(uuid)  → 20260308072335 (SECURITY DEFINER, profiles)
--   is_super_admin(uuid)       → 20260418163700
--   has_role(uuid, app_role)   → 20260131190034
-- RLS definida e aprovada pela dev-plataforma-multitenant.
-- =============================================================================

BEGIN;

-- =============================================================================
-- §1. Tabela public.contract_attachments
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.contract_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  contract_id   uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  display_name  text NOT NULL,
  storage_path  text NOT NULL,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_attachments_contract_id
  ON public.contract_attachments(contract_id);

-- =============================================================================
-- §2. Trigger BEFORE INSERT — força company_id/uploaded_by do usuário logado
-- =============================================================================
-- Espelha o padrão de set_company_id_on_insert() (20260602213504): só age
-- quando auth.uid() está presente (usuário authenticated). Em chamadas via
-- service_role (auth.uid() NULL — seeds/limpeza) o trigger vira no-op e NÃO
-- sobrescreve, preservando o company_id/uploaded_by explícitos do payload.
CREATE OR REPLACE FUNCTION public.set_contract_attachment_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Só sobrescreve quando o INSERT veio de um usuário authenticated real.
  IF auth.uid() IS NOT NULL THEN
    NEW.company_id  := public.get_user_company_id(auth.uid());
    NEW.uploaded_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_contract_attachment_owner() IS
'Força company_id e uploaded_by = usuário logado em INSERT de contract_attachments.
No-op quando auth.uid() é NULL (service_role/seeds), pra não sobrescrever payload.';

DROP TRIGGER IF EXISTS tg_set_contract_attachment_owner ON public.contract_attachments;
CREATE TRIGGER tg_set_contract_attachment_owner
  BEFORE INSERT ON public.contract_attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_contract_attachment_owner();

-- =============================================================================
-- §3. RLS da tabela (FIEL — definida pela dev-plataforma-multitenant)
-- =============================================================================
ALTER TABLE public.contract_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own company contract_attachments" ON public.contract_attachments;
CREATE POLICY "Users view own company contract_attachments"
  ON public.contract_attachments FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Users insert own company contract_attachments" ON public.contract_attachments;
CREATE POLICY "Users insert own company contract_attachments"
  ON public.contract_attachments FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Users update own company contract_attachments" ON public.contract_attachments;
CREATE POLICY "Users update own company contract_attachments"
  ON public.contract_attachments FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Users delete own company contract_attachments" ON public.contract_attachments;
CREATE POLICY "Users delete own company contract_attachments"
  ON public.contract_attachments FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "service_role full access contract_attachments" ON public.contract_attachments;
CREATE POLICY "service_role full access contract_attachments"
  ON public.contract_attachments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.contract_attachments TO authenticated, service_role;

-- =============================================================================
-- §4. Bucket contract-attachments (privado, 10MB) + storage policies
-- =============================================================================
-- Espelha pmoc-documents (20260523154440:405-455) MAS libera INSERT/UPDATE/
-- DELETE pro tenant dono (upload manual), com gating por foldername[1].
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contract-attachments', 'contract-attachments', false, 10485760, NULL)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "contract_attachments_storage_select_own_company" ON storage.objects;
CREATE POLICY "contract_attachments_storage_select_own_company"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contract-attachments' AND (
    (storage.foldername(name))[1]::uuid = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)));

DROP POLICY IF EXISTS "contract_attachments_storage_insert_own_company" ON storage.objects;
CREATE POLICY "contract_attachments_storage_insert_own_company"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contract-attachments' AND (
    (storage.foldername(name))[1]::uuid = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)));

DROP POLICY IF EXISTS "contract_attachments_storage_update_own_company" ON storage.objects;
CREATE POLICY "contract_attachments_storage_update_own_company"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'contract-attachments' AND (
    (storage.foldername(name))[1]::uuid = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK (bucket_id = 'contract-attachments' AND (
    (storage.foldername(name))[1]::uuid = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)));

DROP POLICY IF EXISTS "contract_attachments_storage_delete_own_company" ON storage.objects;
CREATE POLICY "contract_attachments_storage_delete_own_company"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contract-attachments' AND (
    (storage.foldername(name))[1]::uuid = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)));

COMMIT;
