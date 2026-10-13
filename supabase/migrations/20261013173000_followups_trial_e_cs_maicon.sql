-- =============================================================================
-- RÉGUA DE ACOMPANHAMENTO DO TRIAL E DE CUSTOMER SUCCESS
--
--   1. Trial: uma tarefa por dia, durante os primeiros 7 dias, para o Maicon.
--   2. Primeira venda: mantém D+2, D+4, ... D+30, para o Maicon.
--   3. Base com mais de um mês: revisão geral a cada 14 dias, para o Maicon.
--
-- As sete tarefas do trial são materializadas no cadastro, com uma data por dia.
-- A aba Tarefas já oculta vencimentos futuros, então o Maicon vê somente o que
-- está devido; o índice único de automation_key protege retries e concorrência.
-- =============================================================================

-- A conta real do Maicon é resolvida pelo e-mail canônico para não congelar
-- UUID. A permissão admin_crm confirma que ele continua apto a operar a tela.
CREATE OR REPLACE FUNCTION public._cs_checkup_responsavel()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id
    FROM auth.users u
    JOIN public.profiles p ON p.user_id = u.id
   WHERE lower(u.email) = 'maicon@dominex.app'
     AND COALESCE(p.is_active, true)
     AND public.has_admin_permission(u.id, 'admin_crm')
   LIMIT 1;
$$;

COMMENT ON FUNCTION public._cs_checkup_responsavel() IS
  'Resolve a conta administrativa ativa do Maicon usada nas automações de Customer Success.';

REVOKE ALL ON FUNCTION public._cs_checkup_responsavel()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._cs_checkup_responsavel()
  TO service_role;

-- O trial continua sob responsabilidade comercial do Maicon. O e-mail
-- canônico já era usado pela automação anterior e evita confundir o UUID do
-- vendedor com o user_id aceito por admin_tasks.assigned_to.
CREATE OR REPLACE FUNCTION public._trial_followup_responsavel()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public._cs_checkup_responsavel();
$$;

COMMENT ON FUNCTION public._trial_followup_responsavel() IS
  'Resolve a conta administrativa ativa do Maicon usada nos follow-ups diários do trial.';

REVOKE ALL ON FUNCTION public._trial_followup_responsavel()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._trial_followup_responsavel()
  TO service_role;

-- -----------------------------------------------------------------------------
-- 1. Uma tarefa de trial por empresa e por dia (máximo de 7 dias)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cs_criar_followups_trial_diarios(
  p_dry_run boolean DEFAULT false,
  p_company_id uuid DEFAULT NULL,
  p_min_due_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET "TimeZone" TO 'America/Sao_Paulo'
AS $$
DECLARE
  v_responsavel  uuid := public._trial_followup_responsavel();
  v_elegiveis    integer := 0;
  v_criadas      integer := 0;
BEGIN
  IF v_responsavel IS NULL THEN
    RETURN jsonb_build_object(
      'tipo', 'trial_followup_diario',
      'dry_run', p_dry_run,
      'criadas', 0,
      'motivo', 'responsavel_indisponivel'
    );
  END IF;

  SELECT count(*)::integer
    INTO v_elegiveis
    FROM public.companies c
    CROSS JOIN LATERAL generate_series(
      0,
      LEAST(GREATEST(COALESCE(c.trial_days, 7), 1), 7) - 1
    ) AS dia(offset_dias)
   WHERE c.subscription_status = 'testing'
     AND NOT COALESCE(c.is_internal_account, false)
     AND c.created_at IS NOT NULL
     AND c.subscription_expires_at IS NOT NULL
     AND (p_company_id IS NULL OR c.id = p_company_id)
     AND (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date + dia.offset_dias
           < (c.subscription_expires_at AT TIME ZONE 'America/Sao_Paulo')::date
     AND (
       p_min_due_date IS NULL
       OR (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date + dia.offset_dias >= p_min_due_date
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.admin_tasks t
        WHERE t.automation_key = format(
          'trial:daily:%s:%s',
          c.id,
          (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date + dia.offset_dias
        )
     );

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'tipo', 'trial_followup_diario',
      'dry_run', true,
      'criadas', v_elegiveis,
      'company_id', p_company_id
    );
  END IF;

  INSERT INTO public.admin_tasks (
    title,
    description,
    type,
    status,
    priority,
    company_id,
    assigned_to,
    created_by,
    due_date,
    automation_key
  )
  SELECT
    format(
      'Follow-up do teste %s/7 - %s',
      dia.offset_dias + 1,
      COALESCE(c.name, '(sem nome)')
    ),
    format(
      E'Acompanhamento diário do teste grátis (dia %s de 7).\n\n'
      || E'Objetivos deste contato:\n'
      || E'• confirmar se o cliente conseguiu acessar e usar a plataforma;\n'
      || E'• identificar dúvidas ou travas antes que interrompam o teste;\n'
      || E'• orientar o próximo passo de uso;\n'
      || E'• registrar feedback e sinal de interesse comercial.\n\n'
      || E'Tarefa criada automaticamente pela régua de teste grátis.',
      dia.offset_dias + 1
    ),
    'cs_checkup'::public.admin_task_type,
    'novo'::public.admin_task_status,
    'media'::public.admin_task_priority,
    c.id,
    v_responsavel,
    v_responsavel,
    (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date + dia.offset_dias,
    format(
      'trial:daily:%s:%s',
      c.id,
      (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date + dia.offset_dias
    )
  FROM public.companies c
  CROSS JOIN LATERAL generate_series(
    0,
    LEAST(GREATEST(COALESCE(c.trial_days, 7), 1), 7) - 1
  ) AS dia(offset_dias)
  WHERE c.subscription_status = 'testing'
    AND NOT COALESCE(c.is_internal_account, false)
    AND c.created_at IS NOT NULL
    AND c.subscription_expires_at IS NOT NULL
    AND (p_company_id IS NULL OR c.id = p_company_id)
    AND (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date + dia.offset_dias
          < (c.subscription_expires_at AT TIME ZONE 'America/Sao_Paulo')::date
    AND (
      p_min_due_date IS NULL
      OR (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date + dia.offset_dias >= p_min_due_date
    )
  ON CONFLICT (automation_key) WHERE automation_key IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_criadas = ROW_COUNT;

  RETURN jsonb_build_object(
    'tipo', 'trial_followup_diario',
    'dry_run', false,
    'criadas', v_criadas,
    'company_id', p_company_id
  );
END;
$$;

COMMENT ON FUNCTION public.cs_criar_followups_trial_diarios(boolean, uuid, date) IS
  'Materializa uma tarefa por dia nos primeiros 7 dias do trial ativo. Pode limitar por empresa e ignorar vencimentos anteriores em backfill.';

REVOKE ALL ON FUNCTION public.cs_criar_followups_trial_diarios(boolean, uuid, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_criar_followups_trial_diarios(boolean, uuid, date)
  TO service_role;

-- Cada empresa nova em trial materializa somente sua própria série. Reentrada
-- posterior em trial não é tratada como um ciclo novo porque não existe hoje uma
-- âncora trial_started_at; isso evita reaproveitar created_at de empresa antiga.
CREATE OR REPLACE FUNCTION public.create_trial_followups_on_company_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET "TimeZone" TO 'America/Sao_Paulo'
AS $$
BEGIN
  IF NEW.subscription_status = 'testing' THEN
    PERFORM public.cs_criar_followups_trial_diarios(false, NEW.id, NULL);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_trial_followups_on_company_insert()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_companies_create_trial_followup
  ON public.companies;

CREATE TRIGGER trg_companies_create_trial_followup
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.create_trial_followups_on_company_insert();

-- -----------------------------------------------------------------------------
-- 2. Primeiro mês: mantém tarefas abertas e próximos ciclos com o Maicon
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_maicon uuid := public._cs_checkup_responsavel();
BEGIN
  IF v_maicon IS NOT NULL THEN
    UPDATE public.admin_tasks
       SET assigned_to = v_maicon
     WHERE automation_key LIKE 'cs:first-month:%'
       AND status <> 'resolvido'::public.admin_task_status
       AND assigned_to IS DISTINCT FROM v_maicon;

    -- A tarefa geral anterior mantém seu texto/histórico e somente garante que
    -- o responsável correto continue atribuído até a conclusão.
    UPDATE public.admin_tasks
       SET assigned_to = v_maicon
     WHERE automation_key LIKE 'cs:groups:%'
       AND status <> 'resolvido'::public.admin_task_status
       AND assigned_to IS DISTINCT FROM v_maicon;
  ELSE
    RAISE WARNING '[cs_tasks] conta do Maicon indisponível; tarefas abertas mantiveram o responsável atual';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Clientes com mais de um mês: check-up geral a cada 14 dias para o Maicon
-- -----------------------------------------------------------------------------
SELECT cron.unschedule('cs-checkup-semanal')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cs-checkup-semanal');

DROP FUNCTION IF EXISTS public.cs_criar_checkup_semanal(boolean, date);

CREATE OR REPLACE FUNCTION public.cs_criar_checkup_quinzenal(
  p_dry_run boolean DEFAULT false,
  p_dia date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET "TimeZone" TO 'America/Sao_Paulo'
AS $$
DECLARE
  v_dia          date := COALESCE(p_dia, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_ultimo_dia   date;
  v_aberta       boolean;
  v_responsavel  uuid := public._cs_checkup_responsavel();
  v_task_id      uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.companies c
     WHERE c.subscription_status = 'active'
       AND NOT COALESCE(c.is_internal_account, false)
       AND EXISTS (
         SELECT 1
           FROM public.company_payments p
          WHERE p.company_id = c.id
            AND p.type = 'primeira_venda'
            AND COALESCE(p.amount, 0) > 0
          GROUP BY p.company_id
         HAVING min((p.payment_date AT TIME ZONE 'America/Sao_Paulo')::date)
                  <= (v_dia - interval '1 month')::date
       )
  ) THEN
    RETURN jsonb_build_object(
      'tipo', 'cs_checkup_quinzenal',
      'dry_run', p_dry_run,
      'criadas', 0,
      'motivo', 'sem_clientes_com_mais_de_um_mes'
    );
  END IF;

  SELECT
    max(COALESCE(t.due_date, (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date)),
    COALESCE(bool_or(t.status <> 'resolvido'::public.admin_task_status), false)
    INTO v_ultimo_dia, v_aberta
    FROM public.admin_tasks t
   WHERE t.type = 'cs_checkup'::public.admin_task_type
     AND t.automation_key LIKE 'cs:groups:%';

  IF v_aberta THEN
    RETURN jsonb_build_object(
      'tipo', 'cs_checkup_quinzenal',
      'dry_run', p_dry_run,
      'criadas', 0,
      'motivo', 'ja_existe_tarefa_aberta',
      'ultimo_dia', v_ultimo_dia
    );
  END IF;

  IF v_ultimo_dia IS NOT NULL AND v_dia < v_ultimo_dia + 14 THEN
    RETURN jsonb_build_object(
      'tipo', 'cs_checkup_quinzenal',
      'dry_run', p_dry_run,
      'criadas', 0,
      'motivo', 'intervalo_ainda_nao_venceu',
      'proximo_dia', v_ultimo_dia + 14
    );
  END IF;

  IF v_responsavel IS NULL THEN
    RETURN jsonb_build_object(
      'tipo', 'cs_checkup_quinzenal',
      'dry_run', p_dry_run,
      'criadas', 0,
      'motivo', 'responsavel_indisponivel'
    );
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'tipo', 'cs_checkup_quinzenal',
      'dry_run', true,
      'criadas', 1,
      'dia', v_dia
    );
  END IF;

  INSERT INTO public.admin_tasks (
    title,
    description,
    type,
    status,
    priority,
    assigned_to,
    created_by,
    due_date,
    automation_key
  )
  VALUES (
    'Check-up quinzenal - clientes com mais de 1 mês',
    E'Revisar os clientes ativos com mais de um mês desde a primeira venda.\n\n'
      || E'• conferir se cada cliente está utilizando bem a plataforma;\n'
      || E'• observar dúvidas, reclamações, silêncio ou sinais de baixo uso;\n'
      || E'• se colocar à disposição e orientar o próximo passo;\n'
      || E'• abrir uma tarefa individual quando houver risco ou oportunidade.\n\n'
      || E'Tarefa geral criada automaticamente a cada 14 dias. Enquanto ela estiver aberta, outra não será criada.',
    'cs_checkup'::public.admin_task_type,
    'novo'::public.admin_task_status,
    'media'::public.admin_task_priority,
    v_responsavel,
    v_responsavel,
    v_dia,
    format('cs:groups:%s', v_dia)
  )
  ON CONFLICT (automation_key) WHERE automation_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_task_id;

  RETURN jsonb_build_object(
    'tipo', 'cs_checkup_quinzenal',
    'dry_run', false,
    'criadas', CASE WHEN v_task_id IS NULL THEN 0 ELSE 1 END,
    'task_id', v_task_id,
    'dia', v_dia
  );
END;
$$;

COMMENT ON FUNCTION public.cs_criar_checkup_quinzenal(boolean, date) IS
  'Mantém uma tarefa geral de revisão de todos os grupos a cada 14 dias, atribuída ao Maicon. Não duplica enquanto houver uma aberta.';

REVOKE ALL ON FUNCTION public.cs_criar_checkup_quinzenal(boolean, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_criar_checkup_quinzenal(boolean, date)
  TO service_role;

SELECT cron.unschedule('cs-checkup-quinzenal')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cs-checkup-quinzenal');

SELECT cron.schedule(
  'cs-checkup-quinzenal',
  '45 9 * * *',
  $job$ SELECT public.cs_criar_checkup_quinzenal(false); $job$
);

-- Para trials já em andamento, cria somente hoje e os próximos dias restantes;
-- não gera tarefas vencidas retroativas.
SELECT public.cs_criar_followups_trial_diarios(
  false,
  NULL,
  (now() AT TIME ZONE 'America/Sao_Paulo')::date
);
SELECT public.cs_criar_checkup_quinzenal(false);
