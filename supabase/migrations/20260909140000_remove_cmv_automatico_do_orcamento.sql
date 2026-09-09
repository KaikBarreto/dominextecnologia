-- ============================================================================
-- LIMPEZA DE DADO — remover os lançamentos de CMV que a APROVAÇÃO DE ORÇAMENTO
-- criava sozinha no financeiro
--
-- DECISÃO DO CEO (2026-09-09):
--   "O custo do orçamento tem que entrar só quando a pessoa compra o material.
--    O custo do orçamento por enquanto é só demonstrativo."
--
-- POR QUÊ:
-- Aprovar um orçamento criava automaticamente as despesas "CMV Materiais —
-- Orçamento #N" e "Mão de obra avulsa — Orçamento #N" no financeiro. Isso
-- duplicava o custo: o dinheiro do material sai do caixa quando o material é
-- COMPRADO (lançamento manual do usuário), não quando o orçamento é aprovado.
-- O custo previsto no orçamento passa a ser apenas demonstrativo — ele vive na
-- tela do orçamento e não vira lançamento financeiro. A criação automática foi
-- removida do código em paralelo (src/hooks/useQuoteConversion.ts).
-- Esta migration limpa os registros que já existiam.
--
-- POR QUE APAGAR (e não marcar como cancelado):
-- Na migration 20260909120000 essas mesmas linhas já tiveram o account_id
-- zerado, justamente porque debitavam o saldo bancário indevidamente. Desde
-- então elas estão INERTES: não entram em saldo de conta e não representam
-- nenhum fato financeiro real — só poluem a listagem de movimentações do
-- cliente. Não há o que preservar como histórico contábil.
--
-- ESCOPO MEDIDO EM PRODUÇÃO ANTES DE APLICAR: 17 linhas, R$ 11.210,18
--   Alô gás Juquitiba .. 10 linhas .. R$ 9.383,91
--   VS PROJECT ......... 7 linhas .. R$ 1.826,27
--
-- CRITÉRIO DE ALVO — as 4 condições JUNTAS (nenhuma sozinha basta):
--   1. category IN ('CMV - Materiais', 'CMV - Mão de Obra Avulsa')
--   2. parent_transaction_id IS NOT NULL      (nasceu vinculado ao orçamento)
--   3. descrição no padrão gerado pelo sistema
--   4. account_id IS NULL + marca '[correção 1.24.3]' em notes
--      (prova de que passou pela migration anterior e está inerte)
--
-- 🚨 O QUE NÃO PODE SER TOCADO: existem 11 linhas com categoria de CMV que são
-- lançamentos MANUAIS — o usuário escolheu essa categoria à mão pra uma despesa
-- real que de fato saiu da conta (6 da Alô gás, 3 da ENGETEC, 2 da Glacial).
-- Elas NÃO têm parent_transaction_id, NÃO seguem o padrão de descrição e TÊM
-- account_id preenchido. Apagá-las seria destruir despesa real do cliente.
-- Total delas: R$ 3.682,70. Elas são preservadas pelas condições 2, 3 e 4.
--
-- ⚠️ ATENÇÃO AO TRAVESSÃO: a descrição usa em dash "—" (U+2014), não hífen.
--
-- PROVA DE SEGURANÇA (rodada em produção, antes e depois):
-- como as 17 linhas têm account_id IS NULL, apagá-las NÃO pode mexer em saldo.
-- Saldos das 2 empresas (initial_balance + entradas pagas − saídas pagas,
-- contas type <> 'cartao') conferidos ANTES e DEPOIS — idênticos ao centavo:
--   Alô gás Juquitiba / Caixa ............ R$ 4.601,22
--   Alô gás Juquitiba / Conta Principal .. R$ 1.267,11
--   VS PROJECT / Conta Principal ......... R$     0,00
--   VS PROJECT / MERCADO PAGO ............ R$ 2.267,70
--
-- DEPENDÊNCIAS VERIFICADAS ANTES DO DELETE (todas zero para as 17 linhas):
-- financial_transactions.parent_transaction_id, financial_transaction_attachments
-- (esse FK é ON DELETE CASCADE), credit_card_bills.payment_transaction_id,
-- nfse_emissions.financial_transaction_id, quotes.financial_transaction_id.
--
-- IDEMPOTENTE: rodar de novo encontra 0 linhas e não faz nada. O teto de 17
-- linhas aborta a transação se o escopo crescer, pra não levar dado novo junto.
-- ============================================================================

-- ============================================================================
-- RECUPERAÇÃO: descomente o bloco abaixo para restaurar as 17 linhas
-- exatamente como estavam (snapshot de todas as colunas, tirado em produção
-- em 2026-09-09, imediatamente antes do DELETE).
-- ----------------------------------------------------------------------------
-- INSERT INTO public.financial_transactions (
--   id, transaction_type, category, description, amount, transaction_date,
--   due_date, paid_date, is_paid, customer_id, service_order_id, receipt_url,
--   notes, created_by, created_at, updated_at, contract_id, payment_method,
--   installment_group_id, installment_number, installment_total, account_id,
--   transfer_pair_id, company_id, parent_transaction_id, credit_card_bill_date,
--   employee_id, payroll_period, payroll_kind, cancelled_at, cancelled_reason,
--   amount_received, billing_reminder_resolved_at, billing_reminder_resolved_by,
--   tenant_charge_id, bill_id
-- ) VALUES
--   ('3773529a-386a-4c4b-a151-1c87074ea78d'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #31', 255.55, '2026-07-20'::date, NULL, '2026-07-20'::date, true, '4a2ccb99-79a8-4001-9dbc-ba2f62d48425'::uuid, NULL, NULL, 'Custo de materiais do orçamento #31' || chr(10) || '[correção 1.24.3] account_id original: fa53f641-f0f8-4e08-ba16-82c3179b91b2 (MERCADO PAGO)', '3342cf5a-4479-41ad-b599-f5b430a0eb63'::uuid, '2026-08-11 00:46:12.92867+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '1f8f9fb0-aaf4-4d81-bb37-11bbd4caaa87'::uuid, '66316cdf-2c32-47cb-963d-a814dca84c33'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('82dabc42-b182-4cd9-b131-25436fd67ffa'::uuid, 'saida'::transaction_type, 'CMV - Mão de Obra Avulsa', 'Mão de obra avulsa — Orçamento #32', 72.70, '2026-07-28'::date, NULL, '2026-07-28'::date, true, '8caed7fb-10e6-4912-9e7e-e3d003e75d51'::uuid, NULL, NULL, 'Diárias / valor avulso do orçamento #32' || chr(10) || '[correção 1.24.3] account_id original: fa53f641-f0f8-4e08-ba16-82c3179b91b2 (MERCADO PAGO)', '3342cf5a-4479-41ad-b599-f5b430a0eb63'::uuid, '2026-08-11 00:53:43.333737+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '1f8f9fb0-aaf4-4d81-bb37-11bbd4caaa87'::uuid, '51853e17-5c2b-4610-9740-3b5c26689128'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('0eb72615-64ea-4941-a35b-019c21f8d58d'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #35', 197.62, '2026-07-29'::date, NULL, '2026-07-29'::date, true, '8caed7fb-10e6-4912-9e7e-e3d003e75d51'::uuid, NULL, NULL, 'Custo de materiais do orçamento #35' || chr(10) || '[correção 1.24.3] account_id original: fa53f641-f0f8-4e08-ba16-82c3179b91b2 (MERCADO PAGO)', '3342cf5a-4479-41ad-b599-f5b430a0eb63'::uuid, '2026-08-11 01:10:23.164468+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '1f8f9fb0-aaf4-4d81-bb37-11bbd4caaa87'::uuid, '904cdfbe-5fc8-45e8-b51f-ba5be47264e0'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('65f2d1bf-4595-4af7-99c0-cb3ca3f60dcc'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #37', 332.20, '2026-07-29'::date, NULL, '2026-07-29'::date, true, NULL, NULL, NULL, 'Custo de materiais do orçamento #37' || chr(10) || '[correção 1.24.3] account_id original: fa53f641-f0f8-4e08-ba16-82c3179b91b2 (MERCADO PAGO)', '3342cf5a-4479-41ad-b599-f5b430a0eb63'::uuid, '2026-08-11 01:44:06.9584+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '1f8f9fb0-aaf4-4d81-bb37-11bbd4caaa87'::uuid, '6c8b4a59-9f66-48bd-b4b7-544972c22f01'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('401d25ac-98a4-4320-a492-6cf3f92e8f6e'::uuid, 'saida'::transaction_type, 'CMV - Mão de Obra Avulsa', 'Mão de obra avulsa — Orçamento #1', 145.40, '2026-08-11'::date, NULL, '2026-08-11'::date, true, 'a8246b7b-3370-44d6-ba9c-6a5d491e433b'::uuid, NULL, NULL, 'Diárias / valor avulso do orçamento #1' || chr(10) || '[correção 1.24.3] account_id original: fa53f641-f0f8-4e08-ba16-82c3179b91b2 (MERCADO PAGO)', '3342cf5a-4479-41ad-b599-f5b430a0eb63'::uuid, '2026-08-11 00:19:23.322422+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '1f8f9fb0-aaf4-4d81-bb37-11bbd4caaa87'::uuid, '68cace32-9412-435a-b7f7-3eda3a36855a'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('90c2502e-0c31-4a9d-9db2-383a29794f83'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #1', 323.80, '2026-08-11'::date, NULL, '2026-08-11'::date, true, 'a8246b7b-3370-44d6-ba9c-6a5d491e433b'::uuid, NULL, NULL, 'Custo de materiais do orçamento #1' || chr(10) || '[correção 1.24.3] account_id original: fa53f641-f0f8-4e08-ba16-82c3179b91b2 (MERCADO PAGO)', '3342cf5a-4479-41ad-b599-f5b430a0eb63'::uuid, '2026-08-11 00:19:23.322422+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '1f8f9fb0-aaf4-4d81-bb37-11bbd4caaa87'::uuid, '68cace32-9412-435a-b7f7-3eda3a36855a'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('2ebf1f25-2bbb-4de8-bcd3-c6f2c5600b45'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #70', 499.00, '2026-09-01'::date, NULL, '2026-09-01'::date, true, '34dfc2eb-cb13-4d9c-9d74-87e4dd38d3d3'::uuid, NULL, NULL, 'Custo de materiais do orçamento #70' || chr(10) || '[correção 1.24.3] account_id original: fa53f641-f0f8-4e08-ba16-82c3179b91b2 (MERCADO PAGO)', '3342cf5a-4479-41ad-b599-f5b430a0eb63'::uuid, '2026-09-02 17:45:40.613041+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '1f8f9fb0-aaf4-4d81-bb37-11bbd4caaa87'::uuid, '3421ec65-ea5a-426a-9364-f80c0d27bfef'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('50f93b17-ee0e-4fc0-956a-ec0fba8cea77'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #18', 172.65, '2026-08-05'::date, NULL, '2026-08-05'::date, true, '15a10ad8-f91c-43e2-bdef-b507cfe03f55'::uuid, NULL, NULL, 'Custo de materiais do orçamento #18' || chr(10) || '[correção 1.24.3] account_id original: 49f6f3c8-49f6-4fd1-96e0-6f4983dc1082 (Conta Principal)', '694e118a-2e09-4977-90ca-05b5cd2baf43'::uuid, '2026-08-06 10:12:54.071955+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '9bd3d561-a567-48fa-899d-a05b04c2137f'::uuid, '7933edfe-d9c8-43c9-9892-db7e2759de83'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('1c58c717-a62f-4e33-9ee2-bea577bfe2b1'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #12', 1046.64, '2026-08-19'::date, NULL, '2026-08-19'::date, true, '35d59051-124d-4653-809f-f896a1f9ca39'::uuid, NULL, NULL, 'Custo de materiais do orçamento #12' || chr(10) || '[correção 1.24.3] account_id original: 57546460-fabb-4c0b-907c-3e9f7c363ead (Caixa)', '694e118a-2e09-4977-90ca-05b5cd2baf43'::uuid, '2026-08-31 18:27:36.613522+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '9bd3d561-a567-48fa-899d-a05b04c2137f'::uuid, 'ac535980-fe79-4923-8467-c4cf79881668'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('a9e09989-274f-48eb-8c36-01d0d539c684'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #49', 190.30, '2026-08-22'::date, NULL, '2026-08-22'::date, true, '950f236e-4ac0-42ad-8dda-2402dc9a79cd'::uuid, NULL, NULL, 'Custo de materiais do orçamento #49' || chr(10) || '[correção 1.24.3] account_id original: 57546460-fabb-4c0b-907c-3e9f7c363ead (Caixa)', '694e118a-2e09-4977-90ca-05b5cd2baf43'::uuid, '2026-08-24 10:58:14.09879+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '9bd3d561-a567-48fa-899d-a05b04c2137f'::uuid, 'cfdde867-570b-429e-8574-68f646883b82'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('e0d4b50b-5f0c-4959-be37-40cc559b4d03'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #48', 712.98, '2026-08-24'::date, NULL, '2026-08-24'::date, true, 'cf42b308-f705-483c-9f30-91f13d9bde5f'::uuid, NULL, NULL, 'Custo de materiais do orçamento #48' || chr(10) || '[correção 1.24.3] account_id original: 57546460-fabb-4c0b-907c-3e9f7c363ead (Caixa)', '694e118a-2e09-4977-90ca-05b5cd2baf43'::uuid, '2026-08-24 09:44:06.575217+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '9bd3d561-a567-48fa-899d-a05b04c2137f'::uuid, '0b22e0b6-b20f-4159-a03d-0948e5561392'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('d6da0667-64a0-45e0-a776-117887530cbe'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #15', 368.84, '2026-08-25'::date, NULL, '2026-08-25'::date, true, '6084af40-f0dc-404f-af2c-38fe521dfd07'::uuid, NULL, NULL, 'Custo de materiais do orçamento #15' || chr(10) || '[correção 1.24.3] account_id original: 57546460-fabb-4c0b-907c-3e9f7c363ead (Caixa)', '694e118a-2e09-4977-90ca-05b5cd2baf43'::uuid, '2026-08-26 10:15:27.93342+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '9bd3d561-a567-48fa-899d-a05b04c2137f'::uuid, '5394b827-df4f-4ba0-8bba-007d939da413'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('fec63112-e6b0-4494-a054-9bbcbaccba42'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #45', 882.00, '2026-08-25'::date, NULL, '2026-08-25'::date, true, 'ef8a210c-40b0-4382-8dcc-73f18cb00256'::uuid, NULL, NULL, 'Custo de materiais do orçamento #45' || chr(10) || '[correção 1.24.3] account_id original: 57546460-fabb-4c0b-907c-3e9f7c363ead (Caixa)', '694e118a-2e09-4977-90ca-05b5cd2baf43'::uuid, '2026-08-26 18:53:04.221975+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '9bd3d561-a567-48fa-899d-a05b04c2137f'::uuid, 'd19384f0-cba6-4d2a-9912-f86dfdbc0326'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('58c091d0-b2a6-4856-b066-ea5b8ed10d20'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #62', 2372.20, '2026-08-26'::date, NULL, '2026-08-26'::date, true, 'ef3449ba-fcf0-4de3-9d96-e5940c1bd256'::uuid, NULL, NULL, 'Custo de materiais do orçamento #62' || chr(10) || '[correção 1.24.3] account_id original: 57546460-fabb-4c0b-907c-3e9f7c363ead (Caixa)', '694e118a-2e09-4977-90ca-05b5cd2baf43'::uuid, '2026-08-30 10:49:10.320997+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '9bd3d561-a567-48fa-899d-a05b04c2137f'::uuid, '6b41a9f3-e137-4766-8f0b-0be197529e8c'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('e5b6071e-7e7d-4031-a771-cb09bcb4a0f3'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #27', 2945.27, '2026-08-28'::date, NULL, '2026-08-28'::date, true, 'd238072d-967f-4daa-828d-e38d53b23879'::uuid, NULL, NULL, 'Custo de materiais do orçamento #27' || chr(10) || '[correção 1.24.3] account_id original: 57546460-fabb-4c0b-907c-3e9f7c363ead (Caixa)', '694e118a-2e09-4977-90ca-05b5cd2baf43'::uuid, '2026-08-31 18:04:23.732911+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '9bd3d561-a567-48fa-899d-a05b04c2137f'::uuid, '229e0409-9397-4eda-b6a0-0b131d22b357'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('c426158a-0540-477c-ba16-c1f73c7aaea6'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #83', 297.35, '2026-09-04'::date, NULL, '2026-09-04'::date, true, 'ab60b59d-bcba-46fd-ade5-482c58e2f154'::uuid, NULL, NULL, 'Custo de materiais do orçamento #83' || chr(10) || '[correção 1.24.3] account_id original: 57546460-fabb-4c0b-907c-3e9f7c363ead (Caixa)', '694e118a-2e09-4977-90ca-05b5cd2baf43'::uuid, '2026-09-05 06:08:19.642025+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '9bd3d561-a567-48fa-899d-a05b04c2137f'::uuid, 'd955294e-bfaa-407c-9877-dc8c66652414'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL),
--   ('3e3b457a-36b9-4ab5-ba6a-7c635f398708'::uuid, 'saida'::transaction_type, 'CMV - Materiais', 'CMV Materiais — Orçamento #86', 395.68, '2026-09-04'::date, NULL, '2026-09-04'::date, true, '49bd16c4-727f-4126-b1a6-419a56efb730'::uuid, NULL, NULL, 'Custo de materiais do orçamento #86' || chr(10) || '[correção 1.24.3] account_id original: 57546460-fabb-4c0b-907c-3e9f7c363ead (Caixa)', '694e118a-2e09-4977-90ca-05b5cd2baf43'::uuid, '2026-09-05 07:47:23.358603+00'::timestamptz, '2026-09-09 13:18:07.961237+00'::timestamptz, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '9bd3d561-a567-48fa-899d-a05b04c2137f'::uuid, 'a881cc78-b72d-4d4e-b894-9a2eb28a13c0'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL)
-- ON CONFLICT (id) DO NOTHING;
-- ============================================================================

DO $$
DECLARE
  v_alvo  integer;
  v_rows  integer;
  v_deps  integer;
BEGIN
  -- 1) Medir o alvo antes de tocar em qualquer coisa.
  SELECT count(*) INTO v_alvo
    FROM public.financial_transactions t
   WHERE t.category IN ('CMV - Materiais', 'CMV - Mão de Obra Avulsa')
     AND t.parent_transaction_id IS NOT NULL
     AND (t.description LIKE 'CMV Materiais — Orçamento #%'
       OR t.description LIKE 'Mão de obra avulsa — Orçamento #%')
     AND t.account_id IS NULL
     AND t.notes LIKE '%[correção 1.24.3] account_id original:%';

  IF v_alvo = 0 THEN
    RAISE NOTICE 'CMV automático de orçamento: nada a remover (já limpo).';
    RETURN;
  END IF;

  IF v_alvo > 17 THEN
    RAISE EXCEPTION 'Escopo maior que o medido (% linhas > 17). Abortando pra não apagar dado novo.', v_alvo;
  END IF;

  -- 2) Ninguém pode depender dessas linhas (o FK de anexos é ON DELETE CASCADE).
  SELECT (SELECT count(*) FROM public.financial_transactions f
            WHERE f.parent_transaction_id IN (SELECT id FROM public.financial_transactions t
              WHERE t.category IN ('CMV - Materiais', 'CMV - Mão de Obra Avulsa')
                AND t.parent_transaction_id IS NOT NULL
                AND (t.description LIKE 'CMV Materiais — Orçamento #%'
                  OR t.description LIKE 'Mão de obra avulsa — Orçamento #%')
                AND t.account_id IS NULL
                AND t.notes LIKE '%[correção 1.24.3] account_id original:%'))
       + (SELECT count(*) FROM public.financial_transaction_attachments a
            WHERE a.transaction_id IN (SELECT id FROM public.financial_transactions t
              WHERE t.category IN ('CMV - Materiais', 'CMV - Mão de Obra Avulsa')
                AND t.parent_transaction_id IS NOT NULL
                AND (t.description LIKE 'CMV Materiais — Orçamento #%'
                  OR t.description LIKE 'Mão de obra avulsa — Orçamento #%')
                AND t.account_id IS NULL
                AND t.notes LIKE '%[correção 1.24.3] account_id original:%'))
       + (SELECT count(*) FROM public.quotes q
            WHERE q.financial_transaction_id IN (SELECT id FROM public.financial_transactions t
              WHERE t.category IN ('CMV - Materiais', 'CMV - Mão de Obra Avulsa')
                AND t.parent_transaction_id IS NOT NULL
                AND (t.description LIKE 'CMV Materiais — Orçamento #%'
                  OR t.description LIKE 'Mão de obra avulsa — Orçamento #%')
                AND t.account_id IS NULL
                AND t.notes LIKE '%[correção 1.24.3] account_id original:%'))
       + (SELECT count(*) FROM public.nfse_emissions n
            WHERE n.financial_transaction_id IN (SELECT id FROM public.financial_transactions t
              WHERE t.category IN ('CMV - Materiais', 'CMV - Mão de Obra Avulsa')
                AND t.parent_transaction_id IS NOT NULL
                AND (t.description LIKE 'CMV Materiais — Orçamento #%'
                  OR t.description LIKE 'Mão de obra avulsa — Orçamento #%')
                AND t.account_id IS NULL
                AND t.notes LIKE '%[correção 1.24.3] account_id original:%'))
       + (SELECT count(*) FROM public.credit_card_bills b
            WHERE b.payment_transaction_id IN (SELECT id FROM public.financial_transactions t
              WHERE t.category IN ('CMV - Materiais', 'CMV - Mão de Obra Avulsa')
                AND t.parent_transaction_id IS NOT NULL
                AND (t.description LIKE 'CMV Materiais — Orçamento #%'
                  OR t.description LIKE 'Mão de obra avulsa — Orçamento #%')
                AND t.account_id IS NULL
                AND t.notes LIKE '%[correção 1.24.3] account_id original:%'))
    INTO v_deps;

  IF v_deps > 0 THEN
    RAISE EXCEPTION 'Existem % registro(s) dependendo das linhas alvo. Abortando.', v_deps;
  END IF;

  -- 3) Apagar. As 4 condições juntas protegem os 11 lançamentos manuais de CMV.
  DELETE FROM public.financial_transactions t
   WHERE t.category IN ('CMV - Materiais', 'CMV - Mão de Obra Avulsa')
     AND t.parent_transaction_id IS NOT NULL
     AND (t.description LIKE 'CMV Materiais — Orçamento #%'
       OR t.description LIKE 'Mão de obra avulsa — Orçamento #%')
     AND t.account_id IS NULL
     AND t.notes LIKE '%[correção 1.24.3] account_id original:%';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'CMV automático de orçamento removido: % linha(s).', v_rows;

  IF v_rows <> v_alvo THEN
    RAISE EXCEPTION 'DELETE removeu % linha(s), esperado %. Abortando.', v_rows, v_alvo;
  END IF;
END $$;
