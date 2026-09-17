-- Por quê: hoje TODO customer Asaas da assinatura SaaS Auctus é criado com
-- notificationDisabled = true, ou seja, o Asaas nunca envia e-mail de cobrança.
-- Precisamos abrir exceção por empresa (pedido do cliente Alô Gás Juquitiba):
-- receber a cobrança mensal no e-mail do financeiro e pagar pelo link da fatura
-- (boleto/PIX/cartão). Estas duas colunas são o opt-in POR EMPRESA que as edge
-- functions do Asaas passam a ler ao criar/atualizar o customer e a cobrança.
--
-- INVARIANTE: o default de billing_notifications_enabled é false. Nenhuma empresa
-- da base pode começar a receber e-mail do Asaas por causa desta migration.
-- Nenhum backfill é feito aqui de propósito — a ativação é manual, empresa a empresa.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_notifications_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.billing_email IS
  'E-mail adicional que recebe a cobrança da assinatura (enviado ao Asaas como additionalEmails). NULL = só o email da empresa.';

COMMENT ON COLUMN public.companies.billing_notifications_enabled IS
  'Quando true, o customer Asaas desta empresa fica com notificações LIGADAS (notificationDisabled=false) e o Asaas envia a cobrança por e-mail. Default false = comportamento histórico (nenhum e-mail).';
