-- =============================================================================
-- Links públicos amigáveis — coluna public_short_code + geração server-side
-- =============================================================================
-- Plano: docs/planos/2026-06-20-links-publicos-amigaveis-slug.md
--
-- OBJETIVO: dar a contracts, service_orders, customers e equipment um
-- identificador curto, legível, GLOBALMENTE único, gerado no servidor — pra
-- montar URLs amigáveis no formato `slug-do-nome-<codigo>` (ex.:
-- /clientes/cliente-demo-a1b2c3d4e5f6). O slug é decorativo; o código é o que
-- resolve. Os links antigos (UUID puro / token 32hex) continuam resolvendo —
-- nada aqui remove ou muda colunas existentes.
--
-- POR QUE UNIQUE GLOBAL (não por company_id):
--   A regra do time "UNIQUE global em tabela tenant vaza isolamento" vale pra
--   valores DIGITADOS pelo usuário (ex.: SKU), onde a unicidade global vira um
--   oráculo cross-tenant ("já existe"). AQUI o valor é gerado ALEATORIAMENTE
--   pelo servidor (60 bits), nunca digitado, e a resolução pública é ANÔNIMA
--   (sem contexto de tenant): o código PRECISA mapear pra exatamente 1 registro
--   no banco inteiro. Logo, UNIQUE(public_short_code) global é proposital.
--
-- pgcrypto vive em schema `extensions` no Dominex → as funções que usam
-- gen_random_bytes carregam SET search_path = public, extensions (mesma régua
-- de generate_pmoc_token, ver 20260523145803).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS antes de CREATE TRIGGER.
-- =============================================================================

-- =====================================================================
-- PASSO 1 — coluna public_short_code (nullable; o trigger preenche) +
-- índice UNIQUE GLOBAL por tabela. Nullable na definição porque o valor é
-- atribuído pelo trigger BEFORE INSERT; o índice UNIQUE ignora NULLs.
-- =====================================================================
ALTER TABLE public.contracts      ADD COLUMN IF NOT EXISTS public_short_code text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS public_short_code text;
ALTER TABLE public.customers      ADD COLUMN IF NOT EXISTS public_short_code text;
ALTER TABLE public.equipment      ADD COLUMN IF NOT EXISTS public_short_code text;

COMMENT ON COLUMN public.contracts.public_short_code IS
  'Código curto (base32 sem ambíguos, 12 chars) gerado pelo servidor. UNIQUE global. Usado pra montar o link público amigável do contrato. NÃO digitado pelo usuário.';
COMMENT ON COLUMN public.service_orders.public_short_code IS
  'Código curto (base32 sem ambíguos, 12 chars) gerado pelo servidor. UNIQUE global. Resolve a OS pública via get_public_os_by_code. NÃO digitado pelo usuário.';
COMMENT ON COLUMN public.customers.public_short_code IS
  'Código curto (base32 sem ambíguos, 12 chars) gerado pelo servidor. UNIQUE global. Usado no link interno amigável do cliente. NÃO digitado pelo usuário.';
COMMENT ON COLUMN public.equipment.public_short_code IS
  'Código curto (base32 sem ambíguos, 12 chars) gerado pelo servidor. UNIQUE global. Usado no link interno amigável do equipamento. NÃO digitado pelo usuário.';

CREATE UNIQUE INDEX IF NOT EXISTS contracts_public_short_code_key
  ON public.contracts (public_short_code);
CREATE UNIQUE INDEX IF NOT EXISTS service_orders_public_short_code_key
  ON public.service_orders (public_short_code);
CREATE UNIQUE INDEX IF NOT EXISTS customers_public_short_code_key
  ON public.customers (public_short_code);
CREATE UNIQUE INDEX IF NOT EXISTS equipment_public_short_code_key
  ON public.equipment (public_short_code);

-- =====================================================================
-- PASSO 2 — função geradora generate_public_short_code(p_len int default 12).
-- Alfabeto base32 SEM caracteres ambíguos: sem 0, o, 1, l, i. Tudo minúsculo.
-- 31 símbolos → ~4,95 bits/char → 12 chars ≈ 59,5 bits.
-- gen_random_bytes (pgcrypto) p/ aleatoriedade criptográfica; cada byte (0-255)
-- é mapeado no alfabeto por módulo. SECURITY DEFINER + search_path com extensions
-- porque pgcrypto vive lá.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.generate_public_short_code(p_len int DEFAULT 12)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_alpha_len constant int := length(v_alphabet);  -- 31
  v_bytes bytea;
  v_out text := '';
  i int;
BEGIN
  IF p_len IS NULL OR p_len < 1 THEN
    RAISE EXCEPTION '[generate_public_short_code] comprimento inválido: %', p_len;
  END IF;
  v_bytes := gen_random_bytes(p_len);
  FOR i IN 0 .. p_len - 1 LOOP
    -- get_byte é 0-indexado; mapeia o byte (0-255) no alfabeto por módulo.
    v_out := v_out || substr(v_alphabet, (get_byte(v_bytes, i) % v_alpha_len) + 1, 1);
  END LOOP;
  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.generate_public_short_code(int) IS
  'Gera código curto aleatório (default 12 chars) em base32 sem caracteres ambíguos (alfabeto abcdefghjkmnpqrstuvwxyz23456789, ~60 bits) via pgcrypto.gen_random_bytes. Usado pelos triggers de public_short_code das 4 tabelas de link amigável.';

GRANT EXECUTE ON FUNCTION public.generate_public_short_code(int) TO authenticated, service_role;

-- =====================================================================
-- PASSO 3 — função de trigger GENÉRICA ensure_public_short_code().
-- Usa TG_TABLE_NAME + EXECUTE dinâmico pra checar unicidade na própria tabela
-- (uma função serve as 4). Só gera quando NEW.public_short_code IS NULL; uma
-- vez emitido, é estável (nunca regenera num UPDATE). Loop de retry contra a
-- UNIQUE da coluna; teto de 7 tentativas (colisão em 60 bits é astronômica).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ensure_public_short_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code     text;
  v_attempts int := 0;
  v_exists   boolean;
BEGIN
  IF NEW.public_short_code IS NULL THEN
    LOOP
      v_code := public.generate_public_short_code(12);
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM public.%I WHERE public_short_code = $1)',
        TG_TABLE_NAME
      ) INTO v_exists USING v_code;

      IF NOT v_exists THEN
        EXIT;
      END IF;

      v_attempts := v_attempts + 1;
      IF v_attempts >= 7 THEN
        RAISE EXCEPTION '[public-short-code] não foi possível gerar código único para a tabela % após % tentativas', TG_TABLE_NAME, v_attempts;
      END IF;
    END LOOP;
    NEW.public_short_code := v_code;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ensure_public_short_code() IS
  'Trigger genérico (BEFORE INSERT OR UPDATE): preenche public_short_code com generate_public_short_code(12) quando NULL, garantindo unicidade global via EXECUTE dinâmico em TG_TABLE_NAME. Estável: nunca regenera código já emitido.';

-- =====================================================================
-- PASSO 4 — os 4 triggers BEFORE INSERT OR UPDATE FOR EACH ROW.
-- DROP IF EXISTS antes do CREATE (idempotente, sem duplicar handler).
-- =====================================================================
DROP TRIGGER IF EXISTS trg_ensure_public_short_code ON public.contracts;
CREATE TRIGGER trg_ensure_public_short_code
  BEFORE INSERT OR UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.ensure_public_short_code();

DROP TRIGGER IF EXISTS trg_ensure_public_short_code ON public.service_orders;
CREATE TRIGGER trg_ensure_public_short_code
  BEFORE INSERT OR UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.ensure_public_short_code();

DROP TRIGGER IF EXISTS trg_ensure_public_short_code ON public.customers;
CREATE TRIGGER trg_ensure_public_short_code
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.ensure_public_short_code();

DROP TRIGGER IF EXISTS trg_ensure_public_short_code ON public.equipment;
CREATE TRIGGER trg_ensure_public_short_code
  BEFORE INSERT OR UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.ensure_public_short_code();

-- =====================================================================
-- PASSO 5 — backfill dos registros existentes. Toca só os NULL.
-- Loop por linha (DO block) gerando + checando unicidade na própria tabela,
-- com o mesmo teto de retry. Mais seguro que disparar o trigger em massa via
-- UPDATE (que também dispararia outros triggers BEFORE UPDATE das tabelas).
-- Log por tabela via RAISE NOTICE pra auditoria.
-- =====================================================================
DO $$
DECLARE
  v_tables   text[] := ARRAY['contracts','service_orders','customers','equipment'];
  v_tbl      text;
  r          record;
  v_code     text;
  v_attempts int;
  v_exists   boolean;
  v_done     int;
BEGIN
  FOREACH v_tbl IN ARRAY v_tables LOOP
    v_done := 0;
    FOR r IN EXECUTE format('SELECT id FROM public.%I WHERE public_short_code IS NULL', v_tbl) LOOP
      v_attempts := 0;
      LOOP
        v_code := public.generate_public_short_code(12);
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE public_short_code = $1)', v_tbl)
          INTO v_exists USING v_code;
        IF NOT v_exists THEN
          EXIT;
        END IF;
        v_attempts := v_attempts + 1;
        IF v_attempts >= 7 THEN
          RAISE EXCEPTION '[public-short-code backfill] código único não gerado p/ %.% após % tentativas', v_tbl, r.id, v_attempts;
        END IF;
      END LOOP;
      EXECUTE format('UPDATE public.%I SET public_short_code = $1 WHERE id = $2', v_tbl)
        USING v_code, r.id;
      v_done := v_done + 1;
    END LOOP;
    RAISE NOTICE '[public-short-code backfill] tabela %: % linha(s) preenchidas', v_tbl, v_done;
  END LOOP;
END $$;

-- =====================================================================
-- PASSO 6 — RPC pública get_public_os_by_code(p_code text).
-- Resolve a OS pelo código curto e DELEGA pro get_public_os(uuid) existente
-- (não duplica o corpo). Mesmo grant do get_public_os (anon).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_public_os_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id
  FROM service_orders
  WHERE public_short_code = p_code;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN public.get_public_os(v_id);
END;
$$;

COMMENT ON FUNCTION public.get_public_os_by_code(text) IS
  'Resolve a OS pública pelo public_short_code e delega pro get_public_os(uuid). Retorna NULL se o código não casar. Anon (link amigável da OS).';

GRANT EXECUTE ON FUNCTION public.get_public_os_by_code(text) TO anon, authenticated, service_role;
