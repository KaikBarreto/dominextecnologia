-- ============================================================================
-- Notas destinadas (NF-e / NFS-e recebidas) — PARTE 1/3: opt-in e cursor
-- ============================================================================
-- Plano: docs/planos/2026-09-24-notas-destinadas-e-config-fiscal.md (Frente C).
--
-- ESTA MIGRATION NÃO LIGA NADA PRA NINGUÉM. Ela só cria o interruptor (desligado)
-- e a mesa onde o estado da fila do governo vai morar. As tabelas de nota vêm
-- nas partes 2 e 3.
--
-- POR QUE O CURSOR MORA EM TABELA (decisão D1 do plano)
--   No EcoSistema o worker `ecosistema-dfe` roda na VPS COM service_role em disco
--   e guarda o ponteiro num volume Docker (`app/estado_local.py`). O dominex-fiscal
--   foi desenhado com a propriedade oposta e explícita: a VPS nunca fala com a
--   Supabase e nunca guarda acervo (ver cabeçalho de
--   supabase/functions/_shared/nfse-provider.ts). Portar o volume local junto
--   colocaria service_role + KEK na mesma máquina e mataria essa garantia.
--   Logo: quem orquestra é edge com cron, e o estado da fila mora AQUI.
--
-- POR QUE UMA TABELA PRÓPRIA, E NÃO COLUNAS EM company_fiscal_settings
--   `company_fiscal_settings` é editável pelo cliente (policy de UPDATE com
--   can_manage_system). Se o ponteiro de NSU morasse lá, um gestor conseguiria
--   REGREDIR o cursor pelo próprio app — e regredir na fila é exatamente o que
--   dispara a rejeição 656 (Consumo Indevido) da SEFAZ, que faz nota destinada se
--   perder. `dfe_sync_state` nasce sem policy de escrita pro tenant: authenticated
--   só LÊ (pra tela mostrar "última sincronização"), service_role escreve.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Opt-in por empresa — NASCE DESLIGADO, os dois separados
-- ---------------------------------------------------------------------------
-- NF-e e NFS-e recebidas ligam INDEPENDENTEMENTE: são dois webservices, dois
-- credenciamentos e dois riscos operacionais distintos (NF-e tem manifestação do
-- destinatário e rejeição 656 da SEFAZ; NFS-e não tem manifestação e é servida
-- pelo Ambiente de Dados Nacional). A MECÂNICA de fila, essa, é a mesma nos
-- dois: cursor de NSU. Ver o bloco da seção 2.
--
-- ATENÇÃO AO NOME JÁ OCUPADO: `company_fiscal_settings.pode_emitir` é EMISSÃO.
-- Recebimento ganha família própria, prefixo `dfe_`. Reaproveitar `pode_emitir`
-- ligaria consulta ao governo em quem só pediu pra emitir nota.
ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS dfe_nfe_ativo       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dfe_nfe_ativado_em  timestamptz,
  ADD COLUMN IF NOT EXISTS dfe_nfse_ativo      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dfe_nfse_ativado_em timestamptz;

COMMENT ON COLUMN public.company_fiscal_settings.dfe_nfe_ativo IS
  'Opt-in de RECEBER NF-e destinada (Distribuicao DF-e da SEFAZ, mTLS direto pela VPS). Nasce false: nenhuma chamada ao governo sem o cliente ligar. NAO confundir com pode_emitir, que e EMISSAO.';
COMMENT ON COLUMN public.company_fiscal_settings.dfe_nfe_ativado_em IS
  'Quando o cliente ligou dfe_nfe_ativo. Serve de marco de consentimento e de corte pra backfill (nota anterior a este instante e historico, nao entrega nova).';
COMMENT ON COLUMN public.company_fiscal_settings.dfe_nfse_ativo IS
  'Opt-in de RECEBER NFS-e tomada (distribuicao do Ambiente de Dados Nacional). Nasce false. Independente de dfe_nfe_ativo: sao webservices e credenciamentos diferentes.';
COMMENT ON COLUMN public.company_fiscal_settings.dfe_nfse_ativado_em IS
  'Quando o cliente ligou dfe_nfse_ativo.';

-- O carimbo de consentimento não pode depender de o front lembrar de mandá-lo:
-- ele é a prova de "o cliente autorizou às tantas horas" numa consulta a órgão
-- público. Gatilho, não validação de formulário.
CREATE OR REPLACE FUNCTION public.stamp_dfe_optin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  -- IF/ELSE explícito em vez de "TG_OP = 'INSERT' OR NOT OLD.x": o OR do
  -- Postgres NÃO garante curto-circuito, então a segunda perna poderia tocar
  -- OLD num INSERT e estourar "record OLD is not assigned yet".
  IF TG_OP = 'INSERT' THEN
    IF NEW.dfe_nfe_ativo THEN
      NEW.dfe_nfe_ativado_em := COALESCE(NEW.dfe_nfe_ativado_em, now());
    END IF;
    IF NEW.dfe_nfse_ativo THEN
      NEW.dfe_nfse_ativado_em := COALESCE(NEW.dfe_nfse_ativado_em, now());
    END IF;
  ELSE
    IF NEW.dfe_nfe_ativo AND NOT OLD.dfe_nfe_ativo THEN
      NEW.dfe_nfe_ativado_em := COALESCE(NEW.dfe_nfe_ativado_em, now());
    END IF;
    IF NEW.dfe_nfse_ativo AND NOT OLD.dfe_nfse_ativo THEN
      NEW.dfe_nfse_ativado_em := COALESCE(NEW.dfe_nfse_ativado_em, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.stamp_dfe_optin() IS
  'Carimba dfe_nfe_ativado_em / dfe_nfse_ativado_em na virada false->true do opt-in de notas destinadas. Existe pra que "quando o cliente autorizou a consulta ao governo" nunca dependa do front mandar o campo. Desligar NAO apaga o carimbo (historico).';

DROP TRIGGER IF EXISTS trg_stamp_dfe_optin ON public.company_fiscal_settings;
CREATE TRIGGER trg_stamp_dfe_optin
  BEFORE INSERT OR UPDATE OF dfe_nfe_ativo, dfe_nfse_ativo ON public.company_fiscal_settings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_dfe_optin();

-- ---------------------------------------------------------------------------
-- 2) dfe_sync_state — cursor da fila + trava anti-656, por empresa e por tipo
-- ---------------------------------------------------------------------------
-- Uma linha por (empresa, tipo de documento). Os dois tipos compartilham a
-- tabela porque compartilham a mecânica — e compartilham MAIS do que parecia:
--   * 'nfe'  -> ponteiro de NSU (a SEFAZ serve a fila por CNPJ, sequencial);
--   * 'nfse' -> ponteiro de NSU TAMBÉM (o Ambiente de Dados Nacional serve a
--               distribuição pelo MESMO desenho de fila sequencial por NSU).
--
-- ⚠️ NÃO existe consulta por período/janela no ADN. Quem expõe "data inicial /
-- data final" é WRAPPER de terceiro (o caminho do EcoSistema, via PlugNotas) —
-- o wrapper varre a fila por dentro e devolve o recorte de datas. O governo
-- direto, não. Por isso `janela_fim` não é cursor de ninguém (ver o COMMENT
-- dela) e `ultimo_nsu` vale para os DOIS tipos.
CREATE TABLE IF NOT EXISTS public.dfe_sync_state (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo                  text NOT NULL,

  -- cursor da fila (NF-e)
  ultimo_nsu            text,
  max_nsu               text,
  -- cursor de janela (NFS-e)
  janela_fim            timestamptz,

  -- trava anti-656 / anti-martelo
  ultima_consulta_em    timestamptz,
  proxima_consulta_em   timestamptz NOT NULL DEFAULT now(),
  ciclos_sem_documento  integer NOT NULL DEFAULT 0,

  -- diagnóstico do último ciclo
  ultimo_cstat          text,
  ultimo_erro           text,
  ultimo_erro_em        timestamptz,
  documentos_ultimo_lote integer,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dfe_sync_state_tipo_check
    CHECK (tipo IN ('nfe', 'nfse')),
  -- NSU da SEFAZ é sempre 15 dígitos com zeros à esquerda. Guardar como text
  -- preserva o formato do protocolo; a CHECK impede que alguém grave '675' cru
  -- e quebre qualquer comparação lexicográfica futura.
  CONSTRAINT dfe_sync_state_ultimo_nsu_check
    CHECK (ultimo_nsu IS NULL OR ultimo_nsu ~ '^[0-9]{15}$'),
  CONSTRAINT dfe_sync_state_max_nsu_check
    CHECK (max_nsu IS NULL OR max_nsu ~ '^[0-9]{15}$'),
  CONSTRAINT dfe_sync_state_ciclos_check
    CHECK (ciclos_sem_documento >= 0),
  -- Alvo do upsert do cron: uma linha por empresa e tipo, sempre.
  CONSTRAINT dfe_sync_state_company_tipo_uniq UNIQUE (company_id, tipo)
);

COMMENT ON TABLE public.dfe_sync_state IS
  'Estado da fila de distribuicao de documentos fiscais destinados, por empresa e por tipo (nfe|nfse). Guarda o cursor de NSU (os DOIS tipos usam NSU: SEFAZ e Ambiente de Dados Nacional servem a fila pelo mesmo desenho sequencial), a trava anti-consumo-indevido (proxima_consulta_em) e o ultimo erro. Substitui o volume Docker que o worker do EcoSistema usa: aqui a VPS nao tem banco (decisao D1). Tenant so LE; quem escreve e service_role.';

COMMENT ON COLUMN public.dfe_sync_state.tipo IS
  'Qual fila esta linha descreve: ''nfe'' (Distribuicao DF-e da SEFAZ) ou ''nfse'' (distribuicao do Ambiente de Dados Nacional). O CURSOR E NSU NOS DOIS — muda o webservice, nao a mecanica.';
COMMENT ON COLUMN public.dfe_sync_state.ultimo_nsu IS
  'Ponteiro da fila (15 digitos, zeros a esquerda), VALIDO NOS DOIS TIPOS. SO AVANCA — o trigger dfe_sync_state_nsu_nao_regride recusa gravar valor menor, e isso protege nfe E nfse. Em ''nfe'' regredir dispara a rejeicao 656 da SEFAZ (1h de bloqueio do CNPJ). Em ''nfse'' nao ha 656, mas regredir faz reler o feed inteiro desde o inicio, o que leva a HTTP 429 (consumo indevido) no ADN e ao mesmo desfecho pratico: o cliente para de receber nota. NULL so enquanto a empresa nunca sincronizou.';
COMMENT ON COLUMN public.dfe_sync_state.max_nsu IS
  'SO TEM VALOR EM tipo=''nfe''. Ultimo NSU que a SEFAZ declarou existir pra este CNPJ (maxNSU da resposta); comparado com ultimo_nsu diz o quanto ainda falta ler. O ADN NAO devolve esse numero — em tipo=''nfse'' fica NULL para sempre, e por isso a tela nao consegue (nem deve tentar) dizer "faltam N notas" pra NFS-e: o unico sinal de fim de fila la e filaDrenada.';
COMMENT ON COLUMN public.dfe_sync_state.janela_fim IS
  'SEM USO NO FLUXO AUTOMATICO — nao e cursor de ninguem. Nasceu da premissa ERRADA de que a NFS-e recebida seria consultada por janela de periodo (31 dias); isso e comportamento de WRAPPER de terceiro, nao do governo: o ADN serve a fila por NSU, igual a SEFAZ. Fica na tabela, sempre NULL na ingestao automatica, reservada pra ingestao MANUAL/municipal fora do Ambiente Nacional (onde o cliente informa um periodo e nao existe NSU). Coluna lida pelo front (useInboundNotes) — derrubar exige mexer no hook.';
COMMENT ON COLUMN public.dfe_sync_state.proxima_consulta_em IS
  'TRAVA ANTI-CONSUMO-INDEVIDO. Instante a partir do qual uma nova consulta e permitida. O cron NAO chama o governo antes disso, nem que o usuario aperte o botao. Vale nos dois tipos: em ''nfe'' o gatilho e o cStat 656 da SEFAZ; em ''nfse'' e o HTTP 429 do ADN. Retorno vazio ou bloqueado empurra este campo pra frente (>= 1h) em vez de tentar de novo.';
COMMENT ON COLUMN public.dfe_sync_state.ciclos_sem_documento IS
  'Quantos ciclos seguidos voltaram sem documento novo. Usado pra alargar progressivamente a espera (backoff) em vez de martelar o webservice.';
COMMENT ON COLUMN public.dfe_sync_state.ultimo_cstat IS
  'cStat cru do ultimo retorno (ex.: 138 documento localizado, 137 nenhum documento, 656 consumo indevido). Diagnostico — a regra de negocio le proxima_consulta_em.';
COMMENT ON COLUMN public.dfe_sync_state.ultimo_erro IS
  'Ultima falha do ciclo, ja sanitizada (nunca conteudo de certificado). Limpa quando um ciclo da certo.';
COMMENT ON COLUMN public.dfe_sync_state.documentos_ultimo_lote IS
  'Quantos documentos o GOVERNO entregou no ultimo lote — nao quantos foram gravados. Em tipo=''nfse'' isso inclui as notas EMITIDAS pela propria empresa, que o feed do ADN mistura com as recebidas e que sao descartadas na ingestao: o que este campo mede e "a fila andou", e e dele que sai o ciclos_sem_documento. Zero nota gravada com o feed andando e resultado NORMAL em NFS-e, nao falha. Serve tambem pra auditar buraco de sequencia junto com inbound_nfe.nsu.';

-- Fila do cron: "quem está liberado pra consultar agora".
CREATE INDEX IF NOT EXISTS idx_dfe_sync_state_fila
  ON public.dfe_sync_state (tipo, proxima_consulta_em);

DROP TRIGGER IF EXISTS set_dfe_sync_state_updated_at ON public.dfe_sync_state;
CREATE TRIGGER set_dfe_sync_state_updated_at
  BEFORE UPDATE ON public.dfe_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3) O ponteiro SÓ AVANÇA — regra de integridade vai no gatilho, não na policy
-- ---------------------------------------------------------------------------
-- Uma policy diz QUEM escreve; ela não sabe comparar o valor novo com o antigo.
-- Regredir o NSU (ou apagá-lo) é a única operação capaz de fazer a SEFAZ devolver
-- 656 e a nota sumir — então isso é proibido no nível mais baixo possível, e vale
-- inclusive pra service_role, que bypassa RLS.
--
-- O gatilho é por COLUNA (`UPDATE OF ultimo_nsu`), logo cobre os dois tipos sem
-- uma linha a mais — e isso é desejável, não efeito colateral: em 'nfse' voltar
-- na fila não gera 656, mas manda reler o feed inteiro desde o começo, e feed
-- inteiro é justamente o que faz o ADN devolver HTTP 429.
CREATE OR REPLACE FUNCTION public.dfe_sync_state_nsu_nao_regride()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF OLD.ultimo_nsu IS NOT NULL THEN
    -- Apagar o ponteiro é regressão disfarçada: preserva o valor antigo.
    IF NEW.ultimo_nsu IS NULL THEN
      NEW.ultimo_nsu := OLD.ultimo_nsu;
    ELSIF NEW.ultimo_nsu::bigint < OLD.ultimo_nsu::bigint THEN
      RAISE EXCEPTION
        'NSU nao pode regredir (% -> %) na empresa %: voltar na fila dispara a rejeicao 656 da SEFAZ.',
        OLD.ultimo_nsu, NEW.ultimo_nsu, OLD.company_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.dfe_sync_state_nsu_nao_regride() IS
  'Recusa UPDATE que diminua ou apague dfe_sync_state.ultimo_nsu, NOS DOIS TIPOS. Em nfe, regredir o ponteiro e o que faz a SEFAZ devolver cStat 656 (Consumo Indevido) e a nota destinada se perder. Em nfse nao ha 656, mas regredir manda reler o feed inteiro do ADN, que responde HTTP 429. Vale ate pra service_role (gatilho, nao policy).';

DROP TRIGGER IF EXISTS trg_dfe_sync_state_nsu_nao_regride ON public.dfe_sync_state;
CREATE TRIGGER trg_dfe_sync_state_nsu_nao_regride
  BEFORE UPDATE OF ultimo_nsu ON public.dfe_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.dfe_sync_state_nsu_nao_regride();

-- ---------------------------------------------------------------------------
-- 4) RLS — tenant LÊ, service_role ESCREVE
-- ---------------------------------------------------------------------------
-- Padrão canônico do Dominex: company_id = (SELECT public.get_user_company_id(auth.uid())).
-- O escalar entre parênteses vira InitPlan (avaliado 1x por query, não por linha).
-- ATENÇÃO: em Dominex get_user_company_id casa auth.uid() com profiles.USER_ID —
-- profiles.id é PK interno. Copiar a forma do EcoSistema (profiles.id = auth.uid())
-- faria a policy nunca casar e a tela mostrar lista vazia em silêncio.
ALTER TABLE public.dfe_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_dfe_sync_state" ON public.dfe_sync_state;
CREATE POLICY "service_role_full_access_dfe_sync_state"
  ON public.dfe_sync_state FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Leitura: a tela precisa mostrar "sincronizado há X" e "próxima consulta às Y".
DROP POLICY IF EXISTS "Users can view dfe sync state from their company" ON public.dfe_sync_state;
CREATE POLICY "Users can view dfe sync state from their company"
  ON public.dfe_sync_state FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id(auth.uid())));

-- INSERT/UPDATE/DELETE: SEM policy pra authenticated, de propósito.
-- O cursor é estado do protocolo com o governo, não preferência do usuário.
-- Quem mexe é a edge (service_role). Ver o porquê no cabeçalho.

-- Privilégios: o Supabase concede a anon/authenticated por default privilege em
-- TODA tabela nova. Esse furo se fecha sempre, na mão.
REVOKE ALL ON TABLE public.dfe_sync_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.dfe_sync_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dfe_sync_state TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Guarda
-- ---------------------------------------------------------------------------
-- A asserção é a INVARIANTE (vale hoje e pra sempre, e por isso a migration é
-- re-executável): recebimento ligado SEM carimbo de consentimento é bug.
-- As contagens são só relatório — `RAISE NOTICE`, não exceção. Assertar
-- "nasce vazio" quebraria o re-run legítimo depois que o primeiro cliente ligar.
DO $guard$
DECLARE
  v_nfe   integer;
  v_nfse  integer;
  v_orfao integer;
  v_state integer;
BEGIN
  SELECT count(*) FILTER (WHERE dfe_nfe_ativo),
         count(*) FILTER (WHERE dfe_nfse_ativo),
         count(*) FILTER (WHERE (dfe_nfe_ativo  AND dfe_nfe_ativado_em  IS NULL)
                             OR (dfe_nfse_ativo AND dfe_nfse_ativado_em IS NULL))
    INTO v_nfe, v_nfse, v_orfao
    FROM public.company_fiscal_settings;

  IF v_orfao <> 0 THEN
    RAISE EXCEPTION
      'Consulta ao governo ligada sem carimbo de consentimento em % empresa(s). Nao prosseguir.',
      v_orfao;
  END IF;

  SELECT count(*) INTO v_state FROM public.dfe_sync_state;

  RAISE NOTICE '[notas destinadas 1/3] opt-in NF-e ligado em %, NFS-e em % (de % config(s) fiscais); dfe_sync_state com % linha(s).',
    v_nfe, v_nfse, (SELECT count(*) FROM public.company_fiscal_settings), v_state;
END
$guard$;
