-- ============================================================================
-- Programa de Afiliados — FUNDAÇÃO (Fase 1: schema base)
-- ============================================================================
-- Port do EcoSistema (20260723170000_affiliates_schema.sql) com as divergências
-- do Dominex já aplicadas. Esta migration cria SÓ as 3 tabelas, o vínculo em
-- companies, a RLS de admin e a origem de captação. O motor de comissão
-- (triggers sobre company_payments) e as RPCs de repasse nascem em migrations
-- separadas — aqui não há nenhuma regra de cálculo.
--
-- ORDEM DE CRIAÇÃO: affiliates -> affiliate_payments -> affiliate_commissions.
-- affiliate_commissions referencia affiliate_payments por FK, então a tabela de
-- repasse precisa existir antes.
--
-- ----------------------------------------------------------------------------
-- DIVERGÊNCIA 1 — gate de admin: o Eco usa has_role(auth.uid(),'admin') e o
-- Dominex não tem esse app_role no painel master; o equivalente é
-- public.is_admin_user(uuid) (= is_super_admin OR tem linha em
-- admin_permissions), criada em 20260512205543_salespeople_admin_user_access.sql.
--
-- DIVERGÊNCIA 2 (a que importa de verdade) — o afiliado é um parceiro EXTERNO
-- com login próprio e NUNCA pode ser tratado como admin. Como is_admin_user()
-- devolve true pra QUALQUER usuário com uma linha em admin_permissions, usar o
-- helper cru aqui significaria que, no dia em que alguém gravasse
-- admin_permissions pro afiliado (pra liberar a tela dele), esse parceiro
-- passaria a ler a lista inteira de afiliados e as comissões dos concorrentes.
-- Por isso o gate destas 3 tabelas é public.can_manage_affiliates(): admin do
-- painel E que não seja afiliado. Cinto e suspensório — o acesso do afiliado à
-- própria ficha vem por VÍNCULO (affiliates.user_id), na migration de
-- self-scope, e não por permissão de admin.
--
-- DIVERGÊNCIA 3 — company_payments do Dominex NÃO tem coluna `voided` (estorno
-- aqui é DELETE, via delete_company_payment_with_rollback). Isso não muda nada
-- nesta migration; só está registrado porque a FK
-- affiliate_commissions.company_payment_id usa ON DELETE SET NULL, e é o motor
-- (outra migration) que precisa marcar a comissão como 'voided' ANTES do DELETE
-- apagar o vínculo.
--
-- DIVERGÊNCIA 4 — semântica de recurring_months: ver COMMENT da coluna. A
-- decisão (registrada em docs/planos/2026-10-14-programa-afiliados.md) é contar
-- RECORRÊNCIAS GERADAS, não meses de calendário.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. affiliates — cadastro do parceiro
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  email             text UNIQUE,
  phone             text,
  -- user_id: vínculo com o login do afiliado. ON DELETE SET NULL pra que apagar
  -- o usuário no auth não derrube o histórico financeiro de comissões.
  user_id           uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  first_payment_pct numeric NOT NULL DEFAULT 0,
  recurring_pct     numeric NOT NULL DEFAULT 0,
  recurring_months  integer NULL,
  is_active         boolean NOT NULL DEFAULT true,
  notes             text,
  -- slug: link amigável (?afiliado=<slug>). Preenchimento/unicidade/trigger
  -- ficam na migration 20261014160100 (port da de slug do Eco).
  slug              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES auth.users(id),
  CONSTRAINT affiliates_recurring_months_check
    CHECK (recurring_months IS NULL OR recurring_months >= 0)
);

COMMENT ON TABLE public.affiliates IS
  'Parceiros do programa de afiliados da Auctus. Usuário EXTERNO: o acesso dele ao painel vem do vínculo user_id, nunca de admin_permissions.';

COMMENT ON COLUMN public.affiliates.first_payment_pct IS
  'Percentual de comissão sobre a PRIMEIRA venda da empresa indicada.';

COMMENT ON COLUMN public.affiliates.recurring_pct IS
  'Percentual de comissão sobre cada pagamento RECORRENTE da empresa indicada.';

COMMENT ON COLUMN public.affiliates.recurring_months IS
  'Duração da recorrência: número de RECORRÊNCIAS (pagamentos) depois da primeira venda em que o afiliado ainda ganha comissão. NÃO é janela de meses de calendário — é contagem de eventos: recurring_months = N significa "primeira venda + as N mensalidades seguintes daquela empresa". NULL = recorrência sem prazo. Comissão estornada (status = voided) NÃO queima cota, então o motor conta apenas as comissões recurring com status <> voided daquele par (afiliado, empresa). Escolha de negócio registrada em docs/planos/2026-10-14-programa-afiliados.md: a janela de calendário zeraria o afiliado em plano anual (a renovação do ano 2 cai fora de 12 meses) e puniria o afiliado por atraso/pausa do cliente.';

COMMENT ON COLUMN public.affiliates.user_id IS
  'Usuário do auth vinculado a este afiliado. É a ÚNICA porta de acesso do afiliado aos próprios dados (ver current_affiliate_id()). Nunca dar admin_permissions a um afiliado.';

-- ---------------------------------------------------------------------------
-- 2. affiliate_payments — repasse pago ao afiliado
-- ---------------------------------------------------------------------------
-- Criada ANTES de affiliate_commissions por causa da FK affiliate_payment_id.
CREATE TABLE IF NOT EXISTS public.affiliate_payments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id         uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  total_amount         numeric NOT NULL,
  reference_month      date,
  payment_method       text,
  paid_at              timestamptz NOT NULL DEFAULT now(),
  -- admin_transaction_id: despesa espelho em admin_financial_transactions.
  -- Deliberadamente SEM FK (igual ao Eco): o lançamento financeiro é criado
  -- pela RPC de repasse na mesma transação, e uma FK aqui criaria dependência
  -- circular de ordem de insert sem ganho real.
  admin_transaction_id uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.affiliate_payments IS
  'Repasses efetivamente pagos ao afiliado. Cada linha agrupa N comissões (affiliate_commissions.affiliate_payment_id) e espelha uma despesa em admin_financial_transactions.';

-- ---------------------------------------------------------------------------
-- 3. affiliate_commissions — extrato de comissões
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id        uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  -- company_id / company_payment_id com ON DELETE SET NULL: apagar empresa ou
  -- estornar pagamento não pode apagar a linha do extrato (histórico de
  -- dinheiro é imutável; o que muda é o status).
  company_id          uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  company_payment_id  uuid REFERENCES public.company_payments(id) ON DELETE SET NULL,
  kind                text NOT NULL CHECK (kind IN ('first','recurring')),
  base_amount         numeric NOT NULL,
  pct_applied         numeric NOT NULL,
  commission_amount   numeric NOT NULL,
  reference_month     date,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','paid','voided')),
  affiliate_payment_id uuid REFERENCES public.affiliate_payments(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.affiliate_commissions IS
  'Extrato de comissões do afiliado. 1 linha por company_payment (trava no índice único affiliate_commissions_payment_uidx). status: pending -> paid (repassado) ou pending -> voided (pagamento estornado). Comissão já paid NUNCA volta atrás — o dinheiro saiu do caixa.';

COMMENT ON COLUMN public.affiliate_commissions.base_amount IS
  'Base de cálculo usada (valor mensal-equivalente do pagamento, não necessariamente o valor da parcela). Congelada no momento do cálculo para auditoria.';

COMMENT ON COLUMN public.affiliate_commissions.pct_applied IS
  'Percentual efetivamente aplicado, congelado. Mudar o % do afiliado não reescreve o passado.';

-- ---------------------------------------------------------------------------
-- 4. Índices
-- ---------------------------------------------------------------------------
-- TRAVA FINANCEIRA PRINCIPAL: no máximo UMA comissão por pagamento de empresa.
-- É o que torna o motor idempotente (ON CONFLICT DO NOTHING) e impede comissão
-- em dobro se a trigger rodar duas vezes ou um replay reprocessar o pagamento.
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_commissions_payment_uidx
  ON public.affiliate_commissions (company_payment_id)
  WHERE company_payment_id IS NOT NULL;

-- Não paga o mesmo mês de referência duas vezes para o mesmo afiliado.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_affiliate_payments_affiliate_month
  ON public.affiliate_payments (affiliate_id, reference_month)
  WHERE reference_month IS NOT NULL;

CREATE INDEX IF NOT EXISTS affiliate_commissions_affiliate_idx
  ON public.affiliate_commissions (affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_commissions_company_idx
  ON public.affiliate_commissions (company_id);
CREATE INDEX IF NOT EXISTS affiliate_commissions_status_idx
  ON public.affiliate_commissions (status);

-- Índice da CONTAGEM DE COTA do recurring_months: o motor pergunta
-- "quantas comissões recurring não-voided já existem para (afiliado, empresa)?"
-- antes de gerar a próxima. Sem este índice a checagem varre o extrato inteiro.
CREATE INDEX IF NOT EXISTS affiliate_commissions_quota_idx
  ON public.affiliate_commissions (affiliate_id, company_id, kind);

CREATE INDEX IF NOT EXISTS affiliate_payments_affiliate_idx
  ON public.affiliate_payments (affiliate_id);

-- ---------------------------------------------------------------------------
-- 5. Vínculo empresa -> afiliado que a indicou
-- ---------------------------------------------------------------------------
-- ON DELETE SET NULL: apagar um afiliado não pode apagar a empresa dele.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS affiliate_id uuid REFERENCES public.affiliates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS companies_affiliate_id_idx
  ON public.companies (affiliate_id);

COMMENT ON COLUMN public.companies.affiliate_id IS
  'Afiliado que indicou esta empresa. Quando preenchido, a venda é do afiliado e NÃO gera comissão de vendedor (guarda no server-side: RPC de pagamento manual + webhook Asaas).';

-- ---------------------------------------------------------------------------
-- 6. Trigger de updated_at
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_affiliates_updated_at ON public.affiliates;
CREATE TRIGGER set_affiliates_updated_at
  BEFORE UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 7. Gate de administração: can_manage_affiliates()
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER porque a função LÊ public.affiliates de dentro da própria
-- avaliação de RLS de public.affiliates. Rodando como owner, a leitura ignora
-- RLS e não há recursão de policy.
CREATE OR REPLACE FUNCTION public.can_manage_affiliates()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_user(auth.uid())
     AND NOT EXISTS (SELECT 1 FROM public.affiliates WHERE user_id = auth.uid());
$$;

COMMENT ON FUNCTION public.can_manage_affiliates() IS
  'Gate de GESTÃO do programa de afiliados: admin do painel master que NÃO é ele mesmo um afiliado. Existe porque is_admin_user() devolve true pra qualquer um com linha em admin_permissions — se um dia alguém der admin_permissions a um afiliado (parceiro externo), este AND NOT EXISTS mantém a lista de afiliados e as comissões dos outros fechadas. O acesso do afiliado aos PRÓPRIOS dados vem de current_affiliate_id(), não daqui.';

REVOKE ALL ON FUNCTION public.can_manage_affiliates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_affiliates() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.affiliates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage affiliates" ON public.affiliates;
CREATE POLICY "Admins manage affiliates" ON public.affiliates
  FOR ALL TO authenticated
  USING (public.can_manage_affiliates())
  WITH CHECK (public.can_manage_affiliates());

DROP POLICY IF EXISTS "Admins manage affiliate_payments" ON public.affiliate_payments;
CREATE POLICY "Admins manage affiliate_payments" ON public.affiliate_payments
  FOR ALL TO authenticated
  USING (public.can_manage_affiliates())
  WITH CHECK (public.can_manage_affiliates());

DROP POLICY IF EXISTS "Admins manage affiliate_commissions" ON public.affiliate_commissions;
CREATE POLICY "Admins manage affiliate_commissions" ON public.affiliate_commissions
  FOR ALL TO authenticated
  USING (public.can_manage_affiliates())
  WITH CHECK (public.can_manage_affiliates());

-- ---------------------------------------------------------------------------
-- 9. ACL de tabela — fecha o default ACL do Supabase
-- ---------------------------------------------------------------------------
-- Toda tabela nova neste projeto nasce com SELECT/INSERT/UPDATE/DELETE pra anon
-- por conta do default ACL (auditoria de 2026-10-01). Hoje a RLS barra porque
-- não existe policy pra anon — ou seja, está a UMA policy mal escrita de virar
-- vazamento. Fechar agora, custo zero.
REVOKE ALL ON TABLE public.affiliates            FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.affiliate_payments    FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.affiliate_commissions FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.affiliates            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.affiliate_payments    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.affiliate_commissions TO authenticated;

GRANT ALL ON TABLE public.affiliates            TO service_role;
GRANT ALL ON TABLE public.affiliate_payments    TO service_role;
GRANT ALL ON TABLE public.affiliate_commissions TO service_role;

-- ---------------------------------------------------------------------------
-- 10. Origem de captação "Afiliado"
-- ---------------------------------------------------------------------------
-- company_origins é a fonte única de companies.origin. Sem esta linha, a empresa
-- que entra por link de afiliado cai em "Outros" e a atribuição se perde.
--
-- show_in_signup = false: não é card que a pessoa escolhe no cadastro — vem do
-- link. utm_key = 'affiliate' seguindo o padrão de 20261004120300: o client
-- manda a CHAVE estável e o banco resolve o nome, então renomear a origem no
-- painel não quebra a atribuição (é o mesmo motivo de "Tráfego Pago" ter chave e
-- não ser card). get_signup_origins() devolve linhas com utm_key NOT NULL, logo
-- o cadastro público consegue resolver 'affiliate' -> nome corrente.
--
-- Idempotente por lower(trim(name)) — e `name` tem UNIQUE constraint
-- (company_origins_name_unique), então um INSERT cego quebraria no replay.
DO $$
DECLARE
  v_inserted int;
BEGIN
  INSERT INTO public.company_origins (name, icon, color, description, show_in_signup, sort_order, utm_key)
  SELECT 'Afiliado', 'Handshake', '#14B8A6',
         'Empresa indicada por um parceiro do programa de afiliados.',
         false, 24, 'affiliate'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_origins WHERE lower(trim(name)) = 'afiliado'
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'company_origins "Afiliado": % linha(s) inserida(s) (0 = já existia)', v_inserted;

  IF NOT EXISTS (SELECT 1 FROM public.company_origins WHERE lower(trim(name)) = 'afiliado') THEN
    RAISE EXCEPTION 'Origem "Afiliado" ausente em company_origins apos o seed — abortando';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK (comentado — reverter só com janela, isto apaga histórico financeiro):
-- BEGIN;
-- DELETE FROM public.company_origins WHERE lower(trim(name)) = 'afiliado';
-- DROP INDEX IF EXISTS public.companies_affiliate_id_idx;
-- ALTER TABLE public.companies DROP COLUMN IF EXISTS affiliate_id;
-- DROP TABLE IF EXISTS public.affiliate_commissions;
-- DROP TABLE IF EXISTS public.affiliate_payments;
-- DROP TABLE IF EXISTS public.affiliates;
-- DROP FUNCTION IF EXISTS public.can_manage_affiliates();
-- COMMIT;
-- ============================================================================
