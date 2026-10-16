-- ============================================================================
-- Isolamento multi-tenant do Storage — ONDA 2, PARTE 2: as policies (16/10/2026)
--
-- Fecha `customer-photos`, `employee-photos`, `financial-receipts`,
-- `equipment-files` e `company-logos` lendo o carimbo de empresa que a parte 1
-- (`20261016120000`) gravou no acervo e que o front passou a enviar em todo
-- upload novo (`src/utils/tenantStorage.ts`).
--
-- ⚠️ ORDEM OBRIGATÓRIA: esta migration só pode ser aplicada DEPOIS que o front
-- carimbado estiver NO AR. Aplicada antes, derruba todo upload desses 5 buckets,
-- porque a policy de INSERT exige o carimbo. Conferido antes de rodar: produção
-- servindo v1.33.2.
--
-- Carimbo AUSENTE = órfão (273 objetos, ver parte 1): ninguém de tenant nenhum
-- alcança. Só super_admin e service_role. É o estado certo para lixo.
--
-- A LEITURA dos 3 buckets PÚBLICOS (customer-photos, equipment-files,
-- company-logos) continua liberada de propósito: o arquivo já é servido por URL
-- direta, que nem passa por RLS. Fechar aqui não protegeria nada e quebraria
-- logo de white-label em página pública, foto em PDF e link já enviado ao
-- cliente. Nesses, o que estava aberto de verdade era a ESCRITA — inclusive
-- trocar o LOGO de outra empresa, que é desfiguração de marca (regra-lei 2).
-- Nos 2 PRIVADOS (comprovante financeiro, foto de funcionário) a leitura fecha.
-- ============================================================================

-- ─── 3. Policies ────────────────────────────────────────────────────────────

-- O carimbo é da MINHA empresa? (ou sou super_admin)
CREATE OR REPLACE FUNCTION public.storage_stamp_company_ok(meta jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT public.is_super_admin((SELECT auth.uid()))
      OR (meta->>'company_id')::uuid = public.get_user_company_id((SELECT auth.uid()));
$fn$;

COMMENT ON FUNCTION public.storage_stamp_company_ok(jsonb) IS
  'Objeto carimbado com a empresa do chamador (ver storage.stamp_company_id). Objeto SEM carimbo é órfão: ninguém de tenant nenhum alcança, só super_admin e service_role.';

-- Posso ENVIAR este arquivo? É AQUI que mora a autoridade do carimbo: o valor
-- que o cliente declarou tem que ser a empresa REAL do chamador. Declarar a
-- empresa de outro é recusado, e subir SEM carimbo também — fail-closed, porque
-- arquivo sem dono é arquivo que ninguém consegue abrir depois.
-- Onde a pasta já identifica a empresa (financial-receipts), ela também tem que
-- ser a minha, pra não plantar arquivo dentro do espaço alheio.
CREATE OR REPLACE FUNCTION public.storage_insert_company_ok(meta jsonb, object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $fn$
  SELECT public.is_super_admin((SELECT auth.uid()))
      OR (
           (meta->>'company_id')::uuid = public.get_user_company_id((SELECT auth.uid()))
           AND NOT EXISTS (
             SELECT 1 FROM public.companies c
             WHERE c.id = public.storage_folder_uuid(object_name)
               AND c.id <> public.get_user_company_id((SELECT auth.uid()))
           )
         );
$fn$;

GRANT EXECUTE ON FUNCTION public.storage_stamp_company_ok(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_insert_company_ok(jsonb, text) TO authenticated;

-- 3.1 employee-photos (PRIVADO — foto de funcionário, LGPD)
DROP POLICY IF EXISTS "Authenticated read employee photos"            ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload employee photos"          ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update employee photos"          ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete employee photos"          ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete employee photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update employee photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload employee photos" ON storage.objects;

CREATE POLICY "employee_photos_select_own_company" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'employee-photos' AND public.is_user_active((SELECT auth.uid())) AND public.storage_stamp_company_ok(user_metadata));
CREATE POLICY "employee_photos_insert_own_company" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-photos' AND public.is_user_active((SELECT auth.uid())) AND public.storage_insert_company_ok(user_metadata, name));
CREATE POLICY "employee_photos_update_own_company" ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'employee-photos' AND public.storage_stamp_company_ok(user_metadata))
  WITH CHECK (bucket_id = 'employee-photos' AND public.storage_insert_company_ok(user_metadata, name));
CREATE POLICY "employee_photos_delete_own_company" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'employee-photos' AND public.storage_stamp_company_ok(user_metadata));

-- 3.2 financial-receipts (PRIVADO — comprovante financeiro)
DROP POLICY IF EXISTS "Authenticated read financial receipts"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload financial receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update financial receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete financial receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload receipts"  ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete receipts"  ON storage.objects;

CREATE POLICY "financial_receipts_select_own_company" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'financial-receipts' AND public.is_user_active((SELECT auth.uid())) AND public.storage_stamp_company_ok(user_metadata));
CREATE POLICY "financial_receipts_insert_own_company" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'financial-receipts' AND public.is_user_active((SELECT auth.uid())) AND public.storage_insert_company_ok(user_metadata, name));
CREATE POLICY "financial_receipts_update_own_company" ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'financial-receipts' AND public.storage_stamp_company_ok(user_metadata))
  WITH CHECK (bucket_id = 'financial-receipts' AND public.storage_insert_company_ok(user_metadata, name));
CREATE POLICY "financial_receipts_delete_own_company" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'financial-receipts' AND public.storage_stamp_company_ok(user_metadata));

-- 3.3 customer-photos / equipment-files / company-logos (buckets PÚBLICOS)
-- A LEITURA segue pública porque o arquivo já é servido por URL direta, que nem
-- passa por RLS: fechar aqui não protegeria nada e quebraria logo de white-label
-- em página pública, foto em PDF e link já enviado ao cliente. O que estava
-- aberto de verdade era a ESCRITA — inclusive trocar o LOGO de outra empresa,
-- que é desfiguração de marca (regra-lei 2).
DROP POLICY IF EXISTS "Authenticated upload customer photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update customer photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete customer photos" ON storage.objects;

CREATE POLICY "customer_photos_insert_own_company" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'customer-photos' AND public.storage_insert_company_ok(user_metadata, name));
CREATE POLICY "customer_photos_update_own_company" ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'customer-photos' AND public.storage_stamp_company_ok(user_metadata))
  WITH CHECK (bucket_id = 'customer-photos' AND public.storage_insert_company_ok(user_metadata, name));
CREATE POLICY "customer_photos_delete_own_company" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'customer-photos' AND public.storage_stamp_company_ok(user_metadata));

DROP POLICY IF EXISTS "Authenticated users can upload equipment files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete equipment files" ON storage.objects;

CREATE POLICY "equipment_files_insert_own_company" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'equipment-files' AND public.storage_insert_company_ok(user_metadata, name));
CREATE POLICY "equipment_files_update_own_company" ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'equipment-files' AND public.storage_stamp_company_ok(user_metadata))
  WITH CHECK (bucket_id = 'equipment-files' AND public.storage_insert_company_ok(user_metadata, name));
CREATE POLICY "equipment_files_delete_own_company" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'equipment-files' AND public.storage_stamp_company_ok(user_metadata));

DROP POLICY IF EXISTS "Authenticated users can upload company logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update company logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete company logos" ON storage.objects;

CREATE POLICY "company_logos_insert_own_company" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos' AND public.storage_insert_company_ok(user_metadata, name));
CREATE POLICY "company_logos_update_own_company" ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'company-logos' AND public.storage_stamp_company_ok(user_metadata))
  WITH CHECK (bucket_id = 'company-logos' AND public.storage_insert_company_ok(user_metadata, name));
CREATE POLICY "company_logos_delete_own_company" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos' AND public.storage_stamp_company_ok(user_metadata));
