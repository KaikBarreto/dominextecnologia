# Daikin Brasil — modelos comerciais e VRV documentados

Conferência: 15/11/2026. Responsável pela curadoria: equipe técnica Dominex. Revisar ao trocar geração, código, tensão ou edição da documentação.

A pesquisa produziu **562 códigos completos** publicados no corpus oficial Daikin Brasil: **265 unidades internas/ventiladores, 109 unidades externas físicas e 188 combinações externas**. Combinações não são condensadoras físicas adicionais. Não foram gerados códigos pela expansão presumida de faixas, tensões ou sufixos.

Todos os registros possuem foto representativa da família, fonte e hash local. **558 possuem PDF correspondente**, e quatro RZR possuem somente publicação BIM/RFA: o manual e o fluido continuam nulos. Imagens de ícones de ruído dB foram rejeitadas visualmente e substituídas por gabinetes reais.

## Cobertura por linha

| Linha | Códigos |
|---|---:|
| SkyAir R-32 | 12 |
| SkyAir R-410A | 12 |
| SkyAir legado | 8 |
| SkyAir legado BIM/RFA | 4 |
| VAM recuperação de calor | 9 |
| VRV 6 quente/frio | 72 |
| VRV 6 recuperação de calor | 54 |
| VRV Fit | 12 |
| VRV Inova só frio | 54 |
| VRV Inova quente/frio legado | 60 |
| VRV S alta eficiência sazonal | 11 |
| VRV W III | 6 |
| VRV W IV | 16 |
| VRV unidades internas atuais | 121 |
| VRV unidades internas legadas documentadas | 111 |

## Fontes centrais

- [Catálogo VRV Unificado 2026](https://www.daikin.com.br/static/uploads/conteudos/downloads/260824111733000000.pdf), 200 páginas: códigos completos, unidades físicas e combinações, equipamentos internos, VAM. Cada registro mantém as páginas físicas onde seu código aparece.
- [SkyAir R-32, folheto 09/2025](https://www.daikin.com.br/static/uploads/conteudos/downloads/251001114217000000.pdf), páginas 14–15: FCQA30/36A5VL, FKQA18/24A5VL, FDMQA18/24/30/36A5VL e RZAQ18/24/30/36BVL. O código “36” não foi convertido automaticamente para 36.000 BTU/h: o documento apresenta nominal de 35.000 BTU/h.
- [SkyAir, folheto 10/2024](https://www.daikin.com.br/static/uploads/conteudos/downloads/241015015241000000.pdf), páginas 10–11: FCQ/FBQ/RZQ 30/36/42/48AVL. Capacidades nominais dependem da combinação, não apenas do número no SKU.
- [VRV Inova RHXYQ-AYL/ATL — dados de engenharia](https://www.daikin.com.br/static/uploads/conteudos/downloads/200509055407000000.pdf), 30 páginas raster: todos os cabeçalhos foram conferidos visualmente. O OCR incorreto não foi usado para inventar códigos. Até 22HP são módulos; de 24 a 66 são combinações expressamente mostradas nas tabelas.
- [VRV W IV — especificações](https://www.daikin.com.br/static/uploads/conteudos/downloads/230411105740000000.pdf), 8 páginas: RWEYQ6–36TYM expressamente listados, separando módulos até 12 e combinações posteriores.
- [VRV W III — instalação](https://www.daikin.com.br/static/uploads/conteudos/downloads/200510044849000000.pdf), capa: RWEYQ10/20/30PTL e PYL.
- [Downloads oficiais](https://www.daikin.com.br/profissionais/downloads), produtos 6/7 SkyAir e 10/12/15/17/18/34/37/38/41 VRV. Todos os PDFs complementares possuem URL final, SHA-256 e arquivo local no manifesto operacional.

## Códigos de diagnóstico

Duas referências adicionais foram entregues com escopo fechado:

1. **FDMQA30A5VL / FDMQA36A5VL:** 54 códigos inequívocos nas páginas PDF 18–19 do [manual original de instalação Daikin, cópia distribuída pela Leveros](https://www.leverosintegra.com.br/download/manuais/Daikin/manual-instalacao-duto-skyair-daikin.pdf). A própria tabela depende do tipo/configuração interna e externa. Funções opcionais não são anunciadas como presentes em todos os equipamentos. As três grafias ambíguas `HO`, `HS` e `LS` não foram normalizadas por suposição. Duplicações com significado equivalente foram consolidadas sem transformar a indicação em diagnóstico exclusivo.
2. **RWEYQ-TYM:** seis indicações inequívocas da tabela de comissionamento, [manual oficial VRV IV W](https://www.daikin.com.br/static/uploads/conteudos/downloads/230411110922000000.pdf), página impressa 16/PDF 20. São orientações de teste inicial, não uma tabela universal de falhas em operação. Os demais códigos multicausais permanecem para consulta no original.

Os manuais de operação originais FCQA30/36 e FKQA18/24 também foram conferidos. Não foi copiada a tabela FDMQA para essas famílias. A referência existente SiBR281412B permanece separada para FCQ/FBQ AVL.

## Fotos e limites de escopo

Foram vistos os 33 assets originais usados nas famílias. As imagens internas e VRV são disponibilizadas pela Daikin Brasil; condensadoras R-32 e R410A utilizam também fotos publicadas por CentralAr/Friopeças, com fonte do produto e escopo familiar. Algumas imagens oficiais incluem dimensões técnicas. A legenda de família deve permanecer na ampliação e no download.

Quatro códigos `RZR30AVL`, `RZR36AVL`, `RZR42AVL`, `RZR48AVL` aparecem na publicação oficial de famílias BIM. BIM/RFA não é PDF nem manual; não atribuir gás ou detalhes técnicos por aproximação. Refnet, BS, controles, filtros e kits não foram cadastrados como condicionadores; requerem categorias próprias.

A cobertura corresponde aos documentos publicados e conferidos, incluindo legados. Ela não afirma disponibilidade comercial atual de cada SKU nem exaustividade mundial de todas as variantes históricas Daikin.

Manifesto de trabalho: `.context/daikin-commercial-models.json`. Evidências, PDFs, fotos, contact sheets e verificador: `.context/daikin-commercial/`. Nenhuma alteração de banco, código de aplicação, commit ou publicação foi feita nesta pesquisa.
