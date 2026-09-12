-- ============================================================================
-- financial_transactions.card_installments
--
-- CONTEXTO
-- --------
-- Quando o cliente final paga uma receita no cartão de crédito parcelado, o
-- dono da empresa escolhe COMO o dinheiro entra no Contas a Receber:
--   · "recebo tudo de uma vez" (antecipado)      -> grava 1 linha, valor cheio
--   · "recebo conforme o cliente paga" (faseado) -> grava N linhas
--
-- No modo faseado o parcelamento já fica registrado naturalmente em
-- `installment_number` / `installment_total`. No modo ANTECIPADO essa
-- informação ("o cliente pagou em 10x") não tinha onde ir e se perdia.
--
-- POR QUE NÃO REUTILIZAR `installment_total`
-- -------------------------------------------
-- A tela usa `installment_total > 1` como sinal de "esta linha é parcela de um
-- grupo": o campo vira selo "Parcela ?/N" somente leitura. Gravar aqui o
-- número de parcelas do cartão no modo antecipado (que é sempre 1 linha
-- física) faria a própria linha única se apresentar como parcela de um grupo
-- que não existe.
--
-- DESENHO
-- -------
-- Coluna nova e independente, preenchida SÓ no modo antecipado. NULL = "não
-- se aplica" (recebimento à vista, ou modo faseado onde a informação já vive
-- em installment_total). Sem backfill: NULL é o estado de 100% da base hoje.
-- ============================================================================

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS card_installments smallint NULL;

COMMENT ON COLUMN public.financial_transactions.card_installments IS
  'Em quantas vezes o CLIENTE FINAL parcelou no cartao. Preenchido so no modo antecipado (recebimento em 1 linha), onde installment_total nao pode ser usado porque a tela o trata como parcela de grupo. NULL = nao se aplica.';

-- ----------------------------------------------------------------------------
-- Sem CHECK de faixa de propósito.
--
-- O Asaas (nosso emissor de cobrança) aceita de 1 a 21 parcelas hoje, e essa
-- regra pode mudar sem aviso, é decisão comercial da adquirente, não do banco.
-- Uma CHECK travada em "1 a 21" (ou "1 a 24") viraria uma segunda fonte de
-- verdade que quebra silenciosamente no dia em que o Asaas mudar o teto — e
-- quem sofreria não é o dono da empresa que digitou errado, é o fluxo de
-- integração, com uma mensagem de erro de banco (não de formulário) sem
-- contexto nenhum pro usuário.
--
-- Existe, sim, um precedente concreto de bug nesta base por campo numérico
-- sem limite (alguém digitou 14.444 parcelas num formulário sem validação).
-- Mas o remédio certo pra "usuário digitou um número absurdo" é validação na
-- BORDA — no formulário, com feedback imediato em PT-BR e o teto real do
-- método de pagamento escolhido (à vista não tem parcela; débito não parcela;
-- crédito seguindo o limite vigente do Asaas). O banco não sabe qual desses
-- contextos está em jogo nem qual é o teto vigente da adquirente; só sabe que
-- o valor é um smallint (já barra 32.768+ de cara, sem precisar de CHECK).
--
-- Se essa mesma coluna algum dia passar a alimentar cálculo interno (juros,
-- rateio de taxa por parcela), aí sim uma CHECK de sanidade grosseira
-- (ex.: 1 a 99, só pra pegar erro de dedo tipo "14444") volta a fazer sentido
-- — porque nesse caso o valor deixa de ser só um rótulo informativo e passa a
-- ser insumo de conta. Hoje `card_installments` é só rastreabilidade/rótulo
-- para a conciliação bancária por extrato (no roadmap), não insumo de cálculo.
-- ----------------------------------------------------------------------------
