-- Preferência pessoal da Agenda: Tudo / Ordens de serviço / Tarefas.
-- Array vazio representa Tudo. A escolha segue o usuário entre aparelhos e é
-- protegida pelas policies own-row já existentes em public.user_preferences.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS schedule_entry_type_filter text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_schedule_entry_type_filter_check;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_schedule_entry_type_filter_check
  CHECK (
    schedule_entry_type_filter <@ ARRAY['os', 'tarefa']::text[]
    AND cardinality(schedule_entry_type_filter) <= 1
  );

COMMENT ON COLUMN public.user_preferences.schedule_entry_type_filter IS
  'Filtro pessoal da Agenda. Vazio = tudo; aceita somente um valor: os ou tarefa.';
