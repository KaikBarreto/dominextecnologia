-- =============================================================================
-- contract_plan_activities: trava contra duplicata + RPC atômica de substituição
--
-- Contexto (bug sistêmico): toda edição de contrato PMOC ACUMULAVA uma cópia
-- inteira do plano em contract_plan_activities. O frontend fazia
-- DELETE-antes-do-INSERT direto do client, mas o DELETE roda sob RLS
-- (get_user_company_id / is_super_admin). Em certos escopos de sessão/JWT o
-- DELETE não casava linha nenhuma (apagava 0) enquanto o INSERT sempre inseria
-- — resultado: acúmulo. Um contrato chegou a 313.687 linhas (78 cópias).
--
-- Esta migration NÃO limpa dados (a limpeza é one-off em produção, feita à parte,
-- ANTES desta migration ser aplicada, senão o UNIQUE INDEX abaixo falha).
-- Ela instala as duas defesas permanentes:
--
--   B) UNIQUE INDEX sobre a chave de identidade da atividade, com COALESCE nas
--      colunas nullable (senão NULL != NULL deixaria dup passar).
--   C) RPC replace_contract_plan_activities — SECURITY DEFINER, com guarda de
--      posse explícita, que faz DELETE + INSERT numa transação real no server
--      (fechando o furo do DELETE-sob-RLS-que-apaga-0).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- B) Trava: UNIQUE INDEX sobre a chave de identidade
--    Chave: (contract_id, contract_item_id, section, component, description,
--            freq_code, freq_months, form_template_id)
--    Colunas nullable recebem COALESCE p/ a unicidade valer mesmo com NULL.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_plan_activities_identity
  ON public.contract_plan_activities (
    contract_id,
    COALESCE(contract_item_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(section, ''),
    COALESCE(component, ''),
    description,
    COALESCE(freq_code, ''),
    COALESCE(freq_months, -1),
    COALESCE(form_template_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

COMMENT ON INDEX public.uq_contract_plan_activities_identity IS
  'Impede duplicata do plano do contrato. COALESCE nas colunas nullable (contract_item_id, section, component, freq_code, freq_months, form_template_id) faz a unicidade valer mesmo com NULL. Chave de identidade da atividade.';

-- -----------------------------------------------------------------------------
-- C) RPC atômica de substituição do plano do contrato
--    Corrige a causa-raiz: DELETE + INSERT como definer, dentro de UMA
--    transação, com posse verificada explicitamente (não depende do RLS do
--    client). company_id é FORÇADO ao do contrato (não confia no payload).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_contract_plan_activities(
  p_contract_id uuid,
  p_activities  jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_inserted   integer;
BEGIN
  -- Contrato existe? Pega o company_id dono.
  SELECT c.company_id INTO v_company_id
  FROM public.contracts c
  WHERE c.id = p_contract_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Contrato % nao encontrado', p_contract_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Guarda de posse: só o dono da empresa OU super_admin pode substituir o plano.
  IF NOT (
        public.get_user_company_id(auth.uid()) = v_company_id
     OR public.is_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissao para alterar o plano do contrato %', p_contract_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Substituição atômica: apaga tudo e reinsere. Roda como definer, então o
  -- DELETE apaga de verdade (não é filtrado pelo RLS do client).
  DELETE FROM public.contract_plan_activities
  WHERE contract_id = p_contract_id;

  IF p_activities IS NULL OR jsonb_typeof(p_activities) <> 'array' THEN
    RETURN 0;
  END IF;

  WITH src AS (
    SELECT DISTINCT ON (
             COALESCE(a->>'contract_item_id', ''),
             COALESCE(a->>'section', ''),
             COALESCE(a->>'component', ''),
             COALESCE(a->>'description', ''),
             COALESCE(a->>'freq_code', ''),
             COALESCE(a->>'freq_months', ''),
             COALESCE(a->>'form_template_id', '')
           )
           a
    FROM jsonb_array_elements(p_activities) AS a
    ORDER BY
      COALESCE(a->>'contract_item_id', ''),
      COALESCE(a->>'section', ''),
      COALESCE(a->>'component', ''),
      COALESCE(a->>'description', ''),
      COALESCE(a->>'freq_code', ''),
      COALESCE(a->>'freq_months', ''),
      COALESCE(a->>'form_template_id', '')
  ),
  ins AS (
    INSERT INTO public.contract_plan_activities (
      company_id,
      contract_id,
      contract_item_id,
      section,
      component,
      description,
      freq_code,
      freq_months,
      is_active,
      sort_order,
      applies_per_equipment,
      form_template_id
    )
    SELECT
      v_company_id,                                   -- FORÇADO, não confia no payload
      p_contract_id,                                  -- FORÇADO
      NULLIF(a->>'contract_item_id', '')::uuid,
      NULLIF(a->>'section', ''),
      NULLIF(a->>'component', ''),
      a->>'description',
      NULLIF(a->>'freq_code', ''),
      NULLIF(a->>'freq_months', '')::integer,
      COALESCE((a->>'is_active')::boolean, true),
      COALESCE((a->>'sort_order')::integer, 0),
      COALESCE((a->>'applies_per_equipment')::boolean, true),
      NULLIF(a->>'form_template_id', '')::uuid
    FROM src
    WHERE COALESCE(a->>'description', '') <> ''
    ON CONFLICT (
      contract_id,
      COALESCE(contract_item_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(section, ''),
      COALESCE(component, ''),
      description,
      COALESCE(freq_code, ''),
      COALESCE(freq_months, -1),
      COALESCE(form_template_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM ins;

  RETURN COALESCE(v_inserted, 0);
END;
$$;

COMMENT ON FUNCTION public.replace_contract_plan_activities(uuid, jsonb) IS
  'Substitui atomicamente o plano de atividades de um contrato (DELETE + INSERT em 1 transacao). SECURITY DEFINER com guarda de posse (get_user_company_id = dono OU is_super_admin). company_id forcado ao do contrato. Idempotente contra uq_contract_plan_activities_identity via ON CONFLICT DO NOTHING + dedupe do payload. Retorna nº de linhas inseridas.';

GRANT EXECUTE ON FUNCTION public.replace_contract_plan_activities(uuid, jsonb) TO authenticated;
