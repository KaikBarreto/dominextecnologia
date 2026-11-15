# Curadoria documental Samsung e Gree Brasil

Revisão: **15/11/2026**. Responsável pela curadoria: **Dev Catálogo / Tech Lead Dominex**. Escopo: dados de referência técnica; esta etapa não publica arquivos nem altera banco, hooks ou telas.

O arquivo de integração é `.context/samsung-gree-models.json`. Documentos, snapshots públicos, imagens e scripts de reprodução estão em `.context/samsung-gree/`. Os documentos locais não devem ser confundidos com arquivos já publicados no catálogo.

## Contagem e natureza dos registros

| Marca | Unidades físicas (`model`) | Configurações comerciais (`configuration`) | Combinações publicadas (`combination`) | Total |
| --- | ---: | ---: | ---: | ---: |
| Gree | 289 | 122 | 0 | 411 |
| Samsung | 204 | 0 | 150 | 354 |
| **Total** | **493** | **122** | **150** | **765** |

As 150 combinações Samsung DVM S2 são nomes publicados nas tabelas do manual. Não são 150 condensadoras individuais. Os códigos comerciais Gree sem `/I` ou `/O` permanecem como configurações; os componentes expressamente identificados recebem o tipo de unidade correspondente. Não foram criadas combinações por permutação, sufixos por inferência, nem modelos a partir de famílias com `xx`, `xxx` ou asteriscos.

Seis grafias Gree com parênteses na capacidade foram preservadas em `codeAliases`/`aliasEvidence` das identidades dos manuais individuais, com documentos, páginas e hashes. Não constituem seis unidades adicionais nem demonstram variantes de hardware.

A base inclui **81 fontes utilizadas**, **6 referências de diagnóstico** e **71 associações código/significado**, restritas aos modelos cobertos. Há **37 pendências explícitas**. Os 4 Samsung e 6 Gree já existentes no inventário devem ser preservados pela integração.

## Fontes principais

| Fonte | Conteúdo utilizado e limite |
| --- | --- |
| [Gree — Materiais técnicos](https://gree.com.br/manuais/) | Índice oficial para manuais atuais e legados. Foram baixados 30 manuais; os arquivos raster sem transcrição visual segura ficam em `pending`. |
| [Gree — Catálogo de Produtos, arquivo 2025B](https://gree.com.br/wp-content/uploads/2025/09/Catalogo_de_Produtos_2025B.pdf) | **O conteúdo identifica Line-up 2026**, apesar do nome/caminho do arquivo. PDF com 64 páginas; SHA-256 `99f9c2e8c344d7c568ca7ce642fc116faad8b6111aa7d2e98049182cf8c9c0cb`. G-Max p.33–35; GMV Mini p.39; High COP p.40–41; HR p.44; Slim-M p.45. Páginas sempre físicas, base 1. |
| [Samsung Brasil — DVM](https://www.samsung.com/br/business/digital-variable-multi/) | Confirma famílias DVM S2, S Eco, S Water e Chiller. A página geral não substitui o código completo ou uma ficha técnica. |
| [Samsung BR — suporte AM080AXVANH/EA](https://www.samsung.com/br/support/model/AM080AXVANH/EA/) | Vincula manual DVM S2 **DB68-12343A-02, 2026**, obtido diretamente do downloadcenter Samsung. P.6–13: modelos/composições; p.5: desenho técnico dos gabinetes; p.74–75: inspeção e operação de teste. |
| [Samsung — catálogo DVM Brasil original, hospedado na CentralAr](https://castaticstorage.blob.core.windows.net/centralar/mds/manuais/samsung/VRF/4094/manual%20%2B%20certificado%20de%20garantia.pdf) | Original do fabricante em distribuidor, identificado como tal em `documentType`. 101 páginas físicas; catálogo em páginas duplas até a p.99, seguido por garantia. A p.99 identifica Samsung Eletrônica da Amazônia. Usado para DVM S legado, Eco, Water, cassetes, High Wall WindFree e dutos. Sufixos `/EU`, `/AA`, `/TL` só entram quando o código está expresso nesse catálogo brasileiro. |
| [Samsung Brasil — loja oficial](https://store.samsung.com/br/ar-condicionado/d) | Página e API pública de produtos da própria loja; 142 itens retornados na pesquisa, com acessórios e kits excluídos quando não fornecem evidência adequada. Cada produto utilizado tem snapshot JSON individual com hash e URL oficial. WindFree, POWERvolt, AI Pro/Black, Digital Inverter Ultra, Multi Split e CAC/cassetes. Os códigos das unidades são extraídos dos campos explícitos da página. |
| [Samsung BR — AG042KSVANH/EU](https://www.samsung.com/br/support/model/AG042KSVANH/EU/), [AG056KSVANH/EU](https://www.samsung.com/br/support/model/AG056KSVANH/EU/), [AG070KSVANH/EU](https://www.samsung.com/br/support/model/AG070KSVANH/EU/) | Cada código completo confirmado individualmente em suporte BR, com snapshot HTML e SHA. Manual DVM Chiller **DB68-05916A-10, 2024**, fornecido nessas páginas: tabela sem bomba p.8 e desenho técnico p.10. Os sufixos não foram completados pela tabela do manual, que traz apenas o código-base. |

## Famílias cobertas

**Gree:** G-Top legado e Auto Inverter, G-Diamond Auto Inverter e Side, G-Classic 2025/2026, G-Side 2026, SmartWind, G-Línea, G-Prime Compact/Plus/Plus II, G-Max com evaporadoras Hi-Wall, cassete 8 vias/1 via, duto e piso-teto; GMV Mini, High COP, HR e GMV 9 Slim-M.

**Samsung:** WindFree e Digital Inverter de múltiplas gerações, POWERvolt, AI Pro e Black; Multi Split; CAC/cassetes 1 via, 4 vias e 360; DVM S2 com configurações Heat Pump, somente frio, alta eficiência e recuperação de calor; DVM S legado, S Eco, S Water, evaporadoras DVM e DVM Chiller sem bomba.

## Capacidade, imagem e diagnóstico

- A família G-Max utiliza **R-32**, explicitamente no catálogo p.30 e nas tabelas do manual G-Max Rev.003 p.52–54. A menção a R410A no parágrafo p.30 é uma comparação com a geração anterior, não o refrigerante dos modelos apresentados.
- Capacidade desconhecida permanece `null`. Não foi usado consumo elétrico como capacidade, nem convertido HP ou kW silenciosamente para BTU/h. A faixa mínima/máxima das condensadoras G-Max não virou capacidade nominal. Nas evaporadoras G-Max, a tabela foi transcrita literalmente, inclusive `GKH(18)EB… = 17.000` e `GTH(18)CA… = 15.500 BTU/h`. A capacidade de `GKH(22)DA-D6DNA1A/I` permanece `null`: catálogo p.35 informa 20.000 BTU/h, enquanto o manual G-Max Rev.003 p.53 informa 22.000 BTU/h para a nomenclatura correspondente; não foi escolhida uma variante por inferência.
- Todas as imagens indicam **família**. Desenhos de estrutura, cutaway e ilustrações técnicas são identificados como `technical_illustration`; não são apresentados como fotografia exata do SKU. As imagens vêm dos PDFs ou da galeria original Samsung. Recortes de tabelas e imagens de conjuntos mantêm essa condição nas notas. O GMV HR usa a imagem original embarcada, Xref 725, sem selo ou unidades vizinhas.
- Gree G-Top/G-Diamond: tabela p.43 dos respectivos manuais, com 13 códigos em cada referência. G-Max: p.50–51, apenas as 6 condensadoras expressamente listadas na capa. `F0` G-Max foi omitido por ressalva de aplicabilidade da própria tabela. Estados como `H1`, `AL`, `Fo` e `dd` não equivalem a confirmação de defeito.
- Samsung DVM S2: `E503`, `E505` e `E506` são referências de **comissionamento** (`context: commissioning`), exclusivas à inspeção/operação de teste do manual utilizado. Não constituem tabela geral de operação para a marca.

## Exclusões e lacunas documentadas

1. Gree evaporadoras GMV p.46–47: séries com `xx`/`xxx`; não foram gerados códigos por capacidade.
2. Gree água gelada/chillers p.52–57: famílias e capacidades de projeto, sem código completo publicável. O catálogo orienta consultar a engenharia para produtos de projeto. Não foram inventados SKUs industriais.
3. Gree GMV 6 CP p.43 e vários manuais legados: conteúdo raster ainda sem transcrição visual integral dos modelos. Os PDFs, hashes e motivos estão preservados em `pending`.
4. Samsung cassetes DVM mini/2 vias: códigos localizados, mas não foi usada imagem de outra família para completar a ficha. A família aguarda imagem própria adequada.
5. Samsung loja oficial: itens com campos evaporadora/condensadora invertidos ou capacidade conflitante com o título foram excluídos. Produtos cuja primeira foto mostra somente a evaporadora não receberam automaticamente uma condensadora com essa foto.
6. Capacidade de kit Multi Split não foi atribuída às unidades físicas que o compõem. Uma composição anunciada em varejo não comprova capacidade nominal de cada evaporadora.
7. Nenhuma tabela portuguesa/europeia avulsa foi usada como catálogo brasileiro. O manual em português fornecido pelo suporte BR pode utilizar português europeu; a evidência de mercado é a página BR do modelo, não o idioma do PDF.

## Verificação e reprodução

```sh
python3 .context/samsung-gree/build_curated.py
python3 .context/samsung-gree/validate_curated.py
```

O relatório `.context/samsung-gree/validation.json` registra 765 registros sem duplicatas marca/código, assinatura `%PDF` dos documentos associados, SHA-256 dos PDFs/snapshots/imagens, ocorrência de cada código na página indicada ou no snapshot oficial, integridade das referências de diagnóstico e o hash do JSON final. Os textos dos PDFs são extraídos uma vez e reutilizados por página, sem renderização por modelo.

Pranchas de revisão: `.context/samsung-gree/assets-final-contact.jpg` e `store-contact-{0,30,60}.jpg`. Os últimos ajustes de Eco, High Wall e GMV HR também foram inspecionados individualmente. Esta verificação é documental e visual, sem ensaio de equipamentos físicos. Não houve alteração de UI, banco, deploy, versão, changelog, commit ou push.

Candidato de aprendizado para avaliação do Tech Lead: em catálogo público, o nome do arquivo pode divergir da edição interna; campos técnicos da loja oficial também podem conter conflito. Registrar ambas as evidências e manter dados inconclusivos em aberto, sem completar pelo código comercial.
