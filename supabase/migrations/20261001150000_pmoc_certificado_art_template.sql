-- =============================================================================
-- PMOC — Certificado de Conformidade com TEMPLATE VISUAL (arte vetorial)
-- =============================================================================
-- Plano: docs/planos/2026-10-01-documentos-com-arte.md (§3 e §4)
--
-- Escopo desta migration:
--   Adiciona, nas DUAS tabelas que já guardam o conteúdo dos documentos PMOC,
--   as colunas que permitem escolher um template visual (arte) pro Certificado
--   de Conformidade, em vez do PDF A4 retrato preto-e-branco só texto de hoje:
--     - company_pmoc_document_templates (padrão da empresa, PK = company_id)
--     - pmoc_contract_documents_custom   (override por contrato, PK = contract_id)
--
--   certificado_art_slug   -> qual template visual (ex: 'clean', 'aurora').
--   certificado_art_config -> tema + overrides de slot (cores, logo, selo,
--                             assinatura, rodapé, HTML por slot com
--                             data-pmoc-var).
--
--   AMBAS nullable, SEM default. NULL = comportamento legado preservado
--   (PDF sai no formato texto puro de hoje, via certificado_content). Zero
--   retroação: nenhum contrato/empresa existente muda de layout sozinho.
--
--   NÃO cria policy nova, NÃO toca RLS: as duas tabelas já têm policy por
--   company_id (SELECT tenant / INSERT-UPDATE admin-gestor / DELETE
--   super_admin) e as colunas novas herdam as policies existentes por serem
--   colunas da mesma linha.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS em tudo.
-- =============================================================================

BEGIN;

-- ---- company_pmoc_document_templates (padrão da empresa) -------------------
ALTER TABLE public.company_pmoc_document_templates
  ADD COLUMN IF NOT EXISTS certificado_art_slug   text,
  ADD COLUMN IF NOT EXISTS certificado_art_config jsonb;

COMMENT ON COLUMN public.company_pmoc_document_templates.certificado_art_slug IS
  'Slug do template visual (arte) do Certificado de Conformidade padrão da '
  'empresa (ex: clean, vanguarda, aurora, prisma). NULL = mantém o layout '
  'texto legado (A4 retrato, preto e branco, via certificado_content).';

COMMENT ON COLUMN public.company_pmoc_document_templates.certificado_art_config IS
  'Config do template visual do Certificado padrão da empresa: orientation, '
  'primary_color, accent_color, bg_color, logo_url, show_seal, '
  'show_signature, show_footer, slots (HTML por slot com data-pmoc-var). '
  'NULL = mantém o layout texto legado.';

-- ---- pmoc_contract_documents_custom (override por contrato) ----------------
ALTER TABLE public.pmoc_contract_documents_custom
  ADD COLUMN IF NOT EXISTS certificado_art_slug   text,
  ADD COLUMN IF NOT EXISTS certificado_art_config jsonb;

COMMENT ON COLUMN public.pmoc_contract_documents_custom.certificado_art_slug IS
  'Slug do template visual (arte) do Certificado de Conformidade deste '
  'contrato, sobrepondo o padrão da empresa (ex: clean, vanguarda, aurora, '
  'prisma). NULL = mantém o layout texto legado (via certificado_content) ou '
  'herda o padrão da empresa, conforme a regra de resolução existente.';

COMMENT ON COLUMN public.pmoc_contract_documents_custom.certificado_art_config IS
  'Config do template visual do Certificado deste contrato: orientation, '
  'primary_color, accent_color, bg_color, logo_url, show_seal, '
  'show_signature, show_footer, slots (HTML por slot com data-pmoc-var). '
  'NULL = mantém o layout texto legado.';

COMMIT;
