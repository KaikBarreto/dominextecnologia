-- Excluir contrato NAO pode apagar lancamento financeiro.
--
-- Contexto: a FK financial_transactions.contract_id estava com ON DELETE CASCADE.
-- Isso criava dois defeitos:
--
-- 1) PORTA DOS FUNDOS NA TRAVA DE DELETE. As migrations 20260904150000 e
--    20260904170000 fecharam o DELETE de financial_transactions atras de
--    can_delete_finance(). Cascade de FK NAO passa por RLS da tabela filha,
--    entao excluir um contrato apagava lancamentos sem passar pela policy.
--    A policy de contracts so checa tenant (apesar do nome), ou seja: qualquer
--    autenticado do tenant conseguia detonar o financeiro por essa via.
--
-- 2) APAGAVA DINHEIRO JA RECEBIDO. Medido em producao: dos 307 lancamentos
--    ligados a contrato, 288 eram parcelas futuras nao pagas e 19 ja tinham
--    sido recebidos. O cascade levava os 19 junto, e o extrato mudava para tras.
--
-- O app (src/hooks/useContracts.ts) ja faz a coisa certa ao excluir contrato:
-- desvincula (contract_id = NULL) os recebimentos ja realizados e apaga apenas
-- as cobrancas nao realizadas. O cascade atropelava essa logica em silencio.
--
-- Com SET NULL o comportamento passa a ser:
--   - parcela futura continua sumindo, porque o app a apaga explicitamente;
--   - recebimento realizado sobrevive desvinculado, como o app promete;
--   - nenhum DELETE de financial_transactions ocorre sem passar pela policy.
--
-- Observacao: todas as outras FKs de financial_transactions ja eram SET NULL
-- (account_id, bill_id, customer_id, service_order_id, employee_id, ...).
-- O CASCADE em contract_id era a unica excecao. Ate service_orders.contract_id
-- e NO ACTION, ou seja, a OS ja era mais protegida que o dinheiro.

ALTER TABLE public.financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_contract_id_fkey;

ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_contract_id_fkey
  FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;

-- ON DELETE SET NULL faz UPDATE nas filhas ao apagar o pai. Sem indice em
-- contract_id isso vira varredura da tabela inteira a cada exclusao de contrato.
CREATE INDEX IF NOT EXISTS idx_financial_transactions_contract_id
  ON public.financial_transactions (contract_id);
