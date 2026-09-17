-- ============================================================================
-- Ponto em modo QUIOSQUE: link geral da empresa + PIN opcional por funcionário
--
-- PORTADO do EcoSistema (20260903235900_ponto_kiosk_e_pin.sql), já com os dois
-- ajustes posteriores dobrados aqui dentro:
--   * 20260903235901 — PIN nulo/vazio NÃO conta como tentativa falha.
--   * 20260903235903 — PIN aceita 4 OU 6 dígitos (nunca 5).
--
-- POR QUÊ:
-- 1) Hoje a Dominex só tem link PESSOAL de ponto (employees.ponto_slug, criado
--    em 20260626170000_ponto_link_publico.sql). Não há como deixar um tablet
--    fixo na empresa pro time todo bater. Nasce companies.ponto_kiosk_slug.
-- 2) O link geral lista o time inteiro num aparelho COMPARTILHADO — qualquer um
--    poderia bater o ponto de qualquer outro. Quem quiser blindar a própria
--    batida ganha um PIN opcional. O PIN mora em TABELA PRÓPRIA (e não em
--    colunas novas de employees) porque cada erro de PIN grava um contador, e
--    gravar em employees faria toda tentativa revalidar CHECKs legados da linha
--    do funcionário — um cadastro antigo inválido travaria o ponto da pessoa.
--    Tabela própria também permite RLS SEM policy: só service_role vê o hash.
--
-- ADAPTAÇÕES Eco -> Dominex (cada uma verificada contra o banco de produção):
--   * Guard de tenant: o Eco usa public.is_platform_admin(uuid). A Dominex NÃO
--     tem essa função (confirmado em pg_proc). O equivalente local é
--     public.is_super_admin(uuid) -> has_role(uid,'super_admin'::app_role),
--     definida em 20260418163700. Mesmo padrão já adotado em
--     20260826140000_admin_db_monitoring_rpcs.sql.
--   * public.get_user_company_id(_user_id uuid) existe igual na Dominex
--     (20260308072335) e lê profiles.user_id — nome e assinatura batem.
--   * Slugify: o Eco usa unaccent(). Aqui seguimos o MESMO slugify de
--     generate_ponto_slug (translate() de acentos + alfabeto base32 sem
--     0/O/1/I/L), pra que os dois links de ponto tenham formato idêntico.
--   * pgcrypto (crypt/gen_salt/gen_random_bytes) vive no schema `extensions`
--     (confirmado em pg_proc), então toda função aqui usa
--     SET search_path = public, extensions — igual a generate_ponto_slug.
--   * REVOKE: o default privilege do schema public deste projeto concede
--     EXECUTE a anon E authenticated em função nova. REVOKE de PUBLIC não
--     remove grant por-role — por isso revogamos anon (e authenticated onde
--     aplica) explicitamente antes de reconceder.
--
-- Migration ADITIVA e idempotente. Nada existente é dropado.
--
-- RENUMERADA de 20260916170000 -> 20260917153000 em 2026-09-17. POR QUÊ: enquanto
-- esta migration esperava autorização, uma sessão paralela aplicou em produção
-- outra migration com o MESMO timestamp 20260916170000
-- (financial_transactions_supplier_id). Com a versão já marcada em
-- supabase_migrations.schema_migrations, o `db push` reportava "up to date" e
-- pulava ESTE arquivo pra sempre — a migration nunca sairia do disco.
--
-- POR QUÊ o slug de quiosque é UNIQUE GLOBAL (e não por company_id): o slug é
-- resolvido por ACESSO ANÔNIMO, sem company_id no contexto — exatamente o mesmo
-- raciocínio do employees.ponto_slug. Colisão é evitada na geração.
-- ============================================================================

-- ─── 1. companies.ponto_kiosk_slug ──────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ponto_kiosk_slug text;

-- UNIQUE GLOBAL parcial (ignora múltiplos NULL: empresa que nunca abriu o
-- quiosque fica com NULL e não colide com nenhuma outra).
CREATE UNIQUE INDEX IF NOT EXISTS companies_ponto_kiosk_slug_key
  ON public.companies (ponto_kiosk_slug)
  WHERE ponto_kiosk_slug IS NOT NULL;

COMMENT ON COLUMN public.companies.ponto_kiosk_slug IS
  'Slug do link PÚBLICO de quiosque de ponto (/ponto/empresa/<slug>), pra tablet '
  'compartilhado da empresa. Gerado sob demanda por get_or_create_ponto_kiosk_slug. '
  'Formato: nome-da-empresa-CODIGO8 (mesmo formato de employees.ponto_slug). '
  'UNIQUE GLOBAL porque é resolvido por acesso anônimo, sem company_id no contexto.';

-- ─── 2. employee_ponto_pins — PIN opcional por funcionário ──────────────────
CREATE TABLE IF NOT EXISTS public.employee_ponto_pins (
  employee_id  uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pin_hash     text NOT NULL,
  set_at       timestamptz NOT NULL DEFAULT now(),
  failed_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz
);

CREATE INDEX IF NOT EXISTS employee_ponto_pins_company_idx
  ON public.employee_ponto_pins (company_id);

-- RLS LIGADA E SEM NENHUMA POLICY, DE PROPÓSITO.
-- POR QUÊ: RLS ligada sem policy = ninguém autenticado lê nem escreve nada.
-- service_role bypassa RLS (é a edge pública quem verifica o PIN). Um bcrypt de
-- PIN de 4 dígitos quebra offline em segundos, então o hash NUNCA pode chegar no
-- browser. O front descobre apenas SE existe PIN, pelo booleano de has_ponto_pin.
ALTER TABLE public.employee_ponto_pins ENABLE ROW LEVEL SECURITY;

-- O default privilege deste projeto concede tudo a anon/authenticated em tabela
-- nova. RLS sem policy já barra, mas revogamos o grant também (defesa em
-- profundidade: se alguém criar uma policy por engano no futuro, o grant não
-- estará lá esperando).
REVOKE ALL ON TABLE public.employee_ponto_pins FROM anon, authenticated;

COMMENT ON TABLE public.employee_ponto_pins IS
  'PIN opcional do funcionário pro ponto público (link pessoal e quiosque da '
  'empresa). RLS ligada SEM policy de propósito: só service_role acessa o hash. '
  'Front usa as RPCs has_ponto_pin/set_ponto_pin; a edge usa verify_ponto_pin.';

COMMENT ON COLUMN public.employee_ponto_pins.employee_id IS
  'PK e FK pra employees. ON DELETE CASCADE: funcionário excluído leva o PIN junto.';
COMMENT ON COLUMN public.employee_ponto_pins.company_id IS
  'Empresa dona do PIN. Redundante com employees.company_id, mas guardado aqui '
  'pra permitir guard de tenant sem JOIN e pra limpeza em cascata da empresa.';
COMMENT ON COLUMN public.employee_ponto_pins.pin_hash IS
  'Hash bcrypt (extensions.crypt + gen_salt(''bf'')). O PIN em claro nunca é '
  'guardado nem trafega de volta pro cliente.';
COMMENT ON COLUMN public.employee_ponto_pins.set_at IS
  'Quando o PIN atual foi definido. Zera junto a cada troca.';
COMMENT ON COLUMN public.employee_ponto_pins.failed_count IS
  'Tentativas ERRADAS consecutivas. PIN não digitado (NULL/vazio) não conta — '
  'senão abrir o cartão de alguém no tablet queimaria as tentativas dela.';
COMMENT ON COLUMN public.employee_ponto_pins.locked_until IS
  'Até quando o funcionário está travado após 5 erros reais (15 minutos).';

-- ─── 3. get_or_create_ponto_kiosk_slug — geração preguiçosa e idempotente ───
-- Mesmo slugify de generate_ponto_slug (20260626170000): translate() pra tirar
-- acento (não unaccent, pra manter os dois links com formato idêntico) e código
-- base32 de 8 chars sem 0/O/1/I/L (evita confusão ao digitar/ditar o link).
CREATE OR REPLACE FUNCTION public.get_or_create_ponto_kiosk_slug(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_name      text;
  v_existing  text;
  v_base      text;
  v_alphabet  text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 chars, sem 0/O/1/I/L
  v_code      text;
  v_candidate text;
  v_bytes     bytea;
  v_attempt   int;
  i           int;
  v_taken     boolean;
BEGIN
  SELECT name, ponto_kiosk_slug INTO v_name, v_existing
  FROM public.companies
  WHERE id = p_company_id;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Empresa % não encontrada', p_company_id;
  END IF;

  -- Guard de tenant escrito à mão: RLS NÃO protege função SECURITY DEFINER.
  -- Passa quem for service_role, super_admin da plataforma, ou usuário da
  -- própria empresa.
  IF NOT (
       auth.role() = 'service_role'
       OR nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role' = 'service_role'
     )
     AND NOT public.is_super_admin((SELECT auth.uid()))
     AND p_company_id IS DISTINCT FROM (SELECT public.get_user_company_id(auth.uid()))
  THEN
    RAISE EXCEPTION 'Acesso negado: empresa diferente da sua'
      USING ERRCODE = '42501';
  END IF;

  -- Idempotente: já tem slug → devolve o existente, NÃO regenera (regenerar
  -- invalidaria o link já colado no tablet da empresa).
  IF v_existing IS NOT NULL AND v_existing <> '' THEN
    RETURN v_existing;
  END IF;

  -- slugify do nome da empresa (idêntico ao de generate_ponto_slug)
  v_base := lower(v_name);
  v_base := translate(
    v_base,
    'áàâãäåçéèêëíìîïñóòôõöúùûüýÿ',
    'aaaaaaceeeeiiiinooooouuuuyy'
  );
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := regexp_replace(v_base, '-+', '-', 'g');
  v_base := trim(both '-' from v_base);
  v_base := left(v_base, 40);
  v_base := trim(both '-' from v_base); -- caso o corte tenha deixado hífen na ponta
  IF v_base = '' OR v_base IS NULL THEN
    v_base := 'empresa';
  END IF;

  v_attempt := 0;
  LOOP
    v_attempt := v_attempt + 1;

    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    FOR i IN 0..7 LOOP
      -- 1 byte (0..255) mapeado pra índice 1..31 do alfabeto
      v_code := v_code || substr(
        v_alphabet,
        (get_byte(v_bytes, i) % 31) + 1,
        1
      );
    END LOOP;

    v_candidate := v_base || '-' || v_code;

    SELECT EXISTS (
      SELECT 1 FROM public.companies
      WHERE ponto_kiosk_slug = v_candidate AND id <> p_company_id
    ) INTO v_taken;

    EXIT WHEN NOT v_taken;

    IF v_attempt >= 50 THEN
      RAISE EXCEPTION 'Não foi possível gerar um link de quiosque único após 50 tentativas. Tente novamente.';
    END IF;
  END LOOP;

  UPDATE public.companies
  SET ponto_kiosk_slug = v_candidate
  WHERE id = p_company_id;

  RETURN v_candidate;
END;
$$;

COMMENT ON FUNCTION public.get_or_create_ponto_kiosk_slug(uuid) IS
  'Devolve (criando na primeira chamada) o slug do link público de quiosque de '
  'ponto da empresa. Idempotente: nunca regenera um slug já emitido, pra não '
  'derrubar o link já em uso no tablet. SECURITY DEFINER com guard de tenant '
  '(service_role, super_admin ou usuário da própria empresa).';

REVOKE ALL ON FUNCTION public.get_or_create_ponto_kiosk_slug(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_ponto_kiosk_slug(uuid)
  TO authenticated, service_role;

-- ─── 4. set_ponto_pin — define/remove o PIN (chamado pelo admin logado) ─────
CREATE OR REPLACE FUNCTION public.set_ponto_pin(p_employee_id uuid, p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.employees
  WHERE id = p_employee_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário % não encontrado', p_employee_id;
  END IF;

  -- Guard de tenant escrito à mão (RLS não cobre SECURITY DEFINER).
  IF NOT (
       auth.role() = 'service_role'
       OR nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role' = 'service_role'
     )
     AND NOT public.is_super_admin((SELECT auth.uid()))
     AND v_company_id IS DISTINCT FROM (SELECT public.get_user_company_id(auth.uid()))
  THEN
    RAISE EXCEPTION 'Acesso negado: funcionário não pertence à sua empresa'
      USING ERRCODE = '42501';
  END IF;

  -- PIN vazio/NULL = remover a proteção (volta a bater sem PIN).
  IF p_pin IS NULL OR btrim(p_pin) = '' THEN
    DELETE FROM public.employee_ponto_pins WHERE employee_id = p_employee_id;
    RETURN;
  END IF;

  -- 4 OU 6 dígitos, nunca 5. POR QUÊ: o PIN é digitado num teclado numérico de
  -- tablet, sem campo de texto e sem contador visível — só bolinhas. Um tamanho
  -- intermediário faz a pessoa hesitar ("faltou um dígito?"). 4 e 6 são os
  -- tamanhos que todo mundo já conhece de cartão e de banco.
  IF btrim(p_pin) !~ '^([0-9]{4}|[0-9]{6})$' THEN
    RAISE EXCEPTION 'O PIN precisa ter 4 ou 6 dígitos numéricos'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.employee_ponto_pins
    (employee_id, company_id, pin_hash, set_at, failed_count, locked_until)
  VALUES (
    p_employee_id,
    v_company_id,
    extensions.crypt(btrim(p_pin), extensions.gen_salt('bf')),
    now(), 0, NULL
  )
  ON CONFLICT (employee_id) DO UPDATE
    SET pin_hash     = EXCLUDED.pin_hash,
        company_id   = EXCLUDED.company_id,
        set_at       = now(),
        failed_count = 0,      -- trocar o PIN destrava quem estava travado
        locked_until = NULL;
END;
$$;

COMMENT ON FUNCTION public.set_ponto_pin(uuid, text) IS
  'Define (4 OU 6 dígitos, nunca 5) ou remove (NULL/vazio) o PIN do ponto do '
  'funcionário. Guarda só o hash bcrypt, nunca o PIN em claro. Trocar o PIN zera '
  'o contador de erros e destrava. SECURITY DEFINER com guard de tenant.';

REVOKE ALL ON FUNCTION public.set_ponto_pin(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_ponto_pin(uuid, text) TO authenticated;

-- ─── 5. has_ponto_pin — o cadastro só precisa saber SE existe ───────────────
-- Devolve booleano e nada mais: o hash nunca sai do banco.
CREATE OR REPLACE FUNCTION public.has_ponto_pin(p_employee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.employees
  WHERE id = p_employee_id;

  IF v_company_id IS NULL THEN
    RETURN false;
  END IF;

  -- Guard de tenant escrito à mão (RLS não cobre SECURITY DEFINER).
  IF NOT (
       auth.role() = 'service_role'
       OR nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role' = 'service_role'
     )
     AND NOT public.is_super_admin((SELECT auth.uid()))
     AND v_company_id IS DISTINCT FROM (SELECT public.get_user_company_id(auth.uid()))
  THEN
    RAISE EXCEPTION 'Acesso negado: funcionário não pertence à sua empresa'
      USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.employee_ponto_pins WHERE employee_id = p_employee_id
  );
END;
$$;

COMMENT ON FUNCTION public.has_ponto_pin(uuid) IS
  'Diz apenas SE o funcionário tem PIN de ponto cadastrado (booleano). É assim '
  'que o cadastro mostra "PIN ativo" sem que o hash chegue no browser — um '
  'bcrypt de PIN de 4 dígitos quebra offline em segundos. Guard de tenant.';

REVOKE ALL ON FUNCTION public.has_ponto_pin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_ponto_pin(uuid) TO authenticated;

-- ─── 6. verify_ponto_pin — SÓ service_role (a edge pública do ponto) ────────
-- Trava após 5 erros REAIS por 15 minutos. PIN ausente NÃO consome tentativa.
CREATE OR REPLACE FUNCTION public.verify_ponto_pin(p_employee_id uuid, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row    public.employee_ponto_pins%ROWTYPE;
  v_max    int := 5;
  v_lock   interval := interval '15 minutes';
  v_failed int;
BEGIN
  -- Só a edge (service_role). Nem anon nem authenticated podem tentar PIN
  -- direto pelo PostgREST — senão dava pra fazer força bruta sem passar pelo
  -- rate limit e pelo contexto da edge.
  IF NOT (
       auth.role() = 'service_role'
       OR nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role' = 'service_role'
     )
  THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.employee_ponto_pins
  WHERE employee_id = p_employee_id
  FOR UPDATE;  -- serializa tentativas concorrentes no mesmo funcionário

  -- Funcionário sem PIN: passa direto (é o comportamento do link pessoal hoje).
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'no_pin', true);
  END IF;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RETURN jsonb_build_object(
      'ok', false, 'locked_until', v_row.locked_until, 'attempts_left', 0
    );
  END IF;

  -- PIN ausente NÃO é tentativa errada, é "ainda não digitei". Sem esta guarda,
  -- abrir o cartão de alguém no quiosque (que chama a RPC uma vez por montagem
  -- de tela, sem pin) queimaria uma das 5 tentativas dela — tocar 5x no cartão
  -- travava a pessoa por 15 minutos. A trava continua sendo REPORTADA acima,
  -- porque quem está travado precisa saber mesmo sem ter digitado.
  IF p_pin IS NULL OR btrim(p_pin) = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'pin_required', true,
      'attempts_left', v_max - COALESCE(v_row.failed_count, 0)
    );
  END IF;

  IF extensions.crypt(btrim(p_pin), v_row.pin_hash) = v_row.pin_hash THEN
    UPDATE public.employee_ponto_pins
       SET failed_count = 0, locked_until = NULL
     WHERE employee_id = p_employee_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  v_failed := COALESCE(v_row.failed_count, 0) + 1;

  IF v_failed >= v_max THEN
    UPDATE public.employee_ponto_pins
       SET failed_count = 0, locked_until = now() + v_lock
     WHERE employee_id = p_employee_id;
    RETURN jsonb_build_object(
      'ok', false, 'locked_until', now() + v_lock, 'attempts_left', 0
    );
  END IF;

  UPDATE public.employee_ponto_pins
     SET failed_count = v_failed
   WHERE employee_id = p_employee_id;

  RETURN jsonb_build_object('ok', false, 'attempts_left', v_max - v_failed);
END;
$$;

COMMENT ON FUNCTION public.verify_ponto_pin(uuid, text) IS
  'Verifica o PIN do ponto. SÓ service_role (a edge pública do ponto). Sem PIN '
  'cadastrado devolve ok=true/no_pin=true. PIN ausente devolve pin_required SEM '
  'contar tentativa. 5 erros REAIS travam por 15 minutos.';

REVOKE ALL ON FUNCTION public.verify_ponto_pin(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_ponto_pin(uuid, text) TO service_role;
