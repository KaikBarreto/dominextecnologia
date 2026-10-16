-- ============================================================================
-- NFS-e AUTOMÁTICA POR CONTRATO RECORRENTE — ONDA 1 (banco)
-- ============================================================================
--
-- POR QUE ESTA MIGRATION EXISTE:
--   Pedido do CEO (2026-10-16): emitir a nota do cliente automaticamente para
--   contratos recorrentes.
--   Plano-pai:   docs/planos/2026-10-16-nfse-automatica-contrato.md
--   Autorização: docs/planos/2026-10-16-nfse-automatica-regra-de-autorizacao.md
--                (🛡️ Plataforma — define a regra; aqui só o SQL dela)
--
--   As parcelas de contrato já são linhas REAIS de financial_transactions
--   (contract_id preenchido, transaction_type='entrada'), mantidas por janela
--   rolante de 24 meses pelo cron extend-contract-billing-daily
--   (20260919250000). É dessas linhas que a nota nasce — não há "plano
--   virtual" a inventar aqui.
--
-- O QUE ESTA ONDA ENTREGA (e o que NÃO entrega):
--   ENTREGA: a configuração no contrato, a FILA (nfse_auto_jobs), os dois
--   produtores que a enchem (trigger de pagamento + cron diário de
--   enfileiramento) e a RPC de CLAIM que re-deriva a posse antes de entregar
--   qualquer job ao consumidor.
--   NÃO ENTREGA: a emissão. Quem drena a fila e chama o núcleo de emissão é a
--   edge `nfse-auto-runner` da Onda 2, com cron PRÓPRIO (ver §9). Até ela
--   subir, os jobs acumulam em 'pendente' — visíveis, nunca perdidos.
--
-- DESENHO: UMA FILA, TRÊS GATILHOS
--   dia_fixo    ─┐
--   vencimento  ─┼─→ nfse_auto_jobs ─→ nfse_auto_claim ─→ runner (Onda 2)
--   pagamento   ─┘    (1 linha = 1 parcela)
--   Os três modos NÃO viram três códigos de emissão. O ponto onde a nota é
--   emitida é onde mora o risco (posse, cota, dado faltando, erro do
--   provedor); um ponto só = uma regra de retry, uma tela de pendência, um
--   lugar pra auditar.
--
-- DOIS CRONS, NUNCA UM ENCADEADO (correção ao §1.4 do plano-pai, decidida
-- pelo Tech Lead + 🛡️ Plataforma R9.2): enfileirar e drenar são schedules
-- independentes. Encadear faria uma falha do enfileirador derrubar a emissão
-- (e vice-versa) e impediria reprocessar a fila sem reenfileirar. Esta
-- migration cria SÓ o cron de enfileirar; o de drenar nasce com a edge, na
-- Onda 2.
--
-- ============================================================================
-- INVARIANTES (não são sugestão — cada um tem a trava física abaixo)
-- ============================================================================
--
-- (1) UMA PARCELA GERA NO MÁXIMO UM JOB → UNIQUE (company_id,
--     financial_transaction_id) em nfse_auto_jobs. Todos os produtores
--     inserem com ON CONFLICT DO NOTHING, então rodar o cron 2x, 10x ou 100x
--     no mesmo dia produz as mesmas linhas da primeira vez. A suspensória
--     (segunda trava, contra nota duplicada de verdade) é a UNIQUE
--     (company_id, idempotency_key) de nfse_emissions, alimentada na Onda 2
--     por chave derivada DA PARCELA (R8).
--     CONSEQUÊNCIA DELIBERADA: job que virou 'falhou' ou 'cancelada' NÃO é
--     re-enfileirado pelo cron. Quem decide tentar de novo é o humano, na
--     tela de pendências da Onda 3 (que reabre a linha que JÁ existe).
--     Repescagem automática de job morto é exatamente como se emite a mesma
--     nota duas vezes.
--
-- (2) NUNCA ENFILEIRAR EM RECEBIMENTO PARCIAL. No Dominex, recebimento
--     parcial cria uma transação FILHA (category='Recebimento parcial',
--     parent_transaction_id preenchido, transaction_type='entrada', nasce
--     is_paid=true) e o gatilho trg_recalc_amount_received acumula a soma das
--     filhas em amount_received da MÃE, só virando is_paid=true na mãe quando
--     a soma cobre o valor (ver 20260523234208). Nota em cima de meio
--     pagamento é erro fiscal, não bug de tela. Quatro guardas, não uma:
--       a) NEW.contract_id IS NOT NULL   — a filha NÃO herda contract_id.
--          MEDIDO EM PRODUÇÃO antes de escrever isto: 12 filhas de
--          'Recebimento parcial' existem, ZERO têm contract_id; e das 505
--          parcelas de contrato, ZERO têm parent_transaction_id. Confirmado
--          nos dois caminhos que criam a filha: buildPartialReceiptRow
--          (src/hooks/useFinancial.ts) e apply_tenant_charge_installment_payment
--          (20260919090000) — nenhum dos dois grava contract_id na filha.
--       b) NEW.parent_transaction_id IS NULL — filha tem pai, parcela não.
--       c) NEW.category IS DISTINCT FROM 'Recebimento parcial'.
--       d) amount_received, quando existe, tem que COBRIR o amount.
--     As guardas (a)-(c) estão no WHEN do trigger (custo zero quando não se
--     aplicam); a (d) está no corpo.
--
-- (3) MÊS É MÊS CALENDÁRIO, NUNCA 30 DIAS, COM CLAMP DE FIM DE MÊS. Toda
--     aritmética usa date_trunc('month', ...) e interval '1 month'. O dia
--     fixo passa por public.nfse_auto_trigger_date(), que clampa: dia 31
--     configurado em fevereiro = 28 (29 em ano bissexto), dia 31 em abril =
--     30. Nunca "+30 dias".
--
-- (4) NASCE DESLIGADO em 100% dos contratos existentes. nfse_auto_enabled
--     boolean NOT NULL DEFAULT false resolve, e NÃO há backfill: nenhum
--     cliente acorda emitindo nota sem pedir. O bloco §11 ABORTA a migration
--     se algum contrato nascer ligado.
--
-- (5) LIGAR A AUTOMAÇÃO NÃO EMITE O PASSADO. Existe nfse_auto_enabled_at
--     (carimbado por trigger no instante em que a chave vira true) e o cron
--     nunca enfileira parcela cuja data de gatilho seja ANTERIOR a esse
--     carimbo. Sem isso, ligar a chave num contrato de 2 anos dispararia um
--     lote de notas retroativas — o oposto do invariante (4).
--
-- (6) A FILA É ESCRITA SÓ POR TRIGGER/CRON/RPC/service_role. authenticated
--     tem SELECT da própria empresa (com entitlement de assinatura, R10) e
--     MAIS NADA: zero policy de INSERT/UPDATE/DELETE e zero GRANT dessas
--     ações. anon não tem nada — o default ACL do Supabase concede anon em
--     toda tabela nova neste projeto (auditoria de 2026-10-01), então o
--     REVOKE é explícito.
--
-- (7) O company_id DE UM JOB NÃO É PROVA, É AFIRMAÇÃO (R3). Quem consome a
--     fila não lê a tabela: chama nfse_auto_claim(), que RE-DERIVA a
--     coerência de quatro linhas (job ↔ parcela ↔ contrato ↔ cliente) na
--     mesma statement SQL e marca 'falhou' — sem entregar — qualquer job
--     incoerente. Hoje o único inserter é um trigger nosso; amanhã nasce uma
--     RPC de enfileirar à mão, uma tela de admin, um backfill. Checar no
--     CONSUMO é a única checagem que sobrevive a inserter novo.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) contracts: a configuração da automação
-- ----------------------------------------------------------------------------
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS nfse_auto_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS nfse_auto_trigger text NOT NULL DEFAULT 'dia_fixo';

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS nfse_auto_day smallint;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS nfse_auto_description text;

-- Autoria da AUTORIZAÇÃO (R5): a nota automática não tem "quem apertou o
-- botão" (nfse_emissions.created_by fica NULL, de propósito — carimbar o rosto
-- de quem não emitiu é falso testemunho sobre documento fiscal). A
-- responsabilidade humana existe e mora AQUI: quem ligou a automação neste
-- contrato, e quando.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS nfse_auto_enabled_at timestamptz;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS nfse_auto_enabled_by uuid;

-- Overrides fiscais opcionais. NULO = herda do tipo de serviço do contrato
-- (service_types.codigo_servico / codigo_tributacao_municipal / codigo_nbs /
-- iss_aliquota). Guardar o override no contrato, e não copiar o valor do tipo
-- de serviço, é o que evita duas verdades: mudar o tipo de serviço continua
-- valendo pra quem não sobrescreveu. A herança é resolvida UMA vez, em SQL,
-- dentro de nfse_auto_claim — nunca reimplementada no runner.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS nfse_codigo_servico text;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS nfse_codigo_tributacao_municipal text;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS nfse_codigo_nbs text;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS nfse_iss_aliquota numeric(5,2);

COMMENT ON COLUMN public.contracts.nfse_auto_enabled IS
  'Emissão automática de NFS-e das parcelas deste contrato. DEFAULT false preserva todo contrato existente — nenhum cliente acorda emitindo nota. Ligar NÃO emite o passado: ver nfse_auto_enabled_at. O runner NUNCA escreve nesta coluna: perder módulo ou ficar inadimplente PAUSA a emissão (job fica vivo e bloqueado), nunca desliga a configuração do cliente.';

COMMENT ON COLUMN public.contracts.nfse_auto_trigger IS
  'QUANDO a nota da parcela é enfileirada: dia_fixo (padrão — dia do mês definido em nfse_auto_day, com clamp de fim de mês), vencimento (due_date da parcela) ou pagamento (a parcela virou paga por QUALQUER caminho: baixa manual ou confirmação Asaas). Nos modos dia_fixo e vencimento a nota sai mesmo sem o cliente ter pago — a nota é do serviço prestado e é ela que origina o pagamento. Quem só quer nota com dinheiro na mão escolhe pagamento.';

COMMENT ON COLUMN public.contracts.nfse_auto_day IS
  'Dia do mês (1..31) em que a nota é enfileirada no modo dia_fixo. Obrigatório quando a automação está LIGADA nesse modo (CHECK contracts_nfse_auto_day_required). Clampado para o último dia do mês quando não existe: 31 em fevereiro = 28/29. Em contrato NÃO mensal (trimestral, semestral, anual) este dia diz apenas EM QUE DIA DO MÊS a nota sai — só há nota nos meses em que existe parcela.';

COMMENT ON COLUMN public.contracts.nfse_auto_description IS
  'Discriminação do serviço que vai na nota. Nulo = o runner cai no fallback (nome do tipo de serviço + competência). Texto livre porque a discriminação é redação fiscal do prestador, não enum.';

COMMENT ON COLUMN public.contracts.nfse_auto_enabled_at IS
  'Instante em que nfse_auto_enabled passou de false para true (carimbado pelo trigger trg_contracts_stamp_nfse_auto_enabled, nunca pelo front). Tem DUAS funções: (1) o cron NUNCA enfileira parcela com data de gatilho anterior a esta data — sem essa trava, ligar a chave num contrato antigo despejaria um lote de notas retroativas; (2) junto com nfse_auto_enabled_by, responde "quem autorizou que este contrato emitisse sozinho, e quando" (R5), que é a pergunta de auditoria que nfse_emissions.created_by NÃO pode responder numa nota automática. Desligar a automação NÃO apaga o carimbo (serve de rastro); religar sobrescreve.';

COMMENT ON COLUMN public.contracts.nfse_auto_enabled_by IS
  'Usuário que LIGOU a emissão automática neste contrato (auth.uid() no momento do UPDATE, preenchido pelo trigger). É aqui que mora a responsabilidade humana da nota automática — nfse_emissions.created_by fica NULL de propósito, porque a tela de Notas Fiscais mostra o avatar de QUEM EMITIU e ninguém emitiu. Nulo quando a chave foi ligada fora de uma sessão autenticada (service_role/cron), caso em que o rastro é o nfse_auto_enabled_at.';

COMMENT ON COLUMN public.contracts.nfse_codigo_servico IS
  'Override do código de serviço municipal para as notas automáticas deste contrato. NULO = herda service_types.codigo_servico do tipo de serviço do contrato.';

COMMENT ON COLUMN public.contracts.nfse_codigo_tributacao_municipal IS
  'Override do cTribMun para as notas automáticas deste contrato. NULO = herda service_types.codigo_tributacao_municipal.';

COMMENT ON COLUMN public.contracts.nfse_codigo_nbs IS
  'Override do código NBS para as notas automáticas deste contrato. NULO = herda service_types.codigo_nbs.';

COMMENT ON COLUMN public.contracts.nfse_iss_aliquota IS
  'Override da alíquota de ISS (em %) para as notas automáticas deste contrato. NULO = herda service_types.iss_aliquota.';

-- Integridade. Cada CHECK é criado só se não existir (idempotência) e falha
-- ALTO: configuração incoerente que o banco aceita vira cron que não faz nada
-- em silêncio — o pior desfecho possível quando o assunto é nota fiscal.
DO $nfse_auto_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_nfse_auto_trigger_check') THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_nfse_auto_trigger_check
      CHECK (nfse_auto_trigger IN ('dia_fixo', 'vencimento', 'pagamento'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_nfse_auto_day_range') THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_nfse_auto_day_range
      CHECK (nfse_auto_day IS NULL OR (nfse_auto_day >= 1 AND nfse_auto_day <= 31));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_nfse_auto_day_required') THEN
    -- Só morde quando a automação está LIGADA no modo dia_fixo. Contrato
    -- desligado (a esmagadora maioria) e os outros dois modos passam livres,
    -- então nenhuma linha existente é rejeitada por este CHECK.
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_nfse_auto_day_required
      CHECK (
        nfse_auto_enabled = false
        OR nfse_auto_trigger <> 'dia_fixo'
        OR nfse_auto_day IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_nfse_iss_aliquota_range') THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_nfse_iss_aliquota_range
      CHECK (nfse_iss_aliquota IS NULL OR (nfse_iss_aliquota >= 0 AND nfse_iss_aliquota <= 100));
  END IF;
END
$nfse_auto_checks$;

-- Índice parcial: o cron precisa achar só os contratos com automação ligada.
-- Hoje são 0 linhas; o índice fica minúsculo e a varredura nunca toca a
-- tabela inteira.
CREATE INDEX IF NOT EXISTS idx_contracts_nfse_auto_enabled
  ON public.contracts (id)
  WHERE nfse_auto_enabled = true;

-- ----------------------------------------------------------------------------
-- 2) Carimbo de "quem ligou e quando" (invariantes 5 e R5)
-- ----------------------------------------------------------------------------
-- NÃO é SECURITY DEFINER de propósito: a função só escreve em NEW, não precisa
-- de privilégio nenhum, e SECURITY DEFINER aqui ATRAPALHARIA — ela precisa ver
-- o chamador (auth.uid()), e função SECURITY DEFINER é exatamente o lugar onde
-- a identidade do chamador fica turva.
CREATE OR REPLACE FUNCTION public.trg_contracts_stamp_nfse_auto_enabled()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.nfse_auto_enabled THEN
      NEW.nfse_auto_enabled_at := COALESCE(NEW.nfse_auto_enabled_at, now());
      NEW.nfse_auto_enabled_by := COALESCE(NEW.nfse_auto_enabled_by, auth.uid());
    END IF;
  ELSIF NEW.nfse_auto_enabled AND COALESCE(OLD.nfse_auto_enabled, false) = false THEN
    -- false -> true: (re)carimba. Desligar não apaga o carimbo anterior.
    -- auth.uid() é NULL em UPDATE de service_role/cron; nesse caso respeita o
    -- que o chamador mandou, em vez de apagar a autoria com NULL.
    NEW.nfse_auto_enabled_at := now();
    NEW.nfse_auto_enabled_by := COALESCE(auth.uid(), NEW.nfse_auto_enabled_by);
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.trg_contracts_stamp_nfse_auto_enabled() IS
  'Carimba contracts.nfse_auto_enabled_at/nfse_auto_enabled_by quando a emissão automática de NFS-e é LIGADA (INSERT com true, ou UPDATE false->true). São as duas colunas que respondem "quem autorizou este contrato a emitir sozinho" (a nota automática não tem created_by) e a trava que impede o cron de enfileirar parcelas anteriores ao momento em que o gestor ligou a chave.';

DROP TRIGGER IF EXISTS trg_contracts_stamp_nfse_auto_enabled ON public.contracts;
CREATE TRIGGER trg_contracts_stamp_nfse_auto_enabled
  BEFORE INSERT OR UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_contracts_stamp_nfse_auto_enabled();

-- ----------------------------------------------------------------------------
-- 3) Clamp de fim de mês (invariante 3)
-- ----------------------------------------------------------------------------
-- IMMUTABLE e pura: dado o 1º dia de um mês e um dia 1..31, devolve a data do
-- gatilho naquele mês, clampada ao último dia existente.
--   (2026-02-01, 31) -> 2026-02-28      (2024-02-01, 31) -> 2024-02-29
--   (2026-04-01, 31) -> 2026-04-30      (2026-03-01, 31) -> 2026-03-31
-- Aritmética de mês calendário (date_trunc + interval '1 month' - '1 day'),
-- nunca "+30 dias".
CREATE OR REPLACE FUNCTION public.nfse_auto_trigger_date(p_month_start date, p_day integer)
RETURNS date
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO 'public'
AS $function$
  SELECT (date_trunc('month', p_month_start::timestamp)::date)
       + (LEAST(
            GREATEST(p_day, 1),
            EXTRACT(DAY FROM (date_trunc('month', p_month_start::timestamp)
                              + interval '1 month' - interval '1 day'))::integer
          ) - 1);
$function$;

COMMENT ON FUNCTION public.nfse_auto_trigger_date(date, integer) IS
  'Data do gatilho "dia fixo" dentro do mês de p_month_start, com clamp de fim de mês: (2026-02-01, 31) -> 2026-02-28, (2024-02-01, 31) -> 2024-02-29, (2026-04-01, 31) -> 2026-04-30. Mês calendário puro, nunca 30 dias. Usada pelo enfileirador nfse_auto_enqueue_due_jobs.';

-- Não é RPC de front: só o cron (service_role/postgres) chama.
REVOKE ALL ON FUNCTION public.nfse_auto_trigger_date(date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nfse_auto_trigger_date(date, integer) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.nfse_auto_trigger_date(date, integer) TO service_role;

-- ----------------------------------------------------------------------------
-- 4) nfse_auto_jobs — a FILA
-- ----------------------------------------------------------------------------
-- 1 linha = 1 parcela. Ciclo de vida:
--   pendente              → esperando o runner
--   processando           → reivindicado por nfse_auto_claim (bloqueado_em
--                           carimbado). Órfão (processo morreu) volta pra
--                           'pendente' na próxima chamada do claim.
--   emitida               → nota autorizada; nfse_emission_id aponta pra ela
--   falhou                → erro de DADO (sem CNPJ, sem IBGE, município sem
--                           cobertura), incoerência de posse, ou teto de
--                           tentativas estourado. Retentar não conserta
--                           cadastro: vira pendência humana na tela.
--   bloqueada_assinatura  ┐ PORTA FECHADA, não tentativa falha (R7). O job
--   bloqueada_modulo      ├ FICA VIVO e é reavaliado no dia seguinte; o
--   bloqueada_cota        ┘ faturamento do cliente NÃO evapora porque a
--                           assinatura Dominex, o módulo ou a cota travou. E
--                           o inverso também é lei: enquanto a porta está
--                           fechada, NADA é emitido.
--   aguardando_decisao    → competência já fechou (mês calendário anterior ao
--                           atual). Emitir nota de competência encerrada tem
--                           efeito tributário no período já apurado: para de
--                           retentar sozinho e espera um clique humano.
--   cancelada             → humano decidiu que esta parcela não leva nota, ou
--                           a automação foi desligada no contrato. Ocupa a
--                           UNIQUE, então o cron não a ressuscita.
CREATE TABLE IF NOT EXISTS public.nfse_auto_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  -- CASCADE e NOT NULL de propósito (R8): a fila é ESCRITURAÇÃO DE TRABALHO,
  -- não o rastro fiscal. Se a parcela é apagada, o job perde sentido — e o
  -- rastro da nota que já saiu continua vivo em nfse_emissions (que tem o seu
  -- próprio financial_transaction_id ON DELETE SET NULL). SET NULL aqui
  -- deixaria job órfão apontando pra nada e o runner tendo que adivinhar.
  financial_transaction_id uuid NOT NULL REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  trigger_reason text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  attempts smallint NOT NULL DEFAULT 0,
  last_error text,
  nfse_emission_id uuid REFERENCES public.nfse_emissions(id) ON DELETE SET NULL,
  scheduled_for date NOT NULL,
  proxima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  bloqueado_em timestamptz,
  emitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- INVARIANTE 1, trava física: uma parcela gera no máximo um job e portanto
  -- no máximo uma nota automática. Escopada por company_id (nunca só pela
  -- transação) porque toda unique neste projeto é por tenant.
  CONSTRAINT nfse_auto_jobs_company_transaction_key UNIQUE (company_id, financial_transaction_id),

  CONSTRAINT nfse_auto_jobs_trigger_reason_check
    CHECK (trigger_reason IN ('dia_fixo', 'vencimento', 'pagamento')),
  CONSTRAINT nfse_auto_jobs_status_check
    CHECK (status IN (
      'pendente', 'processando', 'emitida', 'falhou', 'cancelada',
      'bloqueada_assinatura', 'bloqueada_modulo', 'bloqueada_cota',
      'aguardando_decisao'
    )),
  CONSTRAINT nfse_auto_jobs_attempts_check
    CHECK (attempts >= 0 AND attempts <= 50),
  -- Competência é MÊS, não dia: guardada sempre no 1º dia do mês. O CHECK
  -- impede que alguém grave 15/03 e o agrupamento por competência passe a
  -- depender de quem escreveu. EXTRACT em date é IMMUTABLE (date_trunc com
  -- argumento date resolve pra timestamptz e seria recusado num CHECK).
  CONSTRAINT nfse_auto_jobs_competencia_month_start
    CHECK (EXTRACT(DAY FROM competencia) = 1)
);

COMMENT ON TABLE public.nfse_auto_jobs IS
  'FILA da emissão automática de NFS-e por contrato recorrente. 1 linha = 1 parcela de contrato (financial_transactions com contract_id). Enchida por dois produtores — trigger trg_nfse_auto_enqueue_on_payment (modo pagamento) e cron nfse-auto-enfileirar-daily via nfse_auto_enqueue_due_jobs (modos dia_fixo e vencimento) — e consumida EXCLUSIVAMENTE pela RPC nfse_auto_claim, que re-deriva a coerência de posse (job/parcela/contrato/cliente) antes de entregar qualquer linha. UNIQUE (company_id, financial_transaction_id) garante no máximo uma nota automática por parcela. Escrita só por trigger/cron/RPC/service_role: authenticated tem SELECT da própria empresa (com entitlement) e nada mais.';

COMMENT ON COLUMN public.nfse_auto_jobs.competencia IS
  'Mês de competência da nota, sempre no 1º dia do mês. Derivado de COALESCE(due_date, transaction_date) da parcela com date_trunc(''month''). Mês calendário, nunca 30 dias.';
COMMENT ON COLUMN public.nfse_auto_jobs.trigger_reason IS
  'Qual gatilho enfileirou: dia_fixo, vencimento ou pagamento. Auditoria — responde "por que esta nota saiu nesse dia".';
COMMENT ON COLUMN public.nfse_auto_jobs.scheduled_for IS
  'Data em que o job ficou ELEGÍVEL (dia fixo clampado, due_date da parcela, ou data do pagamento). Não é a data em que o runner rodou; serve pra provar que o atraso foi do consumidor, e não do produtor.';
COMMENT ON COLUMN public.nfse_auto_jobs.proxima_tentativa_em IS
  'A partir de quando nfse_auto_claim pode reivindicar este job de novo. Erro de rede/provedor empurra pra amanhã; porta fechada (bloqueada_*) também. Molde de dfe_manifestacao_jobs.';
COMMENT ON COLUMN public.nfse_auto_jobs.bloqueado_em IS
  'Quando o job foi reivindicado por nfse_auto_claim. Job em ''processando'' com bloqueado_em velho é ÓRFÃO (o processo morreu) e volta pra ''pendente'' na próxima chamada do claim — sem isso, um crash trancaria a parcela pra sempre.';
COMMENT ON COLUMN public.nfse_auto_jobs.attempts IS
  'Tentativas REAIS de emissão (incrementadas pelo claim quando o job sai de ''pendente''). Porta fechada não é tentativa: quem marca bloqueada_assinatura/bloqueada_modulo/bloqueada_cota tem que devolver attempts ao valor anterior, porque o teto de tentativas NÃO se aplica a job bloqueado (R7.2).';
COMMENT ON COLUMN public.nfse_auto_jobs.last_error IS
  'Motivo da última falha, em PT-BR leigo, pra aparecer direto na tela de pendências. Erro que aparece vence erro que esconde. Nunca carrega segredo, token nem payload cru do provedor.';

DROP TRIGGER IF EXISTS set_updated_at_nfse_auto_jobs ON public.nfse_auto_jobs;
CREATE TRIGGER set_updated_at_nfse_auto_jobs
  BEFORE UPDATE ON public.nfse_auto_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tela de pendências por empresa.
CREATE INDEX IF NOT EXISTS idx_nfse_auto_jobs_company_status
  ON public.nfse_auto_jobs (company_id, status, scheduled_for DESC);

-- Lote do claim: só jobs reivindicáveis. Parcial pra não indexar o histórico
-- de 'emitida', que é o que cresce pra sempre.
CREATE INDEX IF NOT EXISTS idx_nfse_auto_jobs_fila_viva
  ON public.nfse_auto_jobs (proxima_tentativa_em, scheduled_for)
  WHERE status IN ('pendente', 'bloqueada_assinatura', 'bloqueada_modulo', 'bloqueada_cota');

-- Liberação de órfão.
CREATE INDEX IF NOT EXISTS idx_nfse_auto_jobs_processando
  ON public.nfse_auto_jobs (bloqueado_em)
  WHERE status = 'processando';

CREATE INDEX IF NOT EXISTS idx_nfse_auto_jobs_contract
  ON public.nfse_auto_jobs (contract_id);

CREATE INDEX IF NOT EXISTS idx_nfse_auto_jobs_emission
  ON public.nfse_auto_jobs (nfse_emission_id)
  WHERE nfse_emission_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5) RLS da fila — regra definida por 🛡️ Plataforma (R10); aqui só o SQL
-- ----------------------------------------------------------------------------
-- Molde IDÊNTICO ao das policies de customers/service_orders/
-- financial_transactions em 20261004213000: super_admin OU (empresa própria E
-- assinatura com acesso). auth.uid() embrulhado em (SELECT ...) pra virar
-- InitPlan e ser avaliado UMA vez por query, não por linha. Sem ramo
-- company_id IS NULL — vazamento conhecido deste projeto.
ALTER TABLE public.nfse_auto_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_nfse_auto_jobs" ON public.nfse_auto_jobs;
CREATE POLICY "service_role_full_access_nfse_auto_jobs"
  ON public.nfse_auto_jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view entitled own company nfse auto jobs" ON public.nfse_auto_jobs;
CREATE POLICY "Users view entitled own company nfse auto jobs"
  ON public.nfse_auto_jobs FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
    )
  );

-- INSERT/UPDATE/DELETE: NENHUMA policy para authenticated, de propósito
-- (invariante 6). A fila é escrita por trigger, cron, RPC SECURITY DEFINER e
-- service_role. Quando a Onda 3 precisar de "tentar de novo", isso vira uma
-- RPC SECURITY DEFINER com posse checada por company_id — não um UPDATE
-- direto do cliente, que permitiria forjar company_id/status e emitir nota em
-- nome de outra empresa.

-- ACL de tabela: fecha o default ACL do Supabase, que concede anon em toda
-- tabela nova neste projeto (auditoria de 2026-10-01). Hoje a RLS barraria
-- porque não existe policy pra anon — ou seja, estaria a UMA policy mal
-- escrita de virar vazamento. Fechar agora, custo zero.
REVOKE ALL ON TABLE public.nfse_auto_jobs FROM PUBLIC;
REVOKE ALL ON TABLE public.nfse_auto_jobs FROM authenticated;
REVOKE ALL ON TABLE public.nfse_auto_jobs FROM anon;
GRANT  SELECT ON TABLE public.nfse_auto_jobs TO authenticated;
GRANT  ALL    ON TABLE public.nfse_auto_jobs TO service_role;

-- ----------------------------------------------------------------------------
-- 6) nfse_emissions: origem e vínculo com o job (R5)
-- ----------------------------------------------------------------------------
-- Pergunta de auditoria "quem apertou o botão desta nota?" → NINGUÉM, quando
-- origem='automatica'. created_by fica NULL de propósito: a tela de Notas
-- Fiscais mostra o avatar de quem emitiu, e carimbar ali o rosto de quem
-- apenas ligou o switch é falso testemunho sobre documento fiscal — e é essa
-- pessoa que seria chamada se a nota estivesse errada. A responsabilidade
-- humana existe e é rastreável: nfse_auto_job_id -> contrato ->
-- nfse_auto_enabled_by/at.
ALTER TABLE public.nfse_emissions
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual';

-- SEM FK física, pelo mesmo motivo documentado em
-- 20260903210000_nfse_autoria_e_detalhes_na_lista.sql: nota é DOCUMENTO. Não
-- pode ser bloqueada nem apagada por causa de outra linha, e um job apagado
-- não pode impedir a nota de existir no nosso banco depois de existir no
-- governo.
ALTER TABLE public.nfse_emissions
  ADD COLUMN IF NOT EXISTS nfse_auto_job_id uuid;

DO $nfse_emissions_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nfse_emissions_origem_check') THEN
    ALTER TABLE public.nfse_emissions
      ADD CONSTRAINT nfse_emissions_origem_check
      CHECK (origem IN ('manual', 'automatica'));
  END IF;
END
$nfse_emissions_checks$;

COMMENT ON COLUMN public.nfse_emissions.origem IS
  'manual (alguém clicou emitir) ou automatica (saiu pelo contrato, sem humano na ponta). DEFAULT ''manual'' preserva as notas existentes. Em origem=''automatica'', created_by é NULL por regra — ver nfse_auto_job_id.';
COMMENT ON COLUMN public.nfse_emissions.nfse_auto_job_id IS
  'Job de nfse_auto_jobs que originou esta nota (só em origem=''automatica''). SEM FK física de propósito: nota é documento fiscal e não pode ser bloqueada nem apagada por causa de outra linha. É por aqui que a auditoria chega em contrato -> nfse_auto_enabled_by/at pra responder quem autorizou a emissão automática.';

CREATE INDEX IF NOT EXISTS idx_nfse_emissions_nfse_auto_job_id
  ON public.nfse_emissions (nfse_auto_job_id)
  WHERE nfse_auto_job_id IS NOT NULL;

-- Responde o NOT EXISTS de "esta parcela já tem nota viva?" sem varrer
-- nfse_emissions. O trigger de pagamento faz essa pergunta a cada baixa de
-- parcela de contrato, então ela precisa ser barata.
CREATE INDEX IF NOT EXISTS idx_nfse_emissions_financial_transaction_id
  ON public.nfse_emissions (financial_transaction_id)
  WHERE financial_transaction_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 7) Produtor 1 — modo 'pagamento': gatilho no BANCO, não no app
-- ----------------------------------------------------------------------------
-- POR QUE NO BANCO: is_paid vira true por DOIS caminhos hoje (baixa manual no
-- app e confirmação da cobrança Asaas via apply_tenant_charge_payment /
-- apply_tenant_charge_installment_payment) e pode ganhar um terceiro amanhã.
-- Instrumentar caminho por caminho garante que o próximo caminho novo nasça
-- furado. O gatilho no banco pega qualquer caminho, inclusive o que ainda não
-- existe.
--
-- QUITAÇÃO TOTAL, NUNCA PARCIAL — ver invariante 2 no cabeçalho. As guardas
-- (a)(b)(c) estão no WHEN do trigger; a (d) (amount_received cobre amount)
-- está aqui no corpo, porque compara duas colunas da mesma linha.
--
-- CONTRATO PAUSADO/ENCERRADO: este produtor NÃO filtra por contracts.status,
-- ao contrário do cron (§8). A assimetria é deliberada: o pagamento é fato
-- consumado sobre serviço já prestado — dinheiro que entrou de uma parcela de
-- contrato encerrado no mês passado ainda precisa de nota. O cron, que empurra
-- faturamento pra FRENTE, respeita a pausa. Quem não quer mais nota nenhuma
-- desliga nfse_auto_enabled.
CREATE OR REPLACE FUNCTION public.trg_nfse_auto_enqueue_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contract_id uuid;
BEGIN
  -- Só receita. Parcela de contrato é sempre 'entrada'.
  IF NEW.transaction_type::text <> 'entrada' THEN
    RETURN NEW;
  END IF;

  -- Parcela cancelada não gera nota.
  IF NEW.cancelled_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- Guarda (d) do invariante 2: se há recebimento parcial registrado, ele tem
  -- que COBRIR o valor da parcela. amount_received = 0 é o caso normal da
  -- quitação direta (nenhuma filha parcial existe).
  IF COALESCE(NEW.amount_received, 0) > 0
     AND COALESCE(NEW.amount_received, 0) < NEW.amount THEN
    RETURN NEW;
  END IF;

  -- Contrato com automação ligada NESTE modo, e da MESMA empresa da parcela
  -- (nada cross-tenant: o company_id do job nasce provado dos dois lados — e
  -- é reconferido no consumo por nfse_auto_claim).
  SELECT c.id
    INTO v_contract_id
    FROM public.contracts c
   WHERE c.id         = NEW.contract_id
     AND c.company_id = NEW.company_id
     AND c.nfse_auto_enabled = true
     AND c.nfse_auto_trigger = 'pagamento';

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Parcela que já tem nota VIVA não entra na fila. 'rejeitada', 'erro' e
  -- 'rascunho' NÃO bloqueiam (nota rejeitada não é nota; rascunho não é
  -- nota). 'cancelada' BLOQUEIA: reemitir depois de cancelar tem prazo legal
  -- e regra municipal — é decisão humana, não automática.
  IF EXISTS (
    SELECT 1
      FROM public.nfse_emissions e
     WHERE e.company_id               = NEW.company_id
       AND e.financial_transaction_id = NEW.id
       AND e.status IN ('pending', 'processando', 'autorizada', 'cancelada')
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.nfse_auto_jobs (
    company_id, contract_id, financial_transaction_id,
    competencia, trigger_reason, scheduled_for
  ) VALUES (
    NEW.company_id,
    v_contract_id,
    NEW.id,
    date_trunc('month', COALESCE(NEW.due_date, NEW.transaction_date)::timestamp)::date,
    'pagamento',
    COALESCE(NEW.paid_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date)
  )
  ON CONFLICT (company_id, financial_transaction_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.trg_nfse_auto_enqueue_on_payment() IS
  'Produtor do modo pagamento da NFS-e automática: quando uma PARCELA DE CONTRATO fecha (is_paid false->true, por qualquer caminho — baixa manual ou Asaas), enfileira um job em nfse_auto_jobs. NUNCA dispara em recebimento parcial: a filha parcial não tem contract_id, tem parent_transaction_id e category=''Recebimento parcial'' (barrada no WHEN do trigger), e a mãe só passa se amount_received cobrir amount. Idempotente por ON CONFLICT na UNIQUE (company_id, financial_transaction_id).';

DROP TRIGGER IF EXISTS trg_nfse_auto_enqueue_on_payment ON public.financial_transactions;
CREATE TRIGGER trg_nfse_auto_enqueue_on_payment
  AFTER UPDATE ON public.financial_transactions
  FOR EACH ROW
  WHEN (
    NEW.contract_id IS NOT NULL                                -- guarda (a)
    AND NEW.parent_transaction_id IS NULL                      -- guarda (b)
    AND NEW.category IS DISTINCT FROM 'Recebimento parcial'    -- guarda (c)
    AND NEW.is_paid IS TRUE
    AND OLD.is_paid IS DISTINCT FROM TRUE                      -- só a TRANSIÇÃO
  )
  EXECUTE FUNCTION public.trg_nfse_auto_enqueue_on_payment();

-- ----------------------------------------------------------------------------
-- 8) Produtor 2 — cron diário: modos 'dia_fixo' e 'vencimento'
-- ----------------------------------------------------------------------------
-- JANELA DE RECUPERAÇÃO: 35 dias (v_catchup_days). Por que 35 e não 1: se o
-- cron não rodar um dia (ou uma semana), no dia seguinte ele ainda enfileira o
-- que ficou pra trás — faturamento perdido em silêncio é o pior desfecho.
-- Por que 35 e não 365: a janela cobre um mês calendário inteiro com folga
-- (31 dias + 4 de margem), o que garante que nenhuma competência mensal é
-- pulada, e para de perseguir meses antigos — nota de competência encerrada é
-- decisão humana (status aguardando_decisao), não retroativa automática.
-- A janela NÃO é risco de lote retroativo ao LIGAR a automação, porque o piso
-- efetivo é GREATEST(hoje - 35, data em que ligou) (invariante 5).
--
-- IDEMPOTÊNCIA: todo INSERT é ON CONFLICT DO NOTHING sobre a UNIQUE. Rodar a
-- função 2x, 10x ou 100x no mesmo dia produz as mesmas linhas da primeira vez,
-- e NUNCA estoura erro por duplicata. Como a condição do modo dia_fixo é
-- "data do gatilho <= hoje" (e não "= hoje"), um job perdido é repescado em
-- qualquer rodada seguinte dentro da janela.
--
-- CONTRATO NÃO MENSAL: a grade é dirigida pela PARCELA, não pelo dia. O dia
-- fixo só diz EM QUE DIA DO MÊS a nota sai; se o mês não tem parcela
-- (trimestral, semestral, anual), o SELECT não acha nada e nada é
-- enfileirado. Zero configuração extra.
--
-- POR QUE O ENFILEIRADOR NÃO CONSULTA ASSINATURA/MÓDULO/COTA: porta fechada
-- não pode apagar faturamento (R7). O job NASCE mesmo com a assinatura
-- vencida, o módulo desligado ou a cota estourada — e é o runner que o
-- segura, com status próprio e motivo em português, reavaliando no dia
-- seguinte. Gatear aqui faria a parcela desaparecer sem rastro, que é
-- exatamente o que o invariante "cota estourada não perde faturamento" proíbe.
--
-- MULTI-TENANT: nada é lido nem escrito cross-empresa. O company_id do job vem
-- do PRÓPRIO contrato E é conferido contra o da parcela no WHERE — e de novo,
-- no consumo, por nfse_auto_claim.
CREATE OR REPLACE FUNCTION public.nfse_auto_enqueue_due_jobs()
RETURNS TABLE(contract_id uuid, trigger_mode text, enqueued_count integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Janela de recuperação de atraso do cron, em dias. Ver cabeçalho.
  v_catchup_days CONSTANT integer := 35;

  v_today        date;
  v_window_floor date;
  v_c            RECORD;
  v_floor        date;
  v_month        date;
  v_trigger_date date;
  v_inserted     integer;
  v_count        integer;
BEGIN
  -- Fuso do Brasil (mesma régua de extend_indeterminate_contract_billing): o
  -- banco roda em UTC, então current_date viraria o dia 3h antes do cliente.
  v_today        := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_window_floor := v_today - v_catchup_days;

  FOR v_c IN
    SELECT c.id,
           c.company_id,
           c.nfse_auto_trigger      AS mode,
           c.nfse_auto_day::integer AS day,
           (c.nfse_auto_enabled_at AT TIME ZONE 'America/Sao_Paulo')::date AS enabled_on
      FROM public.contracts c
     WHERE c.nfse_auto_enabled = true
       AND c.nfse_auto_trigger IN ('dia_fixo', 'vencimento')
       -- Contrato pausado/encerrado para de empurrar faturamento pra frente,
       -- igual ao cron da janela rolante de parcelas. Reativar retoma (dentro
       -- da janela de 35 dias). Allowlist, não denylist.
       AND c.status = 'active'
     ORDER BY c.id
  LOOP
    contract_id    := v_c.id;
    trigger_mode   := v_c.mode;
    enqueued_count := 0;
    v_count        := 0;

    -- Piso efetivo: o mais RECENTE entre a janela de recuperação e o momento
    -- em que a automação foi ligada (invariante 5). nfse_auto_enabled_at nulo
    -- só acontece se alguém ligar a chave por baixo do trigger; nesse caso o
    -- piso é a janela.
    v_floor := GREATEST(v_window_floor, COALESCE(v_c.enabled_on, v_window_floor));

    IF v_c.mode = 'dia_fixo' THEN
      IF v_c.day IS NULL THEN
        -- O CHECK contracts_nfse_auto_day_required impede isso; se aparecer, é
        -- sinal de que alguém escreveu por fora. Deixa rastro e segue.
        reason := 'sem_dia_configurado';
        RAISE WARNING '[nfse_auto_enqueue_due_jobs] contrato % ligado em dia_fixo sem nfse_auto_day', v_c.id;
        RETURN NEXT;
        CONTINUE;
      END IF;

      -- Meses candidatos: o corrente e o anterior. Dois meses cobrem a janela
      -- de 35 dias em qualquer ponto do mês; mês calendário puro
      -- (date_trunc + interval '1 month'), nunca 30 dias.
      FOR v_month IN
        SELECT gs::date
          FROM generate_series(
                 date_trunc('month', v_today::timestamp) - interval '1 month',
                 date_trunc('month', v_today::timestamp),
                 interval '1 month'
               ) AS gs
      LOOP
        -- Dia fixo com CLAMP de fim de mês: 31 em fevereiro = 28/29.
        v_trigger_date := public.nfse_auto_trigger_date(v_month, v_c.day);

        -- Ainda não chegou o dia, ou é anterior ao piso efetivo.
        IF v_trigger_date > v_today OR v_trigger_date < v_floor THEN
          CONTINUE;
        END IF;

        INSERT INTO public.nfse_auto_jobs (
          company_id, contract_id, financial_transaction_id,
          competencia, trigger_reason, scheduled_for
        )
        SELECT ft.company_id,
               v_c.id,
               ft.id,
               date_trunc('month', COALESCE(ft.due_date, ft.transaction_date)::timestamp)::date,
               'dia_fixo',
               v_trigger_date
          FROM public.financial_transactions ft
         WHERE ft.contract_id           = v_c.id
           AND ft.company_id            = v_c.company_id
           AND ft.transaction_type      = 'entrada'
           AND ft.cancelled_at IS NULL
           AND ft.parent_transaction_id IS NULL
           AND ft.amount > 0
           -- A parcela cuja COMPETÊNCIA é este mês. Mês calendário.
           AND date_trunc('month', COALESCE(ft.due_date, ft.transaction_date)::timestamp)::date
               = date_trunc('month', v_month::timestamp)::date
           AND NOT EXISTS (
             SELECT 1
               FROM public.nfse_emissions e
              WHERE e.company_id               = ft.company_id
                AND e.financial_transaction_id = ft.id
                AND e.status IN ('pending', 'processando', 'autorizada', 'cancelada')
           )
        ON CONFLICT (company_id, financial_transaction_id) DO NOTHING;

        -- GET DIAGNOSTICS tem que estar no MESMO bloco PL/pgSQL do statement.
        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        v_count := v_count + v_inserted;
      END LOOP;

    ELSE  -- 'vencimento'
      INSERT INTO public.nfse_auto_jobs (
        company_id, contract_id, financial_transaction_id,
        competencia, trigger_reason, scheduled_for
      )
      SELECT ft.company_id,
             v_c.id,
             ft.id,
             date_trunc('month', COALESCE(ft.due_date, ft.transaction_date)::timestamp)::date,
             'vencimento',
             ft.due_date
        FROM public.financial_transactions ft
       WHERE ft.contract_id           = v_c.id
         AND ft.company_id            = v_c.company_id
         AND ft.transaction_type      = 'entrada'
         AND ft.cancelled_at IS NULL
         AND ft.parent_transaction_id IS NULL
         AND ft.amount > 0
         AND ft.due_date IS NOT NULL
         -- Venceu (hoje ou dentro da janela de recuperação), e nunca antes do
         -- momento em que a automação foi ligada.
         AND ft.due_date <= v_today
         AND ft.due_date >= v_floor
         AND NOT EXISTS (
           SELECT 1
             FROM public.nfse_emissions e
            WHERE e.company_id               = ft.company_id
              AND e.financial_transaction_id = ft.id
              AND e.status IN ('pending', 'processando', 'autorizada', 'cancelada')
         )
      ON CONFLICT (company_id, financial_transaction_id) DO NOTHING;

      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      v_count := v_count + v_inserted;
    END IF;

    enqueued_count := v_count;
    reason := CASE WHEN v_count > 0 THEN 'enqueued' ELSE 'nothing_due' END;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.nfse_auto_enqueue_due_jobs() IS
  'Produtor dos modos dia_fixo e vencimento da NFS-e automática. Roda 1x/dia via cron nfse-auto-enfileirar-daily. Para cada contrato ATIVO com nfse_auto_enabled=true, enfileira em nfse_auto_jobs as parcelas elegíveis: no modo dia_fixo, a parcela cuja competência é o mês cujo dia fixo (com clamp de fim de mês) já passou; no modo vencimento, as parcelas com due_date vencido. Janela de recuperação de 35 dias pra tolerar atraso do cron, com piso em contracts.nfse_auto_enabled_at pra NUNCA emitir o passado de quem acabou de ligar a chave. NÃO consulta assinatura/módulo/cota de propósito: porta fechada é decidida no consumo, pra não apagar faturamento sem rastro. Idempotente (ON CONFLICT DO NOTHING) e sem efeito cross-tenant. Retorna (contract_id, trigger_mode, enqueued_count, reason) por contrato avaliado; reason em enqueued|nothing_due|sem_dia_configurado.';

-- ----------------------------------------------------------------------------
-- 9) nfse_auto_claim — o ÚNICO jeito de consumir a fila (R3)
-- ----------------------------------------------------------------------------
-- O runner NÃO lê nfse_auto_jobs com supabase.from(...). Ele chama esta RPC,
-- no molde de dfe_manifestacao_claim (20260924170000 §6).
--
-- POR QUE A RE-DERIVAÇÃO DE POSSE ACONTECE AQUI, E NÃO NO PRODUTOR:
--   "O job diz que é da empresa X" não é prova de nada — é a afirmação de quem
--   inseriu. A prova é a COERÊNCIA entre o job, a parcela (o dinheiro), o
--   contrato (a autorização) e o cliente (o tomador). Se os quatro não
--   concordam sobre a empresa, não existe nota legítima a emitir. Hoje o único
--   inserter é um trigger nosso; amanhã nasce uma RPC de enfileirar à mão, uma
--   tela de admin, um backfill — e é aí que o company_id divergente entra.
--   Checar no CONSUMO (o lugar que emite) é a única checagem que sobrevive a
--   inserter novo. E fazer isso numa statement SQL, em vez de três awaits no
--   Deno, elimina a janela entre leituras.
--
-- DUAS TRAVAS, NÃO UMA:
--   (i)  o passo 2 abaixo marca 'falhou' todo job incoerente ANTES de
--        reivindicar — ele nunca é entregue, e nenhuma linha nasce em
--        nfse_emissions;
--   (ii) os JOINs do passo 3 são INNER e carregam a igualdade de company_id.
--        Mesmo que o passo 2 deixasse passar algo, o job simplesmente não sai
--        no resultado — fica 'processando' e a liberação de órfão o devolve
--        pra 'pendente' na rodada seguinte, onde o passo 2 o pega.
--
-- A HERANÇA FISCAL É RESOLVIDA AQUI (COALESCE override do contrato -> tipo de
-- serviço). Duas verdades sobre código de serviço é como se emite nota com a
-- tributação errada; o runner recebe o valor já resolvido e não decide nada.
--
-- LIMITAÇÃO CONHECIDA, DOCUMENTADA DE PROPÓSITO: a R3 pede "grava
-- nfse_events" no caso incoerente. HOJE ISSO É IMPOSSÍVEL —
-- nfse_events.nfse_emission_id é NOT NULL REFERENCES nfse_emissions(id), e um
-- job incoerente, por definição, não tem (nem pode ter) emissão. O registro do
-- evento fica em nfse_auto_jobs.last_error (que a tela de pendências lê) + um
-- RAISE WARNING no log do Postgres. Se o time quiser o evento em nfse_events,
-- isso exige tornar nfse_emission_id nullable naquela tabela — decisão de
-- schema que NÃO foi autorizada nesta onda.
CREATE OR REPLACE FUNCTION public.nfse_auto_claim(
  p_limite        integer DEFAULT 10,
  p_orfao_minutos integer DEFAULT 15
)
RETURNS TABLE (
  job_id                   uuid,
  job_company_id           uuid,
  job_contract_id          uuid,
  job_transaction_id       uuid,
  job_competencia          date,
  job_trigger_reason       text,
  job_scheduled_for        date,
  job_attempts             integer,
  parcela_amount           numeric,
  parcela_due_date         date,
  parcela_transaction_date date,
  parcela_is_paid          boolean,
  parcela_amount_received  numeric,
  parcela_description      text,
  contrato_nome            text,
  contrato_status          text,
  contrato_auto_enabled    boolean,
  contrato_auto_trigger    text,
  contrato_descricao_nota  text,
  contrato_service_type_id uuid,
  fiscal_servico_nome      text,
  fiscal_codigo_servico    text,
  fiscal_codigo_trib_mun   text,
  fiscal_codigo_nbs        text,
  fiscal_item_lc116        text,
  fiscal_iss_aliquota      numeric,
  cliente_id               uuid,
  cliente_nome             text,
  cliente_razao_social     text,
  cliente_documento        text,
  cliente_email            text,
  cliente_telefone         text,
  cliente_logradouro       text,
  cliente_numero           text,
  cliente_complemento      text,
  cliente_bairro           text,
  cliente_cidade           text,
  cliente_uf               text,
  cliente_cep              text,
  cliente_ibge             text,
  cliente_inscricao_mun    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_incoerentes integer := 0;
BEGIN
  -- (1) ÓRFÃOS. O processo morreu com o job em 'processando'. Devolver pra
  --     fila é seguro porque a emissão é idempotente nas duas pontas (UNIQUE
  --     do job + UNIQUE (company_id, idempotency_key) da emissão, com chave
  --     derivada da parcela). Sem isso, um crash trancaria a parcela pra
  --     sempre e o cliente ficaria sem nota, em silêncio.
  UPDATE public.nfse_auto_jobs j
     SET status       = 'pendente',
         bloqueado_em = NULL,
         updated_at   = now()
   WHERE j.status = 'processando'
     AND j.bloqueado_em IS NOT NULL
     AND j.bloqueado_em < now() - make_interval(mins => GREATEST(COALESCE(p_orfao_minutos, 15), 1));

  -- (2) COERÊNCIA DE QUATRO LINHAS, antes de reivindicar qualquer coisa.
  --     attempts fica CONGELADO: isto não é tentativa de emissão que falhou,
  --     é agendamento inválido. A mensagem é PT-BR leigo porque vai direto
  --     pra tela de pendências.
  WITH incoerentes AS (
    SELECT j.id
      FROM public.nfse_auto_jobs j
      LEFT JOIN public.financial_transactions ft ON ft.id = j.financial_transaction_id
      LEFT JOIN public.contracts             c  ON c.id  = j.contract_id
      LEFT JOIN public.customers             cu ON cu.id = c.customer_id
     WHERE j.status IN ('pendente', 'bloqueada_assinatura', 'bloqueada_modulo', 'bloqueada_cota')
       AND (
            ft.id IS NULL
         OR c.id  IS NULL
         OR cu.id IS NULL
         OR j.company_id  IS DISTINCT FROM ft.company_id
         OR j.company_id  IS DISTINCT FROM c.company_id
         OR j.company_id  IS DISTINCT FROM cu.company_id
         -- A parcela tem que ser DESTE contrato. Job apontando pra parcela de
         -- outro contrato da mesma empresa também é agendamento inválido.
         OR ft.contract_id IS DISTINCT FROM j.contract_id
       )
  )
  UPDATE public.nfse_auto_jobs j
     SET status       = 'falhou',
         last_error   = 'Inconsistência de empresa no agendamento da nota. A emissão automática foi interrompida por segurança.',
         bloqueado_em = NULL,
         updated_at   = now()
    FROM incoerentes i
   WHERE j.id = i.id;

  GET DIAGNOSTICS v_incoerentes = ROW_COUNT;
  IF v_incoerentes > 0 THEN
    RAISE WARNING '[nfse_auto_claim] % job(s) com incoerencia de posse marcados como falhou e NAO entregues ao chamador', v_incoerentes;
  END IF;

  -- (3) REIVINDICA com FOR UPDATE SKIP LOCKED (duas instâncias do runner nunca
  --     pegam o mesmo job) e devolve o job JÁ JOINADO.
  --     attempts só incrementa quando o job vem de 'pendente': porta fechada
  --     (bloqueada_*) sendo reavaliada não é tentativa de emissão (R7.2).
  RETURN QUERY
  WITH reivindicados AS (
    UPDATE public.nfse_auto_jobs j
       SET status       = 'processando',
           bloqueado_em = now(),
           attempts     = j.attempts + CASE WHEN j.status = 'pendente' THEN 1 ELSE 0 END,
           updated_at   = now()
     WHERE j.id IN (
       SELECT cand.id
         FROM public.nfse_auto_jobs cand
        WHERE cand.status IN ('pendente', 'bloqueada_assinatura', 'bloqueada_modulo', 'bloqueada_cota')
          AND cand.proxima_tentativa_em <= now()
        ORDER BY cand.scheduled_for, cand.created_at
        LIMIT GREATEST(COALESCE(p_limite, 10), 1)
        FOR UPDATE SKIP LOCKED
     )
    RETURNING j.*
  )
  SELECT j.id,
         j.company_id,
         j.contract_id,
         j.financial_transaction_id,
         j.competencia,
         j.trigger_reason,
         j.scheduled_for,
         j.attempts::integer,
         ft.amount,
         ft.due_date,
         ft.transaction_date,
         COALESCE(ft.is_paid, false),
         COALESCE(ft.amount_received, 0),
         ft.description,
         c.name,
         c.status,
         c.nfse_auto_enabled,
         c.nfse_auto_trigger,
         c.nfse_auto_description,
         c.service_type_id,
         st.name,
         -- Herança fiscal resolvida UMA vez, aqui: override do contrato vence,
         -- tipo de serviço completa. O runner não decide nada disso.
         COALESCE(c.nfse_codigo_servico,              st.codigo_servico),
         COALESCE(c.nfse_codigo_tributacao_municipal, st.codigo_tributacao_municipal),
         COALESCE(c.nfse_codigo_nbs,                  st.codigo_nbs),
         st.item_lc116,
         COALESCE(c.nfse_iss_aliquota,                st.iss_aliquota),
         cu.id,
         cu.name,
         cu.company_name,
         cu.document,
         cu.email,
         cu.phone,
         cu.address,
         COALESCE(cu.address_number, cu.street_number),
         cu.complement,
         cu.neighborhood,
         cu.city,
         cu.state,
         cu.zip_code,
         cu.ibge_municipality_code,
         cu.inscricao_municipal
    FROM reivindicados j
    -- INNER + igualdade de company_id = trava (ii). Job incoerente não sai.
    JOIN public.financial_transactions ft
      ON ft.id = j.financial_transaction_id AND ft.company_id = j.company_id
    JOIN public.contracts c
      ON c.id  = j.contract_id              AND c.company_id  = j.company_id
    JOIN public.customers cu
      ON cu.id = c.customer_id              AND cu.company_id = j.company_id
    LEFT JOIN public.service_types st
      ON st.id = c.service_type_id          AND st.company_id = j.company_id
   ORDER BY j.scheduled_for, j.created_at;
END;
$function$;

COMMENT ON FUNCTION public.nfse_auto_claim(integer, integer) IS
  'ÚNICO caminho de consumo da fila nfse_auto_jobs. (1) solta jobs órfãos (processando há mais de p_orfao_minutos); (2) marca ''falhou'', com attempts congelado e SEM entregar, todo job cuja posse não fecha — job.company_id tem que bater com a parcela, o contrato E o cliente, e a parcela tem que ser do contrato do job; (3) reivindica até p_limite jobs com FOR UPDATE SKIP LOCKED (duas instâncias do runner nunca pegam o mesmo), incrementando attempts só quando o job vem de ''pendente'' (porta fechada não é tentativa), e devolve cada job já JOINado com parcela, contrato, cliente e a herança fiscal resolvida (override do contrato vence o tipo de serviço). O chamador usa UM company_id por iteração, vindo deste retorno, e nada mais: company_id de requisição não existe neste caminho. REVOKE de anon/authenticated — só service_role chama.';

-- ----------------------------------------------------------------------------
-- 10) Privilégios das funções novas (R10)
-- ----------------------------------------------------------------------------
-- Nenhuma delas é RPC de front. nfse_auto_claim é SECURITY DEFINER e bypassa
-- RLS: se authenticated pudesse chamá-la do browser, um usuário reivindicaria
-- e travaria a fila de QUALQUER empresa.
DO $privilegios$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.nfse_auto_enqueue_due_jobs()',
    'public.nfse_auto_claim(integer, integer)',
    'public.nfse_auto_trigger_date(date, integer)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
  END LOOP;
END
$privilegios$;

-- Funções de TRIGGER: não precisam (nem devem) de EXECUTE pra ninguém. O
-- Postgres checa EXECUTE no CREATE TRIGGER, não a cada disparo, e chamá-las
-- direto falha com "can only be called as a trigger".
REVOKE ALL ON FUNCTION public.trg_nfse_auto_enqueue_on_payment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_nfse_auto_enqueue_on_payment() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_contracts_stamp_nfse_auto_enabled() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_contracts_stamp_nfse_auto_enabled() FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 11) Agendamento do ENFILEIRADOR (pg_cron)
-- ----------------------------------------------------------------------------
-- UM job, uma responsabilidade: enfileirar. O cron que DRENA a fila
-- (nfse-auto-runner) é separado e nasce na Onda 2, junto com a edge — ver R9.2.
-- Encadear os dois faria uma falha do enfileirador derrubar a emissão, e
-- vice-versa, e impediria reprocessar a fila sem reenfileirar.
--
-- Este job é SQL PURO: não faz http_post, logo não há segredo nenhum em jogo
-- (o padrão CRON_SECRET + vault.decrypted_secrets vale pro job do runner, que
-- chama edge por HTTP). Nenhum literal de segredo existe nesta migration.
--
-- 05:50 UTC = 02:50 em São Paulo. DEPOIS de extend-contract-billing-daily
-- (05:35), de propósito: a janela rolante materializa as parcelas do mês e só
-- então este cron tem o que enfileirar. Inverter a ordem faria o primeiro dia
-- do mês perder a parcela nova.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('nfse-auto-enfileirar-daily')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nfse-auto-enfileirar-daily');

    PERFORM cron.schedule(
      'nfse-auto-enfileirar-daily',
      '50 5 * * *',
      $job$ SELECT public.nfse_auto_enqueue_due_jobs(); $job$
    );

    RAISE NOTICE 'cron nfse-auto-enfileirar-daily agendado (50 5 * * * = 02:50 America/Sao_Paulo)';
  ELSE
    RAISE NOTICE 'pg_cron ausente — funcoes criadas, agendamento pulado';
  END IF;
END
$cron$;

-- ----------------------------------------------------------------------------
-- 12) Conferência (sem backfill — invariante 4)
-- ----------------------------------------------------------------------------
-- NENHUM contrato existente é ligado por esta migration. DEFAULT false
-- resolve, e não há UPDATE em contracts em lugar nenhum acima.
DO $audit$
DECLARE
  v_contratos integer;
  v_ligados   integer;
  v_jobs      integer;
  v_notas     integer;
  v_auto      integer;
BEGIN
  SELECT count(*) INTO v_contratos FROM public.contracts;
  SELECT count(*) INTO v_ligados   FROM public.contracts WHERE nfse_auto_enabled = true;
  SELECT count(*) INTO v_jobs      FROM public.nfse_auto_jobs;
  SELECT count(*) INTO v_notas     FROM public.nfse_emissions;
  SELECT count(*) INTO v_auto      FROM public.nfse_emissions WHERE origem = 'automatica';

  RAISE NOTICE 'NFS-e automatica onda 1: % contrato(s), % com automacao LIGADA (esperado 0), % job(s) na fila (esperado 0), % nota(s) existente(s), % marcada(s) como automatica (esperado 0)',
    v_contratos, v_ligados, v_jobs, v_notas, v_auto;

  IF v_ligados <> 0 THEN
    RAISE EXCEPTION 'Abortado: % contrato(s) nasceram com nfse_auto_enabled=true. A automacao tem que nascer DESLIGADA em 100%% dos contratos existentes.', v_ligados;
  END IF;

  IF v_auto <> 0 THEN
    RAISE EXCEPTION 'Abortado: % nota(s) existente(s) foram marcadas como origem=automatica. O DEFAULT tem que ser manual.', v_auto;
  END IF;
END
$audit$;
