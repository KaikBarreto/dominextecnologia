-- Correção de DADOS pós-auditoria dos manuais do catálogo de AC (domain='ar_condicionado').
-- A coluna manual_type já existe (20260616160000) — aqui NÃO há mudança de schema.
-- Auditoria revelou que vários modelos estavam rotulados manual_type='instalacao' mas o PDF
-- na verdade era manual do usuário/guia; e para 18 modelos conseguimos um manual de
-- instalação/serviço melhor (já hospedado e validado HTTP 200 no bucket equipment-catalog).
--
-- 38 mudanças no total, chaveadas por equipment_models.id (catálogo global Auctus,
-- ambiente único, IDs estáveis em prod):
--   * 18 UPGRADES  -> SET manual_type E manual_url (novo PDF)
--   * 20 CORRECOES -> SET manual_type apenas (manual_url inalterada)
-- Não toca RLS nem outras tabelas.

-- ============================================================
-- 1) UPGRADES: novo manual_type + nova manual_url
-- ============================================================
UPDATE public.equipment_models AS em
SET manual_type = v.tipo,
    manual_url  = v.url
FROM (VALUES
  ('103f9743-881a-4283-8568-6651568ca93f'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/carrier-springer-teto-42zqvd36m5-instalacao.pdf'),
  ('69bddb5c-026a-4bca-8a13-d1238e64e164'::uuid, 'servico',    'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/komeco-kohi-inverter-servico.pdf'),
  ('d9ae4d13-69c5-48f1-a7e7-0fb1cda5f4ae'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/gree-eco-garden-inverter-instalacao.pdf'),
  ('51bb8ee5-a6f5-44ef-a273-12f626a6ae29'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/philco-m15-instalacao.pdf'),
  ('a54c7491-d40c-4225-ac89-d765db520807'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/philco-m15-instalacao.pdf'),
  ('db7e6e16-e5df-479d-a6ee-23928f4f82ab'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/carrier-springer-teto-42zqvd36m5-instalacao.pdf'),
  ('fe45751f-9258-4a70-ab6f-bdd2a183fd81'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/gree-eco-garden-inverter-instalacao.pdf'),
  ('052293dc-851c-4f3c-b119-cf8ff98aaf4c'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/philco-m15-instalacao.pdf'),
  ('c2dc6846-3209-45e4-a192-2c5e5254a99e'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/philco-m15-instalacao.pdf'),
  ('315e7281-c5c6-4962-8b60-e3c51a17f523'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/tcl-cassete-csg-ct-inv-instalacao.pdf'),
  ('8b96cb65-318e-4d6e-a1b4-992684b3224c'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/gree-eco-garden-inverter-instalacao.pdf'),
  ('f7941cd3-51f2-435f-b66f-bb0fad825bd4'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/samsung-windfree-dyfa-instalacao.pdf'),
  ('c7f29e43-fb90-48fa-9871-1ef21637a5c3'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/samsung-windfree-dyfa-instalacao.pdf'),
  ('8518d250-0245-463e-ab89-9a745f2c1e3a'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/samsung-windfree-dyfa-instalacao.pdf'),
  ('f541a89a-10e9-4156-9921-064cbc55f476'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/samsung-windfree-dyfa-instalacao.pdf'),
  ('0d0d2edc-8635-4cb7-b599-b12a18ec9376'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/tcl-piso-teto-csg-cf-inv-instalacao.pdf'),
  ('16292a19-183f-4893-91a8-528a412a8efb'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/philco-m15-instalacao.pdf'),
  ('662d6f02-872a-4434-96af-03ebf87ecfec'::uuid, 'instalacao', 'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/equipment-catalog/manuals/upgrades/gree-eco-garden-inverter-instalacao.pdf')
) AS v(id, tipo, url)
WHERE em.id = v.id;

-- ============================================================
-- 2) CORRECOES DE RÓTULO: novo manual_type apenas (manual_url inalterada)
-- ============================================================
UPDATE public.equipment_models AS em
SET manual_type = v.tipo
FROM (VALUES
  ('76494db4-172a-494b-badc-43605d54e02e'::uuid, 'usuario'),
  ('1a64e60a-93db-44f8-9d8f-115d187ac6b2'::uuid, 'usuario'),
  ('955e9859-f756-4f5e-9433-c9a6b8216234'::uuid, 'guia'),
  ('6659def7-6f7b-4ef5-86f2-331ad0aa2efa'::uuid, 'usuario'),
  ('45cd0e78-723d-4514-a016-960361165027'::uuid, 'usuario'),
  ('84cfdcff-38f3-44ae-a3ec-726b21859081'::uuid, 'usuario'),
  ('5c1efdea-3d59-4e0c-8ac7-d0e392ad8104'::uuid, 'usuario'),
  ('6e68fc64-1651-484e-a715-db6f79237656'::uuid, 'usuario'),
  ('13359d45-72a4-4648-b30e-2036c88c4467'::uuid, 'usuario'),
  ('e9ddc770-28f8-4765-8d40-add1c5eff6c6'::uuid, 'usuario'),
  ('3a702600-23db-4d6a-9a1f-7b310ae43694'::uuid, 'usuario'),
  ('b0cd1c70-4a07-4312-980c-2a218f13d64f'::uuid, 'usuario'),
  ('fed50c64-2069-46e2-9212-64fbe4761578'::uuid, 'usuario'),
  ('a3baa4f3-d6b7-43bf-b324-8f352300e536'::uuid, 'usuario'),
  ('5d9fca9b-827a-4ec3-9ea9-32f3a121eac9'::uuid, 'usuario'),
  ('088b8017-8ee1-41c0-be5f-8c7c3e26e6eb'::uuid, 'usuario'),
  ('e37f92da-aa4d-4a01-88cc-a69082eff99a'::uuid, 'usuario'),
  ('0d4dd52d-8bed-4b8e-a160-47b24b0ee5da'::uuid, 'usuario'),
  ('ea54128a-c905-4f08-877d-8c9aa09ca627'::uuid, 'usuario'),
  ('15385c46-10e9-41df-8671-9fda9374a7fc'::uuid, 'usuario')
) AS v(id, tipo)
WHERE em.id = v.id;
