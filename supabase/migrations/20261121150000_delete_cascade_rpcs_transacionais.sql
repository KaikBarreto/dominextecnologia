-- =============================================================================
-- Exclusão "tudo ou nada" de Contrato, OS e Equipe
-- =============================================================================
-- Por quê: hoje o navegador apaga os filhos (parcelas em aberto, itens,
-- ambientes, OS futuras, respostas, fotos, membros...) em chamadas separadas e
-- só no fim apaga o registro principal. Se a permissão (RLS) barra o delete
-- principal (o PostgREST devolve 204 sem erro e sem linhas) ou algo falha no
-- meio, os filhos já foram embora e o registro fica pela metade.
--
-- O que muda: cada exclusão vira UMA RPC transacional. Qualquer falha (inclusive
-- o delete principal afetar 0 linhas) desfaz tudo.
--
-- O que NÃO muda (regra de negócio idêntica ao front de hoje):
--   * delete_contract_cascade  <- executeDeleteContract (src/hooks/useContracts.ts)
--       - OS com scheduled_date >= hoje: apagadas (com responsáveis, equipamentos,
--         respostas, fotos e avaliações). scheduled_date < hoje OU nula: ficam no
--         histórico como OS avulsas (contract_id, contract_reference_date e
--         contract_visit_customized_at zerados).
--       - Lançamentos com is_paid = true: preservados e desvinculados.
--         is_paid false/NULL: apagados.
--       - contract_items e contract_environments apagados.
--       - "Hoje" = p_today (o front manda a data local dele, como faz hoje); sem
--         p_today, data de America/Sao_Paulo.
--   * delete_service_order_cascade <- deleteServiceOrder (src/hooks/useServiceOrders.ts)
--       - Apaga equipamentos da OS, respostas, fotos, avaliações e movimentações
--         de estoque; desvincula pmoc_schedules; apaga a OS.
--       - Movimentação de estoque: authenticated NÃO tem privilégio de DELETE em
--         inventory_movements, então hoje o delete do front falha calado e a FK
--         (ON DELETE SET NULL) só desvincula. A RPC reproduz isso: só tenta
--         apagar se o papel que chama tem o privilégio; senão a FK desvincula.
--         Não há gatilho de DELETE em inventory_movements: nenhum caminho mexe
--         em saldo (inventory_stock_levels / inventory.quantity). Sem estorno.
--   * delete_team_cascade <- deleteTeam (src/hooks/useTeams.ts)
--       - Zera team_id em service_orders e contracts, apaga team_members e a equipe.
--
-- Única diferença deliberada: no contrato, se alguma cobrança EM ABERTO visível
-- não puder ser apagada (ex.: usuário sem permissão de excluir no financeiro), a
-- exclusão inteira é recusada. Hoje ela sobrava como lançamento avulso órfão
-- (a FK financial_transactions.contract_id é SET NULL), e o toast ainda dizia
-- "cobrança removida".
--
-- Storage: arquivos não são apagáveis dentro da transação. Cada RPC devolve,
-- em `storage`, o que o front deve limpar DEPOIS (best-effort).
--
-- Segurança: SECURITY INVOKER (a RLS de cada tabela continua valendo pra quem
-- chama, igual a hoje). EXECUTE só para authenticated/service_role.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';

-- -----------------------------------------------------------------------------
-- OS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_service_order_cascade(p_service_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_media text[] := ARRAY[]::text[];
  v_equipment integer := 0;
  v_responses integer := 0;
  v_photos integer := 0;
  v_ratings integer := 0;
  v_movements_deleted integer := 0;
  v_movements_unlinked integer := 0;
  v_pmoc_unlinked integer := 0;
  v_main integer := 0;
BEGIN
  IF p_service_order_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Informe a OS a excluir.';
  END IF;

  -- Trava a OS (e confirma que quem chama enxerga/pode mexer nela).
  PERFORM 1 FROM public.service_orders so WHERE so.id = p_service_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Não foi possível excluir a OS: você não tem permissão para esta ação ou ela já não existe. Atualize a tela e tente de novo.';
  END IF;

  -- Mídias da OS (fotos avulsas + fotos/vídeos do checklist, separados por vírgula),
  -- coletadas antes de apagar, para o front limpar o bucket os-photos depois.
  SELECT coalesce(array_agg(DISTINCT m.url ORDER BY m.url), ARRAY[]::text[])
    INTO v_media
    FROM (
      SELECT p.photo_url AS url FROM public.os_photos p WHERE p.service_order_id = p_service_order_id
      UNION ALL
      SELECT btrim(x) FROM public.form_responses fr
        CROSS JOIN LATERAL regexp_split_to_table(coalesce(fr.response_photo_url, ''), ',') x
       WHERE fr.service_order_id = p_service_order_id
      UNION ALL
      SELECT btrim(x) FROM public.form_responses fr
        CROSS JOIN LATERAL regexp_split_to_table(coalesce(fr.response_video_url, ''), ',') x
       WHERE fr.service_order_id = p_service_order_id
    ) m
   WHERE coalesce(m.url, '') <> '';

  DELETE FROM public.service_order_equipment WHERE service_order_id = p_service_order_id;
  GET DIAGNOSTICS v_equipment = ROW_COUNT;

  DELETE FROM public.form_responses WHERE service_order_id = p_service_order_id;
  GET DIAGNOSTICS v_responses = ROW_COUNT;

  DELETE FROM public.os_photos WHERE service_order_id = p_service_order_id;
  GET DIAGNOSTICS v_photos = ROW_COUNT;

  DELETE FROM public.service_ratings WHERE service_order_id = p_service_order_id;
  GET DIAGNOSTICS v_ratings = ROW_COUNT;

  -- Ver cabeçalho: sem privilégio de DELETE (authenticated), o comportamento de
  -- hoje é a FK SET NULL desvincular as movimentações. Saldo não muda em nenhum caso.
  IF has_table_privilege('public.inventory_movements', 'DELETE') THEN
    DELETE FROM public.inventory_movements WHERE service_order_id = p_service_order_id;
    GET DIAGNOSTICS v_movements_deleted = ROW_COUNT;
  ELSE
    SELECT count(*) INTO v_movements_unlinked
      FROM public.inventory_movements WHERE service_order_id = p_service_order_id;
  END IF;

  UPDATE public.pmoc_schedules SET service_order_id = NULL WHERE service_order_id = p_service_order_id;
  GET DIAGNOSTICS v_pmoc_unlinked = ROW_COUNT;

  BEGIN
    DELETE FROM public.service_orders WHERE id = p_service_order_id;
    GET DIAGNOSTICS v_main = ROW_COUNT;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION USING ERRCODE = '23503',
      MESSAGE = 'Não foi possível excluir a OS: ela tem registros vinculados que impedem a exclusão (ex.: documentos PMOC emitidos). Nada foi apagado.',
      DETAIL = SQLERRM;
  END;

  IF v_main <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Não foi possível excluir a OS: você não tem permissão para esta ação ou ela já não existe. Atualize a tela e tente de novo.';
  END IF;

  RETURN jsonb_build_object(
    'service_order_id', p_service_order_id,
    'deleted', jsonb_build_object(
      'service_orders', v_main,
      'service_order_equipment', v_equipment,
      'form_responses', v_responses,
      'os_photos', v_photos,
      'service_ratings', v_ratings,
      'inventory_movements', v_movements_deleted
    ),
    'unlinked', jsonb_build_object(
      'pmoc_schedules', v_pmoc_unlinked,
      'inventory_movements', v_movements_unlinked
    ),
    'storage', jsonb_build_object(
      'os_media_urls', to_jsonb(v_media)   -- bucket os-photos (front: removeOsMedia)
    )
  );
END
$function$;

COMMENT ON FUNCTION public.delete_service_order_cascade(uuid) IS
  'Exclui a OS e seus filhos numa transação só (tudo ou nada). SECURITY INVOKER: a RLS de cada tabela vale para quem chama. Devolve contagens e URLs de mídia para limpar o Storage depois.';

-- -----------------------------------------------------------------------------
-- Contrato
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_contract_cascade(p_contract_id uuid, p_today date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_today date := coalesce(p_today, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_future uuid[];
  v_past uuid[];
  v_paid uuid[];
  v_unpaid uuid[];
  v_media text[] := ARRAY[]::text[];
  v_attachment_paths text[];
  v_pmoc_paths text[];
  v_tx_unlinked integer := 0;
  v_tx_deleted integer := 0;
  v_items integer := 0;
  v_envs integer := 0;
  v_assignees integer := 0;
  v_so_equipment integer := 0;
  v_responses integer := 0;
  v_photos integer := 0;
  v_ratings integer := 0;
  v_os_deleted integer := 0;
  v_os_unlinked integer := 0;
  v_main integer := 0;
BEGIN
  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Informe o contrato a excluir.';
  END IF;

  -- Trava o contrato: nenhuma visita nova entra no meio da exclusão.
  PERFORM 1 FROM public.contracts c WHERE c.id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Não foi possível excluir o contrato: você não tem permissão ou ele já não existe. Atualize a tela e tente de novo.';
  END IF;

  -- OS do contrato. Futuras (>= hoje) são apagadas; passadas e sem data
  -- (no front, '' < hoje) ficam no histórico como avulsas.
  SELECT coalesce(array_agg(so.id) FILTER (WHERE so.scheduled_date >= v_today), ARRAY[]::uuid[]),
         coalesce(array_agg(so.id) FILTER (WHERE so.scheduled_date IS NULL OR so.scheduled_date < v_today), ARRAY[]::uuid[])
    INTO v_future, v_past
    FROM public.service_orders so
   WHERE so.contract_id = p_contract_id;

  -- Lançamentos: realizados (is_paid = true) preservados; o resto (false/NULL) apagado.
  SELECT coalesce(array_agg(ft.id) FILTER (WHERE ft.is_paid IS TRUE), ARRAY[]::uuid[]),
         coalesce(array_agg(ft.id) FILTER (WHERE ft.is_paid IS NOT TRUE), ARRAY[]::uuid[])
    INTO v_paid, v_unpaid
    FROM public.financial_transactions ft
   WHERE ft.contract_id = p_contract_id;

  IF cardinality(v_paid) > 0 THEN
    -- Sem checagem de contagem: se a RLS barrar, a FK (SET NULL) desvincula do
    -- mesmo jeito no delete do contrato. Não sobra lixo.
    UPDATE public.financial_transactions SET contract_id = NULL
     WHERE id = ANY(v_paid) AND contract_id = p_contract_id;
    GET DIAGNOSTICS v_tx_unlinked = ROW_COUNT;
  END IF;

  IF cardinality(v_unpaid) > 0 THEN
    DELETE FROM public.financial_transactions
     WHERE id = ANY(v_unpaid) AND contract_id = p_contract_id;
    GET DIAGNOSTICS v_tx_deleted = ROW_COUNT;
    IF v_tx_deleted <> cardinality(v_unpaid) THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = format('Não foi possível excluir o contrato: %s cobrança(s) em aberto dele não puderam ser apagadas (falta permissão de excluir no financeiro). Nada foi apagado.',
                         cardinality(v_unpaid) - v_tx_deleted);
    END IF;
  END IF;

  DELETE FROM public.contract_items WHERE contract_id = p_contract_id;
  GET DIAGNOSTICS v_items = ROW_COUNT;

  DELETE FROM public.contract_environments WHERE contract_id = p_contract_id;
  GET DIAGNOSTICS v_envs = ROW_COUNT;

  IF cardinality(v_future) > 0 THEN
    SELECT coalesce(array_agg(DISTINCT m.url ORDER BY m.url), ARRAY[]::text[])
      INTO v_media
      FROM (
        SELECT p.photo_url AS url FROM public.os_photos p WHERE p.service_order_id = ANY(v_future)
        UNION ALL
        SELECT btrim(x) FROM public.form_responses fr
          CROSS JOIN LATERAL regexp_split_to_table(coalesce(fr.response_photo_url, ''), ',') x
         WHERE fr.service_order_id = ANY(v_future)
        UNION ALL
        SELECT btrim(x) FROM public.form_responses fr
          CROSS JOIN LATERAL regexp_split_to_table(coalesce(fr.response_video_url, ''), ',') x
         WHERE fr.service_order_id = ANY(v_future)
      ) m
     WHERE coalesce(m.url, '') <> '';

    DELETE FROM public.service_order_assignees WHERE service_order_id = ANY(v_future);
    GET DIAGNOSTICS v_assignees = ROW_COUNT;
    DELETE FROM public.service_order_equipment WHERE service_order_id = ANY(v_future);
    GET DIAGNOSTICS v_so_equipment = ROW_COUNT;
    DELETE FROM public.form_responses WHERE service_order_id = ANY(v_future);
    GET DIAGNOSTICS v_responses = ROW_COUNT;
    DELETE FROM public.os_photos WHERE service_order_id = ANY(v_future);
    GET DIAGNOSTICS v_photos = ROW_COUNT;
    DELETE FROM public.service_ratings WHERE service_order_id = ANY(v_future);
    GET DIAGNOSTICS v_ratings = ROW_COUNT;

    BEGIN
      DELETE FROM public.service_orders WHERE id = ANY(v_future);
      GET DIAGNOSTICS v_os_deleted = ROW_COUNT;
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE EXCEPTION USING ERRCODE = '23503',
        MESSAGE = 'Não foi possível excluir o contrato: há OS futura com registros vinculados que impedem a exclusão (ex.: documentos PMOC emitidos). Nada foi apagado.',
        DETAIL = SQLERRM;
    END;
    IF v_os_deleted <> cardinality(v_future) THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = format('Não foi possível excluir o contrato: %s OS futura(s) não puderam ser apagadas (sem permissão). Nada foi apagado.',
                         cardinality(v_future) - v_os_deleted);
    END IF;
  END IF;

  IF cardinality(v_past) > 0 THEN
    UPDATE public.service_orders
       SET contract_id = NULL,
           contract_reference_date = NULL,
           contract_visit_customized_at = NULL
     WHERE id = ANY(v_past);
    GET DIAGNOSTICS v_os_unlinked = ROW_COUNT;
    IF v_os_unlinked <> cardinality(v_past) THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = format('Não foi possível excluir o contrato: %s OS passada(s) não puderam ser desvinculadas (sem permissão). Nada foi apagado.',
                         cardinality(v_past) - v_os_unlinked);
    END IF;
  END IF;

  -- Arquivos que somem por CASCADE junto com o contrato (o front limpa depois).
  SELECT coalesce(array_agg(ca.storage_path ORDER BY ca.storage_path) FILTER (WHERE coalesce(ca.storage_path, '') <> ''), ARRAY[]::text[])
    INTO v_attachment_paths
    FROM public.contract_attachments ca WHERE ca.contract_id = p_contract_id;
  SELECT coalesce(array_agg(pd.pdf_storage_path ORDER BY pd.pdf_storage_path) FILTER (WHERE coalesce(pd.pdf_storage_path, '') <> ''), ARRAY[]::text[])
    INTO v_pmoc_paths
    FROM public.pmoc_documents pd WHERE pd.contract_id = p_contract_id;

  BEGIN
    DELETE FROM public.contracts WHERE id = p_contract_id;
    GET DIAGNOSTICS v_main = ROW_COUNT;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION USING ERRCODE = '23503',
      MESSAGE = 'Não foi possível excluir o contrato: ainda há OS vinculadas a ele que você não tem permissão para alterar. Nada foi apagado.',
      DETAIL = SQLERRM;
  END;

  IF v_main <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Não foi possível excluir o contrato: você não tem permissão ou ele já não existe. Atualize a tela e tente de novo.';
  END IF;

  RETURN jsonb_build_object(
    'contract_id', p_contract_id,
    'today', v_today,
    -- Os 4 números que o toast do front já usa (mesma semântica de hoje).
    'deleted_os_count', cardinality(v_future),
    'unlinked_os_count', cardinality(v_past),
    'preserved_tx_count', cardinality(v_paid),
    'deleted_tx_count', cardinality(v_unpaid),
    'deleted', jsonb_build_object(
      'contracts', v_main,
      'financial_transactions', v_tx_deleted,
      'contract_items', v_items,
      'contract_environments', v_envs,
      'service_orders', v_os_deleted,
      'service_order_assignees', v_assignees,
      'service_order_equipment', v_so_equipment,
      'form_responses', v_responses,
      'os_photos', v_photos,
      'service_ratings', v_ratings
    ),
    'unlinked', jsonb_build_object(
      'service_orders', v_os_unlinked,
      'financial_transactions', v_tx_unlinked
    ),
    'storage', jsonb_build_object(
      'os_media_urls', to_jsonb(v_media),                         -- bucket os-photos (removeOsMedia)
      'contract_attachment_paths', to_jsonb(v_attachment_paths),  -- bucket contract-attachments
      'pmoc_document_paths', to_jsonb(v_pmoc_paths)                -- bucket pmoc-documents
    )
  );
END
$function$;

COMMENT ON FUNCTION public.delete_contract_cascade(uuid, date) IS
  'Exclui o contrato numa transação só (tudo ou nada): apaga OS futuras e cobranças em aberto, preserva/desvincula OS passadas e recebimentos realizados. SECURITY INVOKER. p_today = data local do front (padrão: America/Sao_Paulo).';

-- -----------------------------------------------------------------------------
-- Equipe
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_team_cascade(p_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_photo text;
  v_os_unlinked integer := 0;
  v_contracts_unlinked integer := 0;
  v_members integer := 0;
  v_main integer := 0;
BEGIN
  IF p_team_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Informe a equipe a excluir.';
  END IF;

  SELECT t.photo_url INTO v_photo FROM public.teams t WHERE t.id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Não foi possível excluir a equipe: você não tem permissão ou ela já não existe. Atualize a tela e tente de novo.';
  END IF;

  UPDATE public.service_orders SET team_id = NULL WHERE team_id = p_team_id;
  GET DIAGNOSTICS v_os_unlinked = ROW_COUNT;

  UPDATE public.contracts SET team_id = NULL WHERE team_id = p_team_id;
  GET DIAGNOSTICS v_contracts_unlinked = ROW_COUNT;

  DELETE FROM public.team_members WHERE team_id = p_team_id;
  GET DIAGNOSTICS v_members = ROW_COUNT;

  -- service_orders.team_id e contracts.team_id são NO ACTION: se sobrou vínculo
  -- que quem chama não enxerga, a FK recusa e tudo volta.
  BEGIN
    DELETE FROM public.teams WHERE id = p_team_id;
    GET DIAGNOSTICS v_main = ROW_COUNT;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION USING ERRCODE = '23503',
      MESSAGE = 'Não foi possível excluir a equipe: ainda há OS ou contratos vinculados a ela que você não tem permissão para alterar. Nada foi apagado.',
      DETAIL = SQLERRM;
  END;

  IF v_main <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Não foi possível excluir a equipe: você não tem permissão ou ela já não existe. Atualize a tela e tente de novo.';
  END IF;

  RETURN jsonb_build_object(
    'team_id', p_team_id,
    'deleted', jsonb_build_object('teams', v_main, 'team_members', v_members),
    'unlinked', jsonb_build_object('service_orders', v_os_unlinked, 'contracts', v_contracts_unlinked),
    'storage', jsonb_build_object(
      'team_photo_urls', CASE WHEN coalesce(v_photo, '') <> '' THEN jsonb_build_array(v_photo) ELSE '[]'::jsonb END  -- bucket team-photos
    )
  );
END
$function$;

COMMENT ON FUNCTION public.delete_team_cascade(uuid) IS
  'Exclui a equipe numa transação só (tudo ou nada): desvincula OS e contratos, apaga membros e a equipe. SECURITY INVOKER.';

-- -----------------------------------------------------------------------------
-- Grants: função nova em public nasce com EXECUTE para PUBLIC/anon.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.delete_service_order_cascade(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_contract_cascade(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_team_cascade(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.delete_service_order_cascade(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_contract_cascade(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_team_cascade(uuid) TO authenticated, service_role;

COMMIT;
