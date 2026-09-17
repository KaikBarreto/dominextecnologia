-- ============================================================================
-- Vincular fornecedor a lançamento financeiro (financial_transactions)
-- ============================================================================
--
-- CONTEXTO:
--   Pedido do sócio: "ao gerar receita/despesa poder vincular a um cliente
--   (igual na ecosistema) pra ficar no histórico também, ou um fornecedor
--   também". A parte de cliente já existe (customer_id, desde a criação
--   original da tabela). Esta migration entrega a parte de fornecedor.
--
--   `public.suppliers` já existe (criada em 20260619150000, usada hoje por
--   Compras e por entradas de estoque em inventory_movements.supplier_id).
--   Não há necessidade de criar tabela nova — só a coluna + FK em
--   financial_transactions.
--
-- ON DELETE SET NULL (não RESTRICT, não CASCADE):
--   financial_transactions já documentou esse invariante explicitamente em
--   20260904190000: TODAS as FKs da tabela são SET NULL (account_id,
--   bill_id, customer_id, service_order_id, employee_id, contract_id, ...).
--   O motivo lá é o mesmo que vale aqui: excluir a entidade referenciada
--   (fornecedor, cliente, conta, contrato) NUNCA pode apagar ou destravar
--   silenciosamente um lançamento financeiro por CASCADE por fora da
--   política de DELETE de financial_transactions (can_delete_finance). A
--   linha do dinheiro sobrevive sempre; só perde o vínculo.
--
--   Avaliei impedir (RESTRICT) a exclusão de fornecedor com lançamento
--   vinculado — mas isso quebraria a consistência com customer_id, que já
--   aceita perder o vínculo (SET NULL) no mesmo cenário, e criaria uma regra
--   assimétrica sem pedido explícito pra isso. Fica SET NULL, igual ao
--   restante da tabela. Precedentes fora desta tabela confirmam que "SET
--   NULL pra registro histórico" é o padrão do repo pra supplier_id:
--   inventory_movements.supplier_id e nfe_imports_log.supplier_id também são
--   SET NULL (só material_purchase_quotes/material_purchase_orders usam
--   CASCADE, porque lá o pedido de compra é artefato do próprio fornecedor,
--   não um registro contábil independente).
--
-- MEDIÇÃO EM PRODUÇÃO (só leitura, antes de escrever isto):
--   3 fornecedores cadastrados, em 2 empresas. Nenhum nome duplicado entre
--   empresas. Nenhum "fornecedor fantasma" guardado como texto solto em
--   financial_transactions.description/notes (1 falso-positivo: categoria
--   "Fornecedores e Insumos" é nome de categoria financeira, não fornecedor).
--   Volume trivial — sem risco de migration.
-- ============================================================================

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS supplier_id uuid;

COMMENT ON COLUMN public.financial_transactions.supplier_id IS
  'Fornecedor vinculado ao lançamento (histórico), nullable. SET NULL ao excluir o fornecedor — mesmo invariante das demais FKs desta tabela (ver 20260904190000).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financial_transactions_supplier_id_fkey'
  ) THEN
    ALTER TABLE public.financial_transactions
      ADD CONSTRAINT financial_transactions_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ON DELETE SET NULL faz UPDATE nas filhas ao apagar o pai (mesmo raciocínio
-- de 20260904190000 pra contract_id): sem índice, excluir um fornecedor com
-- muitos lançamentos vira varredura da tabela inteira. Também serve pra
-- filtrar/relatar lançamentos por fornecedor, que é o próprio motivo do
-- pedido (ficar no histórico do fornecedor).
CREATE INDEX IF NOT EXISTS idx_financial_transactions_supplier_id
  ON public.financial_transactions (supplier_id);

-- RLS: nenhuma política nova. financial_transactions e suppliers já são
-- RLS por linha (company_id = get_user_company_id(auth.uid()) OU
-- is_super_admin), cada uma independente. Isso já cobre a coluna nova (RLS
-- é por linha, não por coluna) e também fecha o vazamento por junção: mesmo
-- que supplier_id aponte pra uma linha de outra empresa (não deveria
-- acontecer — a aplicação só oferece fornecedores da própria empresa no
-- select —, mas nada no schema impede o valor por enquanto, exatamente como
-- já acontece hoje com customer_id), um SELECT com JOIN em suppliers só
-- devolve o fornecedor se a RLS de suppliers também aprovar a linha. Se o
-- supplier_id for de outra empresa, o JOIN simplesmente não traz nada — não
-- há como o lançamento de uma empresa exibir fornecedor de outra.
--
-- Gap pré-existente (não introduzido aqui, já vale hoje pra customer_id):
-- não há trigger validando que suppliers.company_id = financial_transactions
-- .company_id no INSERT/UPDATE. Fica registrado, fora do escopo deste
-- pedido.
