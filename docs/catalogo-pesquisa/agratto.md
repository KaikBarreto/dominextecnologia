# Catálogo de pesquisa — AGRATTO (ar-condicionado, mercado BR)

> Pesquisa de dados PÚBLICOS cruzando ≥2 fontes. Pesquisado em 2026-06-14.
> Marca brasileira; e-commerce e blogs técnicos como fontes. Confiança rotulada por item.
> **Nada inventado** — campos sem confirmação ficam `null` e listados em LACUNAS.

Legenda de confiança: **alta** (≥2 fontes concordam, incl. site oficial/e-commerce grande) · **média** (1 fonte sólida) · **baixa** (citação indireta / inferência).

---

## 1. Logo

| Item | Valor | Confiança |
|---|---|---|
| URL re-hospedável (PNG 2000x614, fundo transparente) | `https://images.seeklogo.com/logo-png/31/1/agratto-logo-png_seeklogo-319108.png` | **média** (SeekLogo; vetor de terceiro, não asset oficial) |
| URL alternativa (site oficial, fundo claro) | `https://images.tcdn.com.br/img/img_prod/1153568/1742909796_agratto.png` | **média** (servida no site agratto.com.br) |

> Observação: preferir a versão SeekLogo (transparente, alta resolução) para re-hospedagem. Validar visualmente antes de subir ao catálogo.

---

## 2. Modelos por TIPO

> O código do modelo da Agratto segue prefixo por linha/tecnologia + BTU + ciclo. Ex.: `ICS18F-02` = linha NEO Inverter, 18k, F=Frio. Sufixo `Q` (ou `QF`) = Quente/Frio. `-02` = revisão. UI/UE: `...I-02` interna, `...E-02` externa.
> Fontes confirmam que a Agratto comercializa os 4 tipos: Split Hi-Wall, Cassete, Piso-Teto e Multi-Split.

### 2.1 Split Hi-Wall

| Linha | BTU | Ciclo | Código modelo | Gás | URL foto (CDN) | Confiança |
|---|---|---|---|---|---|---|
| NEO Inverter | 9.000 | Frio | (família ICS9F) | R-410 Eco | `https://fujiokadistribuidor.vteximg.com.br/arquivos/ids/166055-292-292/p_50078_alta_2.png?v=637048611186130000` | **alta** |
| NEO Inverter | 18.000 | Frio | ICS18F-02 | R-410 / R-32 (varia) | null | **alta** (código), **n/a** (foto) |
| NEO Inverter | 9 / 12 / 18 / 24 / 30 mil | Frio | família ICS\<btu\>F-02 | R-410 Eco / R-32 | null | **alta** (gama), **baixa** (códigos individuais) |
| ZEN Inverter | 9.000 | Frio | ZICST9F-02 | R-32 (provável) | null | **alta** (site oficial) |
| ZEN Inverter | 9.000 | Quente/Frio | ZICST9QF-02 | R-32 (provável) | null | **alta** (site oficial) |
| ZEN Inverter | 12.000 | Frio / Q-F | ZICST12F-02 / ZICST12QF-02 | R-32 (provável) | null | **alta** (site oficial) |
| ZEN Inverter | 24.000 | Frio / Q-F | ZICST24F-02 / ZICST24QF-02 | R-32 (provável) | null | **alta** (site oficial) |
| LIV Inverter | 12.000 | Frio | LCST12F-02I | R-32 (provável) | null | **média** (site oficial, "anúncio de catálogo") |
| ECO TOP (On/Off) | 9.000 | Frio | ECST9FR4-02 | R-410A | null | **média** (e-commerce) |
| FIT TOP (On/Off) | 9.000 | Frio | CCST9FIR402 | R-410A (provável) | null | **média** (manual oficial CentralAr) |

### 2.2 Cassete

| Linha | BTU | Ciclo | Código modelo | Gás | URL foto (CDN) | Confiança |
|---|---|---|---|---|---|---|
| Cassete Inverter | 36.000 | Frio | LCI36F-02 (UI: LCI36FI-02 / UE: LCI36FE-02) | R-32 | `https://lojawebcontinental.vtexassets.com/arquivos/ids/67725898-800-auto?v=638730620532100000&width=800&height=auto&aspect=true` | **alta** |
| Cassete Inverter | 55.000 | Frio | LCI55F-02 | R-32 (provável) | null | **alta** (site oficial) |
| Cassete Inverter | 60.000 | Frio | LCI60F-02 | R-32 (provável) | null | **média** (citado em e-commerce/site) |

### 2.3 Piso-Teto

| Linha | BTU | Ciclo | Código modelo | Gás | URL foto (CDN) | Confiança |
|---|---|---|---|---|---|---|
| Piso-Teto Inverter | 36.000 | Frio | LPTI36F-02 / LPTI36KF | R-32 | null | **alta** (site oficial; variação de sufixo entre fontes) |
| Piso-Teto Inverter | 55.000 | Frio | LPTI55F-02 / LPTI55KF | R-32 | null | **alta** (site oficial) |
| Piso-Teto Inverter | 60.000 (55KBTU rotulado "60") | Frio | LPTI60F-02 | R-32 | null | **média** (página oficial do produto) |

### 2.4 Multi-Split

| Linha | BTU | Ciclo | Código modelo | Gás | URL foto (CDN) | Confiança |
|---|---|---|---|---|---|---|
| Multi-Split | null | null | null | null | null | **baixa** — fontes confirmam que a categoria existe no portfólio, mas não retornaram modelos/BTU/códigos específicos |

---

## 3. Códigos de erro

> Os códigos variam por FAMÍLIA de placa/modelo (prefixos ACS/ACST, CCS/CCST, ECS/ECST, ICS/ICST, LCS/LCST, DCS/DCST). Confirmados por blog técnico CentralAr + ClimaServices (≥2 fontes concordam na maioria; divergências marcadas). Confiança geral: **média-alta**.

### Família ECS / ECST (Split Eco — comum no mercado)

| code | title | description | diagnosis | component |
|---|---|---|---|---|
| E1 | Sensor temp. ambiente | Falha no sensor de temperatura ambiente | Verificar/substituir sensor da UI | Sensor de temperatura ambiente |
| E2 | Sensor trocador de calor | Falha no sensor de temperatura do trocador de calor (serpentina) | Verificar/substituir sensor da serpentina | Sensor de serpentina |
| E4 | Sistema de refrigeração | Falta de fluido refrigerante ou defeito na unidade condensadora, compressor ou motor ventilador | Checar carga de gás, compressor, ventilador UE | Gás / compressor / ventilador UE |
| E6 | Ventilador UI | Mau funcionamento do motor ventilador da unidade interna | Verificar motor ventilador da UI | Motor ventilador interno |

Confiança: **alta** (CentralAr + ClimaServices concordam).

### Família CCS / CCST (Split On/Off — ex. FIT TOP)

| code | title | description | diagnosis | component |
|---|---|---|---|---|
| P2 | Superaquecimento evaporador | Proteção contra superaquecimento do evaporador ou velocidade incorreta do ventilador | Verificar fluxo de ar / rotação do ventilador | Evaporador / ventilador |
| P3 | Congelamento evaporador | Prevenção de congelamento do evaporador | Checar carga de gás e fluxo de ar | Serpentina evaporadora |
| F1 | Sensor temp. ambiente | Erro do sensor de temperatura ambiente | Substituir sensor ambiente | Sensor ambiente |
| F2 | Sensor evaporador | Erro no sensor de temperatura do evaporador | Substituir sensor evaporador | Sensor evaporador |
| F3 | Sensor condensador | Erro no sensor de temperatura do condensador | Substituir sensor condensador | Sensor condensador |
| F4 | Motor PG | Erro do motor PG (feedback do ventilador) | Verificar motor/feedback do ventilador UI | Motor PG / ventilador |

Confiança: **alta**.

### Família ICS / ICST (NEO Inverter)

| code | title | description | diagnosis | component |
|---|---|---|---|---|
| E1 | Sensor temp. ambiente | Falha no sensor de temperatura do ambiente (quarto) | Substituir sensor ambiente | Sensor ambiente |
| E2 | Sensor bobina UE | Falha do sensor de temperatura da bobina externa (OD) | Substituir sensor serpentina UE | Sensor serpentina externa |
| E3 | Sensor bobina UI | Falha do sensor de temperatura da bobina interna (ID) | Substituir sensor serpentina UI | Sensor serpentina interna |
| E4 | Motor PG UI | Falha do feedback do motor PG interno | Verificar motor ventilador UI | Motor PG interno |
| E5 | Comunicação UI/UE | Falha de comunicação entre unidades interna e externa | Checar cabo de interligação/placas | Cabeamento / placas |
| F0 | Motor CC UE | Falha de retorno do motor CC externo | Verificar motor ventilador UE | Motor ventilador externo |
| F1 | Módulo IPM | Falha modular IPM | Verificar/substituir placa inverter | Módulo IPM |
| F2 | Módulo PFC | Falha modular PFC | Verificar/substituir placa inverter | Módulo PFC |
| F3 | Compressor | Falha na operação do compressor | Diagnóstico de compressor | Compressor |
| F4 | Sensor descarga UE | Falha do sensor de temperatura de descarga (OD) | Substituir sensor de descarga | Sensor de descarga |
| F5 | Topo do compressor | Proteção da tampa superior do compressor | Checar superaquecimento/compressor | Compressor (proteção térmica) |
| F6 | Sensor amb. UE | Falha do sensor de temperatura ambiente externo | Substituir sensor ambiente UE | Sensor ambiente externo |
| F7 | Tensão | Proteção contra sub/sobretensão | Verificar rede elétrica | Alimentação elétrica |
| F8 | Comunicação ODT | Falha de comunicação do módulo ODT | Verificar placa/comunicação UE | Módulo ODT |
| F9 | EEPROM UE | Falha na EEPROM da unidade externa | Substituir/regravar placa UE | EEPROM placa externa |
| FA | Sensor sucção | Falha no sensor de temperatura de sucção | Substituir sensor de sucção | Sensor de sucção |
| P4 | Sobrecarga | Proteção contra sobrecarga | Verificar corrente/carga | Compressor / elétrica |
| P5 | Temp. descarga | Proteção de temperatura de descarga | Checar carga de gás/compressor | Compressor |
| P6 | Alta temperatura | Proteção de alta temperatura | Verificar troca térmica/UE | Sistema |
| P7 | Congelamento | Proteção contra congelamento | Checar gás/fluxo de ar | Serpentina |

Confiança: **média-alta** (ClimaServices; padrão típico de placas inverter).

### Família LCS / LCST (LIV Inverter)

| code | title | description | diagnosis | component |
|---|---|---|---|---|
| E0 | Comunicação | Falha de comunicação entre as unidades | Checar cabo/placas | Cabeamento / placas |
| E1 | Sensor temp. ambiente UI | Falha no sensor de temperatura ambiente da unidade interna | Substituir sensor | Sensor ambiente UI |
| E2 | Sensor temperatura | Falha no sensor de temperatura | Substituir sensor | Sensor |
| E3 | Sensor serpentina | Falha no sensor de temperatura da serpentina | Substituir sensor | Sensor serpentina |
| E4 | Refrigeração anormal | Sistema de refrigeração anormal | Checar gás/compressor | Sistema de refrigeração |
| E5 | Incompatibilidade UI/UE | Falha de incompatibilidade entre UI e UE | Verificar pareamento de unidades | UI / UE |
| E6 | Ventilador UI | Motor ventilador da UI com funcionamento anormal | Verificar motor ventilador | Motor ventilador UI |
| E7 | Sensor amb. UE | Falha no sensor de temperatura ambiente da UE | Substituir sensor UE | Sensor ambiente UE |

Confiança: **média** (ClimaServices).

### Família ACS / ACST

| code | title | description | diagnosis | component |
|---|---|---|---|---|
| DF | Descongelamento | Ciclo de degelo (não é falha) | Aguardar fim do degelo | — (operacional) |
| E0 | Porta/acesso | Falha de abertura de porta/acesso | Verificar porta de acesso | Porta de acesso |
| E1 | Sensor temp. externa | Falha no sensor de temperatura externo | Substituir sensor externo | Sensor externo |
| E2 | Sensor temperatura | Falha no sensor de temperatura (ambiente) | Substituir sensor | Sensor ambiente |
| E3 | Sensor serpentina | Mau funcionamento do sensor do trocador de calor | Substituir sensor | Sensor serpentina |
| E5 | Ventilador | Falha no ventilador | Verificar motor ventilador | Motor ventilador |
| E7 | Falha externa | Falha externa (UE) | Diagnóstico da UE | Unidade externa |
| E8 | Protetor térmico | Protetor térmico / descongelar | Checar superaquecimento | Protetor térmico |

Confiança: **média** (CentralAr).

### Família DCS / DCST (parcial — inverter de maior porte)

| code | title | description | diagnosis | component |
|---|---|---|---|---|
| E0 | Topo do casco do compressor | Proteção do teto do casco do compressor | Checar superaquecimento | Compressor |
| E3 | Compressor fora de passo | Falha do compressor fora de passo | Diagnóstico inverter | Compressor |
| E4 | Compressão anormal | Compressão anormal (falha de fase/reverso) | Verificar fases/compressor | Compressor |
| EF | EEPROM UE | Falha na EEPROM da unidade externa | Substituir/regravar placa | EEPROM UE |
| F5 | Sensor de escape | Falha do sensor de temperatura de escape | Substituir sensor | Sensor de descarga |
| F6 | Comunicação UI/UE | Falha de comunicação interna e externa | Checar cabo/placas | Cabeamento |
| F8 | Comunicação placas | Falha de comunicação placa principal ↔ placa driver | Verificar conexões internas UE | Placa driver |
| F9 | Módulo IPM | Falha no módulo IPM | Substituir placa inverter | Módulo IPM |

Confiança: **média-baixa** (lista parcial em ClimaServices; várias entradas truncadas — ver LACUNAS).

---

## 4. Manuais (PDF)

| Modelo/linha | URL PDF | Confiança |
|---|---|---|
| Split Hi-Wall On/Off FIT TOP 9.000 BTU 220V (CCST9FIR402) | `https://cdn2.centralar.com.br/centralar/mds/manuais/agratto/split/9442/ar-condicionado-split-hw-onoff-fit-top-9000-btus-frio-220v-monofasico-ccst9fir402-outlet-9442-manual.pdf` | **alta** (PDF oficial hospedado pela CentralAr) |
| Cassete / Piso-Teto (manual conjunto) | `https://castaticstorage.blob.core.windows.net/centralar/mds/manuais/agratto/Cassete/3693/Manual%20-%20Agratto%20-%20Cassete%20-%20Piso%20teto.pdf` | **alta** (PDF oficial CentralAr) |
| Catálogo Agratto Split (PDF licitação) | `https://arquivos.licitardigital.com.br/8361_1_707887455c5fbff679c590c8ae786483.pdf` | **média** (catálogo via portal de licitação) |

---

## 5. Fontes

1. Agratto — site oficial (`agratto.com.br/ar-condicionado`) — linhas LIV, ZEN, NEO, Cassete, Piso-Teto, Cortina de Ar.
2. Fujioka Distribuidor — ficha NEO Inverter 9k (modelo, gás, fotos CDN).
3. WebContinental — ficha Cassete Inverter LCI36F-02 (modelo UI/UE, R-32, fotos CDN).
4. MadeiraMadeira / Multimaq / Casa Sul / Dooca Gusto — confirmação de códigos ICS18F-02, ECST9FR4-02 e gama NEO.
5. CentralAr (loja + blog `blog.centralar.com.br/codigo-erro-ar-condicionado-agratto`) — códigos de erro ACS/CCS/ECS/ICS/DCS + manuais PDF.
6. ClimaServices (`climaservices.com.br/codigos-de-erro-do-ar-condicionado-agratto`) — tabelas de erro por família LCS/CCS/ECS/ICS/DCS.
7. JF Ar Condicionado, GoiâniaArCondicionado, WebArCondicionado — corroboração de E4 e perfil do fabricante.
8. SeekLogo — logo PNG 2000x614 (terceiro).

---

## 6. LACUNAS (não confirmado / a validar)

- **Multi-Split**: categoria confirmada no portfólio, mas SEM modelos, BTU, códigos ou fotos. Pesquisar separadamente.
- **Fotos CDN**: só obtidas para NEO 9k (Fujioka) e Cassete 36k (WebContinental). Demais linhas = `null`. Coletar foto por SKU em e-commerce.
- **Gás refrigerante por modelo**: NEO antigo usa R-410 Eco; linhas novas (ZEN/LIV/LPTI/LCI) usam R-32 — mas o gás exato por SKU específico nem sempre foi confirmado (marcado "provável").
- **Códigos de modelo individuais** da gama NEO (12k/24k/30k) e ZEN não foram todos confirmados um a um.
- **Famílias de erro DCS/DCST e ICS** vieram parcialmente truncadas nas fontes (entradas P-series e EE/FO/PA mencionadas mas sem descrição completa). Validar contra manual oficial do modelo específico.
- **Divergência de sufixo Piso-Teto**: site oficial mostra `LPTI36KF`/`LPTI55KF` em uma página e `LPTI36F-02`/`LPTI60F-02` em outra. Confirmar nomenclatura vigente.
- **Logo oficial**: ambas URLs são de terceiros/CDN de loja, não asset de imprensa oficial Agratto. Validar direito de uso/qualidade antes de re-hospedar.
- **Linha ECO TOP vs ECO**: "ECO TOP" (ECST...) aparece em e-commerce; relação exata com a família de erro ECS a confirmar.
