-- PMOC: endereço próprio da UNIDADE no contrato
-- Por quê: um contrato PMOC = 1 unidade (loja/site). A Planilha PMOC (Seção 1,
-- identificação do ambiente/unidade) precisa do endereço da UNIDADE, que pode
-- diferir do cliente proprietário. Hoje usa-se o endereço do cliente; estas
-- colunas permitem um endereço próprio com fallback pro cliente na aplicação.
-- Todas aditivas/nullable; idempotentes.

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS unidade_nome text NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS unidade_endereco text NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS unidade_numero text NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS unidade_complemento text NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS unidade_bairro text NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS unidade_cidade text NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS unidade_uf text NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS unidade_cep text NULL;

COMMENT ON COLUMN public.contracts.unidade_nome IS 'PMOC Seção 1: nome/identificação da unidade (fallback: cliente)';
COMMENT ON COLUMN public.contracts.unidade_endereco IS 'PMOC Seção 1: logradouro da unidade (fallback: cliente)';
