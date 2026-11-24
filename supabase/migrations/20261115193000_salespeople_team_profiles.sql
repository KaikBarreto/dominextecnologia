-- Equipe interna da Dominex: separa área de atuação de papel comercial.
-- É aditivo: registros atuais continuam comerciais e elegíveis a vendas.
ALTER TABLE public.salespeople
  ADD COLUMN IF NOT EXISTS person_type text NOT NULL DEFAULT 'sales',
  ADD COLUMN IF NOT EXISTS can_receive_sales boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'salespeople_person_type_check'
      AND conrelid = 'public.salespeople'::regclass
  ) THEN
    ALTER TABLE public.salespeople
      ADD CONSTRAINT salespeople_person_type_check
      CHECK (person_type IN ('sales', 'customer_success', 'support', 'financial', 'admin', 'partner', 'other'));
  END IF;
END $$;

COMMENT ON COLUMN public.salespeople.person_type IS
  'Área interna da pessoa. Não concede acesso nem torna a pessoa elegível para vendas.';
COMMENT ON COLUMN public.salespeople.can_receive_sales IS
  'Controla seletores comerciais; false exclui a pessoa de vendas, links e rodízio.';

-- A view alimenta seletores. Mantém os campos existentes e expõe a flag para
-- callers filtrarem comercial sem usar equipes de tenant.
CREATE OR REPLACE VIEW public.salespeople_basic
  WITH (security_invoker = true) AS
  SELECT
    id,
    name,
    email,
    referral_code,
    is_active,
    user_id,
    photo_url,
    role,
    daily_goal_contacts,
    daily_goal_meetings_scheduled,
    can_receive_sales,
    person_type
  FROM public.salespeople;

-- Defesa no servidor para links antigos e alterações feitas fora da UI: uma
-- pessoa não comercial nunca pode voltar ao rodízio só por estar ativa.
CREATE OR REPLACE FUNCTION public.assign_next_lead_salesperson()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.salespeople
  WHERE is_active = true
    AND can_receive_sales = true
    AND in_rotation = true
    AND phone IS NOT NULL
    AND btrim(phone) <> ''
  ORDER BY last_lead_assigned_at ASC NULLS FIRST, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NOT NULL THEN
    UPDATE public.salespeople SET last_lead_assigned_at = now() WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$fn$;
