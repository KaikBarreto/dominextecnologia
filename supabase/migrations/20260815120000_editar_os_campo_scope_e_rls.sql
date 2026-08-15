-- ============================================================================
-- Feature "Editar OS em campo" — segurança + operação atômica de escopo
--
-- Por quê:
--   A UI vai permitir que um usuário COM PERMISSÃO adicione/remova equipamentos
--   e checklists (form_templates) de uma OS avulsa, durante o preenchimento.
--   O escopo vive na junction service_order_equipment (N:N OS↔equip↔template;
--   equipment_id = NULL => checklist avulso a nível de OS).
--
--   Hoje a RLS da junction (policy "Users manage own service_order_equipment",
--   migration 20260418163700) libera INSERT/UPDATE/DELETE pra QUALQUER usuário
--   autenticado da MESMA empresa — sem checagem de permissão fina. Esta migration
--   introduz a permissão fn:editar_os_campo e GATEIA as escritas por ela,
--   preservando o guard de tenant (company_id) e super_admin. SELECT permanece
--   como está (tenant-level pra authenticated + portal anon intactos).
--
--   Além da RLS (segurança), expõe a RPC atômica edit_service_order_scope pra
--   UI salvar o escopo inteiro de uma vez via DIFF incremental (nunca
--   delete-all+insert client, que sob RLS pode apagar 0 e acumular — incidente
--   conhecido). A RPC é SECURITY DEFINER, mas re-valida posse/tenant/permissão
--   e bloqueia OS de PMOC (decisão de produto v1: só edita OS avulsa).
--
-- Idempotente: CREATE OR REPLACE + DROP POLICY IF EXISTS antes de cada CREATE.
-- Assinaturas confirmadas na sondagem:
--   is_admin_or_gestor(uuid), has_full_permissions(uuid),
--   get_user_company_id(uuid), is_super_admin(uuid).
--   user_permissions(user_id, permissions jsonb, is_active).
--   service_orders(id, company_id NOT NULL, contract_id).
--   service_order_equipment(id, service_order_id, equipment_id NULL,
--                           form_template_id NULL, created_at).
--   form_responses(service_order_id, question_id, equipment_id?, ...) —
--     ATENÇÃO: form_responses NÃO tem equipment_id nesta base (confirmado no
--     CREATE TABLE 20260131202425). A resposta amarra à OS + question_id, e a
--     question amarra ao template via form_questions.template_id. Portanto a
--     limpeza de respostas órfãs ao remover um par (equip, template) é feita por
--     service_order_id + question_id ∈ questions(template) — ver RPC abaixo.
--   contracts(id, is_pmoc) — discriminador de PMOC.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. can_edit_os(_user_id) — pode editar escopo de OS em campo?
--    Espelha o padrão de can_manage_users/can_manage_system (curinga '*' aditivo
--    + chave literal fn:editar_os_campo), somado a admin/gestor e acesso total.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_edit_os(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (
    public.is_admin_or_gestor(_user_id)
    OR public.has_full_permissions(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_permissions
      WHERE user_id = _user_id
        AND is_active = true
        AND (
          permissions ? '*'                                 -- curinga aditivo: acesso total dinâmico
          OR permissions @> '"fn:editar_os_campo"'::jsonb   -- permissão fina da feature
        )
    )
  )
$function$;

COMMENT ON FUNCTION public.can_edit_os(uuid) IS
  'True se o usuário pode editar o escopo (equipamentos/checklists) de uma OS em campo: admin/gestor OU acesso total (*) OU fn:editar_os_campo.';

GRANT EXECUTE ON FUNCTION public.can_edit_os(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. RLS na junction service_order_equipment
--    Troca a policy única "FOR ALL" por: SELECT tenant-level (comportamento
--    inalterado) + INSERT/UPDATE/DELETE gateados por can_edit_os.
--    Guard de tenant sempre via join em service_orders.company_id.
--    NÃO toca a policy anon "Public view service_order_equipment via portal".
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users manage own service_order_equipment" ON public.service_order_equipment;

-- SELECT: mantém o que existia (qualquer authenticated da empresa lê; super_admin lê tudo)
CREATE POLICY "Users view own service_order_equipment"
  ON public.service_order_equipment FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id
        AND (so.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
    )
  );

-- INSERT: exige permissão de editar OS + tenant
CREATE POLICY "Editors insert own service_order_equipment"
  ON public.service_order_equipment FOR INSERT TO authenticated
  WITH CHECK (
    (public.can_edit_os(auth.uid()) OR is_super_admin(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id
        AND (so.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
    )
  );

-- UPDATE: exige permissão de editar OS + tenant (linha atual E linha nova)
CREATE POLICY "Editors update own service_order_equipment"
  ON public.service_order_equipment FOR UPDATE TO authenticated
  USING (
    (public.can_edit_os(auth.uid()) OR is_super_admin(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id
        AND (so.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
    )
  )
  WITH CHECK (
    (public.can_edit_os(auth.uid()) OR is_super_admin(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id
        AND (so.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
    )
  );

-- DELETE: exige permissão de editar OS + tenant
CREATE POLICY "Editors delete own service_order_equipment"
  ON public.service_order_equipment FOR DELETE TO authenticated
  USING (
    (public.can_edit_os(auth.uid()) OR is_super_admin(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id
        AND (so.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
    )
  );

-- ----------------------------------------------------------------------------
-- 3. RPC atômica edit_service_order_scope
--    A UI passa o ESTADO DESEJADO COMPLETO do escopo; a RPC faz DIFF incremental.
--    _items: jsonb array de { equipment_id: uuid|null, form_template_ids: uuid[] }
--      - equipment_id = null  => checklists avulsos (nível OS)
--      - form_template_ids = [] => equipamento presente sem checklist (par
--        (equip, NULL) — usa NULL em form_template_id)
--    Comportamento: guard tenant+permissão, bloqueio PMOC, diff de pares,
--    limpeza de respostas órfãs ao remover, idempotência, retorno do estado final.
-- ----------------------------------------------------------------------------
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
  -- 1) Apagar respostas órfãs dos pares que serão removidos.
  --    form_responses não tem equipment_id nesta base; a resposta pertence à OS
  --    e a question pertence ao template (form_questions.template_id). Só apagamos
  --    respostas de um template SE, após o diff, NENHUM par remanescente na OS
  --    ainda usar aquele template (senão apagaríamos respostas ainda válidas).
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
  ),
  -- templates que somem por completo do escopo desejado (não sobra nenhum par
  -- com aquele template no estado final)
  templates_gone AS (
    SELECT DISTINCT tr.form_template_id
      FROM to_remove tr
     WHERE tr.form_template_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM _desired d WHERE d.form_template_id = tr.form_template_id
       )
  ),
  del_resp AS (
    DELETE FROM public.form_responses fr
     WHERE fr.service_order_id = _service_order_id
       AND fr.question_id IN (
         SELECT fq.id FROM public.form_questions fq
          JOIN templates_gone tg ON tg.form_template_id = fq.template_id
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
  'Salva atomicamente o escopo (equipamentos + checklists) de uma OS avulsa via DIFF incremental na junction service_order_equipment. Re-valida tenant + can_edit_os, bloqueia OS de PMOC, limpa respostas órfãs de templates removidos. _items = array de {equipment_id: uuid|null, form_template_ids: uuid[]}. Idempotente. Retorna jsonb {removed, inserted, responses_deleted, scope[]}.';

GRANT EXECUTE ON FUNCTION public.edit_service_order_scope(uuid, jsonb) TO authenticated;
