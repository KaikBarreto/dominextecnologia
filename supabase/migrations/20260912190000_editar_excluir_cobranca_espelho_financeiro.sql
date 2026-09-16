-- ============================================================================
-- Editar / excluir cobrança online (Asaas BYO) — LADO DO NOSSO BANCO
--
-- CONTEXTO
-- --------
-- A aba Financeiro → Cobranças não deixava editar nem excluir uma cobrança já
-- emitida. Fazer isso só do nosso lado seria pior que não fazer: a linha some
-- daqui e a cobrança continua VIVA E PAGÁVEL no gateway. Por isso quem manda
-- é o gateway: as edges `tenant-asaas-update-charge` e
-- `tenant-asaas-delete-charge` falam com a Asaas PRIMEIRO e só depois chamam
-- estas duas funções para alinhar o nosso banco.
--
-- Estas funções NÃO chamam o gateway e NÃO decidem se a cobrança pode ser
-- alterada. Elas são o passo "nosso banco acompanha", com três garantias:
--
--   1. POSSE: company_id é reaplicado no corpo (SECURITY DEFINER não passa por
--      RLS). Cobrança de outra empresa devolve found=false, igual a não existir.
--   2. GUARDA DE ESTADO: se a linha local já constar como paga/estornada, a
--      função ABORTA (ERRCODE 23001). É a rede contra corrida com o webhook
--      entre a resposta do gateway e a escrita aqui.
--   3. DINHEIRO BAIXADO NÃO SOME EM SILÊNCIO: o "a receber" espelho
--      (financial_transactions.tenant_charge_id) só é alterado/apagado quando
--      NÃO tem dinheiro nem vínculo fiscal em cima. Quando tem, a linha é
--      PRESERVADA, recebe um carimbo em `notes` (a pista sobrevive ao
--      ON DELETE SET NULL do elo) e a função devolve o motivo pra edge avisar
--      o usuário.
--
-- Chamadas só por service_role (edge). Sem caller no frontend: EXECUTE fechado
-- pra PUBLIC/anon/authenticated no fim do arquivo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) update_tenant_charge_local
--
-- A edge manda a IMAGEM FINAL da cobrança (já confirmada pela Asaas), não um
-- "patch": value/status/invoice_url/boleto_url/pix_copy_paste vêm da resposta
-- do gateway e sobrescrevem o que estava aqui. due_date e description aceitam
-- NULL = "mantém o que já estava" (a Asaas pode devolver descrição vazia).
--
-- pix_copy_paste é sobrescrito SEMPRE, inclusive com NULL de propósito: o
-- payload do Pix carrega o VALOR. Mudou o valor e não conseguimos regerar o
-- copia-e-cola? Melhor a página de pagamento ficar sem copia-e-cola (ela tem o
-- link hospedado da Asaas como caminho) do que servir um QR com o valor velho.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_tenant_charge_local(
  p_company_id     uuid,
  p_charge_id      uuid,
  p_value          numeric,
  p_due_date       date,
  p_description    text,
  p_status         text,
  p_invoice_url    text,
  p_boleto_url     text,
  p_pix_copy_paste text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_charge         public.tenant_charges%ROWTYPE;
  v_mirror_total   integer := 0;
  v_mirror_updated integer := 0;
  v_mirror_locked  integer := 0;
  v_mirror_nfse    integer := 0;
BEGIN
  IF p_company_id IS NULL OR p_charge_id IS NULL THEN
    RAISE EXCEPTION '[update_tenant_charge_local] company_id e charge_id são obrigatórios';
  END IF;
  IF p_value IS NULL OR p_value <= 0 THEN
    RAISE EXCEPTION '[update_tenant_charge_local] valor precisa ser positivo (recebido: %)', p_value;
  END IF;

  -- Posse + trava da linha até o fim da transação.
  SELECT * INTO v_charge
    FROM public.tenant_charges
   WHERE id = p_charge_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Guarda de estado (defesa em profundidade; a edge já checou o gateway).
  IF upper(COALESCE(v_charge.status, '')) = ANY (
       ARRAY['CONFIRMED','RECEIVED','RECEIVED_IN_CASH','REFUNDED','CHARGEBACK']
     ) THEN
    RAISE EXCEPTION
      '[update_tenant_charge_local] cobrança % consta como paga/estornada no nosso banco (status %) — alteração abortada',
      p_charge_id, v_charge.status
      USING ERRCODE = '23001';
  END IF;

  UPDATE public.tenant_charges
     SET value          = p_value,
         due_date       = COALESCE(p_due_date, due_date),
         description    = COALESCE(NULLIF(btrim(p_description), ''), description),
         status         = COALESCE(NULLIF(btrim(upper(p_status)), ''), status),
         invoice_url    = p_invoice_url,
         boleto_url     = p_boleto_url,
         pix_copy_paste = p_pix_copy_paste,
         updated_at     = now()
   WHERE id = p_charge_id
     AND company_id = p_company_id
  RETURNING * INTO v_charge;

  -- ---- Espelho no Financeiro ("a receber" criado por
  --      create_tenant_charge_receivable). Só mexe em linha SEM dinheiro em cima.
  WITH mirror AS (
    SELECT ft.id,
           (ft.is_paid IS TRUE OR COALESCE(ft.amount_received, 0) > 0) AS has_money,
           EXISTS (
             SELECT 1 FROM public.nfse_emissions ne
              WHERE ne.financial_transaction_id = ft.id
           ) AS has_nfse
      FROM public.financial_transactions ft
     WHERE ft.tenant_charge_id = p_charge_id
       AND ft.company_id       = p_company_id
       AND ft.transaction_type = 'entrada'
  ), upd AS (
    UPDATE public.financial_transactions ft
       SET amount      = p_value,
           due_date    = COALESCE(p_due_date, ft.due_date),
           description = COALESCE(NULLIF(btrim(p_description), ''), ft.description)
      FROM mirror m
     WHERE ft.id = m.id
       AND m.has_money = false
    RETURNING ft.id
  )
  SELECT (SELECT count(*) FROM mirror),
         (SELECT count(*) FROM upd),
         (SELECT count(*) FROM mirror WHERE has_money),
         (SELECT count(*) FROM mirror WHERE has_nfse)
    INTO v_mirror_total, v_mirror_updated, v_mirror_locked, v_mirror_nfse;

  RETURN jsonb_build_object(
    'found', true,
    'charge', jsonb_build_object(
      'id',          v_charge.id,
      'value',       v_charge.value,
      'due_date',    v_charge.due_date,
      'description', v_charge.description,
      'status',      v_charge.status,
      'invoice_url', v_charge.invoice_url
    ),
    'mirror_total',   v_mirror_total,
    'mirror_updated', v_mirror_updated,
    'mirror_locked',  v_mirror_locked,
    'mirror_nfse',    v_mirror_nfse
  );
END;
$function$;

COMMENT ON FUNCTION public.update_tenant_charge_local(uuid,uuid,numeric,date,text,text,text,text,text) IS
  'Alinha tenant_charges + o "a receber" espelho (financial_transactions.tenant_charge_id) DEPOIS que a Asaas confirmou a alteração. Recebe a imagem final vinda do gateway. Posse por company_id reaplicada no corpo. Aborta (23001) se a cobrança local já constar paga/estornada. Espelho com baixa (is_paid ou amount_received>0) NÃO é alterado: volta em mirror_locked pra edge avisar o usuário. Chamada só pela edge tenant-asaas-update-charge (service_role).';

-- ----------------------------------------------------------------------------
-- 2) delete_tenant_charge_local
--
-- Roda SÓ depois que a Asaas confirmou a remoção. Apaga a linha de
-- tenant_charges (a Asaas mantém o histórico dela do lado de lá, com status
-- DELETED) e o "a receber" espelho — MAS preserva o espelho que tiver baixa,
-- recebimento parcial, nota fiscal emitida ou orçamento apontando pra ele.
--
-- O carimbo em `notes` é gravado ANTES do DELETE da cobrança: o elo
-- tenant_charge_id é ON DELETE SET NULL, então a pista precisa estar escrita
-- enquanto o vínculo ainda existe.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_tenant_charge_local(
  p_company_id uuid,
  p_charge_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_charge         public.tenant_charges%ROWTYPE;
  v_mirror_total   integer := 0;
  v_mirror_deleted integer := 0;
  v_mirror_kept    integer := 0;
  v_reasons        text[]  := ARRAY[]::text[];
  v_note           text;
  v_has_paid       boolean := false;
  v_has_partial    boolean := false;
  v_has_nfse       boolean := false;
  v_has_quote      boolean := false;
BEGIN
  IF p_company_id IS NULL OR p_charge_id IS NULL THEN
    RAISE EXCEPTION '[delete_tenant_charge_local] company_id e charge_id são obrigatórios';
  END IF;

  SELECT * INTO v_charge
    FROM public.tenant_charges
   WHERE id = p_charge_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF upper(COALESCE(v_charge.status, '')) = ANY (
       ARRAY['CONFIRMED','RECEIVED','RECEIVED_IN_CASH','REFUNDED','CHARGEBACK']
     ) THEN
    RAISE EXCEPTION
      '[delete_tenant_charge_local] cobrança % consta como paga/estornada no nosso banco (status %) — exclusão abortada',
      p_charge_id, v_charge.status
      USING ERRCODE = '23001';
  END IF;

  v_note := format(
    'Cobrança online removida em %s (referência %s, valor R$ %s). Este lançamento foi mantido porque já tinha baixa ou vínculo. Confira se precisa de ajuste.',
    to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    COALESCE(v_charge.asaas_payment_id, 'sem identificador'),
    replace(to_char(COALESCE(v_charge.value, 0), 'FM999999990.00'), '.', ',')
  );

  -- Classifica cada espelho e resolve tudo num statement só: quem tem dinheiro
  -- ou vínculo em cima recebe o carimbo e FICA; o resto é apagado. Os dois
  -- conjuntos são disjuntos (keep_it / NOT keep_it), então não brigam entre si.
  -- CTE que escreve roda sempre, mesmo sem ser lida pela query principal.
  WITH mirror AS (
    SELECT ft.id,
           (ft.is_paid IS TRUE)                  AS r_paid,
           (COALESCE(ft.amount_received, 0) > 0) AS r_partial,
           EXISTS (SELECT 1 FROM public.nfse_emissions ne WHERE ne.financial_transaction_id = ft.id) AS r_nfse,
           EXISTS (SELECT 1 FROM public.quotes q        WHERE q.financial_transaction_id  = ft.id)   AS r_quote
      FROM public.financial_transactions ft
     WHERE ft.tenant_charge_id = p_charge_id
       AND ft.company_id       = p_company_id
  ), classified AS (
    SELECT m.*, (m.r_paid OR m.r_partial OR m.r_nfse OR m.r_quote) AS keep_it
      FROM mirror m
  ), stamped AS (
    UPDATE public.financial_transactions ft
       SET notes = btrim(COALESCE(ft.notes || E'\n', '') || v_note)
      FROM classified c
     WHERE ft.id = c.id
       AND c.keep_it
    RETURNING ft.id
  ), del AS (
    DELETE FROM public.financial_transactions ft
     USING classified c
     WHERE ft.id = c.id
       AND c.keep_it = false
    RETURNING ft.id
  )
  SELECT count(*),
         (SELECT count(*) FROM del),
         count(*) FILTER (WHERE c.keep_it),
         COALESCE(bool_or(c.r_paid), false),
         COALESCE(bool_or(c.r_partial), false),
         COALESCE(bool_or(c.r_nfse), false),
         COALESCE(bool_or(c.r_quote), false)
    INTO v_mirror_total, v_mirror_deleted, v_mirror_kept,
         v_has_paid, v_has_partial, v_has_nfse, v_has_quote
    FROM classified c;

  IF v_has_paid    THEN v_reasons := v_reasons || 'paid'::text;    END IF;
  IF v_has_partial THEN v_reasons := v_reasons || 'partial'::text; END IF;
  IF v_has_nfse    THEN v_reasons := v_reasons || 'nfse'::text;    END IF;
  IF v_has_quote   THEN v_reasons := v_reasons || 'quote'::text;   END IF;

  DELETE FROM public.tenant_charges
   WHERE id = p_charge_id
     AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'found', true,
    'deleted', true,
    'mirror_total',   v_mirror_total,
    'mirror_deleted', v_mirror_deleted,
    'mirror_kept',    v_mirror_kept,
    'mirror_reasons', to_jsonb(v_reasons)
  );
END;
$function$;

COMMENT ON FUNCTION public.delete_tenant_charge_local(uuid,uuid) IS
  'Apaga a linha de tenant_charges e o "a receber" espelho DEPOIS que a Asaas confirmou a remoção da cobrança. Posse por company_id reaplicada no corpo. Aborta (23001) se a cobrança local constar paga/estornada. Espelho com baixa, recebimento parcial, NFS-e ou orçamento vinculado NÃO é apagado: fica com carimbo em notes e volta em mirror_kept/mirror_reasons pra edge avisar o usuário. Chamada só pela edge tenant-asaas-delete-charge (service_role).';

-- ----------------------------------------------------------------------------
-- 3) ACL — só service_role. Função nasce com EXECUTE pra PUBLIC no Postgres;
--    a chave anônima do Supabase vai no bundle do frontend, então deixar aberto
--    seria expor exclusão de cobrança pra internet inteira.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.update_tenant_charge_local(uuid,uuid,numeric,date,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_tenant_charge_local(uuid,uuid,numeric,date,text,text,text,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.update_tenant_charge_local(uuid,uuid,numeric,date,text,text,text,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_charge_local(uuid,uuid,numeric,date,text,text,text,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.delete_tenant_charge_local(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_tenant_charge_local(uuid,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_tenant_charge_local(uuid,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_charge_local(uuid,uuid) TO service_role;
