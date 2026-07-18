-- Migration: seed_company_catalog_i18n
-- Recria seed_company_catalog com suporte a idioma (p_language text DEFAULT 'pt-br').
-- Backward-compat: chamadas de 1 argumento continuam funcionando via DEFAULT 'pt-br'.
-- Idiomas suportados: 'pt-br', 'en', 'es', 'fr'. Qualquer outro cai em pt-br.
-- NÃO altera empresas existentes — só o seed de novas empresas muda.

-- Remove sobrecarga legada de 1 argumento (se existir) antes de recriar com 2.
DROP FUNCTION IF EXISTS public.seed_company_catalog(uuid);

CREATE OR REPLACE FUNCTION public.seed_company_catalog(
  p_company_id uuid,
  p_language   text DEFAULT 'pt-br'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lang text;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'seed_company_catalog: p_company_id não pode ser NULL';
  END IF;

  -- Normaliza idioma; qualquer valor fora do suportado cai em pt-br
  v_lang := CASE
    WHEN lower(p_language) IN ('pt-br', 'en', 'es', 'fr') THEN lower(p_language)
    ELSE 'pt-br'
  END;

  -- ----- service_types (3 tipos padrão) -----
  INSERT INTO public.service_types (company_id, name, color, requires_equipment, is_active)
  SELECT
    p_company_id,
    CASE v_lang
      WHEN 'en' THEN 'Preventive maintenance'
      WHEN 'es' THEN 'Mantenimiento preventivo'
      WHEN 'fr' THEN 'Maintenance préventive'
      ELSE            'Manutenção Preventiva'
    END,
    '#27AE60', true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.service_types
    WHERE company_id = p_company_id
      AND name = CASE v_lang
        WHEN 'en' THEN 'Preventive maintenance'
        WHEN 'es' THEN 'Mantenimiento preventivo'
        WHEN 'fr' THEN 'Maintenance préventive'
        ELSE            'Manutenção Preventiva'
      END
  );

  INSERT INTO public.service_types (company_id, name, color, requires_equipment, is_active)
  SELECT
    p_company_id,
    CASE v_lang
      WHEN 'en' THEN 'Technical visit'
      WHEN 'es' THEN 'Visita técnica'
      WHEN 'fr' THEN 'Visite technique'
      ELSE            'Visita Técnica'
    END,
    '#6C757D', true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.service_types
    WHERE company_id = p_company_id
      AND name = CASE v_lang
        WHEN 'en' THEN 'Technical visit'
        WHEN 'es' THEN 'Visita técnica'
        WHEN 'fr' THEN 'Visite technique'
        ELSE            'Visita Técnica'
      END
  );

  INSERT INTO public.service_types (company_id, name, color, requires_equipment, is_active)
  SELECT
    p_company_id,
    CASE v_lang
      WHEN 'en' THEN 'Sanitization'
      WHEN 'es' THEN 'Higienización'
      WHEN 'fr' THEN 'Assainissement'
      ELSE            'Higienização'
    END,
    '#F1C40F', true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.service_types
    WHERE company_id = p_company_id
      AND name = CASE v_lang
        WHEN 'en' THEN 'Sanitization'
        WHEN 'es' THEN 'Higienización'
        WHEN 'fr' THEN 'Assainissement'
        ELSE            'Higienização'
      END
  );

  -- ----- os_statuses (7 status canônicos, posições preservadas) -----
  INSERT INTO public.os_statuses (company_id, key, label, color, position, is_default)
  SELECT p_company_id, v.key, v.label, v.color, v.position, v.is_default
  FROM (VALUES
    ('agendada',
      CASE v_lang
        WHEN 'en' THEN 'Scheduled'
        WHEN 'es' THEN 'Programada'
        WHEN 'fr' THEN 'Programmée'
        ELSE            'Agendada'
      END,
      '#8b5cf6', 0, true),
    ('pendente',
      CASE v_lang
        WHEN 'en' THEN 'Pending'
        WHEN 'es' THEN 'Pendiente'
        WHEN 'fr' THEN 'En attente'
        ELSE            'Pendente'
      END,
      '#f59e0b', 1, true),
    ('a_caminho',
      CASE v_lang
        WHEN 'en' THEN 'On the way'
        WHEN 'es' THEN 'En camino'
        WHEN 'fr' THEN 'En route'
        ELSE            'A Caminho'
      END,
      '#6366f1', 2, true),
    ('em_andamento',
      CASE v_lang
        WHEN 'en' THEN 'In progress'
        WHEN 'es' THEN 'En progreso'
        WHEN 'fr' THEN 'En cours'
        ELSE            'Em Andamento'
      END,
      '#3b82f6', 3, true),
    ('concluida',
      CASE v_lang
        WHEN 'en' THEN 'Completed'
        WHEN 'es' THEN 'Completada'
        WHEN 'fr' THEN 'Terminée'
        ELSE            'Concluída'
      END,
      '#22c55e', 4, true),
    ('pausada',
      CASE v_lang
        WHEN 'en' THEN 'Paused'
        WHEN 'es' THEN 'En pausa'
        WHEN 'fr' THEN 'En pause'
        ELSE            'Pausada'
      END,
      '#d97706', 5, false),
    ('cancelada',
      CASE v_lang
        WHEN 'en' THEN 'Canceled'
        WHEN 'es' THEN 'Cancelada'
        WHEN 'fr' THEN 'Annulée'
        ELSE            'Cancelada'
      END,
      '#ef4444', 6, true)
  ) AS v(key, label, color, position, is_default)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.os_statuses os
    WHERE os.company_id = p_company_id AND os.key = v.key
  );

  -- ----- task_types (3 tipos genéricos) -----
  INSERT INTO public.task_types (company_id, name, color, description, icon, is_active)
  SELECT
    p_company_id,
    CASE v_lang
      WHEN 'en' THEN 'Callback'
      WHEN 'es' THEN 'Llamada de retorno'
      WHEN 'fr' THEN 'Rappel'
      ELSE            'Ligação de retorno'
    END,
    '#5fecf7',
    CASE v_lang
      WHEN 'en' THEN 'Follow up with the client'
      WHEN 'es' THEN 'Devolver la llamada al cliente'
      WHEN 'fr' THEN 'Rappeler le client'
      ELSE            'Retornar contato com o cliente'
    END,
    'CheckSquare', true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.task_types tt
    WHERE tt.company_id = p_company_id
      AND tt.name = CASE v_lang
        WHEN 'en' THEN 'Callback'
        WHEN 'es' THEN 'Llamada de retorno'
        WHEN 'fr' THEN 'Rappel'
        ELSE            'Ligação de retorno'
      END
  );

  INSERT INTO public.task_types (company_id, name, color, description, icon, is_active)
  SELECT
    p_company_id,
    CASE v_lang
      WHEN 'en' THEN 'Salesperson task'
      WHEN 'es' THEN 'Tarea del vendedor'
      WHEN 'fr' THEN 'Tâche du commercial'
      ELSE            'Tarefa do vendedor'
    END,
    '#5918f2',
    CASE v_lang
      WHEN 'en' THEN 'Call to offer or sell a service to the client'
      WHEN 'es' THEN 'Llamar para ofrecer/vender servicio al cliente'
      WHEN 'fr' THEN 'Appeler pour proposer/vendre un service au client'
      ELSE            'Ligar para oferecer/vender serviço ao cliente'
    END,
    'CheckSquare', true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.task_types tt
    WHERE tt.company_id = p_company_id
      AND tt.name = CASE v_lang
        WHEN 'en' THEN 'Salesperson task'
        WHEN 'es' THEN 'Tarea del vendedor'
        WHEN 'fr' THEN 'Tâche du commercial'
        ELSE            'Tarefa do vendedor'
      END
  );

  INSERT INTO public.task_types (company_id, name, color, description, icon, is_active)
  SELECT
    p_company_id,
    CASE v_lang
      WHEN 'en' THEN 'Collector task'
      WHEN 'es' THEN 'Tarea del cobrador'
      WHEN 'fr' THEN 'Tâche du recouvreur'
      ELSE            'Tarefa do cobrador'
    END,
    '#8b5cf6',
    CASE v_lang
      WHEN 'en' THEN 'Follow up with overdue clients'
      WHEN 'es' THEN 'Hacer seguimiento/cobrar a cliente en mora'
      WHEN 'fr' THEN 'Relancer/recouvrer un client en retard'
      ELSE            'Acompanhar/cobrar cliente em atraso'
    END,
    'CheckSquare', true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.task_types tt
    WHERE tt.company_id = p_company_id
      AND tt.name = CASE v_lang
        WHEN 'en' THEN 'Collector task'
        WHEN 'es' THEN 'Tarea del cobrador'
        WHEN 'fr' THEN 'Tâche du recouvreur'
        ELSE            'Tarefa do cobrador'
      END
  );
END;
$$;

-- Garante permissões (idempotente: REPLACE não remove GRANTs mas garantir explicitamente)
GRANT EXECUTE ON FUNCTION public.seed_company_catalog(uuid, text) TO authenticated, service_role;
