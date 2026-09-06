-- Fecha `anon` no Guia Técnico: nem SELECT na tabela, nem EXECUTE na RPC.
--
-- POR QUE ESTA MIGRATION EXISTE (correção de premissa minha, não de bug):
-- as migrations 20260905210000 e 20260905210100 abriram leitura pra `anon`
-- apoiadas em "a página /guia-tecnico é pública, então o visitante deslogado
-- precisa buscar no banco". A premissa é FALSA, e foi verificada na origem
-- (EcoSistema, worktree nashville), que é de onde a página vem:
--
--   * `grep -c buscar_guia public/guia-tecnico/index.html` -> 0. O HTML gerado
--     não cita a RPC em lugar nenhum.
--   * a ÚNICA referência a Supabase no HTML inteiro é a URL do Storage do PDF.
--   * `scripts/montar-guia-web.mjs` não tem createClient, não tem fetch pra
--     /rest/v1, não fala com o banco. A busca da página é CLIENT-SIDE, sobre um
--     índice que o próprio montador embute no HTML.
--   * o único consumidor real da RPC é a edge `cato-assist`, e ela chama por
--     `admin.rpc("buscar_guia", ...)` onde
--     `admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`
--     (supabase/functions/_shared/cato/access.ts:68). Ou seja: service_role.
--   * na Dominex hoje não existe chamador nenhum — nem front, nem edge.
--
-- Logo: `guia_chunks` e `buscar_guia` servem ao agente de WhatsApp e a um
-- assistente futuro, que rodam server-side (service_role) ou como usuário
-- logado. Ninguém precisa de `anon`.
--
-- E deixar aberto NÃO é neutro: a chave publicável viaja no bundle do cliente,
-- então GRANT EXECUTE a `anon` transformaria a `buscar_guia` numa superfície de
-- computação que qualquer pessoa na internet aciona — full-text sobre GIN, com
-- parsing de termos e uma contagem por termo pra calcular IDF a cada chamada.
-- Barato por chamada, mas é custo que não compra nada. A regra do repositório é
-- a inversa: RPC SECURITY DEFINER nova nasce fechada pra anon/authenticated e
-- só ganha grant quando existe chamador real.
--
-- GATILHO DA VOLTA (o inverso da trava que ficou em 20260905210100):
--   Se e quando a página pública, ou o app deslogado, passar a chamar a busca
--   pelo banco, o GRANT a `anon` volta — NO MESMO COMMIT que introduzir o
--   chamador, nunca antes e nunca "por precaução". Junto com a outra regra já
--   escrita (se a função passar a ler tabela com company_id, o grant a anon
--   cai), as duas fecham o cerco nos dois sentidos.
--
-- O que NÃO muda: tudo que foi apertado continua igual — REVOKE ALL antes dos
-- grants nominais, service_role com ALL, os dois wrappers immutable_unaccent,
-- search_path = '' neles, extensão unaccent em `extensions`, e todas as
-- constantes de ranqueamento (c_max_termos, c_max_candidatos, c_min_termos,
-- c_df_generico) e pesos da RPC.

-- ---------------------------------------------------------------------------
-- 1. RPC: anon perde EXECUTE
-- ---------------------------------------------------------------------------
-- authenticated e service_role ficam. PUBLIC continua sem nada (o default
-- privilege do schema public já foi revogado em 20260905210100 — e é por isso
-- que revogar de PUBLIC sozinho nunca bastou pra fechar anon: são grants
-- separados).
REVOKE EXECUTE ON FUNCTION public.buscar_guia(text, integer, text[], text) FROM anon;

-- ---------------------------------------------------------------------------
-- 2. Tabela: anon perde SELECT
-- ---------------------------------------------------------------------------
-- REVOKE ALL e não só SELECT: anon não tinha escrita (já revogada), mas o ALL
-- deixa a intenção explícita e é idempotente.
REVOKE ALL ON public.guia_chunks FROM anon;

-- ---------------------------------------------------------------------------
-- 3. Policy: renomeada, porque "Anyone" passou a mentir
-- ---------------------------------------------------------------------------
-- Nome de policy que mente já custou caro neste repositório (policy chamada
-- "Managers can delete" que não checava gestor). Se a policy vale só pra
-- authenticated, o nome diz authenticated.
DROP POLICY IF EXISTS "Anyone can read guia_chunks" ON public.guia_chunks;
DROP POLICY IF EXISTS "Authenticated users can read guia_chunks" ON public.guia_chunks;
DROP POLICY IF EXISTS "authenticated_read_guia_chunks" ON public.guia_chunks;
CREATE POLICY "authenticated_read_guia_chunks"
  ON public.guia_chunks FOR SELECT TO authenticated
  USING (true);

-- service_role_full_access_guia_chunks fica intacta (FOR ALL, service_role).
-- Nenhuma das duas chama função de auth, então não há nada pra embrulhar em
-- (SELECT ...) — a regra de InitPlan do repositório não se aplica aqui.

-- ---------------------------------------------------------------------------
-- 4. Comentários: os antigos diziam "leitura liberada a anon"
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.guia_chunks IS
  'Guia Técnico da Dominex quebrado em chunks pesquisáveis (RAG). Documentação de produto: sem company_id. Leitura só para authenticated; escrita só service_role, revogada por GRANT além da RLS. anon NÃO tem acesso: a página /guia-tecnico busca client-side, no índice embutido no HTML, e não fala com o banco.';

COMMENT ON FUNCTION public.buscar_guia(text, integer, text[], text) IS
  'Busca no Guia Técnico (public.guia_chunks) por texto livre, do jeito que o cliente escreve. Limpa muleta de conversa (inclusive verbo de consulta: veja/vejo/olhar/checar; "ver" fica de fora de propósito, é nome de botão), escolhe os 12 termos mais raros do corpus (IDF na mão, porque ts_rank_cd não tem) descartando termo genérico (df >= 30% do guia, com piso de 4 termos), junta AND e OR no mesmo ranking e dá bônus pra problema/faq e sobreposição com chaves. Determinística: mesma consulta, mesmo resultado. Documentação de produto: sem company_id. EXECUTE só para authenticated e service_role — o consumidor real (agente de WhatsApp / assistente) roda server-side com service_role.';
