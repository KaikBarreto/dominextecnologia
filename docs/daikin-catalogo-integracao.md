# Catálogo Daikin Brasil — integração e cobertura

Revisão: **15/11/2026**. Responsável: curadoria técnica Dominex. Revisar ao atualizar documentos, modelos ou geração comercial.

## Cobertura conferida

O manifesto contém **1.797 referências documentadas**, das quais **1.793 são novas** em relação aos quatro EcoSwing Gold já cadastrados. O controle remoto genérico preexistente foi preservado separadamente.

| Tipo de referência | Quantidade |
| --- | ---: |
| Unidades internas/externas, ventilação e purificadores | 527 |
| Configurações publicadas nos catálogos industriais | 1.071 |
| Combinações de unidades explicitamente publicadas | 188 |
| Séries configuráveis sem SKU completo fechado | 11 |
| **Total** | **1.797** |

São **1.789 referências de climatização/industrial** e **8 purificadores**, estes no domínio de linha branca, sem gás ou BTU fictício. Nenhuma combinação foi gerada multiplicando capacidades ou sufixos. Configuração de catálogo não equivale automaticamente ao código completo de pedido de uma máquina com opcionais.

Todas as referências têm imagem original identificada. **13 usam ilustração técnica**, não fotografia: nove condensadoras Multi antigas e quatro Exclusive. Essa identificação permanece no card, na ampliação e no arquivo baixado. As demais imagens representam a família/tipologia; não são prova de acabamento, quadro elétrico ou quantidade de módulos da variante exata.

Há **1.787 documentos vinculados**. Dez referências permanecem sem manual exato comprovado: RZR30/36/42/48AVL (somente publicação BIM/RFA), MC55UVM6, MCK55TVM6 e séries WSC/WMC/WME/ZUW-B. Arquivo BIM não foi apresentado como PDF, e manual de outra geração não foi usado para preencher lacuna.

## Fontes por domínio

- [Residencial: 145 códigos, imagens e diagnóstico por família](daikin-residencial-fontes.md)
- [Comercial: 562 códigos, unidades e combinações VRV/SkyAir](daikin-comercial-fontes.md)
- [Industrial/Applied e purificadores: 1.090 referências](daikin-industrial-fontes.md)
- [Central oficial de downloads Daikin Brasil](https://www.daikin.com.br/profissionais/downloads)

Os documentos primários foram conferidos por hash, páginas e identidade. **108 códigos exigem prova visual de páginas escaneadas**: 41 HXE, sete ZUWV e 60 RHXYQ. As demais referências com PDF têm o código localizado textualmente nas páginas declaradas. Referências publicadas somente em HTML/BIM são identificadas como tal. Duas confusões E/F foram corrigidas pela leitura da tabela original, com teste de regressão.

As configurações de 50 Hz explicitamente publicadas mantêm essa identificação. Não se inventa uma variante de 60 Hz nem se trata potência térmica como consumo elétrico. Cartões de componentes ou de equipamentos sem dados elétricos não exibem uma estimativa de consumo presumida.

## Diagnóstico e limites

Foram acrescentadas **14 referências de tabelas**, restritas a **68 códigos exatos de equipamentos**, além das tabelas existentes de Hi-Wall e SkyAir AVL. São 113 referências de equipamentos Daikin com códigos disponíveis na leitura consolidada. Isso não significa que os demais 1.684 equipamentos/séries compartilhem um diagnóstico universal.

- UA da FFQ e UA da Multi PMVM mantêm os significados de seus respectivos documentos.
- A tabela da 2MXC-R não é aplicada à 3MKC-S.
- FDMQA30/36 R-32 têm 54 códigos inequívocos; tipografias ambíguas HO/HS/LS não são corrigidas por adivinhação.
- As seis indicações VRV W IV de teste inicial são identificadas como **comissionamento**, inclusive na interface, sem apresentá-las como tabela universal de falhas em operação.
- Registros de diagnóstico remotos existentes têm precedência sobre a complementação.

Classes legadas como 3MXS75/80/90/100, 5MXS100 e externas Advance N5 sem sufixo completo confirmado continuam pendentes. A publicação de uma classe num nome de arquivo não permite gerar um SKU. Refnets, controles, BS, kits e filtros não foram contados como condicionadores completos.

## Implementação e publicação

- `src/data/daikinCatalog.json`: identidades estáveis, categoria/domínio, apresentação e procedência.
- `src/data/daikinErrorCodeReferences.json`: tabelas, páginas, contexto e modelos exatos abrangidos.
- `src/data/equipmentCatalogAssets.json`: imagens/manuais com fonte, hash, tipo e escopo.
- `src/data/curatedEquipmentModels.ts`: integração aditiva à leitura do hook canônico; marca/domínio/código normalizado evitam duplicação. UUID e campos preenchidos do servidor são preservados.
- `src/lib/catalogPagination.ts`: leitura por páginas de 500, com ordem estável e sem teto silencioso de mil registros.
- Grade do catálogo: páginas finitas de 10/25/50/100, busca/filtros reiniciando a página. A navegação inferior móvel tem área de rolagem reservada, inclusive ao focar ou revelar ações.

O catálogo consolidado de todas as marcas fica com **2.059 registros**, **2.058 com imagem**, **2.015 com documento** e **4.573 associações de códigos**. As imagens anteriores permanecem preservadas. Esses números são o retrato desta revisão, não constantes de interface.

Os 3.584 vínculos Daikin usam **129 arquivos únicos** compartilhados por SHA-256. Os arquivos foram preparados com `--stage-only`; **nenhum novo registro foi persistido no catálogo de produção e o app não foi publicado**. A versão local integra os novos itens por manifesto, preservando os dados remotos existentes. Não há alteração de schema, RLS, API pública ou edge function.

## Reproduzir a curadoria e os testes

As pesquisas e provas pesadas ficam em `.context/daikin-{residential,commercial,industrial}/`; não versionar PDFs, imagens ou credenciais. Os manifestos de aplicação e as fontes/páginas/hashes são versionáveis. Os preparadores consomem os manifestos públicos locais já revisados, não fazem descoberta automática por semelhança de código.

```sh
python3 scripts/prepare-daikin-catalog.py
python3 scripts/prepare-daikin-error-references.py
python3 scripts/import-equipment-catalog-assets.py --stage-only \
  --manifest .context/daikin-assets-manifest.json \
  --models-manifest src/data/daikinCatalog.json
python3 scripts/test-equipment-catalog-assets.py
```

O preparador recebe a URL pública do backend pelo ambiente; o importador recebe a credencial exclusivamente pelo ambiente do processo, conforme o [procedimento de curadoria](catalogo-integracao-curadoria.md). Nunca imprimir ou versionar secrets. Fotos/PDFs compartilhados só aceitam caminho correspondente ao hash completo, e o upload não sobrescreve arquivos. `--models-manifest` permite preparar arquivos dos novos itens antes da publicação; `--apply` recusa alterações de registros ainda não persistidos.
