-- ============================================================================
-- Notas destinadas — CORREÇÃO DE PREMISSA: a NFS-e recebida também é por NSU
-- ============================================================================
-- Depende de: 20260924160000 (dfe_sync_state), 20260924161000 (inbound_nfse).
--
-- ⚠️ ESTA MIGRATION NÃO MUDA NADA ESTRUTURAL. Nenhum ALTER TABLE, nenhuma
-- coluna, nenhum índice, nenhuma policy. Só `COMMENT ON`. Ela existe porque o
-- schema estava DOCUMENTADO ERRADO, e comentário errado em tabela de protocolo
-- com o governo é pior que comentário nenhum: o próximo a mexer aqui confia nele.
--
-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ O QUE ESTAVA ERRADO                                                       │
-- │                                                                           │
-- │ As migrations 160000/161000 afirmam que a consulta de NFS-e RECEBIDA no   │
-- │ Ambiente de Dados Nacional (ADN) é feita por JANELA DE PERÍODO (31 dias), │
-- │ e que por isso `ultimo_nsu` seria "sempre NULL em tipo='nfse'" e          │
-- │ `janela_fim` seria o cursor daquele tipo.                                 │
-- │                                                                           │
-- │ É FALSO. Essa é a forma do WRAPPER que o EcoSistema usa (PlugNotas): o    │
-- │ wrapper caminha a fila por dentro e expõe um recorte por datas. O GOVERNO │
-- │ não expõe período nenhum. A distribuição do ADN é uma fila sequencial por │
-- │ NSU, com o mesmo desenho da Distribuição DF-e da SEFAZ. Conferido contra  │
-- │ a especificação oficial do ADN e quatro clientes independentes.           │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ CONSEQUÊNCIA BOA: NENHUMA COLUNA NOVA É NECESSÁRIA                        │
-- │                                                                           │
-- │ `dfe_sync_state.ultimo_nsu` já existe, já é `text` com                    │
-- │ CHECK '^[0-9]{15}$' — que é EXATAMENTE o formato que a rota de NFS-e      │
-- │ devolve — e o gatilho `dfe_sync_state_nsu_nao_regride` é `UPDATE OF       │
-- │ ultimo_nsu`, logo já passa a proteger 'nfse' sem uma linha a mais.        │
-- │                                                                           │
-- │ E proteger é DESEJÁVEL, não sobra: regredir o cursor de NFS-e não causa   │
-- │ 656 (isso é vocabulário da SEFAZ), mas manda reler o feed do ADN desde o  │
-- │ começo — e feed inteiro é justamente o que faz o ADN devolver HTTP 429    │
-- │ (consumo indevido). Desfecho prático idêntico: o cliente para de receber  │
-- │ nota.                                                                     │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- Os arquivos 160000/161000 JÁ FORAM corrigidos na fonte. Este arquivo existe
-- pra que um banco onde eles já rodaram fique igual — `COMMENT ON` é a única
-- forma idempotente de reescrever comentário (sempre substitui, nunca acumula).
-- Mesmo padrão da seção 0 da 20260924170000.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) dfe_sync_state — o cursor é NSU nos DOIS tipos
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.dfe_sync_state IS
  'Estado da fila de distribuicao de documentos fiscais destinados, por empresa e por tipo (nfe|nfse). Guarda o cursor de NSU (os DOIS tipos usam NSU: SEFAZ e Ambiente de Dados Nacional servem a fila pelo mesmo desenho sequencial), a trava anti-consumo-indevido (proxima_consulta_em) e o ultimo erro. Substitui o volume Docker que o worker do EcoSistema usa: aqui a VPS nao tem banco (decisao D1). Tenant so LE; quem escreve e service_role.';

COMMENT ON COLUMN public.dfe_sync_state.tipo IS
  'Qual fila esta linha descreve: ''nfe'' (Distribuicao DF-e da SEFAZ) ou ''nfse'' (distribuicao do Ambiente de Dados Nacional). O CURSOR E NSU NOS DOIS — muda o webservice, nao a mecanica.';

-- ⚠️ ESTE É O COMENTÁRIO QUE MENTIA ("sempre NULL em tipo='nfse'").
COMMENT ON COLUMN public.dfe_sync_state.ultimo_nsu IS
  'Ponteiro da fila (15 digitos, zeros a esquerda), VALIDO NOS DOIS TIPOS. SO AVANCA — o trigger dfe_sync_state_nsu_nao_regride recusa gravar valor menor, e isso protege nfe E nfse. Em ''nfe'' regredir dispara a rejeicao 656 da SEFAZ (1h de bloqueio do CNPJ). Em ''nfse'' nao ha 656, mas regredir faz reler o feed inteiro desde o inicio, o que leva a HTTP 429 (consumo indevido) no ADN e ao mesmo desfecho pratico: o cliente para de receber nota. NULL so enquanto a empresa nunca sincronizou.';

-- max_nsu continua sendo SÓ de NF-e — mas agora pelo motivo certo: não é que a
-- NFS-e use outro cursor, é que o envelope do ADN não traz o "até onde a fila
-- vai". Sem esse número, a tela NÃO CONSEGUE dizer "faltam N notas" em NFS-e, e
-- não deve inventar: o único sinal de fim é `filaDrenada`.
COMMENT ON COLUMN public.dfe_sync_state.max_nsu IS
  'SO TEM VALOR EM tipo=''nfe''. Ultimo NSU que a SEFAZ declarou existir pra este CNPJ (maxNSU da resposta); comparado com ultimo_nsu diz o quanto ainda falta ler. O ADN NAO devolve esse numero — em tipo=''nfse'' fica NULL para sempre, e por isso a tela nao consegue (nem deve tentar) dizer "faltam N notas" pra NFS-e: o unico sinal de fim de fila la e filaDrenada.';

-- `janela_fim` era o suposto cursor de NFS-e. Não é cursor de nada. Fica na
-- tabela em vez de ser derrubada por DOIS motivos, nesta ordem:
--   1. `useInboundNotes.ts` faz SELECT nominal dela nas duas filas; derrubar a
--      coluna quebra a query do front em runtime — e mexer no hook é mudança de
--      código de domínio, que não é decisão desta camada.
--   2. Ela tem uso PLAUSÍVEL e distinto na ingestão manual/municipal (NFS-e
--      fora do Ambiente Nacional, onde o cliente informa um período e NSU não
--      existe). Coluna com dono futuro e comentário honesto é melhor que
--      coluna removida e recriada em três meses.
-- O que NÃO se aceita é ela ficar órfã e sem explicação — daí o comentário
-- dizer, em primeira linha, que hoje ninguém escreve nela.
COMMENT ON COLUMN public.dfe_sync_state.janela_fim IS
  'SEM USO NO FLUXO AUTOMATICO — nao e cursor de ninguem. Nasceu da premissa ERRADA de que a NFS-e recebida seria consultada por janela de periodo (31 dias); isso e comportamento de WRAPPER de terceiro, nao do governo: o ADN serve a fila por NSU, igual a SEFAZ. Fica na tabela, sempre NULL na ingestao automatica, reservada pra ingestao MANUAL/municipal fora do Ambiente Nacional (onde o cliente informa um periodo e nao existe NSU). Coluna lida pelo front (useInboundNotes) — derrubar exige mexer no hook.';

COMMENT ON COLUMN public.dfe_sync_state.proxima_consulta_em IS
  'TRAVA ANTI-CONSUMO-INDEVIDO. Instante a partir do qual uma nova consulta e permitida. O cron NAO chama o governo antes disso, nem que o usuario aperte o botao. Vale nos dois tipos: em ''nfe'' o gatilho e o cStat 656 da SEFAZ; em ''nfse'' e o HTTP 429 do ADN. Retorno vazio ou bloqueado empurra este campo pra frente (>= 1h) em vez de tentar de novo.';

-- ⚠️ A contagem do último lote NÃO é "quantas notas entraram". Em NFS-e o feed
-- do ADN MISTURA nota emitida pela própria empresa com nota recebida; as
-- emitidas avançam o cursor e são descartadas na ingestão. Logo "0 gravadas com
-- o feed andando" é o resultado NORMAL, e quem mede "a fila andou" (base do
-- backoff por ociosidade) é este campo, não a contagem de gravadas.
COMMENT ON COLUMN public.dfe_sync_state.documentos_ultimo_lote IS
  'Quantos documentos o GOVERNO entregou no ultimo lote — nao quantos foram gravados. Em tipo=''nfse'' isso inclui as notas EMITIDAS pela propria empresa, que o feed do ADN mistura com as recebidas e que sao descartadas na ingestao: o que este campo mede e "a fila andou", e e dele que sai o ciclos_sem_documento. Zero nota gravada com o feed andando e resultado NORMAL em NFS-e, nao falha. Serve tambem pra auditar buraco de sequencia junto com inbound_nfe.nsu.';

COMMENT ON FUNCTION public.dfe_sync_state_nsu_nao_regride() IS
  'Recusa UPDATE que diminua ou apague dfe_sync_state.ultimo_nsu, NOS DOIS TIPOS. Em nfe, regredir o ponteiro e o que faz a SEFAZ devolver cStat 656 (Consumo Indevido) e a nota destinada se perder. Em nfse nao ha 656, mas regredir manda reler o feed inteiro do ADN, que responde HTTP 429. Vale ate pra service_role (gatilho, nao policy).';

-- ---------------------------------------------------------------------------
-- 2) inbound_nfse.nsu — deixa de ser "fica NULL" e passa a ser o cursor da linha
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.inbound_nfse.nsu IS
  'NSU com que o documento saiu da fila de distribuicao do Ambiente de Dados Nacional. A distribuicao do ADN e por NSU (igual a da SEFAZ) — ao contrario do que a versao inicial desta migration dizia, nao existe consulta por periodo no governo direto; periodo e recorte de wrapper de terceiro. Preenchido em origem=''dfe'', NULL em origem=''manual''.';

COMMENT ON COLUMN public.company_fiscal_settings.dfe_nfse_ativo IS
  'Opt-in de RECEBER NFS-e tomada (distribuicao do Ambiente de Dados Nacional, fila por NSU). Nasce false. Independente de dfe_nfe_ativo: sao webservices e credenciamentos diferentes, ainda que a mecanica de fila seja a mesma.';

-- ---------------------------------------------------------------------------
-- 3) Guarda
-- ---------------------------------------------------------------------------
-- Asserção = a INVARIANTE que a correção acabou de tornar explícita: o gatilho
-- anti-regressão tem que estar vivo, porque a partir de agora ele é a única
-- coisa que impede uma releitura de feed inteiro de NFS-e (HTTP 429). O resto é
-- relatório.
DO $guard$
DECLARE
  v_trg     integer;
  v_check   integer;
  v_mentira integer;
  v_nfse    integer;
BEGIN
  SELECT count(*) INTO v_trg
    FROM pg_trigger
   WHERE tgrelid = 'public.dfe_sync_state'::regclass
     AND tgname  = 'trg_dfe_sync_state_nsu_nao_regride'
     AND NOT tgisinternal;
  IF v_trg <> 1 THEN
    RAISE EXCEPTION 'dfe_sync_state sem o gatilho anti-regressao de NSU: a fila de NFS-e ficaria sem protecao contra releitura de feed inteiro.';
  END IF;

  -- A CHECK de 15 dígitos é o que casa com o formato que a rota de NFS-e
  -- devolve. Se alguém a afrouxar, o comentário acima vira mentira de novo.
  SELECT count(*) INTO v_check
    FROM pg_constraint
   WHERE conrelid = 'public.dfe_sync_state'::regclass
     AND conname  = 'dfe_sync_state_ultimo_nsu_check';
  IF v_check <> 1 THEN
    RAISE EXCEPTION 'dfe_sync_state_ultimo_nsu_check ausente: o formato de 15 digitos do NSU deixaria de ser garantido.';
  END IF;

  -- O comentário de `ultimo_nsu` é o que estava mentindo. A asserção é
  -- NOMINAL e NEGATIVA de propósito: um curinga tipo "31 dias" pegaria o
  -- comentário CORRETO de `janela_fim`, que cita a premissa antiga justamente
  -- pra dizer que ela era errada — falso positivo que derrubaria a migration.
  SELECT count(*) INTO v_mentira
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.oid = 'public.dfe_sync_state'::regclass
     AND a.attname = 'ultimo_nsu'
     AND (
       col_description(c.oid, a.attnum) IS NULL
       OR col_description(c.oid, a.attnum) ~* 'sempre NULL em tipo'
       OR col_description(c.oid, a.attnum) !~* 'VALIDO NOS DOIS TIPOS'
     );
  IF v_mentira <> 0 THEN
    RAISE EXCEPTION 'O comentario de dfe_sync_state.ultimo_nsu nao ficou corrigido (ainda afirma ser so de NF-e).';
  END IF;

  SELECT count(*) INTO v_nfse FROM public.dfe_sync_state WHERE tipo = 'nfse';

  RAISE NOTICE '[notas destinadas] comentarios corrigidos: NFS-e recebida usa cursor de NSU, igual a NF-e. Nenhuma coluna criada. % linha(s) de dfe_sync_state em tipo=nfse.', v_nfse;
END
$guard$;
