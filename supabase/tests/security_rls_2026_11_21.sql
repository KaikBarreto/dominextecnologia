-- ============================================================================
-- Teste das migrations de RLS de 21/11/2026 (20261121160000..160400)
-- ============================================================================
-- Roda inteiro dentro de BEGIN ... ROLLBACK: nada persiste.
-- Uso (depois das migrations aplicadas, ou concatenado a elas num ensaio):
--   python3 -I /tmp/q.py < supabase/tests/security_rls_2026_11_21.sql
-- Saída: uma linha por verificação (test, ok, detail). Tudo deve ser ok = true.
--
-- Sujeitos (produção, 21/11/2026):
--   Empresa A  = 4d922360-70cb-4473-8b9f-10c51da4d453
--     usuário comum (técnico, sem gestão) = dcc4ca84-3152-4acb-8878-fd0ebf6c7131
--     admin da empresa                     = acfce3dc-78a4-49b4-b73e-d4903c29151a
--   Empresa B  = 293900d9-174a-4db9-9be1-febe5c2baa30
--   G-Tech (dona do cargo "Técnico em Campo") = 6510e8af-c249-4494-86b7-ed9e24cb0d91
--   KGIE (só fn:manage_users)    = 62d570d3-9045-4bd2-a5a4-e5fad2177213 / eacad75e-3da3-4df4-b19c-7351890f5148
--   CLIMATIZE (só fn:manage_settings antes do item 3) = f1d0c69c-eb5d-4e6c-849e-0b9cd001a9f4
--   super_admin                  = 48cc8c05-b1f6-4c5b-99ef-c156aa54da4a
--   órfão (profile sem empresa)  = 00dd6d2b-173e-4e80-b026-50aa39f0fc3d
-- ============================================================================

BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE _t (n bigserial, test text, ok boolean, detail text) ON COMMIT DROP;
CREATE TEMP TABLE _v (k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON _t, _v TO authenticated, anon, service_role;
GRANT ALL ON SEQUENCE _t_n_seq TO authenticated, anon, service_role;

-- Executa o SQL num subtransação e SEMPRE desfaz. Devolve 'rows=N' ou 'err=SQLSTATE: msg'.
CREATE FUNCTION pg_temp.run(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n bigint; r text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    r := 'rows=' || n;
    RAISE EXCEPTION '__probe_rollback__';
  EXCEPTION WHEN others THEN
    IF SQLERRM = '__probe_rollback__' THEN RETURN r; END IF;
    RETURN 'err=' || SQLSTATE || ': ' || SQLERRM;
  END;
END $f$;

-- Primeiro valor do SQL. p_keep = false desfaz o efeito; true mantém (até o ROLLBACK final).
CREATE FUNCTION pg_temp.val(p_sql text, p_keep boolean DEFAULT false) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text;
BEGIN
  BEGIN
    EXECUTE p_sql INTO v;
    IF p_keep THEN RETURN coalesce(v, 'NULL'); END IF;
    RAISE EXCEPTION '__probe_rollback__';
  EXCEPTION WHEN others THEN
    IF SQLERRM = '__probe_rollback__' THEN RETURN coalesce(v, 'NULL'); END IF;
    RETURN 'err=' || SQLSTATE || ': ' || SQLERRM;
  END;
END $f$;

CREATE FUNCTION pg_temp.chk(p_test text, p_got text, p_expect text) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO _t (test, ok, detail) VALUES (p_test, coalesce(p_got ~ p_expect, false), p_got);
$f$;

-- ---------------------------------------------------------------------------
-- Preparação (postgres, sem JWT)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO _v VALUES
  ('A', '4d922360-70cb-4473-8b9f-10c51da4d453'),
  ('B', '293900d9-174a-4db9-9be1-febe5c2baa30'),
  ('GTECH', '6510e8af-c249-4494-86b7-ed9e24cb0d91'),
  ('U', 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131'),
  ('ADM', 'acfce3dc-78a4-49b4-b73e-d4903c29151a'),
  ('ORPHAN', '00dd6d2b-173e-4e80-b026-50aa39f0fc3d');
INSERT INTO _v SELECT 'emp_total', count(*)::text FROM public.employees;
INSERT INTO _v SELECT 'empA', id::text FROM public.employees
  WHERE company_id = '4d922360-70cb-4473-8b9f-10c51da4d453' AND is_active ORDER BY created_at LIMIT 1;
INSERT INTO _v SELECT 'profs_climatize', count(*)::text FROM public.profiles WHERE company_id = 'f62fa387-e980-4982-8099-f4ca270d9d15';
INSERT INTO _v SELECT 'profs_kgie', count(*)::text FROM public.profiles WHERE company_id = 'eacad75e-3da3-4df4-b19c-7351890f5148';
INSERT INTO _v SELECT 'title', t.id::text FROM public.domiflix_titles t
  WHERE t.is_active AND NOT EXISTS (SELECT 1 FROM public.domiflix_watchlist w
    WHERE w.title_id = t.id AND w.user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131')
  ORDER BY t.created_at LIMIT 1;
INSERT INTO _v SELECT 'draft_title', id::text FROM public.domiflix_titles
  WHERE is_active AND id::text <> (SELECT v FROM _v WHERE k = 'title') ORDER BY created_at DESC LIMIT 1;
INSERT INTO _v SELECT 'post_pub', id::text FROM public.blog_posts WHERE status = 'published' ORDER BY published_at DESC NULLS LAST LIMIT 1;
INSERT INTO _v SELECT 'post_draft', id::text FROM public.blog_posts
  WHERE status = 'published' AND id::text <> (SELECT v FROM _v WHERE k = 'post_pub') ORDER BY published_at DESC NULLS LAST LIMIT 1;
INSERT INTO _v SELECT 'likes_before', coalesce(likes_count, 0)::text FROM public.blog_posts WHERE id = (SELECT v::uuid FROM _v WHERE k = 'post_pub');

-- Rascunhos de teste (desfeitos no ROLLBACK final)
UPDATE public.domiflix_titles SET is_active = false WHERE id = (SELECT v::uuid FROM _v WHERE k = 'draft_title');
UPDATE public.blog_posts SET status = 'draft' WHERE id = (SELECT v::uuid FROM _v WHERE k = 'post_draft');
-- Cargo da empresa A para os testes de escrita
INSERT INTO public.permission_presets (name, permissions, company_id)
  VALUES ('__teste_rls__', '[]'::jsonb, '4d922360-70cb-4473-8b9f-10c51da4d453');
INSERT INTO _v SELECT 'presetA', id::text FROM public.permission_presets WHERE name = '__teste_rls__';

-- ---------------------------------------------------------------------------
-- Item 1: permission_presets (dados, como postgres)
-- ---------------------------------------------------------------------------
SELECT pg_temp.chk('1.dados: nenhum cargo sem empresa',
  (SELECT count(*)::text FROM public.permission_presets WHERE company_id IS NULL), '^0$');
SELECT pg_temp.chk('1.dados: nenhum vínculo de cargo com empresa divergente',
  (SELECT count(*)::text FROM public.user_permissions up JOIN public.permission_presets pp ON pp.id = up.preset_id
    WHERE pp.company_id IS DISTINCT FROM public.get_profile_company_id(up.user_id)), '^0$');
SELECT pg_temp.chk('1.dados: 3 "Técnico em Campo" (G-Tech, v sabrina, Maqfrio)',
  (SELECT string_agg(left(company_id::text, 8), ',' ORDER BY company_id) FROM public.permission_presets WHERE name = 'Técnico em Campo'),
  '^0f4dc2a9,28cb8658,6510e8af$');
SELECT pg_temp.chk('1.dados: G-Tech mantém o id original',
  (SELECT company_id::text FROM public.permission_presets WHERE id = 'c44855ed-8b11-4450-834b-0df635371a0a'), '^6510e8af');
SELECT pg_temp.chk('1.dados: Meio oficial e Auxiliar com a Tiklear',
  (SELECT count(*)::text FROM public.permission_presets WHERE id IN ('20b10454-29f4-499c-b823-e7e16d3ffc83','b7b4df4d-b9af-4420-a74e-116bf149e3a0')
     AND company_id = '808e1322-c7f7-4e6e-be58-f9c9440632c9'), '^2$');
SELECT pg_temp.chk('1.dados: Escritório / ADM com Carlos & Arruda',
  (SELECT company_id::text FROM public.permission_presets WHERE id = '3d98cd72-4d7a-4d25-955a-e867edaae359'), '^e9d06e16');
SELECT pg_temp.chk('1.dados: cópias preservam created_at original',
  (SELECT count(DISTINCT created_at)::text FROM public.permission_presets WHERE name = 'Técnico em Campo'), '^1$');

-- Item 1, impersonação: usuário comum da empresa A
SELECT set_config('request.jwt.claims', json_build_object('sub', 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('1.comum A: não lê cargo de outra empresa',
  pg_temp.val($$SELECT count(*)::text FROM public.permission_presets WHERE company_id <> public.get_user_company_id(auth.uid())$$), '^0$');
SELECT pg_temp.chk('1.comum A: lê o cargo da própria empresa',
  pg_temp.val($$SELECT count(*)::text FROM public.permission_presets WHERE id = (SELECT v::uuid FROM _v WHERE k = 'presetA')$$), '^1$');
SELECT pg_temp.chk('1.comum A: não edita cargo da própria empresa',
  pg_temp.run($$UPDATE public.permission_presets SET name = name WHERE company_id = '4d922360-70cb-4473-8b9f-10c51da4d453'$$), '^rows=0$');
SELECT pg_temp.chk('1.comum A: não cria cargo',
  pg_temp.run($$INSERT INTO public.permission_presets (name, permissions) VALUES ('x', '[]')$$), '^err=42501');
RESET ROLE;

-- Item 1, impersonação: admin da empresa A
SELECT set_config('request.jwt.claims', json_build_object('sub', 'acfce3dc-78a4-49b4-b73e-d4903c29151a', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('1.admin A: update em cargo de outra empresa = 0',
  pg_temp.run($$UPDATE public.permission_presets SET name = name WHERE company_id = '6510e8af-c249-4494-86b7-ed9e24cb0d91'$$), '^rows=0$');
SELECT pg_temp.chk('1.admin A: delete em cargo de outra empresa = 0',
  pg_temp.run($$DELETE FROM public.permission_presets WHERE company_id = '6510e8af-c249-4494-86b7-ed9e24cb0d91'$$), '^rows=0$');
SELECT pg_temp.chk('1.admin A: insert sem company_id grava com A',
  pg_temp.val($$WITH i AS (INSERT INTO public.permission_presets (name, permissions) VALUES ('t', '[]') RETURNING company_id) SELECT company_id::text FROM i$$),
  '^4d922360-70cb-4473-8b9f-10c51da4d453$');
SELECT pg_temp.chk('1.admin A: insert com company_id NULL explícito grava com A (gatilho)',
  pg_temp.val($$WITH i AS (INSERT INTO public.permission_presets (name, permissions, company_id) VALUES ('t', '[]', NULL) RETURNING company_id) SELECT company_id::text FROM i$$),
  '^4d922360-70cb-4473-8b9f-10c51da4d453$');
SELECT pg_temp.chk('1.admin A: insert com company_id de outra empresa falha',
  pg_temp.run($$INSERT INTO public.permission_presets (name, permissions, company_id) VALUES ('t', '[]', '6510e8af-c249-4494-86b7-ed9e24cb0d91')$$), '^err=42501');
SELECT pg_temp.chk('1.admin A: edita cargo da própria empresa',
  pg_temp.run($$UPDATE public.permission_presets SET name = name WHERE id = (SELECT v::uuid FROM _v WHERE k = 'presetA')$$), '^rows=1$');
SELECT pg_temp.chk('1.admin A: não muda cargo de empresa',
  pg_temp.run($$UPDATE public.permission_presets SET company_id = '6510e8af-c249-4494-86b7-ed9e24cb0d91' WHERE id = (SELECT v::uuid FROM _v WHERE k = 'presetA')$$), '^err=42501');
RESET ROLE;

-- Item 1, guarda de preset_id: service_role tentando vincular cargo de outra empresa
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
SET LOCAL ROLE service_role;
SELECT pg_temp.chk('1.service_role: preset_id de outra empresa vira NULL',
  pg_temp.val($$WITH u AS (UPDATE public.user_permissions SET preset_id = 'c44855ed-8b11-4450-834b-0df635371a0a'
     WHERE user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131' RETURNING preset_id) SELECT coalesce(preset_id::text, 'NULL') FROM u$$), '^NULL$');
INSERT INTO _t (test, ok, detail)
SELECT '1.service_role: preset_id da própria empresa é mantido', r = (SELECT v FROM _v WHERE k = 'presetA'), r
  FROM (SELECT pg_temp.val($$WITH u AS (UPDATE public.user_permissions SET preset_id = (SELECT v::uuid FROM _v WHERE k = 'presetA')
     WHERE user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131' RETURNING preset_id) SELECT coalesce(preset_id::text, 'NULL') FROM u$$) AS r) s;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Item 2: Domiflix
-- ---------------------------------------------------------------------------
SELECT pg_temp.chk('2.catálogo: nenhuma política domiflix com o papel admin do tenant',
  (SELECT count(*)::text FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND (tablename LIKE 'domiflix%' OR policyname ILIKE '%domiflix%')
      AND (coalesce(qual, '') || coalesce(with_check, '')) ~ $$'admin'::app_role$$), '^0$');
SELECT pg_temp.chk('2.RPCs de CS sem has_role admin',
  (SELECT count(*)::text FROM pg_proc
    WHERE proname IN ('cs_domiflix_usuarios', 'admin_company_learning_catalog', '_domiflix_assert_admin')
      AND pg_get_functiondef(oid) ~ $$has_role\(auth\.uid\(\), 'admin'\)$$), '^0$');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'acfce3dc-78a4-49b4-b73e-d4903c29151a', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('2.admin A: update domiflix_titles = 0', pg_temp.run($$UPDATE public.domiflix_titles SET title = title$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: update domiflix_seasons = 0', pg_temp.run($$UPDATE public.domiflix_seasons SET title = title$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: update domiflix_episodes = 0', pg_temp.run($$UPDATE public.domiflix_episodes SET title = title$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: update domiflix_sections = 0', pg_temp.run($$UPDATE public.domiflix_sections SET label = label$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: update domiflix_section_titles = 0', pg_temp.run($$UPDATE public.domiflix_section_titles SET order_index = order_index$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: update domiflix_learning_paths = 0', pg_temp.run($$UPDATE public.domiflix_learning_paths SET title = title$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: update domiflix_title_modules = 0', pg_temp.run($$UPDATE public.domiflix_title_modules SET module_code = module_code$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: update domiflix_episode_resources = 0', pg_temp.run($$UPDATE public.domiflix_episode_resources SET title = title$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: update domiflix_episode_subtitles = 0', pg_temp.run($$UPDATE public.domiflix_episode_subtitles SET label = label$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: delete domiflix_titles = 0', pg_temp.run($$DELETE FROM public.domiflix_titles$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: delete domiflix_seasons = 0', pg_temp.run($$DELETE FROM public.domiflix_seasons$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: delete domiflix_episodes = 0', pg_temp.run($$DELETE FROM public.domiflix_episodes$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: delete domiflix_sections = 0', pg_temp.run($$DELETE FROM public.domiflix_sections$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: delete domiflix_section_titles = 0', pg_temp.run($$DELETE FROM public.domiflix_section_titles$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: delete domiflix_learning_paths = 0', pg_temp.run($$DELETE FROM public.domiflix_learning_paths$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: delete domiflix_title_modules = 0', pg_temp.run($$DELETE FROM public.domiflix_title_modules$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: delete domiflix_episode_resources = 0', pg_temp.run($$DELETE FROM public.domiflix_episode_resources$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: delete domiflix_episode_subtitles = 0', pg_temp.run($$DELETE FROM public.domiflix_episode_subtitles$$), '^rows=0$');
SELECT pg_temp.chk('2.admin A: insert domiflix_sections falha',
  pg_temp.run($$INSERT INTO public.domiflix_sections (label) VALUES ('x')$$), '^err=42501');
SELECT pg_temp.chk('2.admin A: insert domiflix_titles falha',
  pg_temp.run($$INSERT INTO public.domiflix_titles (title, learning_path_id) SELECT 'x', learning_path_id FROM public.domiflix_titles LIMIT 1$$), '^err=42501|^rows=0$');
SELECT pg_temp.chk('2.admin A: insert domiflix_learning_paths falha',
  pg_temp.run($$INSERT INTO public.domiflix_learning_paths (slug, title) VALUES ('x-teste', 'x')$$), '^err=42501');
SELECT pg_temp.chk('2.admin A: não vê título em rascunho',
  pg_temp.val($$SELECT count(*)::text FROM public.domiflix_titles WHERE NOT is_active$$), '^0$');
SELECT pg_temp.chk('2.admin A: storage domiflix-videos invisível',
  pg_temp.val($$SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'domiflix-videos'$$), '^0$');
SELECT pg_temp.chk('2.admin A: upload em domiflix-learning-assets falha',
  pg_temp.run($$INSERT INTO storage.objects (bucket_id, name) VALUES ('domiflix-learning-assets', '__teste_rls__.txt')$$), '^err=42501');
SELECT pg_temp.chk('2.admin A: cs_domiflix_usuarios(B) = forbidden',
  pg_temp.run($$SELECT * FROM public.cs_domiflix_usuarios('293900d9-174a-4db9-9be1-febe5c2baa30')$$), '^err=42501: forbidden');
SELECT pg_temp.chk('2.admin A: admin_company_learning_catalog(B) = forbidden',
  pg_temp.run($$SELECT public.admin_company_learning_catalog('293900d9-174a-4db9-9be1-febe5c2baa30')$$), '^err=42501: forbidden');
SELECT pg_temp.chk('2.admin A: cs_domiflix_usuarios(A) também = forbidden (é ferramenta do painel master)',
  pg_temp.run($$SELECT * FROM public.cs_domiflix_usuarios('4d922360-70cb-4473-8b9f-10c51da4d453')$$), '^err=42501: forbidden');
SELECT pg_temp.chk('2.admin A: _domiflix_assert_admin = forbidden',
  pg_temp.run($$SELECT public._domiflix_assert_admin()$$), '^err=42501: forbidden');
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', '48cc8c05-b1f6-4c5b-99ef-c156aa54da4a', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('2.super_admin: update domiflix_titles = 1',
  pg_temp.run($$UPDATE public.domiflix_titles SET title = title WHERE id = (SELECT v::uuid FROM _v WHERE k = 'title')$$), '^rows=1$');
SELECT pg_temp.chk('2.super_admin: vê o rascunho',
  pg_temp.val($$SELECT count(*)::text FROM public.domiflix_titles WHERE id = (SELECT v::uuid FROM _v WHERE k = 'draft_title')$$), '^1$');
SELECT pg_temp.chk('2.super_admin: cs_domiflix_usuarios(B) funciona',
  pg_temp.run($$SELECT * FROM public.cs_domiflix_usuarios('293900d9-174a-4db9-9be1-febe5c2baa30')$$), '^rows=');
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('2.comum: insere na própria minha lista',
  pg_temp.run($$INSERT INTO public.domiflix_watchlist (user_id, title_id) VALUES (auth.uid(), (SELECT v::uuid FROM _v WHERE k = 'title'))$$), '^rows=1$');
SELECT pg_temp.chk('2.comum: não insere na lista de outro usuário',
  pg_temp.run($$INSERT INTO public.domiflix_watchlist (user_id, title_id) VALUES ('acfce3dc-78a4-49b4-b73e-d4903c29151a', (SELECT v::uuid FROM _v WHERE k = 'title'))$$), '^err=42501');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Item 3: employees (fase A)
-- ---------------------------------------------------------------------------
SELECT pg_temp.chk('3.políticas: 1 SELECT, 1 INSERT, 1 UPDATE, 1 DELETE, nenhuma ALL',
  (SELECT string_agg(cmd, ',' ORDER BY cmd) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employees'),
  '^DELETE,INSERT,SELECT,UPDATE$');
SELECT pg_temp.chk('3.concessão: os 4 usuários agora gerenciam funcionários',
  (SELECT count(*)::text FROM unnest(ARRAY['a9a4c5de-b61e-416d-86cd-69721bb4d1b3','f1d0c69c-eb5d-4e6c-849e-0b9cd001a9f4',
     '688d4296-49d0-40f4-9784-9820b3279ba2','d1a60085-e21e-4a12-b2ff-dbaead993e6e']::uuid[]) u WHERE public.can_manage_employees(u)), '^4$');
SELECT pg_temp.chk('3.helper sem fallback legado: técnico comum não gerencia',
  (SELECT public.can_manage_employees('dcc4ca84-3152-4acb-8878-fd0ebf6c7131')::text), '^false$');
SELECT pg_temp.chk('3.helper: EXECUTE só authenticated/service_role',
  (SELECT has_function_privilege('anon', 'public.can_manage_employees(uuid)', 'EXECUTE')::text
       || has_function_privilege('authenticated', 'public.can_manage_employees(uuid)', 'EXECUTE')::text), '^falsetrue$');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('3.comum A: update salário na própria empresa = 0',
  pg_temp.run($$UPDATE public.employees SET salary = salary WHERE company_id = '4d922360-70cb-4473-8b9f-10c51da4d453'$$), '^rows=0$');
SELECT pg_temp.chk('3.comum A: delete na própria empresa = 0',
  pg_temp.run($$DELETE FROM public.employees WHERE company_id = '4d922360-70cb-4473-8b9f-10c51da4d453'$$), '^rows=0$');
SELECT pg_temp.chk('3.comum A: insert falha',
  pg_temp.run($$INSERT INTO public.employees (name) VALUES ('x')$$), '^err=42501');
SELECT pg_temp.chk('3.comum A: update em outra empresa = 0',
  pg_temp.run($$UPDATE public.employees SET salary = salary WHERE company_id = '293900d9-174a-4db9-9be1-febe5c2baa30'$$), '^rows=0$');
SELECT pg_temp.chk('3.comum A: leitura da própria empresa preservada',
  pg_temp.val($$SELECT (count(*) > 0)::text FROM public.employees WHERE company_id = '4d922360-70cb-4473-8b9f-10c51da4d453'$$), '^true$');
SELECT pg_temp.chk('3.comum A: arquivar continua negado',
  pg_temp.run($$SELECT public.archive_employee((SELECT v::uuid FROM _v WHERE k = 'empA'))$$), '^err=42501');
SELECT pg_temp.chk('3.comum A: RPC DEFINER generate_ponto_slug segue funcionando (gatilho não barra)',
  pg_temp.run($$SELECT public.generate_ponto_slug((SELECT v::uuid FROM _v WHERE k = 'empA'))$$), '^rows=1$');
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', '62d570d3-9045-4bd2-a5a4-e5fad2177213', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('3.só fn:manage_users (KGIE): update user_id afeta linhas',
  pg_temp.run($$UPDATE public.employees SET user_id = user_id$$), '^rows=[1-9]');
SELECT pg_temp.chk('3.só fn:manage_users (KGIE): update photo_url/email afeta linhas',
  pg_temp.run($$UPDATE public.employees SET photo_url = photo_url, email = email$$), '^rows=[1-9]');
SELECT pg_temp.chk('3.só fn:manage_users (KGIE): update salário = 42501',
  pg_temp.run($$UPDATE public.employees SET salary = coalesce(salary, 0) + 1$$), '^err=42501: Sem permissão para alterar dados de RH');
SELECT pg_temp.chk('3.só fn:manage_users (KGIE): update monthly_cost = 42501',
  pg_temp.run($$UPDATE public.employees SET monthly_cost = coalesce(monthly_cost, 0) + 1$$), '^err=42501');
SELECT pg_temp.chk('3.só fn:manage_users (KGIE): insert falha',
  pg_temp.run($$INSERT INTO public.employees (name) VALUES ('x')$$), '^err=42501');
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', 'acfce3dc-78a4-49b4-b73e-d4903c29151a', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('3.admin A: update salário na própria empresa afeta N',
  pg_temp.run($$UPDATE public.employees SET salary = salary WHERE company_id = '4d922360-70cb-4473-8b9f-10c51da4d453'$$), '^rows=[1-9]');
SELECT pg_temp.chk('3.admin A: mudar funcionário para empresa B = erro',
  pg_temp.run($$UPDATE public.employees SET company_id = '293900d9-174a-4db9-9be1-febe5c2baa30' WHERE id = (SELECT v::uuid FROM _v WHERE k = 'empA')$$), '^err=42501');
SELECT pg_temp.chk('3.admin A: insert grava na própria empresa',
  pg_temp.val($$WITH i AS (INSERT INTO public.employees (name) VALUES ('__teste_rls__') RETURNING company_id) SELECT company_id::text FROM i$$),
  '^4d922360-70cb-4473-8b9f-10c51da4d453$');
SELECT pg_temp.chk('3.admin A: update em empresa B = 0',
  pg_temp.run($$UPDATE public.employees SET salary = salary WHERE company_id = '293900d9-174a-4db9-9be1-febe5c2baa30'$$), '^rows=0$');
SELECT pg_temp.chk('3.admin A: arquivar funcionário da própria empresa',
  pg_temp.val($$SELECT public.archive_employee((SELECT v::uuid FROM _v WHERE k = 'empA'))::text$$), '^true$');
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', '48cc8c05-b1f6-4c5b-99ef-c156aa54da4a', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('3.super_admin: lê todos os funcionários',
  pg_temp.val($$SELECT (count(*) = (SELECT v::bigint FROM _v WHERE k = 'emp_total'))::text FROM public.employees$$), '^true$');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Item 5: profiles x gestão de usuários
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('sub', 'acfce3dc-78a4-49b4-b73e-d4903c29151a', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('5.gestor A: edita nome dos colegas',
  pg_temp.run($$UPDATE public.profiles SET full_name = full_name WHERE company_id = '4d922360-70cb-4473-8b9f-10c51da4d453' AND user_id <> auth.uid()$$), '^rows=[1-9]');
SELECT pg_temp.chk('5.gestor A: edita nome/telefone/foto de um colega',
  pg_temp.run($$UPDATE public.profiles SET full_name = full_name || ' x', phone = '11999990000', avatar_url = 'https://x/y.png' WHERE user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131'$$), '^rows=1$');
SELECT pg_temp.chk('5.gestor A: company_id = null em colega = erro',
  pg_temp.run($$UPDATE public.profiles SET company_id = NULL WHERE user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131'$$), '^err=');
SELECT pg_temp.chk('5.gestor A: is_active = false em colega = erro (guard atual)',
  pg_temp.run($$UPDATE public.profiles SET is_active = false WHERE user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131'$$), '^err=');
SELECT pg_temp.chk('5.gestor A: email de colega = erro',
  pg_temp.run($$UPDATE public.profiles SET email = 'x@y.com' WHERE user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131'$$), '^err=42501');
SELECT pg_temp.chk('5.gestor A: navigation_style de colega = erro',
  pg_temp.run($$UPDATE public.profiles SET navigation_style = CASE WHEN navigation_style = 'topbar' THEN 'sidebar' ELSE 'topbar' END WHERE user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131'$$), '^err=42501');
SELECT pg_temp.chk('5.gestor A: terms_accepted_at de colega = erro',
  pg_temp.run($$UPDATE public.profiles SET terms_accepted_at = now() WHERE user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131'$$), '^err=42501');
SELECT pg_temp.chk('5.gestor A: perfis da empresa B = 0',
  pg_temp.run($$UPDATE public.profiles SET full_name = full_name WHERE company_id = '293900d9-174a-4db9-9be1-febe5c2baa30'$$), '^rows=0$');
SELECT pg_temp.chk('5.gestor A: não lê perfis da empresa B',
  pg_temp.val($$SELECT count(*)::text FROM public.profiles WHERE company_id = '293900d9-174a-4db9-9be1-febe5c2baa30'$$), '^0$');
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('5.comum A: perfis alheios = 0',
  pg_temp.run($$UPDATE public.profiles SET full_name = full_name WHERE user_id <> auth.uid()$$), '^rows=0$');
SELECT pg_temp.chk('5.comum A: próprio perfil = 1',
  pg_temp.run($$UPDATE public.profiles SET full_name = full_name, phone = phone WHERE user_id = auth.uid()$$), '^rows=1$');
SELECT pg_temp.chk('5.comum A: própria preferência de navegação = 1',
  pg_temp.run($$UPDATE public.profiles SET navigation_style = CASE WHEN navigation_style = 'topbar' THEN 'sidebar' ELSE 'topbar' END WHERE user_id = auth.uid()$$), '^rows=1$');
SELECT pg_temp.chk('5.comum A: pedido de exclusão (LGPD) = 1',
  pg_temp.run($$UPDATE public.profiles SET deletion_requested_at = now() WHERE user_id = auth.uid()$$), '^rows=1$');
SELECT pg_temp.chk('5.comum A: aceite de termos pela RPC',
  pg_temp.run($$SELECT public.accept_terms_of_service('1.0')$$), '^rows=1$');
SELECT pg_temp.chk('5.comum A: próprio email = erro',
  pg_temp.run($$UPDATE public.profiles SET email = 'x@y.com' WHERE user_id = auth.uid()$$), '^err=42501');
SELECT pg_temp.chk('5.comum A: própria empresa = erro',
  pg_temp.run($$UPDATE public.profiles SET company_id = '293900d9-174a-4db9-9be1-febe5c2baa30' WHERE user_id = auth.uid()$$), '^err=42501');
SELECT pg_temp.chk('5.comum A: não altera cargo de colega (user_permissions)',
  pg_temp.run($$UPDATE public.user_permissions SET permissions = permissions WHERE user_id <> auth.uid()$$), '^rows=0$');
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', 'f1d0c69c-eb5d-4e6c-849e-0b9cd001a9f4', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('5.só fn:manage_settings (CLIMATIZE): perfis alheios = 0',
  pg_temp.run($$UPDATE public.profiles SET full_name = full_name WHERE user_id <> auth.uid()$$), '^rows=0$');
SELECT pg_temp.chk('5.só fn:manage_settings (CLIMATIZE): continua lendo a empresa',
  pg_temp.val($$SELECT (count(*) = (SELECT v::bigint FROM _v WHERE k = 'profs_climatize'))::text FROM public.profiles$$), '^true$');
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', '62d570d3-9045-4bd2-a5a4-e5fad2177213', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('5.só fn:manage_users (KGIE): lê a empresa toda',
  pg_temp.val($$SELECT (count(*) = (SELECT v::bigint FROM _v WHERE k = 'profs_kgie'))::text FROM public.profiles$$), '^true$');
SELECT pg_temp.chk('5.só fn:manage_users (KGIE): edita nome de colega',
  pg_temp.run($$UPDATE public.profiles SET full_name = full_name WHERE user_id <> auth.uid()$$), '^rows=[1-9]');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Item 6: guarda de company_id em profiles
-- ---------------------------------------------------------------------------
SELECT pg_temp.chk('6.gatilho guard_profiles_identity existe',
  (SELECT count(*)::text FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'guard_profiles_identity' AND NOT tgisinternal), '^1$');

SELECT set_config('request.jwt.claims', json_build_object('sub', '48cc8c05-b1f6-4c5b-99ef-c156aa54da4a', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('6.super_admin: mover usuário de A para B = erro',
  pg_temp.run($$UPDATE public.profiles SET company_id = '293900d9-174a-4db9-9be1-febe5c2baa30' WHERE user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131'$$), '^err=42501: A empresa do usuário');
SELECT pg_temp.chk('6.super_admin: órfão NULL -> A = erro',
  pg_temp.run($$UPDATE public.profiles SET company_id = '4d922360-70cb-4473-8b9f-10c51da4d453' WHERE user_id = '00dd6d2b-173e-4e80-b026-50aa39f0fc3d'$$), '^err=42501: A empresa do usuário');
SELECT pg_temp.chk('6.super_admin: segue editando nome de qualquer perfil',
  pg_temp.run($$UPDATE public.profiles SET full_name = full_name WHERE user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131'$$), '^rows=1$');
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
SET LOCAL ROLE service_role;
SELECT pg_temp.chk('6.service_role: órfão NULL -> A = 1 (create-user / create-company / self-register)',
  pg_temp.run($$UPDATE public.profiles SET company_id = '4d922360-70cb-4473-8b9f-10c51da4d453', full_name = full_name WHERE user_id = '00dd6d2b-173e-4e80-b026-50aa39f0fc3d'$$), '^rows=1$');
SELECT pg_temp.chk('6.service_role: retry com a mesma empresa = 1',
  pg_temp.run($$UPDATE public.profiles SET company_id = company_id, full_name = full_name WHERE user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131'$$), '^rows=1$');
SELECT pg_temp.chk('6.service_role: A -> B = erro',
  pg_temp.run($$UPDATE public.profiles SET company_id = '293900d9-174a-4db9-9be1-febe5c2baa30' WHERE company_id = '4d922360-70cb-4473-8b9f-10c51da4d453' AND user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131'$$), '^err=42501');
SELECT pg_temp.chk('6.service_role: A -> NULL = erro',
  pg_temp.run($$UPDATE public.profiles SET company_id = NULL WHERE user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131'$$), '^err=42501');
SELECT pg_temp.chk('6.service_role: desativar usuário (manage-user) segue funcionando',
  pg_temp.run($$UPDATE public.profiles SET is_active = false WHERE user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131'$$), '^rows=1$');
RESET ROLE;

SELECT set_config('request.jwt.claims', '', true);
SELECT pg_temp.chk('6.sem JWT (manutenção): A -> B passa',
  pg_temp.run($$UPDATE public.profiles SET company_id = '293900d9-174a-4db9-9be1-febe5c2baa30' WHERE user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131'$$), '^rows=1$');
SELECT pg_temp.chk('6.sem JWT (sync de e-mail do Auth): email passa',
  pg_temp.run($$UPDATE public.profiles SET email = email || '.x' WHERE user_id = 'dcc4ca84-3152-4acb-8878-fd0ebf6c7131'$$), '^rows=1$');

-- ---------------------------------------------------------------------------
-- Item 4: blog_post_likes (por último: este bloco mantém estado até o ROLLBACK)
-- ---------------------------------------------------------------------------
SELECT pg_temp.chk('4.políticas: só service_role',
  (SELECT string_agg(policyname, ',') FROM pg_policies WHERE schemaname = 'public' AND tablename = 'blog_post_likes'),
  '^service_role_full_access_blog_post_likes$');
SELECT pg_temp.chk('4.grants: nenhum para anon/authenticated',
  (SELECT count(*)::text FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'blog_post_likes' AND grantee IN ('anon', 'authenticated')), '^0$');

SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
SET LOCAL ROLE anon;
SELECT pg_temp.chk('4.anon: select na tabela = sem permissão',
  pg_temp.run($$SELECT count(*) FROM public.blog_post_likes$$), '^err=42501');
SELECT pg_temp.chk('4.anon: delete na tabela = sem permissão',
  pg_temp.run($$DELETE FROM public.blog_post_likes$$), '^err=42501');
SELECT pg_temp.chk('4.anon: insert na tabela = sem permissão',
  pg_temp.run($$INSERT INTO public.blog_post_likes (post_id, session_id) VALUES ((SELECT v::uuid FROM _v WHERE k = 'post_pub'), 'x')$$), '^err=42501');
SELECT pg_temp.chk('4.anon: toggle A curte',
  pg_temp.val($$SELECT public.toggle_blog_post_like((SELECT v::uuid FROM _v WHERE k = 'post_pub'), '11111111-1111-4111-8111-111111111111')::text$$, true),
  '"liked": true');
SELECT pg_temp.chk('4.anon: toggle B curte (contador +2 no total)',
  pg_temp.val($$SELECT public.toggle_blog_post_like((SELECT v::uuid FROM _v WHERE k = 'post_pub'), '22222222-2222-4222-8222-222222222222')::text$$, true),
  '"liked": true');
SELECT pg_temp.chk('4.anon: toggle B de novo remove só a de B',
  pg_temp.val($$SELECT public.toggle_blog_post_like((SELECT v::uuid FROM _v WHERE k = 'post_pub'), '22222222-2222-4222-8222-222222222222')::text$$, true),
  '"liked": false');
SELECT pg_temp.chk('4.anon: get_blog_post_like(A) continua true',
  pg_temp.val($$SELECT public.get_blog_post_like((SELECT v::uuid FROM _v WHERE k = 'post_pub'), '11111111-1111-4111-8111-111111111111')::text$$), '^true$');
SELECT pg_temp.chk('4.anon: get_blog_post_like(B) = false',
  pg_temp.val($$SELECT public.get_blog_post_like((SELECT v::uuid FROM _v WHERE k = 'post_pub'), '22222222-2222-4222-8222-222222222222')::text$$), '^false$');
SELECT pg_temp.chk('4.anon: toggle em post rascunho = erro',
  pg_temp.run($$SELECT public.toggle_blog_post_like((SELECT v::uuid FROM _v WHERE k = 'post_draft'), '11111111-1111-4111-8111-111111111111')$$), '^err=P0002');
SELECT pg_temp.chk('4.anon: session_id que não é uuid = erro de tipo',
  pg_temp.run($$SELECT public.toggle_blog_post_like((SELECT v::uuid FROM _v WHERE k = 'post_pub'), 'lixo')$$), '^err=22P02');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
SELECT pg_temp.chk('4.contador: likes_count = original + 1 (A ficou, B saiu)',
  (SELECT (coalesce(likes_count, 0) = (SELECT v::int FROM _v WHERE k = 'likes_before') + 1)::text
     FROM public.blog_posts WHERE id = (SELECT v::uuid FROM _v WHERE k = 'post_pub')), '^true$');
SELECT pg_temp.chk('4.dados: só a curtida de A ficou no post',
  (SELECT string_agg(session_id, ',') FROM public.blog_post_likes WHERE post_id = (SELECT v::uuid FROM _v WHERE k = 'post_pub')),
  '^11111111-1111-4111-8111-111111111111$');

-- ---------------------------------------------------------------------------
SELECT n, test, ok, detail FROM _t ORDER BY n;
ROLLBACK;
