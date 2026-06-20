-- =============================================================================
-- reassign_contract_pending_orders — propaga os responsáveis do contrato às OSs
-- ainda NÃO realizadas.
-- =============================================================================
-- Regra do CEO: ao editar os responsáveis pela execução de um contrato (PMOC ou
-- comum), todas as OSs que ainda não foram realizadas passam a apontar pro novo
-- técnico/equipe. Chamada no save de edição do contrato (dev-cliente-pmoc).
--
-- Colunas reais de service_orders (conferidas no schema):
--   - technician_id uuid  → técnico responsável (guarda o auth uid = profiles.user_id)
--   - team_id       uuid  → equipe (FK teams.id)
--   - status        enum service_order_status: agendada, pendente, a_caminho,
--                          em_andamento, concluida, cancelada, pausada
--
-- "Não realizada" = status NOT IN ('concluida','cancelada').
--
-- MULTI-TENANT: o company_id é derivado do PRÓPRIO contrato e o UPDATE só atinge
-- OSs do mesmo company_id — não confiamos só no contract_id pra evitar qualquer
-- vazamento entre tenants.
--
-- NULL é valor válido: se a nova seleção do contrato não tiver técnico (ou
-- equipe), o parâmetro vem NULL e a coluna correspondente é zerada — refletindo
-- exatamente a seleção atual do contrato.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reassign_contract_pending_orders(
  p_contract_id uuid,
  p_technician_id uuid,
  p_team_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_count integer := 0;
BEGIN
  IF p_contract_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Deriva o tenant a partir do contrato (fonte da verdade do isolamento).
  SELECT company_id INTO v_company_id
  FROM public.contracts
  WHERE id = p_contract_id;

  IF v_company_id IS NULL THEN
    -- Contrato inexistente (ou sem company) → nada a fazer.
    RETURN 0;
  END IF;

  UPDATE public.service_orders
  SET
    technician_id = p_technician_id,
    team_id = p_team_id,
    updated_at = now()
  WHERE contract_id = p_contract_id
    AND company_id = v_company_id
    AND status NOT IN ('concluida', 'cancelada');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.reassign_contract_pending_orders(uuid, uuid, uuid) IS
  'Propaga technician_id/team_id do contrato pras OSs não realizadas (status NOT IN concluida/cancelada). company_id derivado do contrato pra isolamento multi-tenant. Retorna a qtd de OSs atualizadas.';

GRANT EXECUTE ON FUNCTION public.reassign_contract_pending_orders(uuid, uuid, uuid)
  TO authenticated, service_role;
