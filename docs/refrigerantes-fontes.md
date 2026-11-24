# Tabelas de saturação: fontes integrais e revisão documental

Revisão: **15/11/2026**. Responsável pela curadoria documental e revisão da implementação: equipe técnica Dominex, com execução assistida por Codex. Não representa homologação metrológica, ensaio de campo ou autoria das tabelas dos fabricantes.

## O que foi conferido

As 20 curvas históricas dos 13 refrigerantes foram substituídas por **21 curvas documentais**, incluindo as duas fases do R-410A. São **639 linhas originais dos 13 documentos**, produzindo **1.039 pontos válidos** após transformar unidades e excluir dois erros tipográficos da publicação, ambos mantidos nos dados brutos com justificativa. Não ficaram tabelas históricas sem origem rastreável.

Os números usados são os pontos publicados, não uma nova estimativa calculada a cada 5 °C. Entre dois pontos, a ferramenta continua usando interpolação linear; fora dos extremos, retorna ausência de resultado em vez de extrapolar. A precisão não supera a resolução da publicação original.

As tabelas físicas National informam pressão **absoluta (psia)**. O app subtrai **14,695948776 psi (1 atm padrão)** uma única vez e apresenta pressão manométrica. A Chemours R32 usa **bar_g**; as tabelas MO99 e Solstice N40 usam **psig**, portanto não recebem nova subtração atmosférica.

## Cobertura de todas as curvas

Faixas abaixo são os extremos publicados convertidos para °C. Cada curva mantém seu intervalo real; líquido e vapor podem ter extremos diferentes. Os números de página “PDF” usam a primeira página do arquivo como 1; os números impressos identificam o guia de origem.

| Gás | Curva | Pontos válidos | Faixa da curva | Unidades originais | Documento/página |
| --- | --- | ---: | --- | --- | --- |
| R-22 | unica | 45 | -51.111111 a 71.111111 °C | F / psia | [PDF 2 (impressa 18)](https://refrigerants.com/wp-content/uploads/2020/03/R22_RefGuid.pdf) |
| R-410A | bubble | 37 | -40.000000 a 60.000000 °C | F / psia | [PDF 2 (impressa 49)](https://refrigerants.com/wp-content/uploads/2020/03/R410A_RefGuid.pdf) |
| R-410A | dew | 37 | -40.000000 a 60.000000 °C | F / psia | [PDF 2 (impressa 49)](https://refrigerants.com/wp-content/uploads/2020/03/R410A_RefGuid.pdf) |
| R-134a | unica | 45 | -51.111111 a 71.111111 °C | F / psia | [PDF 2 (impressa 27)](https://refrigerants.com/wp-content/uploads/2020/03/R134a_RefGuid.pdf) |
| R-290 | unica | 43 | -51.111111 a 65.555556 °C | F / psia | [PDF 2 (impressa 29)](https://refrigerants.com/wp-content/uploads/2020/03/R290_RefGuid.pdf) |
| R-404A | bubble | 43 | -51.111111 a 68.333333 °C | F / psia | [PDF 2 (impressa 39)](https://refrigerants.com/wp-content/uploads/2020/03/R404A_RefGuid.pdf) |
| R-404A | dew | 44 | -51.111111 a 68.333333 °C | F / psia | [PDF 2 (impressa 39)](https://refrigerants.com/wp-content/uploads/2020/03/R404A_RefGuid.pdf) |
| R-407C | bubble | 40 | -51.111111 a 60.000000 °C | F / psia | [PDF 2 (impressa 43)](https://refrigerants.com/wp-content/uploads/2020/03/R407C_RefGuid.pdf) |
| R-407C | dew | 41 | -51.111111 a 60.000000 °C | F / psia | [PDF 2 (impressa 43)](https://refrigerants.com/wp-content/uploads/2020/03/R407C_RefGuid.pdf) |
| R-422D | bubble | 41 | -51.111111 a 60.000000 °C | F / psia | [PDF 2 (impressa 58)](https://refrigerants.com/wp-content/uploads/2020/03/R422D_RefGuid.pdf) |
| R-422D | dew | 41 | -51.111111 a 60.000000 °C | F / psia | [PDF 2 (impressa 58)](https://refrigerants.com/wp-content/uploads/2020/03/R422D_RefGuid.pdf) |
| R-407A | bubble | 41 | -51.111111 a 60.000000 °C | F / psia | [PDF 2 (impressa 41)](https://refrigerants.com/wp-content/uploads/2020/03/R407A_RefGuid.pdf) |
| R-407A | dew | 41 | -51.111111 a 60.000000 °C | F / psia | [PDF 2 (impressa 41)](https://refrigerants.com/wp-content/uploads/2020/03/R407A_RefGuid.pdf) |
| R-449A | bubble | 39 | -40.000000 a 65.555556 °C | F / psia | [PDF 2 (impressa 62)](https://refrigerants.com/wp-content/uploads/2020/03/R449A_RefGuid.pdf) |
| R-449A | dew | 39 | -40.000000 a 65.555556 °C | F / psia | [PDF 2 (impressa 62)](https://refrigerants.com/wp-content/uploads/2020/03/R449A_RefGuid.pdf) |
| R-12 | unica | 45 | -51.111111 a 71.111111 °C | F / psia | [PDF 2 (impressa 14)](https://refrigerants.com/wp-content/uploads/2020/03/R12_RefGuid.pdf) |
| R-32 | unica | 59 | -50.000000 a 66.000000 °C | C / barg | [PDF 2](https://www.chemours.com/en/-/media/files/opteon/a2l/optxlptac-0522-printable.pdf?rev=1df2ac22fd7e42c9a29b784938b52a48) |
| R-438A | bubble | 103 | -52.777778 a 64.500000 °C | F / psig | [PDF 16, 17](https://www.opteon.com/en/-/media/files/freon/freon-mo99-nu22b-retrofit-guidelines.pdf?hash=DE5A7532DF6786ED720C67D3097A810E&rev=cb47ceae0ca247879c21e65941aa1546) |
| R-438A | dew | 103 | -46.388889 a 67.444444 °C | F / psig | [PDF 16, 17](https://www.opteon.com/en/-/media/files/freon/freon-mo99-nu22b-retrofit-guidelines.pdf?hash=DE5A7532DF6786ED720C67D3097A810E&rev=cb47ceae0ca247879c21e65941aa1546) |
| R-448A | bubble | 56 | -46.111111 a 63.833333 °C | F / psig | [PDF 3](https://prod-edam.solstice.com/content/dam/honeywell-edam/pmt/oneam/en-us/refrigerants/documents/7900001-ras-tds-solstice-n40-ltr-en.pdf) |
| R-448A | dew | 56 | -39.944444 a 67.222222 °C | F / psig | [PDF 3](https://prod-edam.solstice.com/content/dam/honeywell-edam/pmt/oneam/en-us/refrigerants/documents/7900001-ras-tds-solstice-n40-ltr-en.pdf) |

## R-410A: duas curvas, mesmo com glide pequeno

O guia National publica pressão de líquido e vapor separadamente. Por exemplo, a 50 °F, a tabela informa157,4 psia (líquido) e156,9 psia (vapor); a 140 °F, 555,9 e554,8 psia. O catálogo agora mantém essas duas curvas: SH usa dew/vapor, SC usa bubble/líquido. Não se usa mais uma curva única aproximada para ambos os cálculos.

## Erros tipográficos publicados, sem corrigir por palpite

- **R-404A bubble, 125 °F:** a fonte imprime384,4 psia, maior que370,6 psia a 130 °F e incompatível com a sequência. A linha original continua preservada no dataset bruto. Apenas esse ponto líquido é excluído da curva e a interpolação usa120/130 °F. A coluna dew346,1 psia a 125 °F continua válida. A tabela independente [Chemours pocket](https://www.freon.com/en/-/media/files/freon/freon-pocket-pressure-temperature-guide-for-replacements.pdf?rev=45d7c4c843f640329656e8975a627431) publica bubble329,0 psig a 124 °F e337,7 psig a 126 °F, corroborando a região da interpolação pelos vizinhos íntegros.
- **R-407C bubble, −30 °F:** a tabela física imprime226 psia entre19,9 psia a−35 °F e25,4 psia a−25 °F. Apenas esse ponto bubble é excluído; dew16,4 psia permanece. A tabela P×T na primeira página do próprio documento publica7,9 psig de líquido a−30 °F, corroborando a ordem de grandeza e demonstrando que226 psia não é um valor válido. Não se substituiu o número impresso por22,6 sem uma linha documental correspondente.

A existência desses erros é registrada em `excluded` junto da curva e da coordenada. Não é aplicado um “filtro de monotonicidade” genérico que esconda automaticamente outros problemas da fonte.

## Conferência reprodutível, ponto a ponto

O dataset versionado em `src/data/refrigerantSaturationSources.ts` preserva título, URL, páginas, revisão, unidade original, todas as linhas e SHA-256 da edição exata de cada PDF. Os testes congelam a impressão das linhas documentais e verificam os1.039 pontos, todos os intervalos/inversas, extremos, vácuo, fases, SH/SC, valores não finitos e ausência de extrapolação. Há checkpoints independentes frio/meio/quente das publicações, sem depender apenas da implementação.

Uma verificação documental independente pode baixar os PDFs públicos e comparar novamente **cada linha da fonte com o dataset**:

```sh
python3 scripts/verify-refrigerant-sources.py --download
```

O script é QA opcional, requer Python3/PyMuPDF e as dependências Node/TypeScript já utilizadas pelo projeto. PDFs ficam em `.context/refrigerants-full-sources/`, não são versionados e não passam a integrar o aplicativo. Sem `--download`, usa os PDFs locais. Se o fabricante trocar a edição/conteúdo, o hash divergente interrompe a conferência e exige revisão, em vez de aceitar dados novos silenciosamente.

Nesta revisão, o verificador confirmou13/13 documentos, 639 linhas e1.039 pontos. Os cabeçalhos/unidades e os pontos/exceções relevantes também foram inspecionados visualmente nos PDFs. A fonte National foi usada para 10 gases; R32 e R438A vêm da Chemours; R448A da Solstice. Não se misturaram as colunas MO99 com as deR22 ou NU22B que aparecem no mesmo documento.

## Limites que continuam explícitos

- Temperaturas/pressões entre linhas são interpoladas e herdam o arredondamento da publicação.
- Tabela de saturação não é pressão universal de trabalho nem determina carga de refrigerante sozinha.
- Os alvos de SH/SC de cada equipamento pertencem ao manual desse modelo e são curadoria separada destas tabelas termodinâmicas.
- As cores e a classificação de inflamabilidade dos gases foram preservadas; esta entrega não altera fotos ou registros do catálogo de equipamentos.
