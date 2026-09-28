-- =============================================================================
-- CHECK-UPS AUTOMÁTICOS DE CUSTOMER SUCCESS
--   1. Primeira venda: 15 tarefas para o Maicon, em D+2, D+4, ... D+30.
--   2. Rotina geral: uma tarefa para revisar todos os grupos a cada 7 dias.
-- =============================================================================
--
-- Sem backfill da cadência individual. Em 28/09/2026 havia duas primeiras
-- vendas nos 30 dias anteriores; criar 30 tarefas retroativas misturaria
-- acompanhamento novo com uma agenda que já começou fora do sistema.

ALTER TABLE public.admin_tasks
  ADD COLUMN IF NOT EXISTS company_id uuid
    REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS automation_key text;

COMMENT ON COLUMN public.admin_tasks.company_id IS
  'Empresa vinculada à tarefa do painel master. NULL em tarefas sem empresa específica.';

COMMENT ON COLUMN public.admin_tasks.automation_key IS
  'Chave estável de automação. NULL em tarefa manual; valor não nulo é único e impede duplicação sob retry.';

CREATE INDEX IF NOT EXISTS idx_admin_tasks_company_id
  ON public.admin_tasks (company_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_tasks_automation_key
  ON public.admin_tasks (automation_key)
  WHERE automation_key IS NOT NULL;

-- A conta real do Maicon é resolvida pelo e-mail canônico para não congelar
-- UUID. A permissão admin_crm garante que a conta continua apta a operar a tela.
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
  'Resolve a conta administrativa ativa do Maicon usada nas automações de check-up de CS.';

REVOKE ALL ON FUNCTION public._cs_checkup_responsavel()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._cs_checkup_responsavel()
  TO service_role;

-- -----------------------------------------------------------------------------
-- 1. Cadência do primeiro mês
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_cs_first_month_checkups_on_first_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET "TimeZone" TO 'America/Sao_Paulo'
AS $$
DECLARE
  v_company      public.companies%ROWTYPE;
  v_responsavel  uuid := public._cs_checkup_responsavel();
  v_payment_day  date := (NEW.payment_date AT TIME ZONE 'America/Sao_Paulo')::date;
  v_criadas      integer := 0;
BEGIN
  -- Os fluxos manual e Asaas usam exatamente este tipo para a primeira venda.
  IF NEW.type IS DISTINCT FROM 'primeira_venda'
     OR COALESCE(NEW.amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT c.* INTO v_company
    FROM public.companies c
   WHERE c.id = NEW.company_id;

  -- Conta interna não representa cliente que precisa de acompanhamento de CS.
  IF NOT FOUND OR COALESCE(v_company.is_internal_account, false) THEN
    RETURN NEW;
  END IF;

  IF v_responsavel IS NULL THEN
    RAISE WARNING '[cs_first_month_checkups] conta do Maicon indisponível; empresa % não recebeu tarefas', NEW.company_id;
    RETURN NEW;
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
    format('Check-up primeiro mês %s/15 - %s', passo, COALESCE(v_company.name, '(sem nome)')),
    format(
      E'Acompanhamento próximo do cliente no primeiro mês, toque %s de 15.\n\n'
      || E'Cliente: %s\nPlano: %s\nTelefone: %s\nE-mail: %s\n'
      || E'Primeiro pagamento: %s\n\n'
      || E'Objetivos deste contato:\n'
      || E'• conferir se o cliente está usando bem a plataforma;\n'
      || E'• identificar dúvidas, travas ou experiências ruins;\n'
      || E'• se colocar à disposição e orientar o próximo passo;\n'
      || E'• buscar retenção e oportunidade de segunda venda.\n\n'
      || E'Tarefa criada automaticamente pela cadência de primeiro mês.',
      passo,
      COALESCE(v_company.name, '-'),
      COALESCE(v_company.subscription_plan, '-'),
      COALESCE(v_company.phone, '-'),
      COALESCE(v_company.email, '-'),
      to_char(v_payment_day, 'DD/MM/YYYY')
    ),
    'cs_checkup'::public.admin_task_type,
    'novo'::public.admin_task_status,
    'media'::public.admin_task_priority,
    NEW.company_id,
    v_responsavel,
    v_responsavel,
    v_payment_day + (passo * 2),
    format('cs:first-month:%s:%s', NEW.company_id, passo)
  FROM generate_series(1, 15) AS passo
  ON CONFLICT (automation_key) WHERE automation_key IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_criadas = ROW_COUNT;
  RAISE NOTICE '[cs_first_month_checkups] % tarefa(s) criada(s) para company % (responsável=%)',
    v_criadas, NEW.company_id, v_responsavel;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.create_cs_first_month_checkups_on_first_sale() IS
  'AFTER INSERT de company_payments: na primeira venda cria 15 tarefas cs_checkup em D+2..D+30, sem backfill.';

REVOKE ALL ON FUNCTION public.create_cs_first_month_checkups_on_first_sale()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_company_payments_create_cs_first_month_checkups
  ON public.company_payments;

CREATE TRIGGER trg_company_payments_create_cs_first_month_checkups
  AFTER INSERT ON public.company_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_cs_first_month_checkups_on_first_sale();

-- -----------------------------------------------------------------------------
-- 2. Check-up geral dos grupos a cada 7 dias
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cs_criar_checkup_semanal(
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
  SELECT
    max(COALESCE(t.due_date, (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date)),
    COALESCE(bool_or(t.status <> 'resolvido'::public.admin_task_status), false)
    INTO v_ultimo_dia, v_aberta
    FROM public.admin_tasks t
   WHERE t.type = 'cs_checkup'::public.admin_task_type
     AND t.automation_key LIKE 'cs:groups:%';

  IF v_aberta THEN
    RETURN jsonb_build_object(
      'tipo', 'cs_checkup_semanal',
      'dry_run', p_dry_run,
      'criadas', 0,
      'motivo', 'ja_existe_tarefa_aberta',
      'ultimo_dia', v_ultimo_dia
    );
  END IF;

  IF v_ultimo_dia IS NOT NULL AND v_dia < v_ultimo_dia + 7 THEN
    RETURN jsonb_build_object(
      'tipo', 'cs_checkup_semanal',
      'dry_run', p_dry_run,
      'criadas', 0,
      'motivo', 'intervalo_ainda_nao_venceu',
      'proximo_dia', v_ultimo_dia + 7
    );
  END IF;

  IF v_responsavel IS NULL THEN
    RETURN jsonb_build_object(
      'tipo', 'cs_checkup_semanal',
      'dry_run', p_dry_run,
      'criadas', 0,
      'motivo', 'responsavel_indisponivel'
    );
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'tipo', 'cs_checkup_semanal',
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
    'Check-up semanal - todos os grupos de clientes',
    E'Revisar todos os grupos ativos de clientes.\n\n'
      || E'• conferir se cada cliente está utilizando bem a plataforma;\n'
      || E'• observar dúvidas, reclamações, silêncio ou sinais de baixo uso;\n'
      || E'• se colocar à disposição e orientar o próximo passo;\n'
      || E'• abrir uma tarefa individual quando houver risco ou oportunidade.\n\n'
      || E'Tarefa geral criada automaticamente a cada 7 dias. Enquanto ela estiver aberta, outra não será criada.',
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
    'tipo', 'cs_checkup_semanal',
    'dry_run', false,
    'criadas', CASE WHEN v_task_id IS NULL THEN 0 ELSE 1 END,
    'task_id', v_task_id,
    'dia', v_dia
  );
END;
$$;

COMMENT ON FUNCTION public.cs_criar_checkup_semanal(boolean, date) IS
  'Mantém uma tarefa geral de revisão de todos os grupos a cada 7 dias e não duplica enquanto houver uma aberta.';

REVOKE ALL ON FUNCTION public.cs_criar_checkup_semanal(boolean, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_criar_checkup_semanal(boolean, date)
  TO service_role;

SELECT cron.unschedule('cs-checkup-semanal')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cs-checkup-semanal');

-- 09:45 UTC = 06:45 em America/Sao_Paulo. O job roda diariamente e a própria
-- função decide se os 7 dias venceram, tolerando indisponibilidade de um tick.
SELECT cron.schedule(
  'cs-checkup-semanal',
  '45 9 * * *',
  $job$ SELECT public.cs_criar_checkup_semanal(false); $job$
);

-- Inicia a rotina sem esperar o primeiro tick do cron. Não afeta clientes
-- individuais e não faz backfill: cria somente a tarefa geral desta semana.
SELECT public.cs_criar_checkup_semanal(false);
