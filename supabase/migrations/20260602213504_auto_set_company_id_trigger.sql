-- Fix sistêmico v1.9.25: trigger BEFORE INSERT que auto-popula company_id
-- quando o payload não envia. Resolve bug em que hooks (useInventory, etc.)
-- esquecem de incluir company_id e RLS rejeita o INSERT silenciosamente,
-- caindo como "Você não tem permissão" pro user master/admin tenant.
--
-- Backwards-compatible: hooks que JÁ enviam company_id continuam funcionando
-- (trigger só age quando NEW.company_id IS NULL).
--
-- Caso real: JUARES DAVI (Engetec, admin/MASTER) bloqueado ao cadastrar item
-- de Estoque. Mesma raiz do bug v1.9.20 (OS de contrato).
--
-- Reference memory: feedback `reference_rls_company_id_silent_block.md`.

-- =========================================================================
-- 1) Função genérica do trigger
-- =========================================================================
CREATE OR REPLACE FUNCTION public.set_company_id_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Auto-popula só quando o INSERT veio sem company_id explícito.
  -- Hooks que JÁ enviam company_id (ex: useContracts após v1.9.20)
  -- sobrescrevem este default.
  --
  -- Quando auth.uid() é NULL (chamadas de service_role/webhook sem JWT),
  -- get_user_company_id retorna NULL → trigger vira no-op e RLS/CHECK
  -- decide o resto. Comportamento idêntico ao INSERT atual.
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.get_user_company_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_company_id_on_insert() IS
'v1.9.25 — Auto-popula company_id em INSERT tenant quando payload não envia.
Resolve bug sistêmico de RLS rejeitar silenciosamente. Aplicado via trigger
BEFORE INSERT em todas tabelas tenant com coluna company_id NOT NULL.';

-- =========================================================================
-- 2) Aplicar trigger em TODAS as tabelas tenant com coluna company_id
-- =========================================================================
-- Idempotente: drop-then-create do trigger. Iteração lê information_schema
-- ao vivo, então tabelas novas com company_id que forem criadas DEPOIS
-- desta migration precisarão receber o trigger via nova migration.
--
-- Exclusões:
--   - companies              → auto-referência (empresa não tem company_id pra si)
--   - profiles               → criado por trigger handle_new_user no signup;
--                              fluxo já controla company_id corretamente
--   - tabelas com underscore inicial → convenção de sistema
DO $$
DECLARE
  tbl record;
  trg_name text;
  applied_count int := 0;
BEGIN
  FOR tbl IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'company_id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name NOT IN ('companies', 'profiles')
      AND c.table_name NOT LIKE E'\\_%'
    ORDER BY c.table_name
  LOOP
    trg_name := 'tg_set_company_id_' || tbl.table_name;

    -- Drop existing trigger se já existe (idempotência)
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trg_name, tbl.table_name);

    -- Cria trigger BEFORE INSERT (FOR EACH ROW)
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert()',
      trg_name, tbl.table_name
    );

    applied_count := applied_count + 1;
    RAISE NOTICE 'Trigger % aplicado em public.%', trg_name, tbl.table_name;
  END LOOP;

  RAISE NOTICE 'Total de triggers aplicados: %', applied_count;
END $$;
