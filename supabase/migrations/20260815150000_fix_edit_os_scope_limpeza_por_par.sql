-- ============================================================================
-- FIX de integridade — edit_service_order_scope: limpeza de respostas órfãs
-- PRECISA por par (equipment_id, form_template_id), não por template global.
--
-- Por quê (BUG corrigido):
--   A versão original (migration 20260815120000) assumiu, ERRADO, que
--   form_responses NÃO tinha coluna equipment_id, e por isso limpava respostas
--   órfãs "por template": só apagava as respostas de um form_template_id quando
--   NENHUM par remanescente na OS ainda usava aquele template.
--
--   Isso está errado. form_responses TEM equipment_id (uuid, FK -> equipment,
--   ON DELETE SET NULL), adicionada na migration 20260323145612. As respostas
--   se amarram a (service_order_id, equipment_id, question_id); a pergunta amarra
--   ao template via form_questions.template_id. A UI (TechnicianOS) agrupa
--   respostas por (equipment_id, template_id).
--
--   Falha concreta da lógica antiga:
--     OS com (Equip A + checklist X respondido) e (Equip B + checklist X
--     respondido). Usuário remove o checklist X SÓ do Equip A. O estado final
--     ainda tem (B, X), então a lógica "por template" não apagava nada → as
--     respostas de (A, X) viravam órfãs eternas (acúmulo de lixo que polui
--     contagem e PDF). Já tivemos incidente de acúmulo por exclusão mal feita.
--
-- Correção:
--   Para cada par (equipment_id, form_template_id) que EXISTIA na junction ANTES
--   e NÃO está no _items desejado (par removido), apagar as form_responses onde:
--     - service_order_id = _service_order_id
--     - equipment_id IS NOT DISTINCT FROM o equipment_id do par removido
--       (IS NOT DISTINCT FROM casa NULL com NULL — respostas de checklist avulso)
--     - question_id IN (SELECT id FROM form_questions WHERE template_id = <tmpl do par>)
--
--   Só apaga respostas de pares REALMENTE removidos. Se o mesmo template continua
--   em OUTRO equipamento, as respostas DAQUELE outro equipamento NÃO são tocadas.
--   Se um equipamento inteiro sai, todos os pares dele são "removidos" e suas
--   respostas em todos os templates são limpas.
--
-- Idempotente: CREATE OR REPLACE FUNCTION (mesma assinatura). Rechamar com o
-- mesmo _items = no-op (0 respostas apagadas na segunda vez).
-- Assinatura, params e retorno INALTERADOS -> não requer regen de types.ts.
--
-- Mantido intacto: guarda de posse/tenant, can_edit_os, bloqueio PMOC, diff
-- incremental da junction, GRANT EXECUTE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.edit_service_order_scope(
  _service_order_id uuid,
  _items jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid            uuid := auth.uid();
  v_company        uuid;
  v_os_company     uuid;
  v_contract_id    uuid;
  v_is_pmoc        boolean;
  v_removed        int := 0;
  v_inserted       int := 0;
  v_resp_deleted   int := 0;
  v_result         jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Posse/tenant: a OS tem que existir e pertencer à empresa do usuário
  -- (ou o usuário ser super_admin).
  SELECT so.company_id, so.contract_id
    INTO v_os_company, v_contract_id
    FROM public.service_orders so
   WHERE so.id = _service_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de serviço não encontrada';
  END IF;

  v_company := get_user_company_id(v_uid);

  IF NOT (is_super_admin(v_uid) OR v_os_company = v_company) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem de serviço';
  END IF;

  -- Permissão fina de editar OS em campo
  IF NOT (is_super_admin(v_uid) OR public.can_edit_os(v_uid)) THEN
    RAISE EXCEPTION 'Sem permissão para editar o escopo desta ordem de serviço';
  END IF;

  -- Guard PMOC: v1 só edita OS avulsa. OS de contrato PMOC é gerada por plano.
  IF v_contract_id IS NOT NULL THEN
    SELECT c.is_pmoc INTO v_is_pmoc
      FROM public.contracts c
     WHERE c.id = v_contract_id;
    IF v_is_pmoc IS TRUE THEN
      RAISE EXCEPTION 'Edição manual indisponível em OS de PMOC';
    END IF;
  END IF;

  -- Normaliza o estado desejado em uma tabela temporária de PARES.
  -- Cada item vira 1+ pares (equipment_id, form_template_id):
  --   - se form_template_ids vazio/ausente => 1 par (equipment_id, NULL)
  --   - senão => 1 par por template
  CREATE TEMP TABLE _desired (
    equipment_id uuid,
    form_template_id uuid
  ) ON COMMIT DROP;

  INSERT INTO _desired (equipment_id, form_template_id)
  SELECT
    NULLIF(item->>'equipment_id','')::uuid AS equipment_id,
    tmpl::uuid AS form_template_id
  FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) AS item
  LEFT JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(item->'form_template_ids') = 'array'
           AND jsonb_array_length(item->'form_template_ids') > 0
      THEN item->'form_template_ids'
      ELSE '[null]'::jsonb   -- garante 1 linha com template NULL quando não há templates
    END
  ) AS tmpl ON true;

  -- Dedup defensivo (a UNIQUE da junction trata NULL como distinto, então
  -- evitamos inserir pares repetidos vindos do payload).
  DELETE FROM _desired a
   USING _desired b
   WHERE a.ctid > b.ctid
     AND a.equipment_id IS NOT DISTINCT FROM b.equipment_id
     AND a.form_template_id IS NOT DISTINCT FROM b.form_template_id;

  -- ---- REMOÇÕES: pares que existem hoje mas não estão no desejado -----------
  -- 1) Apagar respostas órfãs — PRECISO POR PAR (equipment_id, form_template_id).
  --    form_responses TEM equipment_id (FK -> equipment). Para cada par removido
  --    (equip, template), apagamos SÓ as respostas daquele equipamento naquele
  --    template. IS NOT DISTINCT FROM casa NULL=NULL (checklist avulso). Respostas
  --    do MESMO template em OUTRO equipamento remanescente NÃO são tocadas.
  WITH current_pairs AS (
    SELECT soe.equipment_id, soe.form_template_id
      FROM public.service_order_equipment soe
     WHERE soe.service_order_id = _service_order_id
  ),
  to_remove AS (
    SELECT cp.equipment_id, cp.form_template_id
      FROM current_pairs cp
      LEFT JOIN _desired d
        ON d.equipment_id IS NOT DISTINCT FROM cp.equipment_id
       AND d.form_template_id IS NOT DISTINCT FROM cp.form_template_id
     WHERE d.equipment_id IS NULL AND d.form_template_id IS NULL
       -- pares com form_template_id NULL não têm respostas atreladas (sem template
       -- => sem questions), então só interessa limpar pares com template definido
       AND cp.form_template_id IS NOT NULL
  ),
  del_resp AS (
    DELETE FROM public.form_responses fr
     USING to_remove tr
     WHERE fr.service_order_id = _service_order_id
       AND fr.equipment_id IS NOT DISTINCT FROM tr.equipment_id
       AND fr.question_id IN (
         SELECT fq.id FROM public.form_questions fq
          WHERE fq.template_id = tr.form_template_id
       )
    RETURNING 1
  )
  SELECT count(*) INTO v_resp_deleted FROM del_resp;

  -- 2) Remover os pares da junction.
  WITH current_pairs AS (
    SELECT soe.id, soe.equipment_id, soe.form_template_id
      FROM public.service_order_equipment soe
     WHERE soe.service_order_id = _service_order_id
  ),
  to_remove AS (
    SELECT cp.id
      FROM current_pairs cp
      LEFT JOIN _desired d
        ON d.equipment_id IS NOT DISTINCT FROM cp.equipment_id
       AND d.form_template_id IS NOT DISTINCT FROM cp.form_template_id
     WHERE d.equipment_id IS NULL AND d.form_template_id IS NULL
  ),
  del_rows AS (
    DELETE FROM public.service_order_equipment soe
     WHERE soe.id IN (SELECT id FROM to_remove)
    RETURNING 1
  )
  SELECT count(*) INTO v_removed FROM del_rows;

  -- ---- INSERÇÕES: pares desejados que ainda não existem ---------------------
  WITH current_pairs AS (
    SELECT soe.equipment_id, soe.form_template_id
      FROM public.service_order_equipment soe
     WHERE soe.service_order_id = _service_order_id
  ),
  to_insert AS (
    SELECT d.equipment_id, d.form_template_id
      FROM _desired d
      LEFT JOIN current_pairs cp
        ON cp.equipment_id IS NOT DISTINCT FROM d.equipment_id
       AND cp.form_template_id IS NOT DISTINCT FROM d.form_template_id
     WHERE cp.equipment_id IS NULL AND cp.form_template_id IS NULL
  ),
  ins_rows AS (
    INSERT INTO public.service_order_equipment (service_order_id, equipment_id, form_template_id)
    SELECT _service_order_id, ti.equipment_id, ti.form_template_id
      FROM to_insert ti
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins_rows;

  -- Estado final da junction (pra UI re-renderizar sem refetch).
  SELECT jsonb_build_object(
           'service_order_id', _service_order_id,
           'removed', v_removed,
           'inserted', v_inserted,
           'responses_deleted', v_resp_deleted,
           'scope', COALESCE(
             (SELECT jsonb_agg(
                       jsonb_build_object(
                         'id', soe.id,
                         'equipment_id', soe.equipment_id,
                         'form_template_id', soe.form_template_id
                       )
                       ORDER BY soe.equipment_id NULLS FIRST, soe.form_template_id NULLS FIRST
                     )
                FROM public.service_order_equipment soe
               WHERE soe.service_order_id = _service_order_id),
             '[]'::jsonb
           )
         )
    INTO v_result;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.edit_service_order_scope(uuid, jsonb) IS
  'Salva atomicamente o escopo (equipamentos + checklists) de uma OS avulsa via DIFF incremental na junction service_order_equipment. Re-valida tenant + can_edit_os, bloqueia OS de PMOC, limpa respostas órfãs de forma PRECISA por par (equipment_id, form_template_id) removido (form_responses.equipment_id existe). _items = array de {equipment_id: uuid|null, form_template_ids: uuid[]}. Idempotente. Retorna jsonb {removed, inserted, responses_deleted, scope[]}.';

GRANT EXECUTE ON FUNCTION public.edit_service_order_scope(uuid, jsonb) TO authenticated;
