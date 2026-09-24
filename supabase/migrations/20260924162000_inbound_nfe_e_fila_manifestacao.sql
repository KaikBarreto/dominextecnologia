-- ============================================================================
-- Notas destinadas — PARTE 3/3: inbound_nfe + fila de manifestação
-- ============================================================================
-- Plano: docs/planos/2026-09-24-notas-destinadas-e-config-fiscal.md (Frente C2).
-- Depende de: 20260924160000 (opt-in + dfe_sync_state).
--
-- O QUE É: NF-e emitidas CONTRA o CNPJ do cliente, lidas da Distribuição DF-e da
-- SEFAZ (mTLS direto, sem intermediário). Sem manifestação do destinatário a
-- SEFAZ devolve só o RESUMO (`resNFe`), nunca o XML completo — por isso
-- manifestar não é enfeite, é o que destrava o documento.
--
-- MANIFESTAÇÃO É ASSÍNCRONA, E ISSO MANDA NO DESENHO
--   O usuário PEDE (edge autenticada enfileira), a VPS TRANSMITE e só depois do
--   aceite da SEFAZ o estado conclusivo é gravado na nota. Se o app escrevesse
--   `manifestacao` direto, a tela diria "Confirmada" para uma nota que a SEFAZ
--   nunca aceitou — e manifestação é evento irreversível perante a Receita.
--   Daí o par: `manifestacao` (fato consumado) x `manifestacao_pendente` (pedido
--   em voo), mais a fila `dfe_manifestacao_jobs`.
--
-- DIVERGÊNCIAS COM O ECOSISTEMA
--   * Financeiro: lá é `financial_bills`; essa tabela NÃO existe no Dominex.
--     Aqui o selo é `financial_transaction_id` (decisão D3 do plano).
--   * Config fiscal: lá são N configs por empresa (`fiscal_config_id`); aqui
--     `company_fiscal_settings` é own-row, então a fila não tem `fiscal_config_id`.
--   * Cota: lá a nota destinada consome franquia do provedor e entra em
--     `count_fiscal_documents_in_month`. Aqui o transporte é mTLS próprio — não
--     há custo por nota, então NADA é somado em cota. Não copiar aquela parte.
--   * Vocabulário neutro: nenhuma coluna com nome de fornecedor. A procedência
--     mora em `origem` ('dfe' | 'manual').
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) inbound_nfe
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inbound_nfe (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- ── identidade ─────────────────────────────────────────────────────────
  chave             text NOT NULL,
  origem            text NOT NULL DEFAULT 'dfe',
  nsu               text,
  numero            integer,
  serie             integer,

  -- ── emitente (quem faturou CONTRA o cliente) ───────────────────────────
  emitente_cnpj     text,
  emitente_nome     text,

  -- ── conteúdo fiscal ────────────────────────────────────────────────────
  valor             numeric(15,2),
  data_emissao      timestamptz,
  natureza          text,
  cfop_principal    text,
  fin_nfe           smallint,
  ref_nfe_key       text,
  situacao_sefaz    text,

  -- ── manifestação do destinatário ───────────────────────────────────────
  manifestacao             text NOT NULL DEFAULT 'nenhuma',
  manifestacao_data        timestamptz,
  manifestacao_pendente    text,
  manifestacao_pendente_em timestamptz,
  manifestacao_erro        text,

  -- ── documento ──────────────────────────────────────────────────────────
  xml_content       text,
  resumo            boolean NOT NULL DEFAULT false,

  -- ── vínculos do cliente (única coisa que o tenant escreve) ─────────────
  financial_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  supplier_id              uuid REFERENCES public.suppliers(id)              ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT inbound_nfe_chave_format_check
    CHECK (chave ~ '^[0-9]{44}$'),
  CONSTRAINT inbound_nfe_ref_nfe_key_format_check
    CHECK (ref_nfe_key IS NULL OR ref_nfe_key ~ '^[0-9]{44}$'),
  CONSTRAINT inbound_nfe_nsu_format_check
    CHECK (nsu IS NULL OR nsu ~ '^[0-9]{1,15}$'),
  CONSTRAINT inbound_nfe_origem_check
    CHECK (origem IN ('dfe', 'manual')),
  CONSTRAINT inbound_nfe_situacao_sefaz_check
    CHECK (situacao_sefaz IS NULL OR situacao_sefaz IN ('autorizada', 'cancelada', 'denegada')),
  CONSTRAINT inbound_nfe_manifestacao_check
    CHECK (manifestacao IN ('nenhuma', 'ciencia', 'confirmada', 'desconhecida', 'nao_realizada')),
  -- CORRIGIDO 2026-09-24 (conferido contra services/dominex-fiscal, §10.2 do
  -- RUNBOOK): 'ciencia' (210210) TAMBÉM entra na fila.
  --   * Ela não é automática: o motor de distribuição só LÊ, não manifesta —
  --     manifestar sem o usuário pedir seria declarar ciência de uma operação
  --     comercial em nome dele, num evento que não se desfaz.
  --   * É justamente a ciência que DESTRAVA o XML completo (sem manifestação a
  --     SEFAZ entrega só o resumo `resNFe`). Deixá-la de fora da fila faria toda
  --     nota ficar `resumo = true` para sempre, sem nenhum caminho de saída.
  -- 'nenhuma' continua proibida aqui: não se "pede pra não manifestar".
  CONSTRAINT inbound_nfe_manifestacao_pendente_check
    CHECK (manifestacao_pendente IS NULL
           OR manifestacao_pendente IN ('ciencia', 'confirmada', 'desconhecida', 'nao_realizada')),
  -- Uma nota recebida é única por empresa; base do upsert idempotente por chave.
  CONSTRAINT inbound_nfe_company_chave_uniq UNIQUE (company_id, chave)
);

COMMENT ON TABLE public.inbound_nfe IS
  'NF-e RECEBIDAS (emitidas CONTRA o CNPJ do cliente), lidas da Distribuicao DF-e da SEFAZ por mTLS direto. Guarda identidade fiscal, emitente, valor, XML e o estado de manifestacao do destinatario. Upsert por (company_id, chave). Ingestao e service_role; o tenant so LE e marca os vinculos.';

COMMENT ON COLUMN public.inbound_nfe.chave IS
  'Chave de acesso da NF-e, 44 digitos. Identidade da nota e alvo do upsert junto com company_id.';
COMMENT ON COLUMN public.inbound_nfe.origem IS
  'De onde ESTA linha veio: ''dfe'' (distribuicao automatica da SEFAZ) ou ''manual'' (XML importado pelo proprio cliente). Vocabulario neutro — nenhum nome de fornecedor entra em coluna.';
COMMENT ON COLUMN public.inbound_nfe.nsu IS
  'NSU (ate 15 digitos) em que a SEFAZ entregou este documento. Serve pra auditar buraco na sequencia da fila junto com dfe_sync_state.ultimo_nsu. NULL em origem=''manual''.';
COMMENT ON COLUMN public.inbound_nfe.numero IS
  'Numero da NF-e (<nNF>). Fallback: posicoes 26-34 da chave de acesso.';
COMMENT ON COLUMN public.inbound_nfe.serie IS
  'Serie da NF-e (<serie>). Fallback: posicoes 23-25 da chave de acesso.';
COMMENT ON COLUMN public.inbound_nfe.cfop_principal IS
  'CFOP do PRIMEIRO item da nota. Sem ele uma NF-e de DEVOLUCAO fica indistinguivel de uma compra, e lancar despesa em cima de devolucao cria divida que nao existe. Nota com CFOPs mistos guarda so o do item 1 — pra decisao fina, ler o XML.';
COMMENT ON COLUMN public.inbound_nfe.fin_nfe IS
  'Finalidade da NF-e (<finNFe>): 1=normal, 2=complementar, 3=ajuste, 4=devolucao.';
COMMENT ON COLUMN public.inbound_nfe.ref_nfe_key IS
  'Chave de 44 digitos da nota referenciada (<refNFe>), quando existir. Numa devolucao, e a chave da nota ORIGINAL sendo devolvida.';
COMMENT ON COLUMN public.inbound_nfe.situacao_sefaz IS
  'Situacao do documento na SEFAZ: autorizada | cancelada | denegada. NULL = ainda nao sabemos (nota so com resumo).';
COMMENT ON COLUMN public.inbound_nfe.manifestacao IS
  'Manifestacao JA REGISTRADA na SEFAZ: nenhuma | ciencia (210210) | confirmada (210200) | desconhecida (210220) | nao_realizada (210240). Fato consumado — so a conclusao do job escreve aqui, nunca o app. ATENCAO: 210210 e CIENCIA e 210200 e CONFIRMACAO; o plano de 24/09 listou invertido, e a fonte da verdade e app/sefaz/manifestacao.py.';
COMMENT ON COLUMN public.inbound_nfe.manifestacao_pendente IS
  'Manifestacao PEDIDA e ainda em voo (enfileirada / transmitindo). NULL fora do processamento. E o que a tela mostra como "enviando". Aceita ciencia | confirmada | desconhecida | nao_realizada — ciencia inclusive, porque e ela que destrava o XML completo e o motor nunca manifesta sozinho.';
COMMENT ON COLUMN public.inbound_nfe.manifestacao_pendente_em IS
  'Instante em que a manifestacao foi enfileirada.';
COMMENT ON COLUMN public.inbound_nfe.manifestacao_erro IS
  'Ultima falha PERMANENTE e sanitizada da manifestacao, em PT-BR pro usuario. Limpa ao reenfileirar ou concluir.';
COMMENT ON COLUMN public.inbound_nfe.resumo IS
  'true quando so temos o resumo (resNFe) da SEFAZ, sem o XML completo. Sem manifestar, a SEFAZ nao libera o XML — este campo e o gatilho do aviso na tela.';
COMMENT ON COLUMN public.inbound_nfe.financial_transaction_id IS
  'Lancamento financeiro (despesa/conta a pagar) gerado a partir desta nota — o selo "Lancada". ON DELETE SET NULL: se o titulo for excluido no Financeiro, o selo some e o botao de lancar volta.';
COMMENT ON COLUMN public.inbound_nfe.supplier_id IS
  'Fornecedor casado pelo CNPJ do emitente no cadastro do cliente, quando houver. Preenchido no lancamento; NULL nao impede nada.';

-- ── índices ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inbound_nfe_company_data_emissao
  ON public.inbound_nfe (company_id, data_emissao DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_nfe_company_emitente
  ON public.inbound_nfe (company_id, emitente_cnpj);
-- Vínculo devolução -> nota original.
CREATE INDEX IF NOT EXISTS idx_inbound_nfe_company_ref_key
  ON public.inbound_nfe (company_id, ref_nfe_key) WHERE ref_nfe_key IS NOT NULL;
-- As duas FKs abaixo são ON DELETE SET NULL: toda exclusão de lançamento
-- financeiro / fornecedor varre esta tabela pra limpar a referência.
CREATE INDEX IF NOT EXISTS idx_inbound_nfe_financial_transaction_id
  ON public.inbound_nfe (financial_transaction_id) WHERE financial_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbound_nfe_supplier_id
  ON public.inbound_nfe (supplier_id) WHERE supplier_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_inbound_nfe_updated_at ON public.inbound_nfe;
CREATE TRIGGER set_inbound_nfe_updated_at
  BEFORE UPDATE ON public.inbound_nfe
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2) RLS de inbound_nfe — mesma régua de inbound_nfse
-- ---------------------------------------------------------------------------
-- Padrão canônico do Dominex: company_id = (SELECT public.get_user_company_id(auth.uid())),
-- que casa auth.uid() com profiles.USER_ID (profiles.id é PK interno). Copiar a
-- forma do EcoSistema (profiles.id = auth.uid()) faria a policy nunca casar e a
-- tela mostrar lista vazia em silêncio.
--
-- O tenant LÊ e marca VÍNCULO. Não insere, não apaga, e não escreve manifestação:
-- manifestação vira pedido na fila, e o estado conclusivo só é gravado depois do
-- aceite da SEFAZ (evento irreversível perante a Receita).
ALTER TABLE public.inbound_nfe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_inbound_nfe" ON public.inbound_nfe;
CREATE POLICY "service_role_full_access_inbound_nfe"
  ON public.inbound_nfe FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view inbound_nfe from their company" ON public.inbound_nfe;
CREATE POLICY "Users can view inbound_nfe from their company"
  ON public.inbound_nfe FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id(auth.uid())));

DROP POLICY IF EXISTS "Users can link inbound_nfe from their company" ON public.inbound_nfe;
CREATE POLICY "Users can link inbound_nfe from their company"
  ON public.inbound_nfe FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.get_user_company_id(auth.uid())))
  WITH CHECK (company_id = (SELECT public.get_user_company_id(auth.uid())));

REVOKE ALL ON TABLE public.inbound_nfe FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inbound_nfe TO authenticated;
-- A policy filtra LINHA; quem limita COLUNA é o GRANT. Sem isto, a policy de
-- UPDATE acima deixaria o cliente reescrever valor, chave, XML e manifestação.
GRANT UPDATE (financial_transaction_id, supplier_id) ON TABLE public.inbound_nfe TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inbound_nfe TO service_role;

-- ---------------------------------------------------------------------------
-- 3) dfe_manifestacao_jobs — fila de manifestação do destinatário
-- ---------------------------------------------------------------------------
-- Sem fiscal_config_id: no Dominex a config fiscal é own-row
-- (company_fiscal_settings, uma linha por empresa), então company_id já resolve
-- qual CNPJ e qual certificado.
CREATE TABLE IF NOT EXISTS public.dfe_manifestacao_jobs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  inbound_nfe_id       uuid NOT NULL REFERENCES public.inbound_nfe(id) ON DELETE CASCADE,
  chave                text NOT NULL,
  tipo                 text NOT NULL,
  justificativa        text,

  status               text NOT NULL DEFAULT 'pendente',
  tentativas           integer NOT NULL DEFAULT 0,
  proxima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  bloqueado_em         timestamptz,

  solicitado_por       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  solicitado_em        timestamptz NOT NULL DEFAULT now(),
  concluido_em         timestamptz,

  cstat                text,
  protocolo            text,
  ultimo_erro          text,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Uma nota tem no máximo um pedido vivo. Reenfileirar é UPDATE da mesma linha,
  -- nunca uma segunda: manifestação duplicada é evento duplicado na Receita.
  CONSTRAINT dfe_manifestacao_jobs_inbound_uniq UNIQUE (inbound_nfe_id),
  CONSTRAINT dfe_manifestacao_jobs_chave_check
    CHECK (chave ~ '^[0-9]{44}$'),
  CONSTRAINT dfe_manifestacao_jobs_tipo_check
    CHECK (tipo IN ('ciencia', 'confirmada', 'desconhecida', 'nao_realizada')),
  CONSTRAINT dfe_manifestacao_jobs_status_check
    CHECK (status IN ('pendente', 'processando', 'concluida', 'erro')),
  CONSTRAINT dfe_manifestacao_jobs_tentativas_check
    CHECK (tentativas >= 0),
  -- CORRIGIDO 2026-09-24 (conferido contra app/sefaz/schemas.py e §10.2 do
  -- RUNBOOK): a justificativa e obrigatoria em UM tipo so — 'nao_realizada'
  -- (210240). A NT 2020.001 v1.50 tirou a exigencia do Desconhecimento, e o
  -- motor so serializa <xJust> na Operacao nao Realizada.
  --
  -- POR QUE ISSO IMPORTA: exigir MAIS que o governo nao e "ser rigoroso", e
  -- bloquear uma operacao que a SEFAZ aceita. Nos demais tipos o texto e
  -- PROIBIDO — guardar justificativa que nunca foi transmitida criaria prova
  -- falsa de algo que o cliente nao declarou.
  CONSTRAINT dfe_manifestacao_jobs_justificativa_check
    CHECK (
      CASE
        WHEN tipo = 'nao_realizada'
          THEN justificativa IS NOT NULL
               AND char_length(btrim(justificativa)) BETWEEN 15 AND 255
        ELSE justificativa IS NULL
      END
    )
);

COMMENT ON TABLE public.dfe_manifestacao_jobs IS
  'Fila dos eventos de manifestacao do destinatario (210210 Ciencia, 210200 Confirmacao, 210220 Desconhecimento, 210240 Operacao nao Realizada) a transmitir pra SEFAZ. O usuario pede pela tela, a edge enfileira aqui, a VPS assina e transmite, e so depois do aceite o estado vai pra inbound_nfe.manifestacao. Tabela INTERNA: sem policy de tenant, acesso so por service_role.';

COMMENT ON COLUMN public.dfe_manifestacao_jobs.tipo IS
  'Evento a transmitir: ciencia (210210) | confirmada (210200) | desconhecida (210220) | nao_realizada (210240). A ciencia ENTRA na fila: o motor de distribuicao so le, nunca manifesta sozinho, e e a ciencia que destrava o XML completo.';
COMMENT ON COLUMN public.dfe_manifestacao_jobs.justificativa IS
  'Obrigatoria (15 a 255 caracteres) SO em nao_realizada (210240); PROIBIDA nos demais tipos. A NT 2020.001 v1.50 dispensou a justificativa no Desconhecimento e o motor so serializa <xJust> na Operacao nao Realizada — guardar texto que nunca foi transmitido criaria prova falsa.';
COMMENT ON COLUMN public.dfe_manifestacao_jobs.status IS
  'pendente -> processando -> concluida | erro. ''processando'' com bloqueado_em antigo e job orfao e deve voltar pra pendente.';
COMMENT ON COLUMN public.dfe_manifestacao_jobs.bloqueado_em IS
  'Quando o worker reivindicou o job. Serve pra soltar job orfao (processo morreu no meio) sem precisar de lock distribuido.';
COMMENT ON COLUMN public.dfe_manifestacao_jobs.cstat IS
  'cStat da resposta da SEFAZ (ex.: 135 evento registrado, 573 duplicidade de evento).';

-- Fila: "qual job está pronto pra transmitir agora".
CREATE INDEX IF NOT EXISTS idx_dfe_manifestacao_jobs_fila
  ON public.dfe_manifestacao_jobs (proxima_tentativa_em, solicitado_em)
  WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_dfe_manifestacao_jobs_company
  ON public.dfe_manifestacao_jobs (company_id, solicitado_em DESC);

DROP TRIGGER IF EXISTS set_dfe_manifestacao_jobs_updated_at ON public.dfe_manifestacao_jobs;
CREATE TRIGGER set_dfe_manifestacao_jobs_updated_at
  BEFORE UPDATE ON public.dfe_manifestacao_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS ligada e NENHUMA policy pra authenticated: o tenant não enxerga a fila.
-- O que ele precisa ver (pedido em voo, erro) já está espelhado em
-- inbound_nfe.manifestacao_pendente / manifestacao_erro, que a tela lê pela
-- policy de SELECT da nota. service_role bypassa RLS e é quem opera a fila.
ALTER TABLE public.dfe_manifestacao_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_dfe_manifestacao_jobs" ON public.dfe_manifestacao_jobs;
CREATE POLICY "service_role_full_access_dfe_manifestacao_jobs"
  ON public.dfe_manifestacao_jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.dfe_manifestacao_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dfe_manifestacao_jobs TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Guarda
-- ---------------------------------------------------------------------------
-- Asserções = invariantes permanentes (re-run seguro). Contagem é só relatório.
DO $guard$
DECLARE
  v_notas integer;
  v_jobs  integer;
  v_solto integer;
  v_fila  integer;
BEGIN
  -- inbound_nfe: tenant não insere nem apaga documento fiscal.
  SELECT count(*) INTO v_solto
    FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND table_name = 'inbound_nfe'
     AND grantee IN ('anon', 'authenticated')
     AND privilege_type IN ('INSERT', 'DELETE', 'TRUNCATE');
  IF v_solto <> 0 THEN
    RAISE EXCEPTION 'inbound_nfe: anon/authenticated com % privilegio(s) de escrita indevidos.', v_solto;
  END IF;

  -- Fila de manifestação: invisível pro tenant, em QUALQUER privilégio.
  SELECT count(*) INTO v_fila
    FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND table_name = 'dfe_manifestacao_jobs'
     AND grantee IN ('anon', 'authenticated');
  IF v_fila <> 0 THEN
    RAISE EXCEPTION 'dfe_manifestacao_jobs exposta a anon/authenticated (% privilegio(s)).', v_fila;
  END IF;

  SELECT count(*) INTO v_notas FROM public.inbound_nfe;
  SELECT count(*) INTO v_jobs  FROM public.dfe_manifestacao_jobs;

  RAISE NOTICE '[notas destinadas 3/3] inbound_nfe (% nota(s)) e dfe_manifestacao_jobs (% job(s)) prontas; fila invisivel pro tenant.',
    v_notas, v_jobs;
END
$guard$;
