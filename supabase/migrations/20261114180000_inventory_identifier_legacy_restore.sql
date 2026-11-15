-- Restaura SKU/GTIN/barcode desativado por versões antigas sem criar uma
-- segunda linha e colidir com a UNIQUE canônica. Preserva tenant e ACLs do
-- trigger interno; não faz backfill, rollout de módulo ou alteração de saldo.
-- Regressão: inventory_identifiers_v2.sql (legado inativo/não principal).

CREATE OR REPLACE FUNCTION public.inventory_sync_primary_identifiers_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_unit text := COALESCE(NULLIF(btrim(NEW.unit), ''), 'un');
  v_type text;
  v_code text;
  v_identifier_id uuid;
BEGIN
  IF NEW.customer_id IS NOT NULL THEN RETURN NEW; END IF;

  FOREACH v_type IN ARRAY ARRAY['sku', 'gtin', 'barcode'] LOOP
    v_code := CASE v_type
      WHEN 'sku' THEN NULLIF(btrim(NEW.sku), '')
      WHEN 'gtin' THEN NULLIF(btrim(NEW.fiscal_gtin), '')
      ELSE CASE
        WHEN public.inventory_normalize_identifier_v2(NEW.barcode)
          IS NOT DISTINCT FROM public.inventory_normalize_identifier_v2(NEW.fiscal_gtin)
          THEN NULL
        ELSE NULLIF(btrim(NEW.barcode), '')
      END
    END;

    SELECT identifier.id
      INTO v_identifier_id
      FROM public.inventory_identifiers identifier
     WHERE identifier.company_id = NEW.company_id
       AND identifier.inventory_id = NEW.id
       AND identifier.identifier_type = v_type
       AND (identifier.is_primary IS TRUE
         OR (v_code IS NOT NULL AND identifier.normalized_code = public.inventory_normalize_identifier_v2(v_code)))
     -- Versões antigas desativavam a marca de principal. Reaproveitar a linha
     -- do código exato evita colidir com o próprio histórico na UNIQUE.
     ORDER BY (identifier.normalized_code IS NOT DISTINCT FROM public.inventory_normalize_identifier_v2(v_code)) DESC,
       identifier.is_active DESC, identifier.created_at, identifier.id
     LIMIT 1
     FOR UPDATE;

    IF v_code IS NULL THEN
      IF v_identifier_id IS NOT NULL THEN
        UPDATE public.inventory_identifiers
           SET is_active = false,
               -- O índice de principal considera apenas linhas ativas. Manter
               -- esta marca permite reativar A após A -> vazio/GTIN -> A sem
               -- colidir com a própria linha inativa na UNIQUE de código.
               is_primary = true,
               unit_label = v_unit
         WHERE id = v_identifier_id;
      END IF;
    ELSIF v_identifier_id IS NULL THEN
      INSERT INTO public.inventory_identifiers(
        company_id, inventory_id, identifier_type, code, normalized_code,
        unit_label, unit_factor, is_primary, is_active
      ) VALUES (
        NEW.company_id, NEW.id, v_type, v_code,
        public.inventory_normalize_identifier_v2(v_code), v_unit, 1, true, true
      );
    ELSE
      -- Se o código restaurado já existia como não principal, a linha primária
      -- atual deixa de representar a coluna legada. Aliases não primários e
      -- embalagens continuam intactos.
      UPDATE public.inventory_identifiers
         SET is_primary = false,
             is_active = false
       WHERE company_id = NEW.company_id
         AND inventory_id = NEW.id
         AND identifier_type = v_type
         AND is_primary IS TRUE
         AND is_active IS TRUE
         AND id <> v_identifier_id;

      UPDATE public.inventory_identifiers
         SET code = v_code,
             normalized_code = public.inventory_normalize_identifier_v2(v_code),
             unit_label = v_unit,
             unit_factor = 1,
             is_primary = true,
             is_active = true
       WHERE id = v_identifier_id;
    END IF;

    v_identifier_id := NULL;
  END LOOP;

  UPDATE public.inventory_identifiers
     SET unit_label = v_unit
   WHERE company_id = NEW.company_id
     AND inventory_id = NEW.id
     AND unit_factor = 1
     AND identifier_type = 'internal';

  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Um dos códigos do material já está em uso nesta empresa.'
    USING ERRCODE = '23505', DETAIL = 'code=inventory_identifier_collision';
END;
$function$;

REVOKE ALL ON FUNCTION public.inventory_sync_primary_identifiers_v2()
  FROM PUBLIC, anon, authenticated, service_role;
;
