
ALTER TABLE public.employees ADD COLUMN user_id uuid;

ALTER TABLE public.form_questions ADD COLUMN answer_mode text DEFAULT 'exclusive';
