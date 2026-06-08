-- Tarefa — Atribuição de SDR na empresa (modelo SDR/Closer).
--
-- Por quê: a empresa hoje guarda apenas o CLOSER em companies.salesperson_id.
-- No modelo SDR/Closer (migration 20260608120000_salespeople_sdr_closer_model),
-- a comissão da venda pode ser dividida entre quem AGENDOU (SDR) e quem FECHOU
-- (closer). Para que a conversão do trial divida a comissão automaticamente,
-- a empresa precisa registrar também o SDR responsável pelo agendamento.
--
-- companies.salesperson_id permanece sendo o CLOSER. companies.sdr_id é o
-- "Quem agendou (SDR)" — opcional/nullable. Sem policy nova: a coluna herda a
-- RLS já existente da tabela companies.

-- 1) Coluna sdr_id (opcional). Espelha o comportamento de salesperson_id:
--    FK para salespeople(id) com ON DELETE SET NULL para não estourar a venda
--    caso o SDR seja removido do cadastro.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS sdr_id uuid REFERENCES public.salespeople(id) ON DELETE SET NULL;

-- 2) Índice parcial — só linhas com SDR atribuído entram no índice.
CREATE INDEX IF NOT EXISTS idx_companies_sdr
  ON public.companies(sdr_id)
  WHERE sdr_id IS NOT NULL;
