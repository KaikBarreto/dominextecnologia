-- Tipo específico dos acompanhamentos automáticos de Customer Success.
-- Separado da migration que usa o valor porque o PostgreSQL só permite usar
-- um valor novo de enum depois do commit que o adicionou.
ALTER TYPE public.admin_task_type ADD VALUE IF NOT EXISTS 'cs_checkup';
