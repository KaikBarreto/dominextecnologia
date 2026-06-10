-- Remove a etapa "Proposta Enviada" do kanban do CRM admin (Auctus).
-- Domínio ÚNICO Auctus (admin_crm_stages) — NÃO multi-tenant, NÃO confundir com crm_stages (tenant).
-- Motivo: CEO decidiu enxugar o funil; a etapa estava sem nenhum lead apontando pra ela.
--
-- Bloco transacional único (DO $$): valida 0 leads e a unicidade do nome DENTRO do mesmo
-- contexto PL/pgSQL pra que qualquer divergência force ROLLBACK via RAISE EXCEPTION antes do DELETE.
-- Idempotente: se a etapa já não existir, o bloco não falha (count = 0, segue sem deletar).

DO $$
DECLARE
  v_stage_id  uuid := '1891d8c1-979a-4dc0-9c51-8a061eb2da42';
  v_name      text := 'Proposta Enviada';
  v_lead_count   integer;
  v_name_count   integer;
  v_deleted      integer;
BEGIN
  -- 1) Segurança: nenhum lead pode referenciar a etapa (caso tenha mudado desde a confirmação).
  SELECT count(*) INTO v_lead_count
  FROM public.admin_leads
  WHERE stage_id = v_stage_id;

  IF v_lead_count > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % lead(s) ainda referenciam a etapa "%" (id %). Reatribua antes de remover.',
      v_lead_count, v_name, v_stage_id;
  END IF;

  -- Guarda extra: a etapa com esse nome tem que ser única (não deletar em massa por engano).
  SELECT count(*) INTO v_name_count
  FROM public.admin_crm_stages
  WHERE name = v_name;

  IF v_name_count > 1 THEN
    RAISE EXCEPTION 'ABORTADO: existem % etapas com nome "%". Esperado no máximo 1.',
      v_name_count, v_name;
  END IF;

  -- 2) DELETE da etapa (por id, que é o alvo exato e único).
  DELETE FROM public.admin_crm_stages
  WHERE id = v_stage_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Etapa "%" removida: % linha(s).', v_name, v_deleted;

  -- 3) Re-sequência: fecha o buraco da position 3.
  -- Etapas com position > 3 sobem 1 (Negociação 4->3, Ganho 5->4, Perdido 6->5).
  -- As com position < 3 ficam intactas.
  UPDATE public.admin_crm_stages
  SET position = position - 1
  WHERE position > 3;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Positions re-sequenciadas: % etapa(s) ajustada(s).', v_deleted;
END $$;
