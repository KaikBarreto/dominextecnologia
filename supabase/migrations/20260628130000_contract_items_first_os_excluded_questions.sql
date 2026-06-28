-- Fatia B3 — Contratos agnósticos / Fase B (continuação)
-- Exclusões POR EQUIPAMENTO de quais PERGUNTAS de checklist NÃO entram na PRIMEIRA OS do contrato.
--
-- Por quê: na UI o usuário marca, por item do contrato, o flag "Adicionar na primeira OS?".
-- O padrão é ENTRAR (toda pergunta do checklist do item vai pra 1ª OS). Para o default ser
-- barato e não exigir backfill, guardamos APENAS as EXCLUSÕES: um array de IDs de form_questions
-- (uuid em texto) que, para AQUELE item, NÃO entram na primeira OS.
--
-- Semântica:
--   []                -> todas as perguntas do checklist do item entram na 1ª OS (padrão).
--   ["<uuid>", ...]   -> essas perguntas específicas NÃO entram na 1ª OS daquele item.
--
-- Tipo escolhido: jsonb (array de string). Flexível, NOT NULL com default vazio, sem backfill.
--
-- Retrocompatível: coluna NOT NULL DEFAULT '[]'. Nenhum dado existente muda (DDL aditiva).
--
-- RLS: contract_items já tem RLS escopada por company. A coluna nova herda essas policies;
-- NENHUMA policy nova é necessária.

ALTER TABLE public.contract_items
  ADD COLUMN IF NOT EXISTS first_os_excluded_questions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.contract_items.first_os_excluded_questions IS
  'Lista de EXCLUSOES: IDs (uuid em texto) de form_questions que NAO entram na primeira OS do contrato para ESTE item. Vazio ([]) = todas as perguntas do checklist do item entram na 1a OS (padrao). Semantica de exclusao para tornar o default barato (sem backfill).';
