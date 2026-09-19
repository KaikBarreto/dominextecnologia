-- =====================================================================
-- Aprovação PÚBLICA de orçamento grava a categoria ATUAL, não o literal
-- =====================================================================
-- POR QUÊ
-- `financial_transactions.category` é `text`, NÃO é FK: o lançamento guarda
-- uma CÓPIA do nome da categoria. Com as categorias de sistema virando
-- renomeáveis (o nome é rótulo, o PAPEL é a identidade), todo lançamento
-- automático passou a resolver o nome na hora — menos um: a RPC
-- `respond_quote_public`, que tinha 'Vendas de Serviços' CHUMBADO
-- (20260911200000, INSERT do recebível). Resultado: empresa que renomeasse a
-- categoria continuaria recebendo, pelo LINK PÚBLICO, lançamento com o nome
-- velho — órfão, fora do grupo do DRE, sem cor nem ícone, em silêncio. E não
-- dá pra consertar do client: quem aprova é o cliente final, anônimo, e o
-- INSERT acontece dentro do banco.
--
-- O QUE ESTA MIGRATION FAZ
--   1) `public.resolve_system_category_name(company_id, role)` — porta pro SQL
--      a MESMA régua de `src/lib/finance-system-categories.ts`: a categoria de
--      sistema é achada pelo trio `is_system` + `type` + `dre_group`, excluindo
--      os nomes de semente que pertencem a OUTRO papel (em especial
--      'Impostos e Taxas', que colide com 'Tarifas e Taxas' no mesmo trio
--      (saida, impostos) em praticamente toda empresa). Resolve só quando
--      sobra EXATAMENTE UMA candidata; senão cai em camadas cada vez mais
--      tolerantes e, no fim, no nome de semente — que é exatamente o
--      comportamento de hoje.
--   2) `public.respond_quote_public` recriada A PARTIR DA DEFINIÇÃO VIVA
--      (`pg_get_functiondef`, conferida idêntica à 20260911200000 fora de
--      formatação), trocando SÓ o literal do INSERT pela variável resolvida.
--
-- INVARIANTE: a aprovação do orçamento NUNCA pode falhar por causa disto. A
-- resolução roda dentro de um bloco com EXCEPTION WHEN OTHERS e o resultado
-- passa por COALESCE no literal 'Vendas de Serviços'. Empresa que nunca
-- renomeou grava exatamente o mesmo texto de antes.
--
-- Idempotente: só CREATE OR REPLACE + GRANT/REVOKE.
-- =====================================================================


-- =====================================================================
-- 1) Resolver de categoria de sistema POR PAPEL (espelho do client)
-- =====================================================================
-- STABLE: só lê. SECURITY DEFINER porque o chamador pode ser um contexto sem
-- sessão (aprovação anônima pelo link público) — o predicado de posse
-- (`company_id = p_company_id`) é reaplicado à mão, já que RLS não cobre
-- SECURITY DEFINER.
--
-- Papéis mapeados (mesmos do client):
--   receipt_fee     → (saida,   impostos) — semente 'Tarifas e Taxas'
--   service_revenue → (entrada, opex)     — semente 'Vendas de Serviços'
-- Papel desconhecido devolve NULL, e quem chama decide o fallback.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.resolve_system_category_name(
  p_company_id uuid,
  p_role       text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_seed     text;
  v_type     text;
  v_dre      text;
  v_other    text;
  v_foreign  text[];
  v_names    text[];
  v_name     text;
BEGIN
  IF p_role = 'service_revenue' THEN
    v_seed := 'Vendas de Serviços'; v_type := 'entrada'; v_dre := 'opex';
    v_other := 'Tarifas e Taxas';
  ELSIF p_role = 'receipt_fee' THEN
    v_seed := 'Tarifas e Taxas';    v_type := 'saida';   v_dre := 'impostos';
    v_other := 'Vendas de Serviços';
  ELSE
    RETURN NULL;
  END IF;

  IF p_company_id IS NULL THEN
    RETURN v_seed;
  END IF;

  -- Nomes de categoria de SISTEMA que NÃO exercem papel nenhum e por isso não
  -- podem roubar a vaga. Espelha FOREIGN_SYSTEM_SEED_NAMES do client, mais o
  -- nome de semente do OUTRO papel. Já normalizados (lower + trim).
  v_foreign := ARRAY[
    'impostos e taxas',
    'folha de pagamento',
    'pagamento de fatura',
    'transferência entre contas',
    'csp - materiais',
    'csp - mão de obra avulsa',
    'cmv - materiais',
    'cmv - mão de obra avulsa',
    lower(btrim(v_other))
  ];

  -- Camada 1 — dona ÚNICA do papel. Só linha ATIVA disputa: a gêmea
  -- desativada por dedup não pode tornar o papel "ambíguo".
  SELECT array_agg(fc.name ORDER BY COALESCE(fc.sort_order, 2147483647), fc.name)
    INTO v_names
    FROM public.financial_categories fc
   WHERE fc.company_id = p_company_id
     AND fc.is_system  = true
     AND fc.is_active  = true
     AND fc.type       = v_type
     AND lower(btrim(COALESCE(fc.dre_group, ''))) = v_dre
     AND NOT (lower(btrim(fc.name)) = ANY (v_foreign));

  IF COALESCE(array_length(v_names, 1), 0) = 1 THEN
    RETURN COALESCE(NULLIF(btrim(v_names[1]), ''), v_seed);
  END IF;

  -- Camada 2 — linha de sistema cujo `dre_group` derivou, reconhecida pelo
  -- nome de semente. Camada 3 — qualquer categoria com o nome de semente
  -- (empresa que perdeu `is_system`). Ordem de desempate igual à do client:
  -- ativa primeiro, menor sort_order, nome.
  SELECT fc.name INTO v_name
    FROM public.financial_categories fc
   WHERE fc.company_id = p_company_id
     AND fc.is_system  = true
     AND fc.type       = v_type
     AND lower(btrim(fc.name)) = lower(btrim(v_seed))
   ORDER BY fc.is_active DESC, COALESCE(fc.sort_order, 2147483647), fc.name
   LIMIT 1;

  IF v_name IS NULL THEN
    SELECT fc.name INTO v_name
      FROM public.financial_categories fc
     WHERE fc.company_id = p_company_id
       AND lower(btrim(fc.name)) = lower(btrim(v_seed))
     ORDER BY fc.is_active DESC, COALESCE(fc.sort_order, 2147483647), fc.name
     LIMIT 1;
  END IF;

  -- Sem nenhuma candidata: devolve o nome de semente. Gravar este texto NÃO
  -- cria categoria (o campo é texto livre) — é exatamente o que o código
  -- gravava antes.
  RETURN COALESCE(NULLIF(btrim(v_name), ''), v_seed);
END;
$fn$;

COMMENT ON FUNCTION public.resolve_system_category_name(uuid, text) IS
  'Nome ATUAL da categoria de sistema que exerce o papel informado nesta empresa (receipt_fee | service_revenue). Espelho SQL de src/lib/finance-system-categories.ts: identidade é is_system + type + dre_group, nome é rótulo. Nunca lança: cai no nome de semente.';

-- Função nova SECURITY DEFINER: o default privilege do schema public concede
-- EXECUTE a todo mundo. REVOKE explícito e GRANT só ao service_role — a
-- aprovação pública chama por DENTRO de respond_quote_public (SECURITY
-- DEFINER, owner postgres), que não precisa de GRANT pra isso.
REVOKE ALL ON FUNCTION public.resolve_system_category_name(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_system_category_name(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_system_category_name(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_system_category_name(uuid, text) TO service_role;


-- =====================================================================
-- 2) respond_quote_public — recriada da DEFINIÇÃO VIVA, só o literal muda
-- =====================================================================
CREATE OR REPLACE FUNCTION public.respond_quote_public(_token text, _status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current   text;
  v_rows      integer;
  v_quote     public.quotes%ROWTYPE;
  v_enabled   boolean;
  v_gross     numeric;
  v_n         integer;
  v_base      date;
  v_due       date;
  v_group     uuid;
  v_share     numeric;
  v_amount    numeric;
  v_desc      text;
  v_first_id  uuid;
  v_id        uuid;
  v_i         integer;
  v_category  text;
BEGIN
  -- Só aceitamos as duas transições públicas possíveis.
  IF _status NOT IN ('aprovado', 'rejeitado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  -- Resolve o status atual SÓ pelo token. Resposta neutra quando não existe
  -- (não revela se o token é válido ou não).
  SELECT status INTO v_current
  FROM public.quotes
  WHERE token = _token
  LIMIT 1;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Transição única e idempotente: só sai de 'enviado'. Nunca rebaixa um quote
  -- já aprovado/rejeitado/convertido. Mexe SOMENTE em `status`.
  UPDATE public.quotes
     SET status = _status
   WHERE token = _token
     AND status = 'enviado';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    -- 0 linhas = já respondido/expirado. Sem erro real; devolve o status atual.
    RETURN jsonb_build_object(
      'ok', false, 'status', v_current, 'error', 'not_pending',
      'receivable_created', false
    );
  END IF;

  ------------------------------------------------------------------
  -- Daqui pra baixo o status JÁ mudou (1 linha). O recebível é um
  -- efeito colateral OPCIONAL: se qualquer guarda barrar, a resposta
  -- continua ok:true — o cliente respondeu a proposta, e isso vale.
  ------------------------------------------------------------------

  IF _status <> 'aprovado' THEN
    RETURN jsonb_build_object('ok', true, 'status', _status, 'receivable_created', false);
  END IF;

  -- O UPDATE acima já travou a linha nesta transação: duas aprovações
  -- simultâneas não geram parcela em dobro (a segunda vê 0 linhas).
  SELECT * INTO v_quote FROM public.quotes WHERE token = _token LIMIT 1;

  -- Mesma guarda de idempotência que o fluxo interno usa
  -- (useQuoteConversion): se o operador já aprovou por dentro, não duplica.
  IF v_quote.financial_generated_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'status', _status, 'receivable_created', false);
  END IF;

  -- Opt-in por empresa. company_id vem do QUOTE.
  SELECT cs.quote_public_approval_creates_receivable
    INTO v_enabled
  FROM public.company_settings cs
  WHERE cs.company_id = v_quote.company_id
  LIMIT 1;

  IF COALESCE(v_enabled, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', true, 'status', _status, 'receivable_created', false);
  END IF;

  v_gross := COALESCE(v_quote.total_value, 0);
  IF v_gross <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'status', _status, 'receivable_created', false);
  END IF;

  v_n     := GREATEST(1, LEAST(60, COALESCE(v_quote.receivable_installments, 1)));
  -- NULL = vence na data da aprovação (fuso do Brasil, não UTC).
  v_base  := COALESCE(v_quote.receivable_first_due_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_group := gen_random_uuid();
  -- Rateio: N-1 parcelas iguais e a SOBRA na última, pra somar ao centavo.
  -- Mesmo critério do parcelamento manual do financeiro (useFinancial).
  v_share := round(v_gross / v_n, 2);

  -- Categoria da receita: resolvida pelo PAPEL da categoria de sistema desta
  -- empresa, nunca pelo nome literal. `financial_transactions.category` guarda
  -- uma CÓPIA do nome (é text, não FK), então com o literal chumbado aqui a
  -- aprovação PÚBLICA continuava gravando 'Vendas de Serviços' depois de o
  -- cliente renomear a categoria na tela — lançamento órfão, fora do grupo do
  -- DRE, sem cor nem ícone, em silêncio. Mesma régua do client
  -- (src/lib/finance-system-categories.ts).
  --
  -- NUNCA FALHA A APROVAÇÃO: qualquer erro na resolução cai no literal de
  -- sempre. O cliente final respondeu a proposta; isso vale mais que a
  -- etiqueta da linha no financeiro.
  BEGIN
    v_category := public.resolve_system_category_name(v_quote.company_id, 'service_revenue');
  EXCEPTION WHEN OTHERS THEN
    v_category := NULL;
  END;
  v_category := COALESCE(NULLIF(btrim(v_category), ''), 'Vendas de Serviços');

  FOR v_i IN 1..v_n LOOP
    IF v_i = v_n THEN
      v_amount := v_gross - (v_share * (v_n - 1));
    ELSE
      v_amount := v_share;
    END IF;

    -- Mês de CALENDÁRIO (regra-lei do projeto), nunca 30 dias. O Postgres já
    -- faz o clamp de fim de mês: 31/01 + 1 mês = 28/02.
    v_due := (v_base + ((v_i - 1) * interval '1 month'))::date;

    v_desc := 'Orçamento #' || v_quote.quote_number::text;
    IF v_n > 1 THEN
      -- Formato idêntico ao do parcelamento manual, pra as duas origens
      -- ficarem indistinguíveis na tela: "Orçamento #12 (2/3)".
      v_desc := v_desc || ' (' || v_i::text || '/' || v_n::text || ')';
    END IF;

    INSERT INTO public.financial_transactions (
      company_id, transaction_type, category, description, amount,
      transaction_date, due_date, paid_date, is_paid,
      customer_id, account_id, created_by,
      installment_group_id, installment_number, installment_total
    ) VALUES (
      v_quote.company_id,           -- SEMPRE do quote. Nunca de parâmetro.
      'entrada',
      v_category,                   -- nome ATUAL da categoria do papel
                                    -- "venda de serviço" desta empresa
      v_desc,
      v_amount,
      v_due, v_due, NULL, false,    -- a receber: sem conta, sem data de pagamento
      v_quote.customer_id,
      NULL,
      NULL,                         -- não há usuário autenticado: quem aprovou
                                    -- foi o cliente final, pelo link público
      -- Parcela única NÃO recebe marcação de parcelamento: é assim que o
      -- lançamento manual nasce (useFinancial só monta grupo quando n > 1) e a
      -- lista financeira desenha o badge "x/y" sempre que installment_number
      -- existe — um "1/1" denunciaria a origem pública sem nenhum ganho.
      CASE WHEN v_n > 1 THEN v_group ELSE NULL END,
      CASE WHEN v_n > 1 THEN v_i     ELSE NULL END,
      CASE WHEN v_n > 1 THEN v_n     ELSE NULL END
    )
    RETURNING id INTO v_id;

    IF v_i = 1 THEN
      v_first_id := v_id;
    END IF;
  END LOOP;

  UPDATE public.quotes
     SET financial_generated_at  = now(),
         financial_transaction_id = v_first_id
   WHERE id = v_quote.id;

  RETURN jsonb_build_object(
    'ok', true, 'status', _status,
    'receivable_created', true, 'installments', v_n
  );
END;
$function$;

-- A assinatura não mudou, então o CREATE OR REPLACE preservou os GRANTs. Re-
-- emitimos mesmo assim: a página é ANÔNIMA e perder este grant derrubaria a
-- aprovação pelo link.
GRANT EXECUTE ON FUNCTION public.respond_quote_public(text, text) TO anon, authenticated, service_role;
