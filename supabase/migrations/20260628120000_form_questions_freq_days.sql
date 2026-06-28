-- Fatia B2 — Contratos agnósticos / Fase B (continuação)
-- Frequência "Personalizada" em DIAS por PERGUNTA de checklist.
--
-- Por quê: a migração 20260627140000 só permitia intervalo de tempo em MESES (freq_months).
-- Agora o usuário pode definir cadência fina em dias (ex.: "a cada 17 dias"), útil para
-- contratos com periodicidade que não cai em mês cheio.
--
-- Semântica: quando freq_kind = 'time', o intervalo pode ser em freq_months OU em freq_days.
-- Se ambos vierem preenchidos, DIAS ganha (alinhado ao motor visitScheduleEngine.ts).
--
-- Retrocompatível: coluna NULLABLE. NULL = sem intervalo em dias (cai no freq_months/padrão).
-- Nenhum dado existente muda.
--
-- RLS: form_questions já tem RLS (SELECT + ALL) escopada por template_id -> form_templates.company_id.
-- A coluna nova herda essas policies; NENHUMA policy nova é necessária.

ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS freq_days integer;

-- Valor positivo quando preenchido (NULL continua válido) — espelha os CHECKs _positive da migração anterior.
ALTER TABLE public.form_questions DROP CONSTRAINT IF EXISTS form_questions_freq_days_positive;
ALTER TABLE public.form_questions
  ADD CONSTRAINT form_questions_freq_days_positive
  CHECK (freq_days IS NULL OR freq_days > 0);

COMMENT ON COLUMN public.form_questions.freq_days IS 'Intervalo em dias quando freq_kind = time (frequência Personalizada). Tem precedência sobre freq_months se ambos preenchidos.';
