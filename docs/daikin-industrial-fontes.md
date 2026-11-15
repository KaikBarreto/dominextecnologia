# Daikin Brasil — modelos industriais e purificadores

Revisão: 15/11/2026. Curadoria: equipe técnica Dominex. Fontes: páginas públicas e downloads originais da Daikin Brasil.

## Cobertura

O manifesto operacional `.context/daikin-industrial-models.json` reúne **1090 registros**: **1079 códigos de modelo/configuração literalmente publicados** e **11 séries configuráveis identificadas explicitamente**. Não foram gerados sufixos elétricos, capacidades ou combinações por inferência. O catálogo oficial brasileiro publica documentos de exportação, inclusive tabelas 50 Hz; publicação no site não é prova de disponibilidade comercial atual de cada SKU.

| Família documentada | Registros |
|---|---:|
| Hi-Wall hidrônico FWW | 4 |
| Cassete hidrônico FWKE | 5 |
| Cassete hidrônico FWK | 13 |
| Duto hidrônico FWC | 10 |
| Duto Slim hidrônico FWW V/T | 55 |
| Hospitalar FWDHA | 3 |
| UAL ER6 R-32 | 2 |
| UAL Mini ER5 | 8 |
| UHAS | 6 |
| VZ R-1234ze | 32 |
| VZ R-134a | 32 |
| VZ R-513A | 32 |
| 4Z R-134a | 16 |
| 4Z R-513A | 16 |
| HTS/HTC | 53 |
| TZD | 443 |
| TZD Free Cooling | 300 |
| Streamer | 6 |
| Streamer legado U/T | 2 |
| HXE R-134a | 33 |
| HXE Modular R-134a | 3 |
| HXE R-1234ze(E) | 5 |
| ZUWV | 7 |
| Centrífugo WSC | 1 |
| Mancal Magnético WMC | 1 |
| Mancal Magnético WME | 1 |
| Parafuso Inverter ZUW-B | 1 |

## Origem e prova

- Inventário de documentos industrial: [Applied no portal de downloads](https://www.daikin.com.br/profissionais/downloads), linha6/produtos19,20,29,30 e46; purificadores linha9/produto36. Respostas dos filtros e listas foram preservadas localmente.
- Páginas de produto e fotos de família: [linha comercial pesada/industrial](https://www.daikin.com.br/produtos/comercial-pesado-industrial) e [purificadores](https://www.daikin.com.br/produto/purificador-de-ar).
- Cada registro carrega código, categoria, tipo de unidade, documento, páginas físicas, SHA-256, fonte da foto, hash e escopo. PDFs e imagens ficam em `.context/daikin-industrial/`; nenhum segredo, dado de cliente ou tabela privada foi consultado.
- Foram baixados e abertos 25 documentos originais. HXE1693/1698/1701 têm o mesmo hash; UHAS1659/1544 também. Não se contam essas cópias como gerações/modelos diferentes.
- Os códigos das tabelas textuais foram extraídos por padrões fechados e associados às páginas que contêm o literal exato. HXE foi transcrito e conferido visualmente no raster; OCR serviu apenas para localizar candidatos e teve erros O/0 e E/F corrigidos pela imagem original.

## Séries configuráveis e limites

- Os sete modelos-base ZUWV têm asterisco na configuração completa do documento. São séries configuráveis, não SKUs fechados de pedido. A configuração completa depende da placa/projeto.
- WSC, WMC, WME e ZUW-B são séries citadas explicitamente na página industrial oficial; não foram inventadas variações individuais, e nenhum manual de outra família foi associado.
- MC55UVM6 e MCK55TVM6 constam na página legada. O catálogo atual Y não foi associado a esses modelos U/T.
- Fancoletes FWW/FWK/FWKE/FWC/FWDHA usam água gelada/quente; não receberam gás refrigerante fictício. Códigos-base de tabela preservam a necessidade de completar alimentação/opções conforme a nomenclatura e a placa.
- UHAS é cascata: o IOM original informa R-134a no gerador de água e R-410A nas unidades externas. A associação registra ambos os circuitos, sem inventar consumo ou capacidade.
- VZ/TZD/4Z: os fluidos derivam da tabela/nomenclatura explícita do documento, e não de uma regra genérica de marca. Não converter letras H do modelo em ciclo quente/frio: nesses códigos H identifica o fluido.
- Capacidades/consumo não foram estimados pelo número do modelo. Em especial, tabela HXE repete o mesmo código com seleções térmicas diferentes; o campo permanece vazio até seleção de projeto.

## Fotos

Fotos de página oficial são representativas da família. FWK usa foto do catálogo FWK, não foto FWKE. MiniER5, multipropósito4Z, UHAS e as gerações TZD/FreeCooling2024 usam imagens originais incorporadas no PDF; quando necessário, a máscara de transparência original foi restaurada ao exportar PNG, sem redesenho ou mudança de conteúdo. `imagePdfXref`, `imagePdfSmask` e `imagePdfPage` tornam a operação reproduzível; o hash corresponde ao PNG final. A versão de PyMuPDF pode incorporar a máscara automaticamente: só combinar SMask se `pix.alpha == 0`.

## Documentos primários

| Fonte no portal | Páginas PDF | Hash SHA-256 |
|---|---:|---|
| [Unidade Multiproposito 4Z R134a - Catálogo Técnico](https://www.daikin.com.br/profissionais/download/force_download/1678) | 60 | `d1c9cdc3d39cecbf284eda80429927a3d9763e9cd5dfe74b54a320e804621abe` |
| [Unidade Multiproposito 4Z R513a - Catálogo Técnico](https://www.daikin.com.br/profissionais/download/force_download/1680) | 77 | `755f3253c52c0dde00f16fa905fcc1cb2bab60b76a0b3232a11438c50d7294b9` |
| [Duto Hospitalar FWDHA - Catálogo Técnico](https://www.daikin.com.br/profissionais/download/force_download/1594) | 14 | `79b9ad549e86ffa9c5673bb0088d243d165ed21d0c4d53e2720975f60f4b3c42` |
| [Fancolete Cassete 4 vias FWK - Catálogo Técnico](https://www.daikin.com.br/profissionais/download/force_download/1667) | 13 | `fd9e7ec36f79630a146b65e6048997e3e2622a8ae61d868102a5206d077c285b` |
| [Fancolete Cassete 4 vias FWKE - Catálogo Técnico](https://www.daikin.com.br/profissionais/download/force_download/1663) | 19 | `3acbb54009ced427e835d6e313dcaa4d1bc51282f25a1c7b550d3261ffd56b9a` |
| [Fancolete Duto 100%AE FWC - Catálogo Técnico](https://www.daikin.com.br/profissionais/download/force_download/1670) | 31 | `3a344bc725858f93ec073bcb9d16b4b810513b003f50927a3fc9fbaae28fd98d` |
| [Fancolete Duto Slim FWW V.T - Catálogo Técnico](https://www.daikin.com.br/profissionais/download/force_download/1674) | 19 | `4ea715de11478fb0c58dafe89f94bfe35950f04838c810dedc4702850f44ddba` |
| [Fancolete Hi Wall FWW - Catálogo Técnico](https://www.daikin.com.br/profissionais/download/force_download/1575) | 18 | `64779da5d1a078df0635839f863e617bb19fbad77fc505b8ce33c46a41642d9a` |
| [Chiller a Água Parafuso Inverter VZ R1234ze - Catálogo Técnico](https://www.daikin.com.br/profissionais/download/force_download/1684) | 42 | `7177670b4c8e76f019f3da5cbb046083c6aed294c8ab7ff4adc427a287607563` |
| [Chiller a Água Parafuso Inverter VZ R134a - Catálogo Técnico](https://www.daikin.com.br/profissionais/download/force_download/1685) | 41 | `1eeaccf626c009c7aa8e657542c97aa44c42da4a8e3b78b79dfde4d2c6802468` |
| [Chiller a Água Parafuso Inverter VZ R513a - Catálogo Técnico](https://www.daikin.com.br/profissionais/download/force_download/1686) | 41 | `0129aef45717950c0543c1d13f837db9dabcb8935fc09b8c2dd5a90c0690dc80` |
| [Chiller a Água Parafuso Inverter ZUWV - Databook](https://www.daikin.com.br/profissionais/download/force_download/1688) | 12 | `4c6a4ad89af873cdafa9b71ad8681a8322bcc57adc0b948a6e5c72871692cf0a` |
| [Chiller Centrífugo HTS & HTC - Catálogo Comercial](https://www.daikin.com.br/profissionais/download/force_download/1690) | 16 | `80583cb239b5eaa89a0483b366fbaa5598d604379ff07d82ad2b887470a56b8e` |
| [Chiller Mancal Magnético HXE - Catálogo Comercial](https://www.daikin.com.br/profissionais/download/force_download/1693) | 9 | `cdab6b8b47530e37e13f4c6b514da9ac8d8ba9af9f18cbc0e87fc615d4b81d3e` |
| [Chiller Mancal Magnético HXE - Catálogo Comercial](https://www.daikin.com.br/profissionais/download/force_download/1698) | 9 | `cdab6b8b47530e37e13f4c6b514da9ac8d8ba9af9f18cbc0e87fc615d4b81d3e` |
| [Chiller Mancal Magnético HXE - Catálogo Comercial](https://www.daikin.com.br/profissionais/download/force_download/1701) | 9 | `cdab6b8b47530e37e13f4c6b514da9ac8d8ba9af9f18cbc0e87fc615d4b81d3e` |
| [CAT PURIFICADOR DE AR STREAMER CBRVPPSV01D0422 ABR/2022](https://www.daikin.com.br/profissionais/download/force_download/1010) | 28 | `7cb0c072ff95fe3132462c88e22d0602153721fb12531762ee545d33ab0f75a9` |
| [Folheto Streamer_202604](https://www.daikin.com.br/profissionais/download/force_download/1011) | 8 | `97cd75e1efea9200654ee92164aaeeddbeb604aee6729a7169d6ba6b675f125d` |
| [Chiller a Ar Parafuso Inverter TZD - Catálogo Técnico](https://www.daikin.com.br/profissionais/download/force_download/1702) | 209 | `d20aa1bc8dd51ea2bb6bf6ffc7e0660196d195a7cb33b8ccb74d0e11d1fef61b` |
| [Chiller a Ar Parafuso Inverter TZD Free Cooling - Catálogo Técnico](https://www.daikin.com.br/profissionais/download/force_download/1707) | 122 | `fec1893eede44ddea531ed416ac15f1773b04d91503b92e77f689128cb137304` |
| [Bomba de Calor Ar-Água UAL ER6 - Catálogo Técnico](https://www.daikin.com.br/profissionais/download/force_download/1641) | 40 | `4c0a64313a2010a3683c8fa3927040edf28d8614f750a95345ec2592b1c6b608` |
| [Bomba de Calor Ar-Água UAL MINI ER5 - Catálogo Técnico_(EN)202302](https://www.daikin.com.br/profissionais/download/force_download/1651) | 51 | `d630056c3973d54b71b0ace0df359e1a937a4fbc5ecf4babca2cc11b225fc0ba` |
| [Bomba de Calor Ar-Água UHAS 100 - Folhete Comercial (EN)](https://www.daikin.com.br/profissionais/download/force_download/1659) | 6 | `69addd56f89695808f300ac23f866b68163e3b1fe2e89a75c744575ffa303501` |
| [Bomba de Calor Ar-Água UHAS 100 - Folheto Comercial (EN)](https://www.daikin.com.br/profissionais/download/force_download/1544) | 6 | `69addd56f89695808f300ac23f866b68163e3b1fe2e89a75c744575ffa303501` |
| [Bomba de Calor Ar-Água UHAS 100 - IOM (EN)](https://www.daikin.com.br/profissionais/download/force_download/1660) | 90 | `f09141b8f8012f69d86052a4c1e5e269a0ade4d9f0d2287c114df68366f86435` |

## Verificação executada

- Unicidade de todos os códigos e integridade de todos os arquivos de foto/PDF por SHA-256.
- Conferência de páginas dentro dos limites dos PDFs.
- Fotos principais de todas as famílias inspecionadas; fontes de FWK e FWKE separadas; transparência de extrações corrigida para conservar o original.
- Nenhuma alteração em banco, UI, hooks, schema, RLS, commit ou publicação neste escopo de pesquisa. Root integra os registros e valida a interface.


## Reconferência visual dos avisos do integrador

Os 48 avisos industriais por ausência de texto contínuo correspondem a PDFs escaneados presentes e legíveis: 41 HXE (arquivo1693, páginas físicas4/5) e sete séries ZUWV (arquivo1688, tabela da página física4, também páginas5/9). A prova por código, hash, página e screenshot está em `.context/daikin-industrial/visual-code-proofs.json`; usar `proof_kind: visual`, não classificar como arquivo ausente.

Na reconferência ampliada, duas transcrições foram corrigidas: `HXEV490DSTGF/F2612-JH-2/C2612-MK-2` e `HXEV490TSTGF/F3012-JH-2/C2612-MK-2`. O original publica F2612/F3012; a transcrição anterior com E era incorreta. A evidência de máxima resolução está em `.context/daikin-industrial/hxe-hfo-code-column.png`. As demais 46 entradas foram reconferidas sem alteração.
