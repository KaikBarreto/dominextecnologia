-- Toda empresa Dominex precisa nascer com uma conta física e uma conta bancária
-- inicial. Antes desta migration a garantia vivia somente nas Edge Functions
-- create-company e self-register. Empresas criadas por outro caminho, ou cujo
-- seed best-effort falhou, ficavam com ZERO contas e não conseguiam registrar
-- venda, conta a pagar/receber ou transação financeira.
--
-- O padrão espelha a garantia universal da EcoSistema: a fonte canônica é um
-- trigger em companies, não o cliente nem uma única porta de cadastro.

BEGIN;

CREATE OR REPLACE FUNCTION public.seed_default_financial_accounts_on_company_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Não interfere em empresa importada/criada com configuração própria.
  IF EXISTS (
    SELECT 1
      FROM public.financial_accounts account
     WHERE account.company_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.financial_accounts (
    company_id,
    name,
    type,
    initial_balance,
    is_active,
    is_cash_account,
    sort_order,
    color,
    icon
  ) VALUES
    (NEW.id, 'Caixa',           'caixa', 0, true, true, 0, '#10b981', 'Wallet'),
    (NEW.id, 'Conta Principal', 'banco', 0, true, true, 1, '#3b82f6', 'Landmark');

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.seed_default_financial_accounts_on_company_insert() IS
  'Garante que toda empresa nova nasça com Caixa e Conta Principal. Só age quando o tenant ainda não possui nenhuma financial_accounts.';

REVOKE ALL ON FUNCTION public.seed_default_financial_accounts_on_company_insert()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_seed_default_financial_accounts ON public.companies;
CREATE TRIGGER trg_seed_default_financial_accounts
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_default_financial_accounts_on_company_insert();

-- Corrige somente tenants zerados. Empresas com ao menos uma
-- conta preservam exatamente a configuração existente, inclusive nomes/saldos.
WITH companies_without_accounts AS MATERIALIZED (
  SELECT company.id
    FROM public.companies company
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.financial_accounts account
      WHERE account.company_id = company.id
   )
)
INSERT INTO public.financial_accounts (
  company_id,
  name,
  type,
  initial_balance,
  is_active,
  is_cash_account,
  sort_order,
  color,
  icon
)
SELECT company.id, defaults.name, defaults.type, 0, true, true,
       defaults.sort_order, defaults.color, defaults.icon
  FROM companies_without_accounts company
 CROSS JOIN (VALUES
   ('Caixa',           'caixa', 0, '#10b981', 'Wallet'),
   ('Conta Principal', 'banco', 1, '#3b82f6', 'Landmark')
 ) AS defaults(name, type, sort_order, color, icon);

DO $verify$
DECLARE
  v_companies_without_accounts integer;
BEGIN
  SELECT count(*)
    INTO v_companies_without_accounts
    FROM public.companies company
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.financial_accounts account
      WHERE account.company_id = company.id
   );

  IF v_companies_without_accounts <> 0 THEN
    RAISE EXCEPTION
      'Backfill financeiro incompleto: % empresa(s) ainda estão sem conta',
      v_companies_without_accounts;
  END IF;
END;
$verify$;

COMMIT;
