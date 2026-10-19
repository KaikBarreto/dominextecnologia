-- ============================================================================
-- MODULO PDV E LOJA (add-on R$ 200/mes) : Onda 1, parte 1 de 4 (o catalogo)
--
-- POR QUE ESTE ARQUIVO EXISTE
-- ---------------------------------------------------------------------------
-- O preco de modulo NUNCA e hardcoded no front. Quem manda e esta tabela, lida
-- por useCompanyModules / pela tela de planos. Enquanto a linha nao existe aqui,
-- nenhuma empresa consegue contratar o PDV, e e exatamente esse o estado seguro
-- durante a construcao da Onda 1: as tabelas e colunas das partes 2, 3 e 4
-- podem existir no banco sem que ninguem veja nada de novo na tela.
--
-- DECISAO COMERCIAL (CEO, 18/10/2026) : TRAVADA
--   * code 'pdv', R$ 200/mes, type 'addon'. Empata com o Modulo Basico em
--     preco e e o maior add-on do catalogo.
--   * A NOTA FISCAL NAO ENTRA NESSES R$ 200. NFC-e e NF-e ficam no modulo `nfe`
--     que ja existe (hoje NFS-e), entao "PDV Fiscal" = modulo `pdv` + modulo
--     `nfe`. Quem so quer caixa paga R$ 200 e imprime comprovante interno.
--   * O PDV nao exige o modulo `cobrancas`. Com ele, Pix vira QR Code na tela;
--     sem ele, Pix e forma de pagamento confirmada na mao.
--
-- NENHUM PLANO PRONTO CONCEDE O PDV
-- ---------------------------------------------------------------------------
-- Mesma regra de Cobrancas (20261016235900): add-on pago nao entra em plano
-- pronto nem no Personalizado por tabela. O UPDATE defensivo no fim do arquivo
-- garante que nenhuma linha de subscription_plans ganhou 'pdv' por acidente de
-- outra migration. Rodar duas vezes nao muda nada.
-- ============================================================================

BEGIN;

INSERT INTO public.subscription_modules (code, name, description, price, type, is_active, sort_order)
VALUES (
  'pdv',
  'PDV e Loja',
  'Venda no balcão com abertura e fechamento de caixa conferindo o dinheiro, leitura de código de barras, foto no produto, pagamento combinado (dinheiro, Pix, cartão), fiado na ficha do cliente e o resultado da loja separado do resultado do serviço.',
  200,
  'addon',
  true,
  14
)
ON CONFLICT (code) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      price       = EXCLUDED.price,
      type        = EXCLUDED.type,
      is_active   = EXCLUDED.is_active,
      sort_order  = EXCLUDED.sort_order;

-- Defensivo e idempotente: o PDV so chega na empresa por contratacao explicita
-- em company_modules. Se algum plano pronto tiver ganhado 'pdv', remove.
UPDATE public.subscription_plans
   SET included_modules = COALESCE(included_modules, '[]'::jsonb) - 'pdv'
 WHERE COALESCE(included_modules, '[]'::jsonb) ? 'pdv';

COMMIT;
