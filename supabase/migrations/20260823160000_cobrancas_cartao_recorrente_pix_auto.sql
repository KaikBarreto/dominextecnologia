-- =====================================================================
-- Motor de Cobranças — ONDA B (schema DORMENTE): cartão recorrente + Pix Automático
-- =====================================================================
-- CONTEXTO: evolução do módulo Cobranças (recebimento do cliente final via
-- Asaas, modelo BYO — o TENANT usa a conta Asaas dele). Esta camada PREPARA o
-- banco para dois meios de recorrência que o Asaas ainda vai habilitar em
-- produção na conta de cada tenant:
--   (A) CARTÃO RECORRENTE (assinatura no cartão tokenizado);
--   (B) PIX AUTOMÁTICO (débito recorrente autorizado pelo pagador).
--
-- A feature nasce DORMENTE: ligada por tenant só depois que o Asaas habilitar
-- o recurso na conta daquele tenant. As flags default DESLIGADAS garantem que
-- nenhum tenant começa a oferecer cartão recorrente / Pix Auto sem o
-- super_admin da Dominex virar a chave.
--
-- SEGURANÇA DE DADOS DE CARTÃO (invariante): o número real do cartão (PAN),
-- CVV e validade NUNCA são gravados neste banco. Guardamos apenas:
--   - a REFERÊNCIA ao token no Vault (credit_card_token_name — já criada na
--     Onda A 20260822130000);
--   - dados de EXIBIÇÃO não sensíveis: últimos 4 dígitos (last4) e bandeira.
-- A tokenização do cartão acontece no Asaas; o banco nunca vê o PAN/CVV.
--
-- RECONCILIAÇÃO COM A ONDA A (20260822130000_tenant_subscriptions_e_juros_multa):
--   - credit_card_token_name    → JÁ EXISTE (nome do secret do Vault com o
--       token do cartão). É a coluna canônica; NÃO criamos um segundo
--       credit_card_token_ref pra não duplicar semântica.
--   - pix_auto_authorization_id → JÁ EXISTE (id de autorização do Pix Auto).
--   Esta migration adiciona apenas o que falta: flags de habilitação na conta
--   e as colunas de EXIBIÇÃO do cartão + status do consentimento Pix Auto.
--
-- RLS: não mexemos. As policies de tenant_subscriptions e
-- tenant_payment_accounts já filtram por company; colunas novas herdam o
-- escopo (RLS é por linha, não por coluna). Nenhuma policy nova é necessária.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS em tudo.
-- =====================================================================


-- =====================================================================
-- 1) FLAGS DE HABILITAÇÃO por tenant (default DESLIGADO — feature dormente)
-- =====================================================================
-- Só o super_admin da Dominex liga, DEPOIS que o Asaas habilitar o recurso em
-- produção na conta Asaas do tenant. Enquanto false, a UI não oferece o meio e
-- as edges não criam assinatura no cartão / Pix Auto.
-- =====================================================================
ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS card_recurring_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS pix_auto_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenant_payment_accounts.card_recurring_enabled IS
  'Habilita CARTÃO RECORRENTE (assinatura no cartão tokenizado) para este tenant. Default false. Só o super_admin da Dominex liga, DEPOIS que o Asaas habilitar cartão recorrente em produção na conta Asaas do tenant. Feature nasce dormente.';
COMMENT ON COLUMN public.tenant_payment_accounts.pix_auto_enabled IS
  'Habilita PIX AUTOMÁTICO (débito recorrente autorizado pelo pagador) para este tenant. Default false. Só o super_admin da Dominex liga, DEPOIS que o Asaas habilitar Pix Automático em produção na conta Asaas do tenant. Feature nasce dormente.';


-- =====================================================================
-- 2) Colunas de EXIBIÇÃO / consentimento em tenant_subscriptions
-- =====================================================================
-- Todas NULLABLE: assinaturas em BOLETO/PIX não usam nenhuma delas.
-- credit_card_token_name e pix_auto_authorization_id JÁ existem (Onda A).
--
-- INVARIANTE DE SEGURANÇA: cartão real (PAN/CVV/validade) NUNCA vai pro banco.
-- last4 e brand são apenas para EXIBIR "MASTERCARD •••• 4242" na UI — não são
-- dados sensíveis e não permitem reconstruir o cartão.
-- =====================================================================
ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS credit_card_last4 text;

ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS credit_card_brand text;

ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS pix_auto_status text
    CHECK (pix_auto_status IN ('pending','authorized','cancelled','expired'));

COMMENT ON COLUMN public.tenant_subscriptions.credit_card_last4 IS
  'Últimos 4 dígitos do cartão, SÓ PARA EXIBIÇÃO (ex: "4242"). NÃO é dado sensível. O cartão real (PAN/CVV) nunca é gravado — só o token no Vault (credit_card_token_name).';
COMMENT ON COLUMN public.tenant_subscriptions.credit_card_brand IS
  'Bandeira do cartão, SÓ PARA EXIBIÇÃO (VISA, MASTERCARD, ELO, ...). NÃO é dado sensível.';
COMMENT ON COLUMN public.tenant_subscriptions.pix_auto_status IS
  'Status do consentimento de Pix Automático: pending (aguardando autorização do pagador), authorized (débito recorrente ativo), cancelled (cancelado), expired (autorização expirada). NULL enquanto a assinatura não usa Pix Auto.';
