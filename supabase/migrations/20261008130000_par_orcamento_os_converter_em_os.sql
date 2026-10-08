-- ════════════════════════════════════════════════════════════════════════════
-- "Converter em OS" nunca funcionou: as duas colunas do par orçamento↔OS
-- jamais existiram no banco
-- ════════════════════════════════════════════════════════════════════════════
--
-- DIAGNÓSTICO (provado em produção em 2026-10-08, base inteira):
--
--   * `src/hooks/useQuoteConversion.ts` insere em `service_orders` o campo
--     `quote_id` -> a coluna NÃO existia, o PostgREST recusava o insert com
--     PGRST204 e a OS nem chegava a ser criada;
--   * o mesmo hook faz `UPDATE quotes SET converted_to_os_id = ..., status =
--     'convertido'` -> `quotes.converted_to_os_id` também NÃO existia.
--
--   Evidência: `information_schema.columns` não devolvia NENHUMA coluna com
--   '%quote%' em `service_orders` nem '%converted%' em `quotes` (as 40 colunas
--   de `quotes` estão listadas e nenhuma é essa); 109 orçamentos na base e
--   ZERO com `status = 'convertido'`; ZERO OS com
--   `description LIKE 'Convertido do Or%'`. Quebrado desde que a ação nasceu
--   (março/2026) -- nunca foi regressão, foi divergência de schema de origem.
--
-- DECISÃO DE ARQUITETURA: criar as colunas que faltam e deixar o hook rodar
-- como foi escrito. O código não é reescrito, a funcionalidade não é removida.
--
-- ────────────────────────────────────────────────────────────────────────────
-- POR QUE `ON DELETE SET NULL` NOS DOIS LADOS (de propósito, não é descuido)
-- ────────────────────────────────────────────────────────────────────────────
--
--   * `service_orders.quote_id` -> apagar o ORÇAMENTO não pode apagar nem
--     travar a OS: a OS pode já ter sido executada, assinada, faturada e tem
--     fotos/checklist/itens de estoque pendurados nela. O vínculo com a origem
--     é informativo; perder a origem não invalida o serviço prestado.
--     (`CASCADE` apagaria histórico de campo; `RESTRICT` travaria o orçamento
--     pra sempre, que é exatamente a armadilha que o `20261008120000` acabou
--     de consertar no lado financeiro.)
--
--   * `quotes.converted_to_os_id` -> apagar a OS não pode apagar nem travar o
--     ORÇAMENTO: o orçamento é documento comercial, foi enviado ao cliente e
--     pode ter lançamento financeiro apontando pra ele.
--
-- ⚠️  ARMADILHA CONHECIDA, DOCUMENTADA DE PROPÓSITO (NÃO resolvida aqui):
--
--   `ON DELETE SET NULL` em `quotes.converted_to_os_id` deixa o orçamento num
--   estado órfão quando a OS é apagada: `converted_to_os_id` volta a NULL mas
--   `status` continua `'convertido'`. Na tela de Orçamentos
--   (`src/pages/Quotes.tsx`) isso some com as ações úteis -- é o MESMO formato
--   de bug do orçamento #99 da "Alo gas Juquitiba" (ver migration
--   `20261008120000_destrava_orcamento_quando_lancamento_e_apagado.sql`), onde
--   o `ON DELETE SET NULL` da FK zerou o ponteiro e o campo-irmão sobrou
--   preenchido.
--
--   A rede de segurança espelhada seria um `BEFORE DELETE` em `service_orders`
--   devolvendo a quote pra `'aprovado'` -- exatamente como o
--   `trg_reset_quote_financial_link_on_delete` faz em `financial_transactions`.
--   TEM que ser BEFORE: no AFTER o `SET NULL` da FK já rodou e o
--   `WHERE converted_to_os_id = OLD.id` casaria ZERO linhas, em silêncio.
--
--   NÃO está nesta leva: fica pendente de aprovação do Tech Lead. Hoje o
--   risco é zero na prática porque não existe nenhuma linha
--   `status = 'convertido'` na base inteira -- a janela de exposição só abre
--   quando a primeira conversão real acontecer.
--
-- RLS: nada a fazer. `quotes` e `service_orders` já têm RLS habilitada e
-- filtram por `company_id` (`Users manage own company quotes` e
-- `Users manage entitled own company service_orders`). Nenhuma policy das duas
-- tabelas enumera colunas e não existe GRANT column-level em nenhuma das duas
-- (os privilégios são table-level), então coluna nova não abre superfície nova.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. As colunas
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS quote_id uuid
  REFERENCES public.quotes(id) ON DELETE SET NULL;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS converted_to_os_id uuid
  REFERENCES public.service_orders(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Índices -- as duas colunas são lidas em gate de UI e em listagem
-- ────────────────────────────────────────────────────────────────────────────
-- `quotes.converted_to_os_id`: gate do botão "Converter em OS"
--   (`if (quote.converted_to_os_id) throw ...` no hook) e do que a tela de
--   Orçamentos mostra em cada linha.
-- `service_orders.quote_id`: caminho inverso (de qual orçamento esta OS veio),
--   e é a coluna varrida por qualquer `ON DELETE SET NULL` de quote -- sem
--   índice, apagar 1 orçamento faz seq scan em `service_orders`.

CREATE INDEX IF NOT EXISTS idx_service_orders_quote_id
  ON public.service_orders (quote_id)
  WHERE quote_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_converted_to_os_id
  ON public.quotes (converted_to_os_id)
  WHERE converted_to_os_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Documentação das colunas
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.service_orders.quote_id IS
  'Orçamento de origem desta OS. Preenchido pela ação "Converter em OS" da tela de Orçamentos (useQuoteConversion.convertToServiceOrder). É o lado OS->orçamento do par; o lado espelho é quotes.converted_to_os_id. ON DELETE SET NULL de propósito: apagar o orçamento não pode apagar nem travar uma OS que pode já ter sido executada e faturada.';

COMMENT ON COLUMN public.quotes.converted_to_os_id IS
  'OS gerada a partir deste orçamento pela ação "Converter em OS" (useQuoteConversion.convertToServiceOrder, que grava junto status = convertido). É o lado orçamento->OS do par; o lado espelho é service_orders.quote_id. Serve de gate: preenchido = já convertido, o botão não reaparece. ON DELETE SET NULL de propósito: apagar a OS não pode apagar nem travar o orçamento. ATENÇÃO: o SET NULL deixa status = convertido órfão -- ver o aviso no topo da migration 20261008130000.';
