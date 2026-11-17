-- Visitas geradas por contrato ainda nascem pelo campo legado
-- service_orders.service_type_id. Desde que a OS passou a aceitar múltiplos
-- serviços, o editor usa as junctions abaixo como fonte canônica. Sem espelhar
-- a visita contratual nelas, a tela mostra o serviço legado, mas a RPC de
-- escopo rejeita o mesmo serviço ao salvar equipamento/checklist.

BEGIN;

CREATE OR REPLACE FUNCTION public.seed_contract_service_order_service_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.origin = 'contract'
     AND NEW.contract_id IS NOT NULL
     AND NEW.service_type_id IS NOT NULL THEN
    INSERT INTO public.service_order_service_types (
      service_order_id,
      service_type_id,
      company_id,
      position
    )
    VALUES (NEW.id, NEW.service_type_id, NEW.company_id, 0)
    ON CONFLICT (service_order_id, service_type_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seed_contract_service_order_service_scope
  ON public.service_orders;
CREATE TRIGGER trg_seed_contract_service_order_service_scope
AFTER INSERT ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.seed_contract_service_order_service_scope();

CREATE OR REPLACE FUNCTION public.seed_contract_equipment_service_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_service_type_id uuid;
BEGIN
  IF NEW.equipment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT so.company_id, so.service_type_id
    INTO v_company_id, v_service_type_id
    FROM public.service_orders so
   WHERE so.id = NEW.service_order_id
     AND so.origin = 'contract'
     AND so.contract_id IS NOT NULL;

  IF v_company_id IS NULL OR v_service_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mantém a FK composta satisfeita mesmo para clientes antigos que criem a
  -- OS e o equipamento no mesmo fluxo sem conhecer as junctions novas.
  INSERT INTO public.service_order_service_types (
    service_order_id,
    service_type_id,
    company_id,
    position
  )
  VALUES (NEW.service_order_id, v_service_type_id, v_company_id, 0)
  ON CONFLICT (service_order_id, service_type_id) DO NOTHING;

  INSERT INTO public.service_order_equipment_service_types (
    service_order_id,
    equipment_id,
    service_type_id,
    company_id,
    position
  )
  VALUES (
    NEW.service_order_id,
    NEW.equipment_id,
    v_service_type_id,
    v_company_id,
    0
  )
  ON CONFLICT (service_order_id, equipment_id, service_type_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seed_contract_equipment_service_scope
  ON public.service_order_equipment;
CREATE TRIGGER trg_seed_contract_equipment_service_scope
AFTER INSERT ON public.service_order_equipment
FOR EACH ROW
EXECUTE FUNCTION public.seed_contract_equipment_service_scope();

REVOKE ALL ON FUNCTION public.seed_contract_service_order_service_scope()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_contract_equipment_service_scope()
  FROM PUBLIC, anon, authenticated;

-- Autocura as visitas contratuais já geradas, inclusive as que foram
-- recriadas ao editar um contrato depois da introdução das junctions.
INSERT INTO public.service_order_service_types (
  service_order_id,
  service_type_id,
  company_id,
  position
)
SELECT so.id, so.service_type_id, so.company_id, 0
  FROM public.service_orders so
 WHERE so.origin = 'contract'
   AND so.contract_id IS NOT NULL
   AND so.service_type_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM public.service_order_service_types current
      WHERE current.service_order_id = so.id
   )
ON CONFLICT (service_order_id, service_type_id) DO NOTHING;

INSERT INTO public.service_order_equipment_service_types (
  service_order_id,
  equipment_id,
  service_type_id,
  company_id,
  position
)
SELECT DISTINCT
  soe.service_order_id,
  soe.equipment_id,
  sost.service_type_id,
  sost.company_id,
  sost.position
  FROM public.service_order_equipment soe
  JOIN public.service_orders so ON so.id = soe.service_order_id
  JOIN public.service_order_service_types sost
    ON sost.service_order_id = soe.service_order_id
 WHERE so.origin = 'contract'
   AND so.contract_id IS NOT NULL
   AND soe.equipment_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM public.service_order_equipment_service_types current
      WHERE current.service_order_id = soe.service_order_id
        AND current.equipment_id = soe.equipment_id
   )
ON CONFLICT (service_order_id, equipment_id, service_type_id) DO NOTHING;

COMMENT ON FUNCTION public.seed_contract_service_order_service_scope() IS
  'Espelha o serviço legado de uma visita contratual na relação canônica de serviços da OS.';
COMMENT ON FUNCTION public.seed_contract_equipment_service_scope() IS
  'Atribui o serviço contratual ao equipamento quando o escopo da visita é criado.';

COMMIT;
