-- ============================================================
-- i18n do CATÁLOGO GLOBAL de equipamentos (Área do Técnico)
-- ------------------------------------------------------------
-- POR QUÊ: o catálogo de referência (categorias, modelos e códigos de erro)
-- guarda o texto SÓ em pt-br nas colunas base (name/title/description/...).
-- Quando o técnico troca o idioma do app (en/es/fr), esse conteúdo não traduz.
-- Adicionamos uma coluna `i18n jsonb` em cada tabela para carregar as traduções.
--
-- CONTRATO DE LEITURA (frontend): valor exibido = i18n[locale][campo] ?? campo_base.
--   - pt-br é SEMPRE a coluna base e NUNCA entra no JSONB.
--   - chaves de idioma no JSONB: 'en', 'es', 'fr'.
--   - chave/tradução ausente => cai no pt-br (fallback).
--
-- SHAPE por tabela:
--   equipment_model_categories.i18n : {"en":{"name":"..."},"es":{...},"fr":{...}}
--   equipment_models.i18n           : {"en":{"name":"..."},"es":{...},"fr":{...}}
--   equipment_error_codes.i18n      : {"en":{"title":"...","description":"...",
--                                            "diagnosis":"...","solution":"...",
--                                            "component":"..."},"es":{...},"fr":{...}}
--
-- Catálogo é GLOBAL (sem company_id). RLS já existente (view=authenticated,
-- write=super_admin) cobre a coluna nova automaticamente. Idempotente.
-- ============================================================

ALTER TABLE public.equipment_model_categories
  ADD COLUMN IF NOT EXISTS i18n JSONB;

ALTER TABLE public.equipment_models
  ADD COLUMN IF NOT EXISTS i18n JSONB;

ALTER TABLE public.equipment_error_codes
  ADD COLUMN IF NOT EXISTS i18n JSONB;

COMMENT ON COLUMN public.equipment_model_categories.i18n IS
  'Traduções do catálogo. {"en":{"name":...},"es":{...},"fr":{...}}. pt-br fica na coluna base. Leitura: i18n[locale][campo] ?? campo_base.';
COMMENT ON COLUMN public.equipment_models.i18n IS
  'Traduções do catálogo. {"en":{"name":...},"es":{...},"fr":{...}}. pt-br fica na coluna base. Leitura: i18n[locale][campo] ?? campo_base.';
COMMENT ON COLUMN public.equipment_error_codes.i18n IS
  'Traduções do catálogo. {"en":{title,description,diagnosis,solution,component},"es":{...},"fr":{...}}. pt-br fica nas colunas base. Leitura: i18n[locale][campo] ?? campo_base.';
