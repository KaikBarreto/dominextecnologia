-- ============================================================================
-- Notas destinadas — PARTE 2/3: inbound_nfse (NFS-e RECEBIDA / serviço tomado)
-- ============================================================================
-- Plano: docs/planos/2026-09-24-notas-destinadas-e-config-fiscal.md (Frente C1).
-- Depende de: 20260924160000 (opt-in + dfe_sync_state).
--
-- POR QUE TABELA SEPARADA DE inbound_nfe (parte 3)
--   * A chave de acesso da NFS-e nacional tem 50 dígitos, não 44 — a CHECK de
--     NF-e recusaria toda linha.
--   * NFS-e NÃO tem manifestação do destinatário. As colunas de manifestação e a
--     fila `dfe_manifestacao_jobs` ficariam NULL pra sempre.
--   * Serviço não entra em estoque: NFS-e recebida só vira DESPESA.
--
-- VOCABULÁRIO NEUTRO DE PROVEDOR (regra de supabase/functions/_shared/nfse-provider.ts)
--   Nenhuma coluna aqui cita fornecedor. A procedência mora numa coluna só,
--   `origem` ('dfe' | 'manual'), e os campos são os do leiaute NACIONAL (DANFSe),
--   não o envelope de quem entregou. Trocar de caminho de ingestão é mudar a
--   origem, não remodelar tabela e tela.
--
-- DIVERGÊNCIA COM O ECOSISTEMA (decisão D3 do plano)
--   Lá o vínculo financeiro é `financial_bills`. Essa tabela NÃO EXISTE no
--   Dominex: aqui o financeiro é `financial_transactions`. O selo vira
--   `financial_transaction_id`, com ON DELETE SET NULL — se o título for
--   excluído, o selo "Lançada" some junto e o botão volta a aparecer.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inbound_nfse (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- ── procedência ────────────────────────────────────────────────────────
  origem            text NOT NULL DEFAULT 'dfe',
  origem_ref        text,
  nsu               text,

  -- ── identidade do documento (leiaute nacional) ─────────────────────────
  -- Chave de Acesso da NFS-e nacional: 50 dígitos
  -- (cMun 7 + ambiente 1 + tipo de inscrição 1 + inscrição federal 14 +
  --  nNFSe 13 + AAMM 4 + código numérico 9 + DV 1).
  chave_acesso              text,
  numero                    text,
  serie                     text,
  codigo_verificacao        text,
  municipio_incidencia_ibge text,

  -- ── datas e valores ────────────────────────────────────────────────────
  data_emissao      timestamptz,
  competencia       date,
  valor_servico     numeric(15,2),
  valor_liquido     numeric(15,2),
  valor_iss         numeric(15,2),
  iss_retido        boolean,

  -- ── partes ─────────────────────────────────────────────────────────────
  prestador_documento      text,
  prestador_nome           text,
  prestador_im             text,
  prestador_municipio_ibge text,
  tomador_documento        text,
  tomador_nome             text,

  -- ── serviço ────────────────────────────────────────────────────────────
  codigo_tributacao_nacional  text,
  codigo_tributacao_municipal text,
  discriminacao               text,

  -- ── situação ───────────────────────────────────────────────────────────
  situacao          text NOT NULL DEFAULT 'autorizada',
  data_cancelamento timestamptz,
  chave_substituta  text,

  -- ── documento ──────────────────────────────────────────────────────────
  xml_content       text,
  resumo            boolean NOT NULL DEFAULT false,

  -- ── vínculos do cliente (única coisa que o tenant escreve) ─────────────
  financial_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  supplier_id              uuid REFERENCES public.suppliers(id)              ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- ── chave natural (base do upsert idempotente) ─────────────────────────
  -- Prefere a Chave de Acesso nacional: ela já carrega município + inscrição do
  -- prestador + número + AAMM + DV, logo é única por construção e IGUAL venha a
  -- nota por qual caminho for — é isso que impede a mesma nota de entrar duas
  -- vezes. Fallback pra NFS-e municipal fora do Ambiente Nacional (sem chave
  -- nacional): prestador + município + série + número. Os dois ramos nunca
  -- colidem porque o fallback tem letras e separadores, logo jamais casa com
  -- '^[0-9]{50}$'.
  chave_natural text NOT NULL GENERATED ALWAYS AS (
    COALESCE(
      NULLIF(btrim(chave_acesso), ''),
      'MUN:' || COALESCE(NULLIF(btrim(municipio_incidencia_ibge), ''), '?') ||
      '|PRE:' || COALESCE(NULLIF(btrim(prestador_documento), ''), '?') ||
      '|SER:' || COALESCE(NULLIF(btrim(serie), ''), '?') ||
      '|NUM:' || COALESCE(NULLIF(btrim(numero), ''), '?')
    )
  ) STORED,

  CONSTRAINT inbound_nfse_origem_check
    CHECK (origem IN ('dfe', 'manual')),
  CONSTRAINT inbound_nfse_chave_acesso_format_check
    CHECK (chave_acesso IS NULL OR chave_acesso ~ '^[0-9]{50}$'),
  CONSTRAINT inbound_nfse_nsu_format_check
    CHECK (nsu IS NULL OR nsu ~ '^[0-9]{1,15}$'),
  CONSTRAINT inbound_nfse_situacao_check
    CHECK (situacao IN ('autorizada', 'cancelada', 'substituida')),
  -- Sem identidade não entra: senão duas notas diferentes virariam a MESMA
  -- chave_natural ('MUN:?|PRE:?|SER:?|NUM:?') e uma sobrescreveria a outra.
  CONSTRAINT inbound_nfse_identidade_check
    CHECK (
      NULLIF(btrim(chave_acesso), '') IS NOT NULL
      OR (NULLIF(btrim(prestador_documento), '') IS NOT NULL
          AND NULLIF(btrim(numero), '') IS NOT NULL)
    ),
  -- Alvo do upsert da ingestão.
  CONSTRAINT inbound_nfse_company_chave_uniq UNIQUE (company_id, chave_natural)
);

COMMENT ON TABLE public.inbound_nfse IS
  'NFS-e RECEBIDAS (servico TOMADO pelo cliente), ingeridas da distribuicao do Ambiente de Dados Nacional. Modelada no leiaute NACIONAL/DANFSe e nao no envelope de quem entregou: a procedencia mora so em `origem`. Sem manifestacao (NFS-e nao tem) e sem entrada de estoque (servico vira DESPESA). Upsert por (company_id, chave_natural). Ingestao e service_role; o tenant so LE e marca os vinculos.';

COMMENT ON COLUMN public.inbound_nfse.origem IS
  'De onde ESTA linha veio: ''dfe'' (distribuicao automatica do Ambiente de Dados Nacional) ou ''manual'' (XML/dados informados pelo proprio cliente). Vocabulario neutro — nenhum nome de fornecedor entra em coluna.';
COMMENT ON COLUMN public.inbound_nfse.origem_ref IS
  'Identificador opaco do documento na origem (protocolo do ADN, id do lote). Serve pra rastrear/reconsultar, NUNCA pra identificar a nota — quem identifica e chave_natural.';
COMMENT ON COLUMN public.inbound_nfse.nsu IS
  'NSU com que o documento saiu da fila de distribuicao do Ambiente de Dados Nacional. A distribuicao do ADN e por NSU (igual a da SEFAZ) — ao contrario do que a versao inicial desta migration dizia, nao existe consulta por periodo no governo direto; periodo e recorte de wrapper de terceiro. Preenchido em origem=''dfe'', NULL em origem=''manual''.';
COMMENT ON COLUMN public.inbound_nfse.chave_acesso IS
  'Chave de Acesso da NFS-e nacional, 50 digitos (cMun 7 + ambiente 1 + tipo de inscricao 1 + inscricao federal 14 + nNFSe 13 + AAMM 4 + codigo numerico 9 + DV 1). NULL em NFS-e municipal fora do Ambiente Nacional.';
COMMENT ON COLUMN public.inbound_nfse.chave_natural IS
  'Identidade da nota, CALCULADA: a chave de acesso nacional quando existe, senao prestador+municipio+serie+numero. Coluna GERADA — nunca escrever nela.';
COMMENT ON COLUMN public.inbound_nfse.competencia IS
  'dCompet — mes de competencia do servico. Pode ser anterior a data_emissao; e a data certa pro regime de COMPETENCIA quando a nota virar despesa.';
COMMENT ON COLUMN public.inbound_nfse.iss_retido IS
  'true quando o ISSQN foi retido pelo TOMADOR (tpRetIssqn). Muda quanto o cliente efetivamente paga ao prestador — o lancamento de despesa precisa olhar isto antes de usar valor_servico.';
COMMENT ON COLUMN public.inbound_nfse.resumo IS
  'true quando so temos os metadados, sem o XML completo da nota.';
COMMENT ON COLUMN public.inbound_nfse.financial_transaction_id IS
  'Lancamento financeiro (despesa/conta a pagar) gerado a partir desta nota — o selo "Lancada". ON DELETE SET NULL: se o titulo for excluido no Financeiro, o selo some e o botao de lancar volta.';
COMMENT ON COLUMN public.inbound_nfse.supplier_id IS
  'Fornecedor/prestador casado pelo CNPJ no cadastro do cliente, quando houver. Preenchido no momento do lancamento; NULL nao impede nada.';

-- ── índices ───────────────────────────────────────────────────────────────
-- Listagem da subaba, mais recentes primeiro.
CREATE INDEX IF NOT EXISTS idx_inbound_nfse_company_data_emissao
  ON public.inbound_nfse (company_id, data_emissao DESC);
-- Casamento de fornecedor e busca por CNPJ do prestador.
CREATE INDEX IF NOT EXISTS idx_inbound_nfse_company_prestador
  ON public.inbound_nfse (company_id, prestador_documento);
-- As duas FKs abaixo são ON DELETE SET NULL: TODA exclusão de lançamento
-- financeiro / fornecedor varre inbound_nfse pra limpar a referência. Sem
-- índice isso é seq scan por DELETE, numa tabela que só cresce.
CREATE INDEX IF NOT EXISTS idx_inbound_nfse_financial_transaction_id
  ON public.inbound_nfse (financial_transaction_id) WHERE financial_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbound_nfse_supplier_id
  ON public.inbound_nfse (supplier_id) WHERE supplier_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_inbound_nfse_updated_at ON public.inbound_nfse;
CREATE TRIGGER set_inbound_nfse_updated_at
  BEFORE UPDATE ON public.inbound_nfse
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- RLS — nota fiscal recebida é documento, não registro editável
-- ---------------------------------------------------------------------------
-- Regra (Plataforma): o tenant LÊ as notas da própria empresa e marca os
-- VÍNCULOS (lançou no financeiro / qual fornecedor). Quem cria, atualiza o
-- conteúdo fiscal e exclui é service_role — a nota é o que o governo entregou,
-- e um UPDATE de cliente em valor/chave/XML seria adulteração de documento.
--
-- A restrição por COLUNA não cabe em policy: policy filtra LINHA. Por isso a
-- porta é dupla — policy de UPDATE por company_id + GRANT UPDATE só nas duas
-- colunas de vínculo. Sem o GRANT restrito, a policy de UPDATE deixaria o
-- cliente reescrever valor_servico e xml_content.
ALTER TABLE public.inbound_nfse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_inbound_nfse" ON public.inbound_nfse;
CREATE POLICY "service_role_full_access_inbound_nfse"
  ON public.inbound_nfse FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view inbound_nfse from their company" ON public.inbound_nfse;
CREATE POLICY "Users can view inbound_nfse from their company"
  ON public.inbound_nfse FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id(auth.uid())));

DROP POLICY IF EXISTS "Users can link inbound_nfse from their company" ON public.inbound_nfse;
CREATE POLICY "Users can link inbound_nfse from their company"
  ON public.inbound_nfse FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.get_user_company_id(auth.uid())))
  -- WITH CHECK igual ao USING: impede mover a nota pra outra empresa no UPDATE.
  WITH CHECK (company_id = (SELECT public.get_user_company_id(auth.uid())));

-- INSERT e DELETE: SEM policy pra authenticated, de propósito. Nota destinada
-- nasce da ingestão (service_role) e não se apaga — é documento fiscal.

-- Privilégios: o Supabase concede a anon/authenticated por default privilege em
-- TODA tabela nova. Fecha-se na mão, sempre.
REVOKE ALL ON TABLE public.inbound_nfse FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inbound_nfse TO authenticated;
GRANT UPDATE (financial_transaction_id, supplier_id) ON TABLE public.inbound_nfse TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inbound_nfse TO service_role;

-- ---------------------------------------------------------------------------
-- Guarda
-- ---------------------------------------------------------------------------
-- Asserção = invariante permanente (re-run seguro): RLS ligada e o tenant sem
-- privilégio de INSERT/DELETE. Contagem de linhas é só relatório.
DO $guard$
DECLARE
  v_linhas integer;
  v_rls    boolean;
  v_solto  integer;
BEGIN
  SELECT relrowsecurity INTO v_rls
    FROM pg_class WHERE oid = 'public.inbound_nfse'::regclass;
  IF NOT COALESCE(v_rls, false) THEN
    RAISE EXCEPTION 'inbound_nfse sem RLS habilitada.';
  END IF;

  SELECT count(*) INTO v_solto
    FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND table_name = 'inbound_nfse'
     AND grantee IN ('anon', 'authenticated')
     AND privilege_type IN ('INSERT', 'DELETE', 'TRUNCATE');
  IF v_solto <> 0 THEN
    RAISE EXCEPTION 'inbound_nfse: anon/authenticated com % privilegio(s) de escrita indevidos.', v_solto;
  END IF;

  SELECT count(*) INTO v_linhas FROM public.inbound_nfse;
  RAISE NOTICE '[notas destinadas 2/3] inbound_nfse pronta (% linha(s)), RLS ligada, UPDATE do tenant limitado a 2 colunas.', v_linhas;
END
$guard$;
