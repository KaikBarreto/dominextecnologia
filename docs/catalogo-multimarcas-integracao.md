# Catálogo multimarcas e navegação por categorias

Revisão editorial/técnica: 15/11/2026, equipe Dominex. Fontes originais listadas nos documentos abaixo; esta curadoria não declara cobrir todos os equipamentos já comercializados. Uma próxima atualização deve conferir novamente modelos, versões dos manuais e compatibilidade das tabelas de diagnóstico.

## Cobertura desta etapa

| Marca | Referências documentadas |
| --- | ---: |
| Midea | 239 |
| Springer / Springer Midea | 21 |
| Carrier | 173 |
| LG | 741 |
| Samsung | 354 |
| Gree | 411 |
| Total | 1.939 |

São 1.931 novas referências e oito registros existentes com UUID/campos preenchidos preservados. O total inclui unidades físicas, configurações, combinações publicadas e séries; a ficha identifica a natureza de cada referência. Não se trata de 1.939 sistemas completos distintos.

Todos têm imagem; imagens de família e ilustrações técnicas são identificadas. Nos oito registros já existentes, os arquivos previamente preenchidos têm precedência. Seis grafias Gree com parênteses foram consolidadas com os códigos equivalentes publicados nos manuais, sem criar variantes de hardware. Um conflito entre capacidade publicada em catálogo e manual permanece sem valor inferido.

Há 3.792 associações espelhadas em 254 arquivos identificados por SHA-256. PDFs grandes também conservam os bytes originais completos; o navegador os abre diretamente por URL/Range, sem criar versões reduzidas nem baixar o arquivo inteiro para um blob na memória do celular. O espelhamento evita o bloqueio 403 que a LG devolveu no Chromium real ao acessar seus originais. Nenhum limite/configuração do armazenamento foi alterado. Páginas de produto HTML/JSON não são apresentadas como manual; documentos já existentes são preservados.

As tabelas adicionais de diagnóstico contêm nove referências, 319 pares explícitos marca/modelo e 120 entradas. Samsung DVM S2 mantém o contexto de comissionamento, separado da operação. Estados normais como degelo não são descritos como defeito. O mesmo código não é generalizado entre marcas ou famílias.

## Navegação

Marcas extensas usam categoria → família → lista e detalhe. Nas famílias com muitas tipologias, o tipo de unidade fica disponível diretamente acima da lista. Marcas pequenas abrem na lista. Categorias vêm da arquitetura/tipologia publicada, nunca de capacidade ou suposição pelo SKU; chiller prevalece sobre o nome comercial DVM.

No desktop, lista e detalhe ficam lado a lado, com orientação antes da seleção. No celular, selecionar o modelo abre o detalhe com retorno explícito à lista. As listas são paginadas. A busca atravessa categorias da marca e aceita diferenças de espaços, barras e parênteses; ao limpar a busca, o escopo anterior é retomado. Abrir e voltar dos códigos preserva categoria, família e busca na URL.

Resultados de códigos agrupam o código e mostram equipamentos em linhas, sem pilhas de badges. Tanto os grupos quanto suas listas internas têm paginação. O significado aparece no contexto do modelo escolhido; cores continuam reservadas a informação com finalidade, como fluido e segurança.

Os JSONs documentais ficam em chunks próprios, sem aumentar o limite do cache offline. A tela não concentra todo o catálogo em um único arquivo JavaScript.

## Preparação e publicação

- `scripts/prepare-additional-catalog.py`: curadoria local, prova literal/visual/HTML, preservação de registros e assets anteriores, deduplicação e limite de espelhamento.
- `scripts/prepare-additional-error-references.py --check --self-test`: referências de diagnóstico com cobertura explícita, hashes e páginas.
- `src/data/additionalCatalog.json` e `src/data/additionalErrorCodeReferences.json`: dados versionados de leitura; não criam registros comerciais nem equipamentos de clientes.
- `scripts/import-equipment-catalog-assets.py --stage-only --manifest .context/additional-assets-manifest.json --models-manifest src/data/additionalCatalog.json`: valida arquivos e hospeda objetos imutáveis; não grava linhas no banco. Credenciais apenas no ambiente do processo, conforme a governança do repositório.
- `--apply` continua recusando modelos ainda ausentes da base. Não substituir arquivos posteriores ou dados preenchidos.

Preparação usa evidências públicas em `.context`, inclusive snapshots HTML com hash, sem dados de clientes. Os relatórios locais registram entradas congeladas, pendências, hashes de saída e preservação dos assets anteriores.

## Fontes e limites

- [Midea / Springer / Carrier](catalogo-midea-group-fontes.md)
- [LG](catalogo-lg-fontes.md)
- [Samsung / Gree](catalogo-samsung-gree-fontes.md)
- [Etapa Daikin](daikin-catalogo-integracao.md)
- [Importação e precedência de arquivos](catalogo-integracao-curadoria.md)

Famílias com nomenclatura abreviada, códigos ainda sem comprovação literal ou tabelas de erro não revisadas permanecem pendentes. Não criar combinações, sufixos, refrigerantes ou diagnósticos por aproximação.

## Validação da integração

- 115 testes focados de catálogo, referências, paginação e ferramentas do técnico; sete testes Python do importador; 65 testes de segurança e auditoria RLS aprovados.
- Build completo aprovado, com 176 páginas estáticas e chunks documentais abaixo do limite do cache offline.
- Lint dos arquivos desta entrega e `git diff --check` aprovados. O lint global mantém falhas fora deste escopo; TypeScript permanece com as mesmas 78 falhas anteriores, sem novas mensagens semânticas.
- Interface real validada em 1440 px claro, 390 px claro/escuro e 320 px escuro: categorias das sete marcas, famílias, tipo de unidade, busca, paginação de grupos de erro, retorno contextual, vazio e marca pequena. Sem overflow horizontal nem erros JavaScript. Fotos e ações também conferidas.
- Os 254 objetos espelhados responderam HTTP 200; 66 amostras SHA-256 foram conferidas. Os sete PDFs grandes passaram nos testes públicos de tamanho, assinatura PDF e leitura Range HTTP 206. O botão de manual e as referências documentais utilizam a cópia de hash idêntico, evitando o bloqueio do site original. O download grande foi testado sem fetch/blob no celular.
- Assets preparados em `stage-only`; nenhum modelo criado ou atualizado no banco. Aplicativo sem commit/push/publicação nesta etapa.
