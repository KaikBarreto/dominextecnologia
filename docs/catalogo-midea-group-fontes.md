# Catálogo técnico Midea, Springer e Carrier — fontes e limites

Revisão da curadoria: **15/11/2026**. Material preparado para integração em estágio, sem alterar banco, fichas existentes ou interface.

O lote contém **433 registros técnicos**, distinguindo componentes individuais, identificadores de catálogo, séries configuráveis e combinações publicadas. Não significa 433 sistemas completos nem cobertura exaustiva de tudo que essas marcas já venderam no Brasil. Não houve geração de sufixos por regras de nomenclatura.

| Marca de integração | Registros | Observação de marca |
| --- | ---: | --- |
| Midea | 239 | Xtreme Save Connect R32, ATOM, terminais V6, VC Max, V6R, V8S, V8 220V e V4+W |
| Springer | 21 | 16 componentes AirVolution com `commercialBrand: Springer Midea`, quatro Duo legados e a série Silentia |
| Carrier | 173 | Aplicados comerciais/industriais, legados e VRF X-Power; não copiados como Midea |

| Natureza do registro | Quantidade | Interpretação |
| --- | ---: | --- |
| `model` | 274 | Código completo literalmente presente na tabela utilizada |
| `catalog_model` | 103 | Identificador de modelo publicado; pode precisar de alimentação, construção e opcionais no pedido |
| `series` | 22 | Família configurável; colunas numéricas, curingas e diagramas de nomenclatura não viraram SKUs |
| `combination` | 34 | Sistemas V8 220V de 30–96 HP com código e composição explicitamente publicados na tabela p.6 |

Há 69 linhas, distribuídas em Hi-Wall, janela, chiller, fancoil hidrônico, air handler, splitão, rooftop, self-contained e VRF. `unitKind` separa 218 unidades internas, 129 externas e 86 sistemas. Os 34 códigos V8 de combinação identificam conjuntos, não condensadoras individuais.

## Fontes documentais

Todos os PDFs abaixo foram baixados, abertos por parser e vinculados às respectivas páginas 1-based. O hash SHA-256, caminho local e contagem de páginas ficam em `sources` e em cada modelo do arquivo de dados.

| Documento | Uso na curadoria |
| --- | --- |
| [Catálogo Comercial CAC 2024, Carrier Brasil](https://carrierdobrasil.com.br/wp-content/uploads/2024/08/CATALOGO-COMERCIAL-CAC.pdf) | 200 páginas. Carrier: chillers, hidrônicos, air handlers, EcoSplit, rooftop, Self e X-Power. Midea: ATOM, VC Max, V6R, V8S e V4+W. Marcas verificadas nos respectivos capítulos. |
| [Midea Xtreme Save Connect R32 — usuário e instalação](https://www.midea.com/content/dam/midea-aem/br/climatizacao/hiwall/xtreme-white-novo/Manual%20de%20usu%C3%A1rio_Xtreme%20Save%20Connect.pdf) | 72 páginas. Tabelas pp.64–67 trazem 16 códigos Midea de componentes de 9/12/18/24 mil BTU/h; autodiagnóstico p.63. |
| [Springer Midea AirVolution Inverter — usuário e instalação](https://www.midea.com/content/dam/midea-aem/br/climatizacao/hiwall/ar-condicionado-springer-midea-airvolution-inverter-idrs/Manual%20de%20usu%C3%A1rio%20(3).pdf) | 68 páginas. Tabelas pp.60–63 trazem 16 códigos de componentes R410A de 9/12/18/22 mil BTU/h; a marca comercial é literalmente Springer Midea. Erros p.59. |
| [Midea V8 220V — Manual de Projeto, C 03/2025](https://carrierdobrasil.com.br/wp-content/uploads/2024/08/MProj.-Unidades-Centrais-Midea-V8-220V-C-03-25-view.pdf) | 118 páginas. P.6 enumera 45 códigos: 11 centrais individuais de 8–28 HP e 34 combinações de 30–96 HP. Especificações pp.21–32. |
| [Midea Terminais V6 — Manual de Projeto, D 07/2023](https://carrierdobrasil.com.br/wp-content/uploads/2023/01/MProj_UTs-VFRs-Midea-Serie-V6-D-07-23-view.pdf) | 242 páginas. Listas literais de cassetes, dutos AC/DC, ar externo, Hi-Wall, piso-teto e console/dutado de piso. Variantes abreviadas entre parênteses não foram expandidas. |
| [Springer DUO — Manual de Serviço, cópia original em Poloar](https://poloar.vteximg.com.br/arquivos/manual%20instalacao%20DUO.pdf?v=635991788786230000) | 68 páginas. Quatro códigos legados com espaços preservados na tabela p.15; erros p.21 apenas para versões eletrônicas. Espelho de fabricante em distribuidor. |
| [Springer Silentia — Manual de Serviço, cópia original em Leveros](https://www.leverosintegra.com.br/download/manuais/Springer/SPRINGER-Manual-Tecnico-Janela-Silentia-.pdf) | 64 páginas. Série legada com classes F/M/Z; sem fabricação de códigos de pedido. Ilustração técnica original do equipamento. Espelho de fabricante em distribuidor. |
| [Carrier Acqua Junior 30AJ — Catálogo Técnico, E 03/2014](https://cdn.carrierdobrasil.com.br/downloads_docs/f2da7-CT-30AJ-4a10TR-60Hz-EXP-E-03-14--view-.pdf) | 40 páginas. Série legada de 4–10 TR, refrigerante R407C confirmado no documento. Tamanhos de coluna não concatenados ao prefixo. |
| [Carrier Global Chiller 30HXF/30GXF Fase III — 10/2012](https://cdn.carrierdobrasil.com.br/downloads_docs/de54f-Cat--logo-T--cnico---ct30hxf-gxf-faseiii-c-10.12--view-.pdf) | 32 páginas. Identificadores históricos de modelos literalmente presentes nas legendas e desenhos; não expandir a nomenclatura. |
| [Carrier 30HKS — Catálogo Técnico, H 02/2013](https://cdn.carrierdobrasil.com.br/downloads_docs/05d55-CT-30HKS-20-A-60-TR--H--02.13--print-.pdf) | 28 páginas. Modelos literalmente mencionados; ilustração dimensional do equipamento completo p.15, identificada como ilustração, sem usar o desenho do compressor como foto do chiller. |

O ano do catálogo é o nome da edição publicada; o endereço e a data da coleta não comprovam disponibilidade comercial atual. Modelos legados preservam essa condição na descrição.

## Imagens

São **65 arquivos de imagem utilizados**, todos derivados de publicação do fabricante. A conferência visual rejeitou logos, selos, controles e diagramas de componentes como imagem de equipamento. A maior parte veio dos objetos raster originais dos PDFs, com Xref, máscara original quando existente e página registrados. Fotos divididas em segmentos no PDF foram recuperadas pela área original da página, com coordenadas de recorte documentadas.

As fotos de [Xtreme Save Connect](https://www.midea.com.br/ar-condicionado-split-inverter-9000-btu-xtremesave-quente-e-frio-midea-1/p) e [AirVolution](https://www.midea.com.br/ar-condicionado-split-inverter-9000-btu-airvolution-frio-midea-2/p) vieram do site oficial Midea, com URL original, hash e cópia local. São fotos representativas de família/conjunto; não certificam que toda revisão e capacidade tem a mesma carcaça. A página comercial AirVolution apresenta descrição inconsistente citando Xtreme; os dados técnicos vêm exclusivamente do manual específico.

Todas as referências usam `imageScope: family`. Quatro registros usam `imageKind: technical_illustration` (Silentia e três 30HKS); os outros 429 usam fotos. Esse número conta registros vinculados, não arquivos diferentes. Imagem de família não deve aparecer como prova de identificação exata pela placa.

## Códigos de erro

Três referências, com 40 linhas de códigos no total:

- Xtreme Save Connect **R32**, p.63: 21 linhas; restritas aos 16 códigos das tabelas pp.64–67 dessa revisão. Maiúsculas/minúsculas e espaços dos códigos preservados.
- AirVolution Inverter da revisão documentada, p.59: 11 linhas; restritas aos 16 códigos das tabelas pp.60–63.
- Springer DUO eletrônico, p.21: oito linhas; vinculadas apenas a `QCA 075 RBB` e `QQA 075 RBB`. Eventos exclusivos de aquecimento dependem da versão quente/frio. Aviso de filtro não é avaria do compressor.

As referências estão marcadas como `context: operation`. Configurações e códigos de comissionamento V8 não foram apresentados como avaria operacional. Não existe tabela universal de erros de marca neste lote. Os títulos são descrições técnicas; a confirmação da causa e o procedimento seguro exigem o manual e o profissional responsável.

## Preservação e lacunas

O inventário atual tem quatro coincidências na mesma marca: `42AGVCI09M5`, `42AGVCI12M5`, `42AGVCI18M5` e `42AGVCI24M5`. Estão em `evidence/inventory-overlap.json`, com os IDs existentes, para a integração preservar essas fichas. Não foi encontrado conflito de código normalizado entre marcas. O lote oferece **429 chaves de marca/código novas** além dessas quatro coincidências.

Limites mantidos em `pending`:

- Mini V6 Dura no CAC separa prefixo e alternativas compactadas: nenhum SKU foi montado por inferência.
- V8 380V no CAC apresenta prefixo separado dos sufixos. A inclusão depende de outra fonte com códigos completos, sem criar concatenações.
- Terminais V6 mantêm a geração publicada. Não são copiados como terminais V8; compatibilidade depende da revisão e seleção.
- AI AirVolution, AI Ecomaster, split teto/cassete atuais, portátil e outras revisões residenciais requerem corpus específico antes de cadastro.
- Séries industriais configuráveis não certificam tensão, acessórios, construção, capacidade e refrigerante opcionais de cada pedido. Nos terminais hidrônicos o refrigerante fica nulo; não atribuir o fluido do chiller ao fancoil.
- Documentos Springer em espelhos de distribuidores estão identificados como cópias originais; não se afirma hospedagem atual no domínio original.

## Artefatos e verificação

- Dados: `.context/midea-group-models.json`.
- Fontes locais: `.context/midea-group/documents/`.
- Imagens: `.context/midea-group/images/`; manifesto de proveniência em `evidence/image-manifest.json`.
- Prova literal por registro: `evidence/code-evidence.json`, com página, hash do texto extraído e hash do documento.
- Provas visuais seletivas de marca/tabela: `evidence/visual-proof-manifest.json` e folhas de contato locais.
- Relatório: `evidence/validation-report.json`.
- Reprodução: `python3 .context/midea-group/build-catalog.py`; validação: `python3 .context/midea-group/validate-catalog.py`.

A validação verifica parsing/magic PDF, hashes, páginas, decodificação das imagens, código literal na página citada, unicidade de marca/código e escopo das tabelas de erro. Não há códigos exclusivamente rasterizados neste lote: todos os identificadores têm prova textual extraível. A conferência visual foi feita nas imagens utilizadas e em páginas amostrais de marca e tabela. A tarefa não alterou aplicação, banco, storage remoto, release, versão ou changelog.
