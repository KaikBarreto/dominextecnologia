-- Serviços executados por equipamento dentro de uma OS com múltiplos serviços.
--
-- A OS continua tendo sua lista global em service_order_service_types. Esta
-- junction detalha em quais equipamentos cada serviço será executado. Os
-- checklists continuam na service_order_equipment e são reconciliados junto com
-- este vínculo pela RPC atômica abaixo.

BEGIN;

CREATE TABLE public.service_order_equipment_service_types (
  service_order_id uuid NOT NULL,
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL
    REFERENCES public.service_types(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_order_id, equipment_id, service_type_id),
  CONSTRAINT service_order_equipment_service_types_order_service_fkey
    FOREIGN KEY (service_order_id, service_type_id)
    REFERENCES public.service_order_service_types(service_order_id, service_type_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_service_order_equipment_service_types_equipment
  ON public.service_order_equipment_service_types(equipment_id);
CREATE INDEX idx_service_order_equipment_service_types_company
  ON public.service_order_equipment_service_types(company_id);

COMMENT ON TABLE public.service_order_equipment_service_types IS
  'Define quais tipos de serviço da OS serão executados em cada equipamento.';

-- Defesa multi-tenant também para service_role/RPC SECURITY DEFINER: os quatro
-- registros envolvidos precisam pertencer à mesma empresa.
CREATE OR REPLACE FUNCTION public.validate_service_order_equipment_service_type_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_company uuid;
  v_equipment_company uuid;
  v_service_company uuid;
BEGIN
  SELECT company_id INTO v_order_company
    FROM public.service_orders
   WHERE id = NEW.service_order_id;
  SELECT company_id INTO v_equipment_company
    FROM public.equipment
   WHERE id = NEW.equipment_id;
  SELECT company_id INTO v_service_company
    FROM public.service_types
   WHERE id = NEW.service_type_id;

  IF v_order_company IS NULL
     OR v_equipment_company IS NULL
     OR v_service_company IS NULL
     OR NEW.company_id IS DISTINCT FROM v_order_company
     OR v_equipment_company IS DISTINCT FROM v_order_company
     OR v_service_company IS DISTINCT FROM v_order_company THEN
    RAISE EXCEPTION 'Equipamento, serviço e OS precisam pertencer à mesma empresa';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_service_order_equipment_service_type_tenant
  BEFORE INSERT OR UPDATE ON public.service_order_equipment_service_types
  FOR EACH ROW EXECUTE FUNCTION public.validate_service_order_equipment_service_type_tenant();

REVOKE ALL ON FUNCTION public.validate_service_order_equipment_service_type_tenant() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.service_order_equipment_service_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own service order equipment services"
  ON public.service_order_equipment_service_types
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR company_id = public.get_user_company_id((SELECT auth.uid()))
  );

REVOKE ALL ON TABLE public.service_order_equipment_service_types FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.service_order_equipment_service_types TO authenticated;
GRANT ALL ON TABLE public.service_order_equipment_service_types TO service_role;

-- Quando o editor de campo antigo remove por completo um equipamento da
-- service_order_equipment, remove também suas atribuições. Se apenas trocar um
-- checklist, as atribuições permanecem.
CREATE OR REPLACE FUNCTION public.cleanup_service_order_equipment_services()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.equipment_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.service_order_equipment soe
        WHERE soe.service_order_id = OLD.service_order_id
          AND soe.equipment_id = OLD.equipment_id
     ) THEN
    DELETE FROM public.service_order_equipment_service_types soest
     WHERE soest.service_order_id = OLD.service_order_id
       AND soest.equipment_id = OLD.equipment_id;
  END IF;
  RETURN OLD;
END;
$function$;

CREATE TRIGGER cleanup_service_order_equipment_services
  AFTER DELETE ON public.service_order_equipment
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_service_order_equipment_services();

REVOKE ALL ON FUNCTION public.cleanup_service_order_equipment_services() FROM PUBLIC, anon, authenticated;

-- Wrapper atômico do escopo de escritório. Primeiro a função consolidada salva
-- equipamento×checklist e limpa respostas órfãs; na MESMA transação sincronizamos
-- equipamento×serviço. Qualquer falha reverte as duas partes.
CREATE OR REPLACE FUNCTION public.sync_service_order_scope_with_services(
  _service_order_id uuid,
  _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_scope jsonb;
  v_services jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT company_id INTO v_company
    FROM public.service_orders
   WHERE id = _service_order_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Ordem de serviço não encontrada';
  END IF;

  IF NOT (public.is_super_admin(v_uid) OR v_company = public.get_user_company_id(v_uid)) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem de serviço';
  END IF;

  DROP TABLE IF EXISTS pg_temp._desired_equipment_services;
  CREATE TEMP TABLE _desired_equipment_services (
    equipment_id uuid NOT NULL,
    service_type_id uuid NOT NULL,
    position integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _desired_equipment_services (equipment_id, service_type_id, position)
  SELECT
    NULLIF(item.value->>'equipment_id', '')::uuid,
    service.value::uuid,
    service.ordinality::integer - 1
  FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) WITH ORDINALITY AS item(value, ordinality)
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(item.value->'service_type_ids') = 'array'
      THEN item.value->'service_type_ids'
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS service(value, ordinality)
  WHERE NULLIF(item.value->>'equipment_id', '') IS NOT NULL;

  -- O payload plano repete service_type_ids uma vez por checklist. Colapsa para
  -- um único vínculo, preservando a menor posição informada.
  DROP TABLE IF EXISTS pg_temp._desired_equipment_services_dedup;
  CREATE TEMP TABLE _desired_equipment_services_dedup ON COMMIT DROP AS
  SELECT equipment_id, service_type_id, min(position)::integer AS position
    FROM _desired_equipment_services
   GROUP BY equipment_id, service_type_id;

  -- Valida todos os IDs antes da função antiga tocar no escopo. SECURITY DEFINER
  -- nunca pode aceitar equipamento/template/serviço de outro tenant.
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) item
      LEFT JOIN public.equipment e
        ON e.id = NULLIF(item->>'equipment_id', '')::uuid
     WHERE NULLIF(item->>'equipment_id', '') IS NOT NULL
       AND (e.id IS NULL OR e.company_id IS DISTINCT FROM v_company)
  ) THEN
    RAISE EXCEPTION 'Equipamento inválido para esta empresa';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) item
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(item->'form_template_ids') = 'array'
          THEN item->'form_template_ids'
          ELSE '[]'::jsonb
        END
      ) AS template_id(value)
      LEFT JOIN public.form_templates ft ON ft.id = template_id.value::uuid
     WHERE ft.id IS NULL OR ft.company_id IS DISTINCT FROM v_company
  ) THEN
    RAISE EXCEPTION 'Checklist inválido para esta empresa';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM _desired_equipment_services_dedup desired
      LEFT JOIN public.service_order_service_types sost
        ON sost.service_order_id = _service_order_id
       AND sost.service_type_id = desired.service_type_id
       AND sost.company_id = v_company
     WHERE sost.service_type_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Serviço do equipamento não pertence a esta ordem de serviço';
  END IF;

  -- Inclui validação de permissão, diff de equipamento×checklist e limpeza
  -- precisa de respostas órfãs.
  v_scope := public.sync_service_order_scope(_service_order_id, _items);

  DELETE FROM public.service_order_equipment_service_types current
   WHERE current.service_order_id = _service_order_id
     AND NOT EXISTS (
       SELECT 1
         FROM _desired_equipment_services_dedup desired
        WHERE desired.equipment_id = current.equipment_id
          AND desired.service_type_id = current.service_type_id
     );

  INSERT INTO public.service_order_equipment_service_types (
    service_order_id,
    equipment_id,
    service_type_id,
    company_id,
    position
  )
  SELECT
    _service_order_id,
    desired.equipment_id,
    desired.service_type_id,
    v_company,
    desired.position
  FROM _desired_equipment_services_dedup desired
  ON CONFLICT (service_order_id, equipment_id, service_type_id)
  DO UPDATE SET position = EXCLUDED.position;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'equipment_id', equipment_id,
        'service_type_id', service_type_id,
        'position', position
      ) ORDER BY equipment_id, position, service_type_id
    ),
    '[]'::jsonb
  ) INTO v_services
  FROM public.service_order_equipment_service_types
  WHERE service_order_id = _service_order_id;

  RETURN v_scope || jsonb_build_object('equipment_services', v_services);
END;
$function$;

COMMENT ON FUNCTION public.sync_service_order_scope_with_services(uuid, jsonb) IS
  'Sincroniza atomicamente equipamento×checklist e equipamento×serviço de uma OS. Valida tenant, permissões e exige que cada serviço do equipamento pertença à lista global da OS.';

REVOKE ALL ON FUNCTION public.sync_service_order_scope_with_services(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_service_order_scope_with_services(uuid, jsonb) TO authenticated, service_role;

-- Backfill seguro das OS existentes: primeiro infere pelo checklist. Quando o
-- equipamento não tem checklist específico, replica os serviços globais da OS,
-- que era exatamente o comportamento anterior do formulário.
INSERT INTO public.service_order_equipment_service_types (
  service_order_id, equipment_id, service_type_id, company_id, position
)
SELECT DISTINCT
  soe.service_order_id,
  soe.equipment_id,
  sost.service_type_id,
  sost.company_id,
  sost.position
FROM public.service_order_equipment soe
JOIN public.form_template_service_types ftst
  ON ftst.template_id = soe.form_template_id
JOIN public.service_order_service_types sost
  ON sost.service_order_id = soe.service_order_id
 AND sost.service_type_id = ftst.service_type_id
WHERE soe.equipment_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.service_order_equipment_service_types (
  service_order_id, equipment_id, service_type_id, company_id, position
)
SELECT DISTINCT
  equipment_scope.service_order_id,
  equipment_scope.equipment_id,
  sost.service_type_id,
  sost.company_id,
  sost.position
FROM (
  SELECT DISTINCT service_order_id, equipment_id
    FROM public.service_order_equipment
   WHERE equipment_id IS NOT NULL
) equipment_scope
JOIN public.service_order_service_types sost
  ON sost.service_order_id = equipment_scope.service_order_id
WHERE NOT EXISTS (
  SELECT 1
    FROM public.service_order_equipment_service_types existing
   WHERE existing.service_order_id = equipment_scope.service_order_id
     AND existing.equipment_id = equipment_scope.equipment_id
)
ON CONFLICT DO NOTHING;

COMMIT;
