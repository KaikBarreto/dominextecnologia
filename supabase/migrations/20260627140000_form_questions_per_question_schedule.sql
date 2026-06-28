-- Fatia B2 — Contratos agnósticos / Fase B
-- Programação (frequência) OPCIONAL por PERGUNTA de checklist.
--
-- Por quê: hoje toda pergunta de um template aparece em TODA visita/OS. Para contratos
-- agnósticos (PMOC e além), cada pergunta precisa poder ter a sua própria cadência —
-- ex.: "a cada 6 meses", "a cada 3 visitas", "a partir da visita 2".
-- O motor puro src/components/contracts/visitScheduleEngine.ts já consome esses campos;
-- aqui só persistimos por pergunta.
--
-- Retrocompatível: todas as colunas são NULLABLE. NULL = comportamento de hoje
-- ("Toda visita" — a pergunta aparece em toda OS/visita). Nenhum dado existente muda.
--
-- RLS: form_questions já tem RLS (SELECT + ALL) escopada por template_id -> form_templates.company_id.
-- Colunas novas herdam essas policies; NENHUMA policy nova é necessária.

-- Frequência: 'time' (intervalo em meses) ou 'visits' (a cada N visitas). NULL = padrão (toda visita).
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS freq_kind text;
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS freq_months integer;
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS freq_visits integer;

-- Início: 'contract_start' (desde o começo do contrato), 'due_now' (vence já),
-- 'visit_n' (a partir da N-ésima visita). NULL = padrão.
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS start_kind text;
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS start_visit integer;

-- CHECK constraints brandos (permitem NULL). Idempotentes via DROP IF EXISTS antes.
ALTER TABLE public.form_questions DROP CONSTRAINT IF EXISTS form_questions_freq_kind_check;
ALTER TABLE public.form_questions
  ADD CONSTRAINT form_questions_freq_kind_check
  CHECK (freq_kind IS NULL OR freq_kind IN ('time', 'visits'));

ALTER TABLE public.form_questions DROP CONSTRAINT IF EXISTS form_questions_start_kind_check;
ALTER TABLE public.form_questions
  ADD CONSTRAINT form_questions_start_kind_check
  CHECK (start_kind IS NULL OR start_kind IN ('contract_start', 'due_now', 'visit_n'));

-- Valores positivos quando preenchidos (NULL continua válido).
ALTER TABLE public.form_questions DROP CONSTRAINT IF EXISTS form_questions_freq_months_positive;
ALTER TABLE public.form_questions
  ADD CONSTRAINT form_questions_freq_months_positive
  CHECK (freq_months IS NULL OR freq_months > 0);

ALTER TABLE public.form_questions DROP CONSTRAINT IF EXISTS form_questions_freq_visits_positive;
ALTER TABLE public.form_questions
  ADD CONSTRAINT form_questions_freq_visits_positive
  CHECK (freq_visits IS NULL OR freq_visits > 0);

ALTER TABLE public.form_questions DROP CONSTRAINT IF EXISTS form_questions_start_visit_positive;
ALTER TABLE public.form_questions
  ADD CONSTRAINT form_questions_start_visit_positive
  CHECK (start_visit IS NULL OR start_visit > 0);

COMMENT ON COLUMN public.form_questions.freq_kind IS 'Tipo de frequência da pergunta: time (meses) | visits (a cada N visitas). NULL = toda visita.';
COMMENT ON COLUMN public.form_questions.freq_months IS 'Intervalo em meses quando freq_kind = time (1,3,6,12 ou custom).';
COMMENT ON COLUMN public.form_questions.freq_visits IS 'A cada N visitas quando freq_kind = visits.';
COMMENT ON COLUMN public.form_questions.start_kind IS 'Início da pergunta: contract_start | due_now | visit_n. NULL = padrão.';
COMMENT ON COLUMN public.form_questions.start_visit IS 'Número da visita (1-based) quando start_kind = visit_n.';
