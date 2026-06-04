-- Fix v1.9.36 (continuação): UNIQUE per-tenant em equipment_field_config.field_key
-- e os_statuses.key. Mesma família do bug do inventory.sku — UNIQUE global vazava
-- isolamento entre tenants. Hoje só 1 tenant em cada → bug não manifestou ainda,
-- mas latente: assim que o 2º tenant tentar criar um field_key/status key que já
-- existe pra outro tenant, 23505 dispara. Fix proativo.

-- ============================================================================
-- equipment_field_config.field_key
-- ============================================================================

ALTER TABLE public.equipment_field_config
  DROP CONSTRAINT IF EXISTS equipment_field_config_field_key_key;

-- DEFENSIVO: dedupe (company_id, field_key) caso existam dupes intra-tenant
-- (mantém a row mais antiga por created_at).
DELETE FROM public.equipment_field_config p1
USING public.equipment_field_config p2
WHERE p1.company_id = p2.company_id
  AND p1.field_key IS NOT NULL
  AND p1.field_key = p2.field_key
  AND p1.created_at > p2.created_at;

ALTER TABLE public.equipment_field_config
  ADD CONSTRAINT equipment_field_config_company_id_field_key_key
  UNIQUE (company_id, field_key);

-- ============================================================================
-- os_statuses.key
-- ============================================================================

ALTER TABLE public.os_statuses
  DROP CONSTRAINT IF EXISTS os_statuses_key_key;

DELETE FROM public.os_statuses p1
USING public.os_statuses p2
WHERE p1.company_id = p2.company_id
  AND p1.key IS NOT NULL
  AND p1.key = p2.key
  AND p1.created_at > p2.created_at;

ALTER TABLE public.os_statuses
  ADD CONSTRAINT os_statuses_company_id_key_key
  UNIQUE (company_id, key);
