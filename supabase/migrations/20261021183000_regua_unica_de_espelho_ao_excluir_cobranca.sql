-- Por quê: a exclusão de uma cobrança tinha DOIS caminhos com resultados
-- diferentes para o MESMO fato.
--   (a) Excluir PELO SISTEMA  -> edge tenant-asaas-delete-charge -> RPC
--       delete_tenant_charge_local, que aplica a régua `keep_it` (dinheiro, NFS-e,
--       orçamento ou contrato em cima => preserva o espelho; senão apaga).
--   (b) Excluir NO PAINEL DO ASAAS -> webhook PAYMENT_DELETED, que só fazia
--       UPDATE tenant_charges SET status='DELETED'. O recebível-espelho em
--       financial_transactions ficava ÓRFÃO: em aberto em Contas a Receber,
--       apontando para uma cobrança que não existe mais no gateway.
--       (Confirmado em produção: KGIE Tecnologia, pay_hkm5enhmurzhghss, 19/10.)
--
-- O que muda:
--   1. A régua `keep_it` sai de dentro do delete_tenant_charge_local e passa a
--      viver em UMA função só: public.tenant_charge_mirror_classification().
--      Régua duplicada = régua que diverge; com uma fonte única, os dois caminhos
--      não podem mais mentir um para o outro.
--   2. delete_tenant_charge_local é recriada A PARTIR DA DEFINIÇÃO VIVA em
--      produção (pg_get_functiondef, que já continha o carimbo por linha
--      introduzido depois do arquivo 20260919160000) — a ÚNICA alteração é trocar
--      as CTEs `mirror`/`classified` pela chamada da função compartilhada.
--      Comportamento idêntico, nenhuma régua tocada.
--   3. Nova RPC public.cleanup_tenant_charge_mirror_on_delete(company, payment_id)
--      para o webhook: aplica a MESMA régua, mas NÃO apaga a tenant_charges
--      (o ramo PAYMENT_DELETED preserva a linha como DELETED para auditoria).
--
-- CREATE OR REPLACE (nunca DROP+CREATE) em delete_tenant_charge_local: DROP
-- levaria os GRANTs junto. ACL preservada: {postgres=X/postgres, service_role=X/postgres}.

-- ---------------------------------------------------------------------------
-- 1) Régua única: classifica cada espelho de UMA cobrança.
--    keep_it = tem dinheiro, nota, orçamento ou contrato em cima => NÃO morre.
--    STABLE + SECURITY DEFINER: só lê, e a posse é reaplicada pelo company_id
--    que o chamador passa (nenhuma linha de outro tenant entra no conjunto).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_charge_mirror_classification(
  p_company_id uuid,
  p_charge_id  uuid
)
RETURNS TABLE (
  id               uuid,
  transaction_type text,
  contract_id      uuid,
  r_paid           boolean,
  r_partial        boolean,
  r_nfse           boolean,
  r_quote          boolean,
  r_contract       boolean,
  keep_it          boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH mirror AS (
    SELECT ft.id,
           ft.transaction_type::text             AS transaction_type,
           ft.contract_id,
           (ft.is_paid IS TRUE)                  AS r_paid,
           (COALESCE(ft.amount_received, 0) > 0) AS r_partial,
           EXISTS (SELECT 1 FROM public.nfse_emissions ne WHERE ne.financial_transaction_id = ft.id) AS r_nfse,
           EXISTS (SELECT 1 FROM public.quotes q        WHERE q.financial_transaction_id  = ft.id)   AS r_quote,
           (ft.contract_id IS NOT NULL)          AS r_contract
      FROM public.financial_transactions ft
     WHERE ft.tenant_charge_id = p_charge_id
       AND ft.company_id       = p_company_id
  )
  SELECT m.id,
         m.transaction_type,
         m.contract_id,
         m.r_paid,
         m.r_partial,
         m.r_nfse,
         m.r_quote,
         m.r_contract,
         (m.r_paid OR m.r_partial OR m.r_nfse OR m.r_quote OR m.r_contract) AS keep_it
    FROM mirror m;
$function$;

COMMENT ON FUNCTION public.tenant_charge_mirror_classification(uuid, uuid) IS
  'Régua ÚNICA de preservação do espelho financeiro de uma cobrança online. keep_it = baixa (is_paid), baixa parcial (amount_received>0), NFS-e, orçamento ou parcela de contrato. Usada por delete_tenant_charge_local (exclusão pelo sistema) e cleanup_tenant_charge_mirror_on_delete (PAYMENT_DELETED do Asaas). Nunca duplicar a régua: os dois caminhos têm que decidir igual.';

-- Fecha o default privilege do projeto (functions nascem com EXECUTE pra PUBLIC/
-- authenticated): função SECURITY DEFINER que recebe company_id por parâmetro não
-- pode ser chamável por usuário logado — seria uma porta cross-tenant.
REVOKE ALL ON FUNCTION public.tenant_charge_mirror_classification(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_charge_mirror_classification(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_charge_mirror_classification(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Caminho pelo SISTEMA — corpo da definição viva, com a régua terceirizada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_tenant_charge_local(p_company_id uuid, p_charge_id uuid)
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
  v_note_base      text;
  v_note_contract  text;
  v_note_default   text;
  v_has_paid       boolean := false;
  v_has_partial    boolean := false;
  v_has_nfse       boolean := false;
  v_has_quote      boolean := false;
  v_has_contract   boolean := false;
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

  -- Cabeçalho comum às duas frases: data, referência e valor formatados uma vez só.
  v_note_base := format(
    'Cobrança online removida em %s (referência %s, valor R$ %s).',
    to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    COALESCE(v_charge.asaas_payment_id, 'sem identificador'),
    replace(to_char(COALESCE(v_charge.value, 0), 'FM999999990.00'), '.', ',')
  );

  -- Único motivo é ser parcela de contrato: afirma o que aconteceu, sem falar em baixa.
  v_note_contract := v_note_base || ' A parcela do contrato continua no Financeiro.';

  -- Demais casos: texto que já existia, inalterado.
  v_note_default  := v_note_base || ' Este lançamento foi mantido porque já tinha baixa ou vínculo. Confira se precisa de ajuste.';

  -- Classifica cada espelho (régua compartilhada) e resolve tudo num statement só:
  -- quem tem dinheiro ou vínculo em cima recebe o carimbo e FICA; o resto é apagado.
  -- Os dois conjuntos são disjuntos (keep_it / NOT keep_it), então não brigam.
  -- MATERIALIZED explícito: `classified` é lida 3x e o conjunto não pode mudar
  -- entre as leituras (as próprias CTEs escrevem nas linhas classificadas).
  WITH classified AS MATERIALIZED (
    SELECT * FROM public.tenant_charge_mirror_classification(p_company_id, p_charge_id)
  ), stamped AS (
    -- Carimbo por linha: o motivo da preservação varia entre os espelhos da MESMA
    -- cobrança, então o texto não pode ser global.
    UPDATE public.financial_transactions ft
       SET notes = btrim(
             COALESCE(ft.notes || E'\n', '')
             || CASE
                  WHEN c.r_contract
                   AND NOT (c.r_paid OR c.r_partial OR c.r_nfse OR c.r_quote)
                  THEN v_note_contract
                  ELSE v_note_default
                END
           )
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
         COALESCE(bool_or(c.r_quote), false),
         COALESCE(bool_or(c.r_contract), false)
    INTO v_mirror_total, v_mirror_deleted, v_mirror_kept,
         v_has_paid, v_has_partial, v_has_nfse, v_has_quote, v_has_contract
    FROM classified c;

  IF v_has_paid     THEN v_reasons := v_reasons || 'paid'::text;     END IF;
  IF v_has_partial  THEN v_reasons := v_reasons || 'partial'::text;  END IF;
  IF v_has_nfse     THEN v_reasons := v_reasons || 'nfse'::text;     END IF;
  IF v_has_quote    THEN v_reasons := v_reasons || 'quote'::text;    END IF;
  IF v_has_contract THEN v_reasons := v_reasons || 'contract'::text; END IF;

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

GRANT EXECUTE ON FUNCTION public.delete_tenant_charge_local(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Caminho pelo PAINEL DO ASAAS — webhook PAYMENT_DELETED.
--    Diferenças DE PROPÓSITO em relação ao caminho local (não são divergência
--    de régua, são de escopo):
--      - NÃO apaga a tenant_charges: o ramo DELETED preserva a linha como
--        histórico/auditoria (status='DELETED').
--      - NÃO lança exceção por cobrança não encontrada nem por argumento nulo:
--        webhook não pode quebrar por isso (devolve reason e 0 linhas tocadas).
--      - Apaga SÓ espelho de ENTRADA (recebível). Linha de SAÍDA (despesa de
--        tarifa do gateway) e linha com contract_id nunca são tocadas.
--      - Aborta sem tocar em nada se a cobrança tem payment_date: o ramo DELETED
--        já sobrescreveu o status, então payment_date é o único resto de
--        "isso já foi pago" no nível da cobrança.
--    Idempotente: Asaas reentrega PAYMENT_DELETED. Na 2ª vez não há mais linha
--    com keep_it=false (deleted=0) e o carimbo não se repete (guarda por LIKE).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_tenant_charge_mirror_on_delete(
  p_company_id       uuid,
  p_asaas_payment_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_charge   public.tenant_charges%ROWTYPE;
  v_total    integer := 0;
  v_deleted  integer := 0;
  v_kept     integer := 0;
  v_skipped  integer := 0;
  v_reasons  text[]  := ARRAY[]::text[];
  v_note_base     text;
  v_note_contract text;
  v_note_default  text;
  v_paid     boolean := false;
  v_partial  boolean := false;
  v_nfse     boolean := false;
  v_quote    boolean := false;
  v_contract boolean := false;
BEGIN
  IF p_company_id IS NULL OR COALESCE(btrim(p_asaas_payment_id), '') = '' THEN
    RETURN jsonb_build_object(
      'found', false, 'reason', 'missing_args',
      'deleted', 0, 'kept', 0, 'reasons', to_jsonb(ARRAY[]::text[])
    );
  END IF;

  SELECT * INTO v_charge
    FROM public.tenant_charges
   WHERE asaas_payment_id = btrim(p_asaas_payment_id)
     AND company_id       = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false, 'reason', 'charge_not_found',
      'deleted', 0, 'kept', 0, 'reasons', to_jsonb(ARRAY[]::text[])
    );
  END IF;

  IF v_charge.payment_date IS NOT NULL THEN
    RETURN jsonb_build_object(
      'found', true, 'charge_id', v_charge.id, 'reason', 'charge_settled',
      'deleted', 0, 'kept', 0, 'reasons', to_jsonb(ARRAY['paid']::text[])
    );
  END IF;

  -- Mesmas frases do caminho local (copy PT-BR idêntica, de propósito: o gestor
  -- não precisa saber por qual porta a exclusão entrou).
  v_note_base := format(
    'Cobrança online removida em %s (referência %s, valor R$ %s).',
    to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    COALESCE(v_charge.asaas_payment_id, 'sem identificador'),
    replace(to_char(COALESCE(v_charge.value, 0), 'FM999999990.00'), '.', ',')
  );
  v_note_contract := v_note_base || ' A parcela do contrato continua no Financeiro.';
  v_note_default  := v_note_base || ' Este lançamento foi mantido porque já tinha baixa ou vínculo. Confira se precisa de ajuste.';

  WITH classified AS MATERIALIZED (
    SELECT * FROM public.tenant_charge_mirror_classification(p_company_id, v_charge.id)
  ), stamped AS (
    UPDATE public.financial_transactions ft
       SET notes = btrim(
             COALESCE(ft.notes || E'\n', '')
             || CASE
                  WHEN c.r_contract
                   AND NOT (c.r_paid OR c.r_partial OR c.r_nfse OR c.r_quote)
                  THEN v_note_contract
                  ELSE v_note_default
                END
           )
      FROM classified c
     WHERE ft.id = c.id
       AND c.keep_it
       AND c.transaction_type = 'entrada'
       -- Idempotência do carimbo: reentrega do webhook não duplica a frase.
       AND COALESCE(ft.notes, '') NOT LIKE '%Cobrança online removida em%'
    RETURNING ft.id
  ), del AS (
    DELETE FROM public.financial_transactions ft
     USING classified c
     WHERE ft.id = c.id
       AND c.keep_it = false
       AND c.transaction_type = 'entrada'   -- nunca a despesa de tarifa (saída)
       AND c.contract_id IS NULL            -- redundante com r_contract, de propósito
    RETURNING ft.id
  )
  SELECT count(*) FILTER (WHERE c.transaction_type = 'entrada'),
         (SELECT count(*) FROM del),
         count(*) FILTER (WHERE c.transaction_type = 'entrada' AND c.keep_it),
         count(*) FILTER (WHERE c.transaction_type <> 'entrada'),
         COALESCE(bool_or(c.r_paid     AND c.transaction_type = 'entrada'), false),
         COALESCE(bool_or(c.r_partial  AND c.transaction_type = 'entrada'), false),
         COALESCE(bool_or(c.r_nfse     AND c.transaction_type = 'entrada'), false),
         COALESCE(bool_or(c.r_quote    AND c.transaction_type = 'entrada'), false),
         COALESCE(bool_or(c.r_contract AND c.transaction_type = 'entrada'), false)
    INTO v_total, v_deleted, v_kept, v_skipped,
         v_paid, v_partial, v_nfse, v_quote, v_contract
    FROM classified c;

  IF v_paid     THEN v_reasons := v_reasons || 'paid'::text;     END IF;
  IF v_partial  THEN v_reasons := v_reasons || 'partial'::text;  END IF;
  IF v_nfse     THEN v_reasons := v_reasons || 'nfse'::text;     END IF;
  IF v_quote    THEN v_reasons := v_reasons || 'quote'::text;    END IF;
  IF v_contract THEN v_reasons := v_reasons || 'contract'::text; END IF;

  RETURN jsonb_build_object(
    'found',        true,
    'charge_id',    v_charge.id,
    'reason',       'processed',
    'mirror_total', v_total,
    'deleted',      v_deleted,
    'kept',         v_kept,
    'skipped',      v_skipped,
    'reasons',      to_jsonb(v_reasons)
  );
END;
$function$;

COMMENT ON FUNCTION public.cleanup_tenant_charge_mirror_on_delete(uuid, text) IS
  'Webhook PAYMENT_DELETED: remove o recebível-espelho órfão da cobrança excluída no painel do Asaas, aplicando a MESMA régua do delete pelo sistema (tenant_charge_mirror_classification). Não apaga a tenant_charges, não toca em saída (tarifa) nem em parcela de contrato, não lança erro quando a cobrança não existe. Idempotente.';

-- Só o webhook (service_role) apaga espelho. Ver nota de ACL acima.
REVOKE ALL ON FUNCTION public.cleanup_tenant_charge_mirror_on_delete(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_tenant_charge_mirror_on_delete(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_tenant_charge_mirror_on_delete(uuid, text) TO service_role;
