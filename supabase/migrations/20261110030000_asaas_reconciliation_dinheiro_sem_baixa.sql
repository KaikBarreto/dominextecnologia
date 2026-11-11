-- =============================================================================
-- Rede de segurança: "entrou dinheiro na conta Asaas que o sistema não reconheceu?"
-- =============================================================================
-- INCIDENTE QUE MOTIVA (upgrade pago por Pix, 2026-11-09):
--   uma empresa pagou o upgrade pro-rata, a Asaas recebeu o valor,
--   a Asaas RECEBEU o dinheiro e NUNCA entregou o `PAYMENT_RECEIVED` à edge
--   `asaas-webhook`. Resultado: `subscription_payments` parado em PENDING com
--   `updated_at == created_at`, cotação de upgrade em `payment_pending`, módulo
--   CRM sem liberar — e ZERO alerta. O time só soube ~16h depois, pelo cliente.
--
-- O FURO: as 3 checagens de `asaas_reconciliation_check()` partem TODAS de
--   `subscription_payments`, e a (2) ainda exige `status IN ('RECEIVED','CONFIRMED')`.
--   Um pagamento que o sistema NUNCA SOUBE que foi pago é invisível pra elas.
--   Vale pra renovação e primeira venda também, não só upgrade.
--
-- A INFORMAÇÃO JÁ EXISTIA: `ledger_asaas` (cron `sync-asaas-ledger-hourly`, espelho
--   de /financialTransactions da conta Asaas da Auctus) já tinha o
--   PAYMENT_RECEIVED com o asaas_payment_id da cobrança.
--   Ninguém cruzava o EXTRATO (caixa) com as NOSSAS COBRANÇAS (livros).
--
-- O QUE ESTA MIGRATION FAZ (detectar e avisar — NUNCA aplicar dinheiro):
--   1) cria `asaas_reconciliation_acks` (reconhecimento auditável de anomalia
--      esperada, pra o alarme não virar ruído);
--   2) adiciona 2 checagens a `asaas_reconciliation_check()`, herdando de graça o
--      cron diário (jobid 8 → `asaas_reconciliation_alert()` → `admin_notifications`
--      → sininho do painel master):
--        (4) DINHEIRO_SEM_BAIXA   — dinheiro entrou pra uma cobrança NOSSA que
--                                   segue sem confirmação  → webhook perdido;
--        (5) CREDITO_SEM_COBRANCA — dinheiro entrou sem NENHUMA cobrança nossa
--                                   → normalmente "órfão de link avulso".
--   3) reconhece semanticamente os órfãos de Pix avulso já alertados por
--      `unmatched_asaas_payment`, pra o alerta novo nascer sem ruído.
--
-- NÃO FAZ (decisão consciente): não chama `apply_subscription_upgrade_payment`,
--   não credita LTV, não cria `subscription_payments`. O ledger é CAIXA, os livros
--   são COMPETÊNCIA, e o `asaas-webhook` é a única fonte de verdade com mutex
--   (`credit_ltv_once_for_payment`). Aplicar dinheiro a partir do extrato é a
--   receita certa pra creditar em dobro. Isto aqui DETECTA e AVISA.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) Reconhecimento de anomalia esperada (anti-ruído), auditável
-- -----------------------------------------------------------------------------
-- POR QUE UMA TABELA NOVA, e não uma coluna em `ledger_asaas`:
--   (a) reconhecimento de alerta e categorizacao contabil sao estados diferentes:
--       o primeiro silencia uma anomalia esperada; o segundo classifica o movimento.
--       Mistura-los impediria reconhecer checagens que nem sequer nascem do ledger.
--   (b) a chave do alerta é (issue_type, ref) — o MESMO par que
--       `asaas_reconciliation_alert()` usa pra não duplicar notificação. Guardar
--       o ack nessa chave serve qualquer checagem futura sem nova coluna.
--   (c) a pista de dinheiro NUNCA é apagada: a linha do `ledger_asaas` continua
--       intacta e visível na tela de Conciliação; o ack só silencia o ALARME.
-- "Des-reconhecer" é `revoked_at` (flag), nunca DELETE — mesma régua do `voided`.
CREATE TABLE IF NOT EXISTS public.asaas_reconciliation_acks (
  issue_type       TEXT        NOT NULL,
  ref              TEXT        NOT NULL,
  note             TEXT,
  acknowledged_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ,
  revoked_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (issue_type, ref)
);

COMMENT ON TABLE public.asaas_reconciliation_acks IS
  'Anomalias de conciliacao Asaas reconhecidas como esperadas (anti-ruido do cron diario). Chave = (issue_type, ref) de asaas_reconciliation_check(). Revogar usa revoked_at, nunca DELETE: a pista precisa continuar auditavel.';
COMMENT ON COLUMN public.asaas_reconciliation_acks.revoked_at IS
  'Quando preenchido, o reconhecimento esta desfeito e a anomalia volta a alertar. Preserva o historico de quem silenciou e quando.';

-- Índice só pros acks ATIVOS (é o único filtro que a checagem usa).
CREATE INDEX IF NOT EXISTS idx_asaas_recon_acks_ativos
  ON public.asaas_reconciliation_acks (issue_type, ref)
  WHERE revoked_at IS NULL;

ALTER TABLE public.asaas_reconciliation_acks ENABLE ROW LEVEL SECURITY;

-- Tabela do painel master (não tem company_id, não é dado de tenant): leitura é
-- permitida a admins; escrita direta fica EXCLUSIVA do service_role. Admins escrevem
-- somente pelas RPCs abaixo, que fixam ator e timestamps da trilha de auditoria.
DROP POLICY IF EXISTS "service_role_full_access_asaas_reconciliation_acks" ON public.asaas_reconciliation_acks;
CREATE POLICY "service_role_full_access_asaas_reconciliation_acks"
  ON public.asaas_reconciliation_acks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin panel users view asaas_reconciliation_acks" ON public.asaas_reconciliation_acks;
CREATE POLICY "Admin panel users view asaas_reconciliation_acks"
  ON public.asaas_reconciliation_acks FOR SELECT TO authenticated
  USING ((SELECT public.is_admin_user(auth.uid())));

DROP POLICY IF EXISTS "Admin panel users insert asaas_reconciliation_acks" ON public.asaas_reconciliation_acks;
DROP POLICY IF EXISTS "Admin panel users update asaas_reconciliation_acks" ON public.asaas_reconciliation_acks;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.asaas_reconciliation_acks FROM authenticated, anon;

-- Sem policy de DELETE de propósito: revogar é UPDATE (revoked_at), nunca apagar.


-- -----------------------------------------------------------------------------
-- 2) RPCs de reconhecer / revogar
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER de propósito: a tabela não aceita escrita direta de authenticated.
-- A guarda explícita de is_admin_user é obrigatória e a função controla os campos de
-- auditoria; usuário comum toma 42501 antes de qualquer escrita.
CREATE OR REPLACE FUNCTION public.asaas_reconciliation_acknowledge(
  p_issue_type TEXT,
  p_ref        TEXT,
  p_note       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.asaas_reconciliation_acks
    (issue_type, ref, note, acknowledged_by, acknowledged_at)
  VALUES (p_issue_type, p_ref, p_note, auth.uid(), now())
  ON CONFLICT (issue_type, ref) DO UPDATE
    SET note            = COALESCE(EXCLUDED.note, public.asaas_reconciliation_acks.note),
        acknowledged_by = EXCLUDED.acknowledged_by,
        acknowledged_at = now(),
        revoked_at      = NULL,
        revoked_by      = NULL,
        updated_at      = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.asaas_reconciliation_unacknowledge(
  p_issue_type TEXT,
  p_ref        TEXT,
  p_note       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.asaas_reconciliation_acks
     SET revoked_at = now(),
         revoked_by = auth.uid(),
         note       = COALESCE(p_note, note),
         updated_at = now()
   WHERE issue_type = p_issue_type
     AND ref        = p_ref
     AND revoked_at IS NULL;
END;
$$;

-- `anon` nasce com EXECUTE em toda função nova (default do PUBLIC) — revogar é
-- obrigatório, senão o silenciador de alarme financeiro fica público.
REVOKE ALL ON FUNCTION public.asaas_reconciliation_acknowledge(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.asaas_reconciliation_unacknowledge(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asaas_reconciliation_acknowledge(TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.asaas_reconciliation_unacknowledge(TEXT, TEXT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.asaas_reconciliation_acknowledge(TEXT, TEXT, TEXT) IS
  'Reconhece uma anomalia de conciliacao Asaas como esperada (para de alertar). Gate explicito = is_admin_user; escrita direta permanece fechada.';
COMMENT ON FUNCTION public.asaas_reconciliation_unacknowledge(TEXT, TEXT, TEXT) IS
  'Revoga o reconhecimento (volta a alertar) sem apagar a linha. Gate explicito = is_admin_user; escrita direta permanece fechada.';


-- -----------------------------------------------------------------------------
-- 3) asaas_reconciliation_check(): 3 checagens antigas INTACTAS + 2 novas
-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE (nunca DROP): DROP FUNCTION levaria os GRANTs junto, e hoje
-- `anon` NÃO tem EXECUTE nesta função — recriar do zero reabriria o buraco.
-- Mesma assinatura e mesmo shape de saída TABLE(issue_type, ref, detail, description),
-- pra o cron do jobid 8 (`asaas_reconciliation_alert()`) continuar funcionando sem
-- nenhuma alteração: ele itera o resultado e grava em `admin_notifications`.
--
-- As 3 primeiras checagens são cópia LITERAL da definição viva (lida via
-- pg_get_functiondef antes desta migration) — não foram reescritas de memória.
CREATE OR REPLACE FUNCTION public.asaas_reconciliation_check()
RETURNS TABLE (
  issue_type  TEXT,
  ref         TEXT,
  detail      TEXT,
  description TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  -- =========================================================================
  -- CTE: o DINHEIRO que de fato entrou na conta Asaas da Auctus, por cobrança.
  -- =========================================================================
  -- Só a conta da Auctus: `ledger_asaas` espelha /financialTransactions DELA.
  -- Pagamento de tenant BYO vive em `tenant_payment_webhook_events` com chave no
  -- Vault — outro eixo, fora daqui de propósito.
  --
  -- DEDUPE POR asaas_payment_id (não por linha): o mesmo dinheiro pode ter DUAS
  -- linhas no ledger — a do `sync` (asaas_transaction_id = ftn_*) e a que o
  -- `asaas-webhook` grava quando não resolve a empresa (asaas_transaction_id =
  -- pay_*, asaas_event_type NULL). Sem o GROUP BY o
  -- alerta sairia dobrado pro mesmo pagamento.
  --
  -- EXCLUSÕES: antecipação de recebível e estorno de Pix são movimento de CAIXA
  -- cuja receita já foi lançada na confirmação da cobrança — não são "dinheiro
  -- novo" e acusariam falso positivo.
  --
  -- JANELA DE CARÊNCIA (4h sobre `min(created_at)` = quando NÓS vimos o dinheiro):
  --   o sync do extrato roda de hora em hora e o webhook chega em segundos, mas os
  --   dois podem cruzar. A Asaas reentrega com intervalo crescente até 3h entre
  --   tentativas (docs lidas em 2026-11-10), então 4h é > o pior intervalo
  --   documentado de uma reentrega E > a cadência de 1h do sync: o que ainda está
  --   se resolvendo sozinho não alerta. Acima de 4h não é mais "processando" — é
  --   fila interrompida, e a Asaas APAGA evento represado depois de 14 dias, então
  --   esperar mais do que isso só queima a janela de recuperação.
  --   Usamos created_at (não occurred_at) porque o extrato traz só a DATA do
  --   movimento e o sync ancora em meio-dia BRT — occurred_at pode até estar no
  --   futuro em relação a now(), o que tornaria a carência imprevisível.
  WITH credito_asaas AS (
    SELECT
      l.asaas_payment_id                                       AS asaas_payment_id,
      max(l.amount)                                            AS amount,
      min(l.occurred_at)                                       AS occurred_at,
      min(l.created_at)                                        AS first_seen_at,
      -- ORDER BY junto do DISTINCT: sem ele a ordem do agregado é indefinida e o
      -- `detail` da notificação mudaria de um dia pro outro sem nada ter mudado.
      string_agg(DISTINCT l.asaas_transaction_id, '+'
                 ORDER BY l.asaas_transaction_id)              AS tx_ids,
      max(l.description)                                       AS description,
      bool_or(l.admin_financial_transaction_id IS NOT NULL)    AS nos_livros
    FROM public.ledger_asaas l
    WHERE l.direction = 'credit'
      AND l.asaas_payment_id IS NOT NULL
      AND COALESCE(l.asaas_event_type, '') NOT IN (
        'RECEIVABLE_ANTICIPATION_GROSS_CREDIT',
        'RECEIVABLE_ANTICIPATION_DEBIT',
        'RECEIVABLE_ANTICIPATION_FEE',
        'PIX_TRANSACTION_DEBIT_REFUND'
      )
    GROUP BY l.asaas_payment_id
    HAVING min(l.created_at) < now() - INTERVAL '4 hours'
  )

  -- (1) RENOVAÇÃO EM DOBRO: mesma fatura (company_id, amount, due_date) com mais
  -- de um pagamento que creditou LTV. Significa que a renovação rodou 2x.
  SELECT
    'RENOVACAO_EM_DOBRO'::TEXT AS issue_type,
    (sp.company_id::TEXT || '|' || sp.amount::TEXT || '|' || sp.due_date::TEXT) AS ref,
    ('company_id=' || sp.company_id || ' amount=' || sp.amount
       || ' due_date=' || sp.due_date || ' creditos=' || count(*)) AS detail,
    'Mesma fatura creditou renovacao (LTV) mais de uma vez' AS description
  FROM public.subscription_payments sp
  WHERE sp.ltv_credited_at IS NOT NULL
  GROUP BY sp.company_id, sp.amount, sp.due_date
  HAVING count(*) > 1

  UNION ALL

  -- (2) PAGAMENTO SEM CREDITO: recebido/confirmado mas nunca renovou a empresa.
  SELECT
    'PAGAMENTO_SEM_CREDITO'::TEXT AS issue_type,
    COALESCE(sp.asaas_payment_id, sp.id::TEXT) AS ref,
    ('payment_id=' || COALESCE(sp.asaas_payment_id, '(null)')
       || ' company_id=' || sp.company_id
       || ' status=' || sp.status || ' amount=' || sp.amount) AS detail,
    'Pagamento recebido/confirmado mas LTV nunca foi creditado (renovacao orfa)' AS description
  FROM public.subscription_payments sp
  WHERE sp.status IN ('RECEIVED', 'CONFIRMED')
    AND sp.ltv_credited_at IS NULL

  UNION ALL

  -- (3) LANCAMENTO DUPLICADO: mesmo asaas_transaction_id em mais de uma linha
  -- de admin_financial_transactions (a idempotência do ledger furou).
  SELECT
    'LANCAMENTO_DUPLICADO'::TEXT AS issue_type,
    aft.asaas_transaction_id AS ref,
    ('asaas_transaction_id=' || aft.asaas_transaction_id
       || ' linhas=' || count(*)) AS detail,
    'Mesmo pagamento Asaas lancado mais de uma vez no financeiro admin' AS description
  FROM public.admin_financial_transactions aft
  WHERE aft.asaas_transaction_id IS NOT NULL
  GROUP BY aft.asaas_transaction_id
  HAVING count(*) > 1

  UNION ALL

  -- =========================================================================
  -- (4) DINHEIRO SEM BAIXA  ← o incidente que motivou a rede. SINAL FORTE.
  -- =========================================================================
  -- O dinheiro entrou na conta Asaas para uma cobrança QUE É NOSSA (existe linha
  -- em subscription_payments), e essa linha segue sem confirmação. Só tem uma
  -- leitura possível: o evento `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` não foi
  -- processado — webhook perdido ou fila da Asaas interrompida. Enquanto isso o
  -- tenant pagou e não foi ativado/renovado/liberado.
  --
  -- NÃO é silenciável por ack de propósito: (a) é sempre incidente, nunca
  -- "esperado"; (b) ele se APAGA SOZINHO no momento em que o pagamento é
  -- reconciliado (status vira RECEIVED/CONFIRMED) — não existe estado em que
  -- alertar pra sempre seja o comportamento correto. Ack aqui só serviria pra
  -- esconder dinheiro não entregue.
  --
  -- Status de estorno/chargeback ficam FORA: nesses o sistema conheceu o ciclo de
  -- vida do pagamento (ele passou por RECEIVED antes de voltar), então o crédito
  -- antigo no extrato não é sinal de webhook perdido.
  SELECT
    'DINHEIRO_SEM_BAIXA'::TEXT AS issue_type,
    c.asaas_payment_id AS ref,
    ('payment_id=' || c.asaas_payment_id
       || ' company_id=' || sp.company_id
       || ' tipo=' || COALESCE(sp.type, '(null)')
       || ' status_no_sistema=' || sp.status
       || ' valor_recebido=' || c.amount
       || ' recebido_em=' || to_char(c.occurred_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
       || ' ledger=' || c.tx_ids) AS detail,
    'Dinheiro entrou na conta Asaas mas a cobranca segue sem confirmacao no sistema (webhook perdido): o cliente pagou e nao foi liberado' AS description
  FROM credito_asaas c
  JOIN public.subscription_payments sp ON sp.asaas_payment_id = c.asaas_payment_id
  WHERE sp.status NOT IN ('RECEIVED', 'CONFIRMED')
    AND sp.status NOT IN (
      'REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS',
      'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'
    )

  UNION ALL

  -- =========================================================================
  -- (5) CREDITO SEM COBRANCA  ← normalmente "órfão de link avulso". SINAL FRACO.
  -- =========================================================================
  -- Dinheiro entrou e NÃO existe nenhuma linha nossa com esse asaas_payment_id.
  -- O padrão conhecido é cobrança criada fora do checkout (Pix avulso: a Asaas
  -- gera a cobrança sozinha a partir do Pix recebido, sem externalReference), e
  -- nesse caso o `asaas-webhook` já grava o órfão no ledger e já notifica
  -- `unmatched_asaas_payment`. Mas NÃO é só isso que cai aqui: também cai o
  -- pagamento cuja cobrança nossa nunca foi materializada (ex.: renovação de
  -- cartão cujo PAYMENT_CREATED/RECEIVED se perdeu) — esse tem
  -- `externalReference` = company_id e é incidente de verdade. Por isso o alerta
  -- existe e por isso ele é SILENCIÁVEL CASO A CASO, nunca por regra geral:
  -- quem olha decide, registra o ack com nota e o alarme para de repetir.
  -- Sem esse mecanismo o cron acusaria os mesmos casos todo dia pra sempre, o CEO
  -- aprenderia a ignorar o aviso, e o próximo incidente passaria batido.
  SELECT
    'CREDITO_SEM_COBRANCA'::TEXT AS issue_type,
    c.asaas_payment_id AS ref,
    ('payment_id=' || c.asaas_payment_id
       || ' valor_recebido=' || c.amount
       || ' recebido_em=' || to_char(c.occurred_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
       || ' nos_livros=' || CASE WHEN c.nos_livros THEN 'sim' ELSE 'nao' END
       || ' ledger=' || c.tx_ids
       || ' origem=' || COALESCE(left(c.description, 70), '(sem descricao)')) AS detail,
    'Entrou dinheiro na conta Asaas sem cobranca correspondente no sistema: confira se e cobranca avulsa (fora do checkout) ou assinatura que nao foi registrada' AS description
  FROM credito_asaas c
  WHERE NOT EXISTS (
          SELECT 1 FROM public.subscription_payments sp
           WHERE sp.asaas_payment_id = c.asaas_payment_id
        )
    AND NOT EXISTS (
          SELECT 1 FROM public.asaas_reconciliation_acks a
           WHERE a.issue_type = 'CREDITO_SEM_COBRANCA'
             AND a.ref        = c.asaas_payment_id
             AND a.revoked_at IS NULL
        );
$$;

REVOKE ALL ON FUNCTION public.asaas_reconciliation_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asaas_reconciliation_check() TO service_role;

COMMENT ON FUNCTION public.asaas_reconciliation_check() IS
  'Varredura read-only de anomalias da integracao Asaas (conta Auctus): renovacao em dobro, pagamento orfao, lancamento duplicado, dinheiro recebido sem baixa (webhook perdido) e credito sem cobranca. Usada pela tela admin e pelo cron asaas-reconciliation-daily (jobid 8).';


-- -----------------------------------------------------------------------------
-- 4) Backfill: reconhece os órfãos de Pix avulso JÁ conhecidos e JÁ alertados
-- -----------------------------------------------------------------------------
-- Critério sem identificadores de produção: billingType = PIX, descrição de cobrança
-- gerada automaticamente a partir de Pix recebido, externalReference ausente, e já
-- existe `admin_notifications.type = 'unmatched_asaas_payment'` pro mesmo payment_id —
-- ou seja, o `asaas-webhook` CHEGOU, não resolveu empresa e JÁ avisou pelo canal
-- próprio dele. Repetir no alerta de conciliação é ruído puro.
-- A linha do ledger NÃO é tocada: continua `pending_categorization` e visível na
-- tela de Conciliação, que é o lugar certo da tarefa contábil. O ack silencia só
-- o ALARME de conciliação.
INSERT INTO public.asaas_reconciliation_acks (issue_type, ref, note)
SELECT DISTINCT
  'CREDITO_SEM_COBRANCA',
  l.asaas_payment_id,
  'Orfao de link avulso (Pix recebido fora do checkout, cobranca gerada pela propria Asaas). '
  || 'Reconhecido por criterio semantico: billingType=PIX, sem externalReference e ja '
  || 'alertado por unmatched_asaas_payment. A categorizacao contabil segue pendente '
  || 'na tela de Conciliacao.'
FROM public.ledger_asaas l
WHERE l.direction = 'credit'
  AND l.asaas_payment_id IS NOT NULL
  AND COALESCE(l.raw_payload->>'billingType', '') = 'PIX'
  AND NULLIF(btrim(COALESCE(l.raw_payload->>'externalReference', '')), '') IS NULL
  AND COALESCE(l.raw_payload->>'description', '') ILIKE '%gerada automaticamente%Pix recebido%'
  AND NOT EXISTS (
        SELECT 1 FROM public.subscription_payments sp
         WHERE sp.asaas_payment_id = l.asaas_payment_id
      )
  AND EXISTS (
        SELECT 1 FROM public.admin_notifications n
         WHERE n.type = 'unmatched_asaas_payment'
           AND n.data->>'payment_id' = l.asaas_payment_id
      )
ON CONFLICT (issue_type, ref) DO NOTHING;
