# Documentos do catálogo: compressores e linha branca

Revisão documental: **15/11/2026**. Responsável pela pesquisa: equipe técnica Dominex. Revisar a associação ao trocar SKU, tensão, BOM ou edição do documento.

## Cobertura e critérios

Inventário público auditado: 36 compressores e 13 registros de linha branca sem documento. Foram validados **33 documentos novos por modelo** (30 completos para o escopo declarado e 3 com limitação explícita), além de **2 correções de associação LG**. Existem 16 pendências: 6 famílias sem SKU e 10 códigos que ainda não têm um original validado localmente. Isso não significa que todos os manuais do fabricante estejam disponíveis.

A pesquisa preserva os documentos existentes. As únicas substituições propostas são duas associações comprovadamente incorretas; a integração deve exigir correspondência tanto da URL quanto do SHA-256 anterior. Nenhum PDF de produto parecido, de outra tensão ou de outra marca foi usado como substituto.

Cada PDF aprovado foi baixado, aberto com PyMuPDF, conferido pela capa/cabeçalho e pelo código ou vínculo oficial de suporte. As páginas abaixo começam em 1 e se referem ao PDF, não necessariamente à numeração impressa. Os PDFs e capas de evidência estão em `.context/catalog-document-research/`; o manifesto operacional está em `.context/catalog-document-candidates.json`, com identificação do registro, URL, páginas, escopo, arquivo local e SHA-256.

**Tipos:** `usuario` é manual do usuário; `instalacao` orienta montagem; `aplicacao` é guia da família; `catalogo_tecnico` lista dados e modelos; `ficha_tecnica` é ficha do modelo. Esses tipos devem permanecer claros na interface: ficha técnica e ficha elétrica não são manuais de reparo.

## Documentos novos validados

| Fabricante / código | Documento e fonte | Páginas | Tipo e escopo |
|---|---|---|---|
| LG **GM402BPL** | [LG GM402BPL — Manual do usuário](https://gscs-b2c.lge.com/open/downloadFile?fileId=NNuNDsWShJBKAqysS8HrQ) | 1 | `usuario` — PDF disponibilizado pelo suporte oficial LG para este modelo exato. SKU impresso no PDF. |
| LG **GR-X228NMSM** | [LG GR-X228NMSM — Manual do usuário](https://gscs-b2c.lge.com/open/downloadFile?fileId=5zn4Zt3c3dRcv5RyBJofLw) | 1 | `usuario` — PDF disponibilizado pelo suporte oficial LG para este modelo exato. PDF de família sem SKU impresso legível; vínculo comprovado pela página oficial de suporte, não inferido por semelhança. |
| Copeland **4DH3F63KE-TSK** | [Copeland Electrical Handbook — Section Fe](https://www.copeland-compressor.com/images/copeland-2D-3D-4D-4R-6D-8D-9R-compressors.pdf) | 18 | `ficha_tecnica` — Extrato original com código completo e dados elétricos. Não é manual de instalação/serviço; falta capa geral do handbook. |
| Copeland **ZF11K4E-TFD** | [Copeland Scroll for Refrigeration — C6.2.20/0716-0617/E](https://alfaco.myshoprenter.hu/custom/alfaco/image/data/srattached/applicationguideline-ZB15-220_ZS21-11_ZF06-48_ZF13-48KVE4.pdf) | 1, 6 | `aplicacao` — Manual original hospedado por distribuidor Alfaco. Modelo base listado; esquemas e ressalvas de motor constam no manual. |
| Bitzer **4CES-6Y** | [BITZER KP-100-1 EN — ECOLINE](https://www.bitzer.de/shared_media/documentation/kp-100-1-en.pdf) | 1, 24, 32 | `catalogo_tecnico` — Catálogo técnico 50 Hz; modelo base com sufixo opcional (Y) listado. Não substitui seleção de tensão/frequência/BOM. |
| Bitzer **2EES-2Y** | [BITZER KP-100-1 EN — ECOLINE](https://www.bitzer.de/shared_media/documentation/kp-100-1-en.pdf) | 1, 24, 30 | `catalogo_tecnico` — Catálogo técnico 50 Hz; modelo base com sufixo opcional (Y) listado. Não substitui seleção de tensão/frequência/BOM. |
| Danfoss/Secop **MLZ038T4LC9A** | [Danfoss MLM/MLZ — AB217586428474en-000801](https://assets.danfoss.com/documents/latest/89869/AB217586428474en-000801.pdf) | 1, 7, 14, 46, 47 | `aplicacao` — Manual de aplicação família MLM/MLZ; MLZ038 listado, sufixo depende de tensão/conexões. Não é manual da geração Evolution C. |
| Copeland **ZF40K4E-TWD** | [Copeland Scroll for Refrigeration — C6.2.20/0716-0617/E](https://alfaco.myshoprenter.hu/custom/alfaco/image/data/srattached/applicationguideline-ZB15-220_ZS21-11_ZF06-48_ZF13-48KVE4.pdf) | 1, 6, 13 | `aplicacao` — Manual original hospedado por distribuidor Alfaco. Modelo base listado; esquemas e ressalvas de motor constam no manual. |
| Bitzer **4FES-3Y** | [BITZER KP-100-1 EN — ECOLINE](https://www.bitzer.de/shared_media/documentation/kp-100-1-en.pdf) | 1, 24, 32 | `catalogo_tecnico` — Catálogo técnico 50 Hz; modelo base com sufixo opcional (Y) listado. Não substitui seleção de tensão/frequência/BOM. |
| Frascold **Q5-28.1Y** | [Frascold Q5-28.1Y — Technical Data Sheet](https://frigopartners.com/media/5c/49/1f/1636646968/Q5-281Y.pdf?ts=1636646968) | 1, 2, 3 | `ficha_tecnica` — Ficha original modelo exato; hospedada por distribuidor. Conferir versão elétrica no documento, sem generalizar para todos os motores. |
| Embraco **NEK6210GK** | [Embraco NEK6210GK — Technical Data Sheet](https://www.kaeltetechnikshop.com/media/ca/f8/80/1636647053/47-32NEK6210GK_tech.pdf) | 1, 4 | `ficha_tecnica` — Ficha original de código de engenharia 958CA5135A0, 220–240V 50Hz. Conferir BOM/tensão na etiqueta. |
| LG **GC-X257CSH1** | [LG GC-X257CSH1 — Manual do usuário](https://gscs-b2c.lge.com/open/downloadFile?fileId=TTuusa1i2OYF8JVBuDMLw) | 1 | `usuario` — PDF disponibilizado pelo suporte oficial LG para este modelo exato. PDF de família sem SKU impresso legível; vínculo comprovado pela página oficial de suporte, não inferido por semelhança. |
| Copeland **ZB21KCE-TFD** | [Copeland Scroll for Refrigeration — C6.2.20/0716-0617/E](https://alfaco.myshoprenter.hu/custom/alfaco/image/data/srattached/applicationguideline-ZB15-220_ZS21-11_ZF06-48_ZF13-48KVE4.pdf) | 1, 6 | `aplicacao` — Manual original hospedado por distribuidor Alfaco. Modelo base listado; esquemas e ressalvas de motor constam no manual. |
| LG **GM-B298NLN1** | [LG GM-B298NLN1 — Manual do usuário](https://gscs-b2c.lge.com/open/downloadFile?fileId=VEXwHmZBIBHKjZbSxRMaSQ) | 1, 2 | `usuario` — PDF disponibilizado pelo suporte oficial LG para este modelo exato. PDF de família sem SKU impresso legível; vínculo comprovado pela página oficial de suporte, não inferido por semelhança. |
| LG **FV5013WC4** | [LG FV5013WC4 — Manual do usuário](https://gscs-b2c.lge.com/open/downloadFile?fileId=hgsYIM4qdjF5JK4ZeloeQ) | 1 | `usuario` — PDF disponibilizado pelo suporte oficial LG para este modelo exato. SKU impresso no PDF. |
| Bitzer **4DES-5Y** | [BITZER KP-100-1 EN — ECOLINE](https://www.bitzer.de/shared_media/documentation/kp-100-1-en.pdf) | 1, 24, 32 | `catalogo_tecnico` — Catálogo técnico 50 Hz; modelo base com sufixo opcional (Y) listado. Não substitui seleção de tensão/frequência/BOM. |
| Bock **HGX4/555-4** | [BOCK HG4 — Assembly instructions 09958-06.2021-Gb](https://vap.bock.de/mobileapplication/Data/DocumentationFiles/09958-06-2021-GB.pdf) | 1 | `instalacao` — Manual família HG4/HGX4 convencional. Modelos exatos constam na capa; não confundir com HGX4 CO₂. |
| Bitzer **4EES-4Y** | [BITZER KP-100-1 EN — ECOLINE](https://www.bitzer.de/shared_media/documentation/kp-100-1-en.pdf) | 1, 24, 32 | `catalogo_tecnico` — Catálogo técnico 50 Hz; modelo base com sufixo opcional (Y) listado. Não substitui seleção de tensão/frequência/BOM. |
| Danfoss/Secop **MTZ100-4VI (MTZ100HS4AVE)** | [Danfoss Maneurop MT/MTZ — AB196386425654en-US1701](https://assets.danfoss.com/documents/latest/372053/AB196386425654en-US1701.pdf) | 1, 42 | `aplicacao` — Tabela inclui MTZ100-4VI. Conferir placa para códigos alternativos entre parênteses. |
| Copeland **ZB45KCE-TFD** | [Copeland Scroll for Refrigeration — C6.2.20/0716-0617/E](https://alfaco.myshoprenter.hu/custom/alfaco/image/data/srattached/applicationguideline-ZB15-220_ZS21-11_ZF06-48_ZF13-48KVE4.pdf) | 1, 6 | `aplicacao` — Manual original hospedado por distribuidor Alfaco. Modelo base listado; esquemas e ressalvas de motor constam no manual. |
| Danfoss/Secop **MTZ56-3VI (MTZ56HP3BVE)** | [Danfoss Maneurop MT/MTZ — AB196386425654en-US1701](https://assets.danfoss.com/documents/latest/372053/AB196386425654en-US1701.pdf) | 1, 42 | `aplicacao` — Tabela inclui MTZ56-3VI. Conferir placa para códigos alternativos entre parênteses. |
| Embraco **NT6217GK** | [Embraco NT6217GK — Technical Data Sheet](https://frigopartners.com/media/dd/70/ca/1636647056/47-32NT6217GK_tech.pdf) | 1, 4 | `ficha_tecnica` — Ficha original de código de engenharia 922AN0404AC, 200–240V 50Hz / 230V 60Hz. Conferir BOM/tensão na etiqueta. |
| Copeland **6DC3F93KE-TSK** | [Copeland Electrical Handbook — Section Fe](https://www.copeland-compressor.com/images/copeland-2D-3D-4D-4R-6D-8D-9R-compressors.pdf) | 53 | `ficha_tecnica` — Extrato original com código completo e dados elétricos. Não é manual de instalação/serviço; falta capa geral do handbook. |
| GMCC **PA170M2A-3FT1** | [GMCC Rotary Compressor Product Catalogue 2018](https://cdn1.npcdn.net/userfiles/20709/attachment/2859682/20200208_92dcf624d684c74c1b3eb6e12a826778/2018-GMCC-product-catalogue.pdf) | 1, 13 | `catalogo_tecnico` — Original GMCC impresso dezembro/2017, hospedado em CDN público. Código exato listado, 60 Hz. Não é manual de reparo. |
| Copeland **ZB15KCE-TFD** | [Copeland Scroll for Refrigeration — C6.2.20/0716-0617/E](https://alfaco.myshoprenter.hu/custom/alfaco/image/data/srattached/applicationguideline-ZB15-220_ZS21-11_ZF06-48_ZF13-48KVE4.pdf) | 1, 6 | `aplicacao` — Manual original hospedado por distribuidor Alfaco. Modelo base listado; esquemas e ressalvas de motor constam no manual. |
| Bock **HGX4/465-4** | [BOCK HG4 — Assembly instructions 09958-06.2021-Gb](https://vap.bock.de/mobileapplication/Data/DocumentationFiles/09958-06-2021-GB.pdf) | 1 | `instalacao` — Manual família HG4/HGX4 convencional. Modelos exatos constam na capa; não confundir com HGX4 CO₂. |
| Frascold **D3-18.1Y** | [Frascold D3-18.1Y — Technical Data Sheet](https://arbo.it/content/product_assets/bf/f6/bff6c47dddf242db1d466d9865eae998/schede_tecniche/D3_18_1Y.pdf) | 1, 2 | `ficha_tecnica` — Ficha original modelo exato; hospedada por distribuidor. Conferir versão elétrica no documento, sem generalizar para todos os motores. |
| LG **GN-B392PLMB** | [LG GN-B392PLMB — Manual do usuário](https://gscs-b2c.lge.com/open/downloadFile?fileId=7sWuY5J5vzEzaOjzPT3bA) | 1 | `usuario` — PDF disponibilizado pelo suporte oficial LG para este modelo exato. PDF de família sem SKU impresso legível; vínculo comprovado pela página oficial de suporte, não inferido por semelhança. |
| Danfoss/Secop **MTZ80-4VI (MTZ80HP4CVE)** | [Danfoss Maneurop MT/MTZ — AB196386425654en-US1701](https://assets.danfoss.com/documents/latest/372053/AB196386425654en-US1701.pdf) | 1, 42 | `aplicacao` — Tabela inclui MTZ80-4VI. Conferir placa para códigos alternativos entre parênteses. |
| Tecumseh **AE2410Z** | [Tecumseh AE2410Z-FZ1A — Technical Sheet 2025](https://cdn.apogee99.com/pdf/hladilen_kompresor_tecumseh_lunite_AE2410Z-FZ1A-78f3a2c5-2fdd-4d5d-9b71-b7d3dc53025d.pdf) | 1, 2, 3 | `ficha_tecnica` — Ficha compressor AE2410Z-FZ1A, 220–240V/50Hz. Cadastro sem sufixo: documento vale apenas para FZ1A. Não é unidade condensadora AE2410Z-AA1AGK. |
| Copeland **ZF18K4E-TFD** | [Copeland Scroll for Refrigeration — C6.2.20/0716-0617/E](https://alfaco.myshoprenter.hu/custom/alfaco/image/data/srattached/applicationguideline-ZB15-220_ZS21-11_ZF06-48_ZF13-48KVE4.pdf) | 1, 6 | `aplicacao` — Manual original hospedado por distribuidor Alfaco. Modelo base listado; esquemas e ressalvas de motor constam no manual. |
| GMCC **PA290G2CS-4MU1** | [GMCC Rotary Compressor Product Catalogue 2018](https://cdn1.npcdn.net/userfiles/20709/attachment/2859682/20200208_92dcf624d684c74c1b3eb6e12a826778/2018-GMCC-product-catalogue.pdf) | 1, 15 | `catalogo_tecnico` — Original GMCC impresso dezembro/2017, hospedado em CDN público. Código exato listado, 50 Hz. Não é manual de reparo. |
| Copeland **ZB114KCE-TFD** | [Copeland Scroll Summit ZB50KCE–ZB114KCE — Application Guidelines](https://www.copeland.com/documents/copeland-scroll-summit-series-zb50kce-zb114kce-zb66k5e-zb114k5e-zf25k5e-zf54k5e-application-guidelines-en-gb-4209564.pdf) | 1, 7, 9, 15 | `aplicacao` — ZB114KCE listado na série Summit. Conferir versão de motor TFD na placa. |

### Vínculo LG de família

Para GC-X257CSH1, GM-B298NLN1, GN-B392PLMB e GR-X228NMSM, o PDF é compartilhado e nem sempre imprime o SKU. A associação foi comprovada pela página oficial de suporte do modelo exato, que publica aquele arquivo. Não foi deduzida por aparência, capacidade ou nome comercial.

- [GM402BPL: suporte oficial LG](https://www.lg.com/br/suporte/suporte-ao-producto/cs-GM402BPL/).
- [GR-X228NMSM: suporte oficial LG](https://www.lg.com/br/suporte/suporte-ao-producto/cs-GR-X228NMSM.AMTFSBS/).
- [GC-X257CSH1: suporte oficial LG](https://www.lg.com/br/suporte/suporte-ao-producto/cs-GC-X257CSH1.ABSGSBS/).
- [GM-B298NLN1: suporte oficial LG](https://www.lg.com/br/suporte/suporte-ao-producto/cs-GM-B298NLN1.APZGSBS/).
- [FV5013WC4: suporte oficial LG](https://www.lg.com/br/suporte/suporte-ao-producto/cs-FV5013WC4.ABWFBRS/).
- [GN-B392PLMB: suporte oficial LG](https://www.lg.com/br/suporte/suporte-ao-producto/cs-GN-B392PLMB.APZFSBS/).

### Limitações técnicas que devem acompanhar o documento

- Bitzer: catálogo de 50 Hz; não transportar desempenho para 60 Hz sem seleção do fabricante.
- Danfoss MLZ038: guia da geração MLM/MLZ publicada; não atribuir automaticamente as regras de Evolution C à versão cadastrada.
- Embraco: a ficha inclui código de engenharia e tensão próprios; modelo base não garante o mesmo conjunto elétrico para todos os BOMs. Frações como 1/2 e 3/4 podem sair erradas na extração automática; conferir PDF visualmente antes de importar especificações.
- Copeland 4DH3F63KE-TSK e 6DC3F93KE-TSK: o arquivo é a seção Fe do handbook elétrico, com código completo, não manual de instalação. A seção não contém capa geral da publicação; manter classificação de ficha elétrica.
- Tecumseh AE2410Z: o catálogo omite o sufixo. A ficha validada é **AE2410Z-FZ1A, 220–240 V / 50 Hz**; só vale para essa variante. Documentos AE2410Z-AA1AGK tratam da unidade condensadora e foram rejeitados como ficha do compressor.
- Originais hospedados em distribuidores mantêm a autoria do fabricante, mas a hospedagem é externa e está registrada. O documento publicado é referência técnica; a placa e a revisão aplicável continuam definindo a variante.

## Correções comprovadas de documentos existentes

| Modelo | Associação anterior incorreta | Documento correto | Evidência |
|---|---|---|---|
| **WD17VVS6** | Manual atual apresenta WD-12270RDA/WD-12270RD na capa, modelo diferente do catálogo. | [LG WD17VVS6 — Manual do usuário MFL69306292](https://gscs-b2c.lge.com/open/downloadFile?fileId=YXFQgcU9tIO2LPnuwn9w) | [Suporte oficial](https://www.lg.com/br/suporte/suporte-ao-producto/cs-WD17VVS6.ASSFBRS/), PDF p. 1, 9; Manual oficial com código exato na capa e página de suporte do modelo. Português, WD17VVS6/WD17VVS6A. |
| **WT13BSB** | Manual atual apresenta WT13WSBP na capa, modelo diferente do catálogo. | [LG WT13BSB — Manual do usuário MFL68781061 Rev.00_020822](https://gscs-b2c.lge.com/open/downloadFile?fileId=v4zrms7JQ68weB7r4CrpDQ) | [Suporte oficial](https://www.lg.com/pe/soporte/soporte-de-producto/cs-WT13BSB/), PDF p. 1, 10, 41; Manual oficial com código exato na capa e página de suporte do modelo. Espanhol, versão Peru WT13BSB, 220V 60Hz; não WT13WSBP. |

O manifesto registra `replacementOfUrl` e `replacementOfSha256`. Aplicar apenas se o documento anterior continuar idêntico; não sobrescrever uma correção paralela.

## Pendências reais

| Fabricante / código | Motivo e próximo dado necessário | Consulta / candidato |
|---|---|---|
| GMCC **PA125G1C-4FTL1** | Encontrada curva exata em distribuidor Prokes, porém sem autoria/marca/capa verificável no PDF. Não aprovada como original do fabricante. Catálogo original GMCC2018 não contém este código. | [Consulta](https://www.gmcc-welling.com/en/product/product-detail?categoryId=100124); [candidato ainda não aprovado](https://www.prokes-auto.com/_obchody/prokes-auto.shop5.cz/prilohy/46/kompresor-gmcc-toshiba-pa125g1c-11965-btu-h-r410a-9a4bd4.pdf) |
| Samsung **família sem SKU** | Registro representa família genérica, sem SKU/modelo completo. A marca tem modelos e gerações diferentes; precisa do código da etiqueta para identificar manual exato. Nenhum PDF foi associado por aproximação. | [Consulta](https://www.samsung.com/br/support/) |
| Consul **família sem SKU** | Registro representa família genérica, sem SKU/modelo completo. A marca tem modelos e gerações diferentes; precisa do código da etiqueta para identificar manual exato. Nenhum PDF foi associado por aproximação. | [Consulta](https://www.consul.com.br/) |
| LG **GJS222PAA** | Ficha LG exata localizada e vinculada pelo distribuidor; servidor recusou download local (HTTP403), impedindo validar bytes/capa/escopo e hash. Não substituir pelo antigo GJ222P. | [Consulta](https://www.kaeltetechnik-shop.at/Compressor-GJS222PAA-LG); [candidato ainda não aprovado](https://www.kaeltetechnik-shop.at/mediafiles/Sonstiges/LG%20Kompressoren/GJS222PAA.pdf) |
| Midea **família sem SKU** | Registro representa família genérica, sem SKU/modelo completo. A marca tem modelos e gerações diferentes; precisa do código da etiqueta para identificar manual exato. Nenhum PDF foi associado por aproximação. | [Consulta](https://www.midea.com/br) |
| Electrolux **LSE11** | Original de usuário 69492112 Jun/09 Rev.01a localizado em repositório público (32 páginas); download recusado HTTP403, sem PDF local validado. Pesquisa também encontra Midea LSE11: fabricante diferente, rejeitado. | [Consulta](https://www.electrolux.com.br); [candidato ainda não aprovado](https://manuals.plus/m/fb0ea34369f4f6097d72122e27a02d1e949a5b01a32bb6d3afe6829cb828dce1.pdf) |
| LG **família sem SKU** | Registro representa família genérica, sem SKU/modelo completo. A marca tem modelos e gerações diferentes; precisa do código da etiqueta para identificar manual exato. Nenhum PDF foi associado por aproximação. | [Consulta](https://www.lg.com/br/suporte/) |
| Samsung **UG5A240JU** | Catálogo Samsung original localizado no distribuidor (18 páginas), mas download local recusado HTTP472; sem validação de capa/modelo/edição. Não confundir com o catálogo Trane de peças. | [Consulta](https://www.skh-kaeltetechnik.de/Compressor-Samsung-UG5A240JU); [candidato ainda não aprovado](https://www.skh-kaeltetechnik.de/mediafiles/Sonstiges/Samsung/Samsung.pdf) |
| Continental **família sem SKU** | Registro representa família genérica, sem SKU/modelo completo. A marca tem modelos e gerações diferentes; precisa do código da etiqueta para identificar manual exato. Nenhum PDF foi associado por aproximação. | [Consulta](https://www.continentalbrasil.com.br/) |
| Copeland **2DC3R53KE-TFD** | Ficha original exata TFD localizada em Baker, mas HTTP403 impediu validar o PDF local. PDF alternativo baixado é TFC (208/230V), não TFD (460V), portanto rejeitado para associação. | [Consulta](https://webapps.copeland.com/online-product-information); [candidato ainda não aprovado](https://cdn.bakerdist.com/copeland_2dc3r53ke-tfd-800_article_1377777669427_en_ss.pdf) |
| GMCC **PA118M1C-3FZU** | Catálogo GMCC2018 validado não contém referência exata. Documento Tipi encontrado diz apenas PA118M1C e não prova sufixo3FZU; catálogos comerciais não substituem original exato. | [Consulta](https://www.gmcc-welling.com/en/product/product-detail?categoryId=100124); [candidato ainda não aprovado](https://www.tipi.com.br/uploads/docs/58d3b9da26e5d.pdf) |
| Electrolux **família sem SKU** | Registro representa família genérica, sem SKU/modelo completo. A marca tem modelos e gerações diferentes; precisa do código da etiqueta para identificar manual exato. Nenhum PDF foi associado por aproximação. | [Consulta](https://www.electrolux.com.br/) |
| GMCC **PA270G2C-4FT1** | Código visto em catálogos de revenda, sem PDF original exato validado. Catálogo GMCC2018 traz PA270G2CS-4MU1, diferente de G2C-4FT1; associação rejeitada. | [Consulta](https://www.gmcc-welling.com/en/product/product-detail?categoryId=100124) |
| Embraco **NE2125GK** | Original Embraco de descontinuação e tabela de equivalência identificam NE2125GK; servidores Embraco/Nidec recusaram HTTP403. Não usar ficha NEK2125GK como se fosse o modelo antigo NE2125GK. | [Consulta](https://www.embraco.com/wp-content/uploads/2019/09/ne-phase-out.pdf); [candidato ainda não aprovado](https://www.embraco.com/wp-content/uploads/2019/09/electrical-components-aspera-british-system.pdf) |
| Samsung **QCR-36602-4** | Referência aparece em catálogo de distribuidor QEQuality junto à marca Samsung; não foi comprovado modelo OEM Samsung equivalente nem manual original. Exige código completo da etiqueta. | [Consulta](https://quality-mx.com/wp-content/uploads/2023/06/catalogo2023quality.pdf) |
| Gree **QXA-C129rB030** | Nenhum PDF original com código exato localizado. Exige confirmar referência completa e versão Landa/Gree na etiqueta; não associar catálogo genérico de rotativos. | [Consulta](https://www.gree.com.br) |

### Candidatos rejeitados ou ainda não aprovados

- GMCC PA125G1C: curvas exatas baixadas, porém sem autoria/capa do fabricante comprovada. Não importar como manual original.
- GMCC PA118M1C: manual de distribuidor sem sufixo completo; não comprova 3FZU.
- Copeland 2DC3R53KE: PDF TFC baixado para 208/230 V não substitui o TFD de 460 V.
- Bock HGX4 CO₂: apesar de números 465/555 parecidos, família/aplicação diferentes da HG4 convencional.
- Midea LSE11: código homônimo de fabricante diferente do Electrolux LSE11.
- Samsung QCR-36602-4: referência de revenda QEQuality; precisa do modelo OEM na etiqueta.
- GMCC2018 apresenta PA270G2CS-4MU1; não é prova para PA270G2C-4FT1.
- NEK2125GK não foi tratado como o antigo NE2125GK.

## Verificação e integração

A conferência estrutural confirmou 51 registros únicos: 49 lacunas e 2 substituições. Todos os 35 aprovados têm PDF local legível, hash e páginas dentro do arquivo; todos os 16 pendentes têm `manualUrl: null`. Os 6 registros genéricos continuam sem manual exato até obter o SKU da etiqueta. Não houve alteração de banco, fotos, hooks ou UI nesta pesquisa.

A integração deve ser aditiva e idempotente. Preservar os tipos e as limitações acima, hospedar somente arquivos aprovados e não importar automaticamente `candidateDocumentUrl`. Não basta uma URL terminar em `.pdf`: a tentativa oficial Copeland 4273556 retornou um PDF de uma página sem conteúdo útil e foi descartada.
