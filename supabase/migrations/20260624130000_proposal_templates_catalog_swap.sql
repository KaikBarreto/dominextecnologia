-- Troca do catálogo GLOBAL de proposal_templates (tabela sem company_id).
-- Decisão CEO 2026-06-24: manter só `vanguarda` + 2 novos (`aurora`, `prisma`)
-- e remover os 3 antigos (`classico`, `moderno`, `minimalista`).
--
-- quotes.proposal_template_id é FK -> proposal_templates(id). Antes de deletar
-- precisamos repontar todas as quotes que apontam pros templates que vão sumir
-- OU que estão ÓRFÃS (apontando pra um id inexistente — 2 quotes em prod nesse
-- estado, travando UPDATE com foreign_key_violation). Repontamos pro vanguarda
-- pra manter uma proposta válida (evita NULL). Só mexe em proposal_template_id;
-- nenhuma quote é apagada ou alterada em outro campo.

-- 1) Inserir os 2 novos templates (idempotente).
INSERT INTO public.proposal_templates (name, slug, description, preview_color)
VALUES
  ('Aurora', 'aurora', 'Capa moderna em A4 com fundo de barras de cor (roxo/rosa) e seções premium — link compartilhável.', '#a21caf'),
  ('Prisma', 'prisma', 'Capa minimalista preto & branco com arte 3D, em A4 multipágina — link compartilhável.', '#0f0f10')
ON CONFLICT (slug) DO NOTHING;

-- 2) Repontar quotes que apontam pros templates a remover OU órfãs -> vanguarda.
--    (b98d49cf... = id fixo do vanguarda em prod)
UPDATE public.quotes
SET proposal_template_id = 'b98d49cf-0834-4269-a9b7-40673a7f24e6'
WHERE proposal_template_id IN (
        SELECT id FROM public.proposal_templates WHERE slug IN ('classico', 'moderno', 'minimalista')
      )
   OR proposal_template_id NOT IN (SELECT id FROM public.proposal_templates);

-- 3) Deletar os 3 templates antigos (já sem quotes apontando).
DELETE FROM public.proposal_templates
WHERE slug IN ('classico', 'moderno', 'minimalista');
