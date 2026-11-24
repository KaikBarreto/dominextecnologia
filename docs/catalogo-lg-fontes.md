# Catálogo LG — fontes e limites da curadoria

Revisão: **15/11/2026**. Responsável: curadoria técnica de catálogo Dominex, assistida por Codex.

A base de integração está em `.context/lg-catalog-models.json`. Esta entrega cobre as famílias documentadas abaixo; **não afirma exaustividade histórica nem disponibilidade comercial atual de todos os identificadores**. O inventário público existente não foi alterado.

## Identificadores e fotografias

| Natureza | Registros |
|---|---:|
| Unidades físicas (`model`) | 262 |
| Combinações explicitamente publicadas (`combination`) | 89 |
| Chillers configuráveis por seleção (`configuration`) | 272 |
| Notações variáveis literais (`series`) | 118 |
| Total documental | 741 |

**741 não significa 741 SKUs físicos.** As notações `A(C)RUN...` e `ARNU...*...` permanecem exatamente como publicadas e não foram expandidas. Sistemas modulares seguem a tabela de combinação, incluindo Multi V Water 5. Os códigos RCWFH/RCWFL identificam configurações da tabela do fabricante, que admite customização.

Há **70 imagens originais** associadas: fotos do fabricante ou ilustrações técnicas do próprio PDF quando faltou foto apropriada. O JSON registra SHA-256, página, xref e máscara, ou retângulo e escala do recorte. `imageScope: family` informa que a imagem é representativa da tipologia/família e não prova a variante elétrica ou a quantidade de módulos. Selos, logos, ícones e garantias foram rejeitados como foto. As fichas residenciais mostram o conjunto pela evaporadora; as 12 condensadoras usam ilustração dimensional própria da unidade externa publicada nos manuais oficiais R32/Uniq, com tabela de chassis na mesma página. A imagem é representativa da família, não prova o chassi exato de cada variante.

Capacidade em HP, índice de seleção em kW e potência elétrica não foram convertidos em BTU/h nem tratados como equivalentes. `capacityBtu` permanece nulo nesta curadoria. Não foi atribuído perfil mecânico SH/SC por marca. As revisões 220 V e 380 V de Multi V PRO II e Water 5 são separadas; casos 50/60 Hz compartilhados na mesma ficha estão indicados em notas.

## Famílias cobertas

| Família | Registros documentais |
|---|---:|
| Multi V | 123 |
| Multi Inverter | 56 |
| Multi Inverter R-32 | 6 |
| Multi V S | 4 |
| Multi V Water 5 220 V | 12 |
| Multi V Water 5 380 V | 27 |
| Multi V S quente/frio | 16 |
| Comercial Leve | 24 |
| Multi V 5 PRO II 380 V | 49 |
| Multi V 5 PRO II 220 V | 49 |
| Chiller Scroll Inverter | 21 |
| Chiller centrífugo mancal magnético | 19 |
| Chiller centrífugo 2 estágios | 16 |
| DUAL Inverter Uniq +AI 3.0 | 6 |
| DUAL Inverter AI Compact | 18 |
| DUAL Inverter AI Artcool | 11 |
| DUAL Inverter Voice +AI | 21 |
| Absorption Chiller WCDX | 23 |
| Absorption Chiller YCDX | 23 |
| Absorption Chiller YCDN | 23 |
| Absorption Chiller WCSH | 23 |
| Absorption Chiller YCSH | 22 |
| Absorption Chiller WCMH | 25 |
| Absorption Chiller YCMH | 25 |
| Absorption Chiller WC2H | 26 |
| Absorption Chiller YC2H | 26 |
| Multi V 5 legado | 47 |

## Documentos usados como evidência de código

| Documento | Origem | Páginas de evidência | SHA-256 |
|---|---|---|---|
| [202409_PDB Multi V S CO_220V.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202409_PDB%20Multi%20V%20S%20CO_220V_20240927_223152_.pdf) | LG oficial | 3, 6, 7, 10, 11, 14, 15, 16, 17, 18, 19 | `143e493bc8496f980d8a79d5589204692248e66f8d6351ab22440f3bb70bb133` |
| [202401_PDB_Multi V 5 PRO II_380V.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202401_PDB_Multi%20V%205%20PRO%20II_380V_20240924_034931_.pdf) | LG oficial | 4, 5 | `cd53132226d27acde3a95ba17b1a936e5fba51149123f1b4906a03ca85b40e5f` |
| [202405_PDB_Multi V 5 PRO II_220V.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202405_PDB_Multi%20V%205%20PRO%20II_220V_20240924_034456_.pdf) | LG oficial | 4, 5 | `f48dee79ca35a9eba780237ce8cdc685e6dd66390163f5e1d89f303cf46a51f3` |
| [Multi V 5 Trouble Shooting Guide.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/Multi%20V%205%20Trouble%20Shooting%20Guide_20240208_214108274_.pdf) | LG oficial | 11 | `8803358b34b459134c90ac45f426e4fa64e6d792306199c27357557318094963` |
| [202401_PDB_Multi V Water 5_220V.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202401_PDB_Multi%20V%20Water%205_220V_20240201_202807654_.pdf) | LG oficial | 1, 3, 4, 33 | `d0b2b51915812b26bddc4cb084fa99ba3ccb42dbb46c84e5f2af2acbcfeb164a` |
| [202312_PDB_Multi V S Compacto.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202312_PDB_Multi%20V%20S%20Compacto_20231222_035317267_.pdf) | LG oficial | 7, 10 | `07ed57477ccf9defb391b7bc40818369b3e050b7b281a3be5c8b97b561956f6c` |
| [202311_PDB_Evaporadoras_MultiV_GHP.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202311_PDB_Evaporadoras_MultiV_GHP_20231222_041449408_.pdf) | LG oficial | 4, 5 | `b438df479cbbb9e403de8a86e64b40f25d4d09077769203572cb9adc3e6b4aaa` |
| [202310_PDB_Multi V Water 5_380V.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202310_PDB_Multi%20V%20Water%205_380V_20231019_043344150_.pdf) | LG oficial | 1, 3, 4 | `89f56d98d42d7a9367c57aaa38168bd530df5a45bfa0029402eeb4169b3212a0` |
| [202310_Catalogo Comercial HVAC LG.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202310_Catalogo%20Comercial%20HVAC%20LG_20231006_031910184_.pdf) | LG oficial | 10 | `a7deb8ee4ca10127a051a3c8549095a48abcf56cba623a42d67c4c9c7edce900` |
| [202305_PDB_Multi V S_220V.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202305_PDB_Multi%20V%20S_220V_20230512_221937270_.pdf) | LG oficial | 3, 8 | `aeb0d5101080b061dd30bbf746779287160cda7ea6b95561649bcea71cad6353` |
| [202103_PDB_MVS_380V.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202103_PDB_MVS_380V_20230324_034250024_.pdf) | LG oficial | 4, 12 | `72c752e6159c404dfbb76ee319115a17b9592e5a99d420e1beee9836a676b251` |
| [202503_PDB Multi Inverter Evaporadoras.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202503_PDB%20Multi%20Inverter%20Evaporadoras_20250321_220207_.pdf) | LG oficial | 5 | `0e4e79ada8ad0e5ffd0330b0707320255afcb3a826e0b20cf193fabd178251b5` |
| [202503_PDB Multi Inverter Condensadora.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202503_PDB%20Multi%20Inverter%20Condensadora_20250321_212407_.pdf) | LG oficial | 3, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 22, 23 | `1b478f4abcdc880357810b1d3ad7ff19daa7257daeece0172e29e369ead8c7f8` |
| [202405_PDB_SCAC_Unidades Internas.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202405_PDB_SCAC_Unidades%20Internas_20240630_010055_.pdf) | LG oficial | 3, 14, 43, 72, 94 | `55afa1b84bdc4cbea5a864dd7ec1453c5092128cc6497c1004d374dcefc8ab69` |
| [202405_PDB_SCAC_Unidades Externas.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202405_PDB_SCAC_Unidades%20Externas_20240630_004938_.pdf) | LG oficial | 3, 35 | `b66cf6e4cf02684dbba62c4c982f30f6b4b22dca059bdc7198d98f4cd5eb2a10` |
| [202311_Folheto Comercial_Chiller Scroll Inverter.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202311_Folheto%20Comercial_Chiller%20Scroll%20Inverter_20231125_043232100_.pdf) | LG oficial | 1, 3, 4, 5, 6, 7 | `9eca2a0969b7f8322080514bdcfff00a0b77454af5ab6932c5aff37888ca0dd2` |
| [2022_Absorption_Chillers.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/2022_Absorption_Chillers_20230317_024537475_.pdf) | LG oficial | 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 28, 30, 31 | `bd5dc031ab038495dd997b8faa07338e3f403060331216e584262bcd385ae80e` |
| [202004_Catálogo_ChillerMancalMagnetico.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202004_Cat%C3%A1logo_ChillerMancalMagnetico_20220701_100316685_.pdf) | LG oficial | 1, 7, 8 | `6e1824e7929dac18ffa91a541fae39dcbb1cc70f40ed0b7fff4ab94e677d38a0` |
| [202004_Catálogo_ChillerCentrífugo.pdf](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/202004_Cat%C3%A1logo_ChillerCentr%C3%ADfugo_20220701_100227769_.pdf) | LG oficial | 1, 9 | `b2a92fefbc6cf324c3756cd18b2a710fc37dbccdb0aeb37b4a806b10ae611a93` |
| [Catálogo comercial LG uniq](https://www.leverosintegra.com.br/download/manuais/LG/catalogo-comercial-hw-inverter-uniqai3.pdf) | Original LG hospedado pelo distribuidor Leveros | 1, 2, 4, 5 | `c9b2ab83372f97bcf2ae6fac0c4b586243d0fa1f5c25c914d69e4faf72780ef5` |
| [Catálogo comercial LG compact-qal](https://www.leverosintegra.com.br/download/manuais/lg/catalogo-comercial-hw-inv-compacta-ia-QAL.pdf) | Original LG hospedado pelo distribuidor Leveros | 1, 3, 5, 6 | `33396f8ae3710073f2dc793258ada72a034c9063b563ef1ee2f01bfaf7e9efb6` |
| [Catálogo comercial LG compact-qac](https://www.leverosintegra.com.br/download/manuais/lg/catalogo-comercial-hw-inv-compact-ia-QAC-lg.pdf) | Original LG hospedado pelo distribuidor Leveros | 1, 3, 5, 6 | `be5d229955760aa333890af4ec63828ba14be0452f653875cafa62426d015e4f` |
| [Ficha comercial LG artcool-fr](https://www.leverosintegra.com.br/download/manuais/LG/catalogo-comercial-fr-lg.pdf) | Original LG hospedado pelo distribuidor Leveros | 1, 3, 5 | `00e47c6f27208da269cd7f21ff228c8535055db1f9203a28b46ff0ddaab530a1` |
| [Ficha comercial LG artcool-qf](https://www.leverosintegra.com.br/download/manuais/LG/catalogo-comercial-ai-voice-qf-12k-18k-24k-lg.pdf) | Original LG hospedado pelo distribuidor Leveros | 1, 3, 7 | `1c8790187b953a2985a2c864dee523daaebae64ed8f1302bb0c76d3b3d4c514b` |
| [Ficha comercial LG DUAL Inverter Voice voice9](https://www.leverosintegra.com.br/download/manuais/LG/catalogo-comercial-hw-inverter-lg-dual-inverter-voice-ai.pdf) | Original LG hospedado pelo distribuidor Leveros | 1, 3, 5, 6 | `6cb73f30edd5752a130af8150c80ae6f47b60cd0a6821475015bdc72292153f4` |
| [Ficha comercial LG DUAL Inverter Voice voice12](https://www.leverosintegra.com.br/download/manuais/LG/catalogo-lg-dual-inverter-voice-12000-btus-r32.pdf) | Original LG hospedado pelo distribuidor Leveros | 1, 5, 6 | `1262b622e5062e52173b20cba595e6186756e8ba6d1b87077621b6922f7c8a63` |
| [Ficha comercial LG DUAL Inverter Voice voice12new](https://www.leverosintegra.com.br/download/manuais/LG/catalogo-comercial-hw-dual-inverter-voice-12k-fr-qf-lg.pdf) | Original LG hospedado pelo distribuidor Leveros | 1, 3, 5, 7 | `d871f5d4fb548d8085b860f300d2fb580d6834b8f7ee23fa1d987742ff17ce97` |
| [Ficha comercial LG DUAL Inverter Voice voice24](https://www.leverosintegra.com.br/download/manuais/LG/catalogo-comercial-hw-dual-inverter-voice-24k-fr-qf-lg.pdf) | Original LG hospedado pelo distribuidor Leveros | 1, 3, 5 | `17c6b51ccd36c059b22048a9f182166bdffc24220c1fd30e819093568010a4ba` |
| [Manual de instalação LG install-uniq](https://www.lg.com/content/dam/subsidiary/latam/brazil/suporte/shared/manuais/9-12K%20Btus_R32_UNIQ_Installation%20Manual.pdf) | LG oficial | 16 | `0f9f2d50c358a6362238c8eac59d18552dea1a139aedb962350aff84a5656e5c` |
| [Manual de instalação LG install-dual9](https://www.lg.com/content/dam/subsidiary/latam/brazil/suporte/shared/manuais/9K%20Btus_Dual%20Inverter_R32_Installation%20Manual.pdf) | LG oficial | 2 | `321ba8568feca1fa0f393533249404a729b0323871e8d663e08070ad4c982a5f` |
| [Manual de instalação LG install-dual12](https://www.lg.com/content/dam/subsidiary/latam/brazil/suporte/shared/manuais/12K%20Btus_Dual%20Inverter_R32_Installation%20Manual.pdf) | LG oficial | 2 | `40ff9648b24eac88d8f46242dd1e06e9c97266f7387d701eb7b9d39eec1fb13c` |
| [Manual de instalação LG install-dual18](https://www.lg.com/content/dam/subsidiary/latam/brazil/suporte/shared/manuais/18-24K%20Btus_Dual%20Inverter_R32_Installation%20Manual.pdf) | LG oficial | 2 | `772accda7263d50eca583506f519222cc75f6e0fb075106079fe7ce09df08910` |

As páginas são números físicos do PDF, começando em 1. Os originais locais ficam em `.context/lg-catalog/documents/`; a publicação oficial que reúne os PDBs é a [página VRF LG Brasil](https://www.lg.com/br/business/ar-condicionado/produtos/vrf-multi-v/). As outras entradas são [Multi Inverter](https://www.lg.com/br/business/ar-condicionado/produtos/multi-split-ar-condicionado/), [Comercial leve](https://www.lg.com/br/business/ar-condicionado/produtos/comercial-leve/), [Chiller](https://www.lg.com/br/business/ar-condicionado/produtos/chiller/) e [manuais residenciais LG](https://www.lg.com/br/suporte/manuais-sistema/).

## Códigos de erro

Foi transcrita uma referência de operação do [LG Multi V5 Trouble Shooting Guide](https://www.lg.com/content/dam/channelbtb/lgcom/br/business/download/airsolution/Multi%20V%205%20Trouble%20Shooting%20Guide_20240208_214108274_.pdf): CH01, CH02 e CH06. A lista de **47 códigos LTE5** cobertos está no JSON e é comprovada na página PDF 11. A explicação do prefixo CH está na página PDF 50; a tabela e o diagnóstico estão na página PDF 52 (numeração impressa 102–103).

Não estender essa referência para PRO II LLS5/BLS5, Multi V S, Multi Inverter ou equipamentos residenciais. O ARUN080LTE5 foi excluído porque o guia o declara indisponível para a América do Sul. Os demais erros ainda aguardam revisão individual.

## Pendências e verificação

A pendência em `pending` é exclusivamente a revisão dos demais códigos de erro do guia Multi V5. Não há registro integrado sem imagem. As anteriores 12 pendências de condensadoras foram resolvidas com desenhos dimensionais originais; as 216 configurações de absorção foram promovidas com identificadores de tabela preservados e desenhos da própria subfamília (PDF 24 DX, 25 DN, 28 SH, 30 2H e 31 MH). Isso não completa os opcionais da nomenclatura nem transforma configuração em SKU físico. Diferenças de sufixo entre tabelas dimensionais e de especificação foram preservadas. Os fancoletes continuam somente como fonte local consultável, sem gerar códigos por nomenclatura. Nenhuma alegação de “todos os modelos LG já vendidos no Brasil” deve ser publicada com esta base.

Validação executada: `python3 .context/lg-catalog/validate.py`. Resultado: **741 identificadores literais, 27 PDFs de códigos, 70 imagens, 39 fontes com SHA-256 conferido, nenhum código duplicado e zero inconsistências**. As imagens foram revisadas em contact sheets e os recortes do guia estão em `.context/lg-catalog/evidence/`. A revisão adicional está em `promoted-dimensions-reviewed.jpg`. Não houve alteração de UI, hooks, banco ou API; testes da aplicação e importação ficam com a integração coordenada pela sessão principal.

Candidato a aprendizado durável para a sessão principal: o nome do arquivo comercial não garante o produto real; conferir capa, código integral, variante elétrica e tipo de registro antes de integrar. Esse cuidado evitou expandir a notação LG `A(C)` e evitou tratar logo de capa como foto.
