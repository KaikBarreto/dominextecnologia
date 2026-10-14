-- ============================================================================
-- sync_service_order_scope — escopo de OS salvo pelo ESCRITÓRIO (atômico)
--
-- Por quê:
--   Existiam DOIS caminhos gravando service_order_equipment:
--     1) Campo    -> RPC edit_service_order_scope (20260815120000 +
--                    20260815150000): diff incremental + limpeza PRECISA de
--                    respostas órfãs por par (equipment_id, form_template_id).
--     2) Escritório -> src/hooks/useServiceOrders.ts fazia
--                    delete().eq('service_order_id', id) + insert(rows) DIRETO
--                    do client e NUNCA tocava em form_responses.
--
--   O caminho 2 é o anti-padrão já documentado (incidente v1.19.2 do
--   contract_plan_activities): "replace children" no client não é atômico e não
--   cuida das tabelas dependentes. Consequência medida em produção: a OS 8006
--   (f903705d-b2df-4954-bd67-97c710ef87d3, Glacial Cold Brasil) ficou com 1 par
--   de escopo e 15 respostas órfãs (equipment_id NULL) do template
--   "Instalação de Split". O OSReport agrupa a partir de form_responses, então o
--   relatório — inclusive o link PÚBLICO do cliente — exibia um checklist
--   fantasma que não existe mais no escopo.
--
--   Esta RPC dá ao escritório o mesmo motor do campo: diff incremental na
--   junction + limpeza por par das respostas órfãs, em UMA transação.
--
-- Diferenças deliberadas em relação a edit_service_order_scope:
--   a) PERMISSÃO: o caminho de escritório é gateado por "fn:edit_os"
--      ("Editar OS"), não pela permissão de campo "fn:editar_os_campo". Aceita
--      super_admin, can_edit_os, is_admin_or_gestor, has_full_permissions ou
--      "fn:edit_os"/"*" em user_permissions.
--   b) SEM bloqueio de PMOC: o formulário de escritório HOJE já edita OS de
--      contrato/PMOC. Recusar aqui seria regressão funcional.
--   c) 🚨 A LIMPEZA DE RESPOSTAS ÓRFÃS SÓ RODA QUANDO so.contract_id IS NULL.
--      Invariante de SEGURANÇA DE DADO, não detalhe de implementação: em OS de
--      contrato o escopo real vem de contract_items, não da junction. Medição em
--      produção achou 93 pares / 360 respostas legítimas que vivem FORA da
--      junction nessas OSs. Se a limpeza rodasse nelas, apagaria histórico de
--      PMOC de cliente. Em OS de contrato: sincroniza a junction e devolve
--      responses_deleted = 0.
--
-- Contrato (idêntico ao de edit_service_order_scope, pra o hook tratar os dois
-- retornos do mesmo jeito):
--   _items = ESTADO DESEJADO COMPLETO; array de
--            {equipment_id: uuid|null, form_template_ids: uuid[]}
--            equipment_id null  => checklists avulsos (nível OS)
--            form_template_ids [] => equipamento presente sem checklist
--   retorno = {service_order_id, removed, inserted, responses_deleted, scope[]}
--
-- Idempotente: CREATE OR REPLACE. Rechamar com o mesmo _items = no-op
-- (removed/inserted/responses_deleted todos 0).
-- Assinatura nova: o hook chama via cast `as any` (mesmo padrão de
-- src/hooks/useEditOsScope.ts), sem regen de types.ts.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_service_order_scope(
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
  v_removed        int := 0;
  v_inserted       int := 0;
  v_resp_deleted   int := 0;
  v_result         jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Posse/tenant: a OS tem que existir e pertencer à empresa do usuário
  -- (ou o usuário ser super_admin). IDÊNTICO ao caminho de campo.
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

  -- Permissão do caminho de ESCRITÓRIO: "fn:edit_os" (Editar OS).
  IF NOT (
    is_super_admin(v_uid)
    OR public.can_edit_os(v_uid)
    OR public.is_admin_or_gestor(v_uid)
    OR public.has_full_permissions(v_uid)
    OR EXISTS (
         SELECT 1
           FROM public.user_permissions up
          WHERE up.user_id = v_uid
            AND up.is_active = true
            AND (up.permissions ? '*' OR up.permissions @> '"fn:edit_os"'::jsonb)
       )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para editar esta ordem de serviço';
  END IF;

  -- Normaliza o estado desejado em uma tabela temporária de PARES.
  -- Nome _desired_office (não _desired) pra não colidir com a temp table de
  -- edit_service_order_scope caso as duas rodem na mesma transação.
  -- O DROP antes do CREATE não é decoração: TEMP TABLE ... ON COMMIT DROP só cai
  -- no COMMIT, então DUAS chamadas desta função na MESMA transação estouravam
  -- 42P07 "relation _desired_office already exists" (medido em smoke test; a
  -- irmã edit_service_order_scope tem o mesmo defeito). Via PostgREST cada RPC é
  -- sua própria transação e isso não aparece — mas um DO block ou outra função
  -- que chame duas vezes quebrava.
  DROP TABLE IF EXISTS pg_temp._desired_office;
  CREATE TEMP TABLE _desired_office (
    equipment_id uuid,
    form_template_id uuid
  ) ON COMMIT DROP;

  INSERT INTO _desired_office (equipment_id, form_template_id)
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
  DELETE FROM _desired_office a
   USING _desired_office b
   WHERE a.ctid > b.ctid
     AND a.equipment_id IS NOT DISTINCT FROM b.equipment_id
     AND a.form_template_id IS NOT DISTINCT FROM b.form_template_id;

  -- ---- REMOÇÕES: pares que existem hoje mas não estão no desejado -----------
  -- 1) Respostas órfãs — SÓ em OS SEM contrato (ver cabeçalho, invariante de
  --    segurança de dado). Limpeza PRECISA por par (equipment_id, template):
  --    IS NOT DISTINCT FROM casa NULL=NULL (checklist avulso) e respostas do
  --    MESMO template em OUTRO equipamento remanescente não são tocadas.
  IF v_contract_id IS NULL THEN
    WITH current_pairs AS (
      SELECT soe.equipment_id, soe.form_template_id
        FROM public.service_order_equipment soe
       WHERE soe.service_order_id = _service_order_id
    ),
    to_remove AS (
      SELECT cp.equipment_id, cp.form_template_id
        FROM current_pairs cp
        LEFT JOIN _desired_office d
          ON d.equipment_id IS NOT DISTINCT FROM cp.equipment_id
         AND d.form_template_id IS NOT DISTINCT FROM cp.form_template_id
       WHERE d.equipment_id IS NULL AND d.form_template_id IS NULL
         -- pares com form_template_id NULL não têm respostas atreladas
         -- (sem template => sem questions)
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
  ELSE
    -- OS de contrato/PMOC: escopo de verdade vive em contract_items. Sincroniza
    -- a junction e NÃO mexe em form_responses.
    v_resp_deleted := 0;
  END IF;

  -- 2) Remover os pares da junction.
  WITH current_pairs AS (
    SELECT soe.id, soe.equipment_id, soe.form_template_id
      FROM public.service_order_equipment soe
     WHERE soe.service_order_id = _service_order_id
  ),
  to_remove AS (
    SELECT cp.id
      FROM current_pairs cp
      LEFT JOIN _desired_office d
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
      FROM _desired_office d
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

COMMENT ON FUNCTION public.sync_service_order_scope(uuid, jsonb) IS
  'Salva atomicamente o escopo (equipamentos + checklists) de uma OS pelo caminho de ESCRITÓRIO, via DIFF incremental na junction service_order_equipment. Substitui o delete+insert que o client fazia direto (anti-padrão do incidente v1.19.2) e que deixava form_responses órfãs aparecendo como checklist fantasma no OSReport e no link público. Re-valida tenant (posse da OS) + permissão fn:edit_os (ou super_admin / can_edit_os / admin-gestor / full permissions). NÃO bloqueia OS de PMOC (o formulário de escritório já as edita). A limpeza de respostas órfãs — precisa por par (equipment_id, form_template_id), com IS NOT DISTINCT FROM pra casar NULL=NULL — SÓ roda quando service_orders.contract_id IS NULL: em OS de contrato o escopo real vem de contract_items e existem respostas legítimas fora da junction (93 pares / 360 respostas medidos em produção), então limpar destruiria histórico de PMOC; nesse caso devolve responses_deleted=0. _items = estado desejado completo: array de {equipment_id: uuid|null, form_template_ids: uuid[]}. Idempotente. Retorna jsonb {service_order_id, removed, inserted, responses_deleted, scope[]}.';

GRANT EXECUTE ON FUNCTION public.sync_service_order_scope(uuid, jsonb) TO authenticated;

-- A ACL default deste banco concede EXECUTE a PUBLIC/anon em TODA função nova
-- (gotcha já conhecido). Tirar explicitamente: esta RPC é SECURITY DEFINER e
-- escreve escopo de OS — só authenticated/service_role podem chamar, igual à
-- irmã edit_service_order_scope (proacl sem PUBLIC e sem anon).
REVOKE ALL ON FUNCTION public.sync_service_order_scope(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_service_order_scope(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_service_order_scope(uuid, jsonb) TO authenticated, service_role;
