-- =========================================================================
-- Ponto Eletrônico — colunas de auditoria pra EDITAR horário e EXCLUIR
-- (soft delete via is_valid=false) batida de ponto na listagem.
--
-- Batida de ponto é prova trabalhista: a exclusão NUNCA apaga a linha
-- (foto/GPS têm que sobreviver). `recompute_time_sheet` já filtra
-- `is_valid = true` — não precisa de mudança nenhuma.
--
-- Todas nullable, sem DEFAULT (evita rewrite da tabela). Idempotente.
-- =========================================================================

ALTER TABLE public.time_records
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by uuid,
  ADD COLUMN IF NOT EXISTS original_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS invalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS invalidated_by uuid;

COMMENT ON COLUMN public.time_records.edited_at IS
  'Quando o gestor editou o horário (recorded_at) da batida pela última vez. NULL = nunca editada.';

COMMENT ON COLUMN public.time_records.edited_by IS
  'auth.uid() do gestor que editou o horário da batida pela última vez.';

COMMENT ON COLUMN public.time_records.original_recorded_at IS
  'Snapshot de recorded_at carimbado na PRIMEIRA edição (preserva o valor original pra auditoria/tooltip "era 12:09"). Front usa COALESCE(original_recorded_at, recorded_at) pra exibir o valor pré-edição.';

COMMENT ON COLUMN public.time_records.invalidated_at IS
  'Quando o gestor removeu a batida da listagem (soft delete). A linha permanece pra auditoria trabalhista; is_valid=false já a exclui do espelho de ponto e de recompute_time_sheet.';

COMMENT ON COLUMN public.time_records.invalidated_by IS
  'auth.uid() do gestor que marcou a batida como inválida (is_valid=false).';
