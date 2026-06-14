# Hitachi — Ar-condicionado (mercado BR) — Pesquisa de catálogo

> Pesquisa de dados PÚBLICOS para alimentar catálogo de equipamentos. Cruzamento de ≥2 fontes
> sempre que possível. Onde não houve confirmação cruzada, está marcado com confiança **BAIXA**.
> Última atualização: 2026-06-14.
>
> **Aviso de inconsistência importante (ver §3):** as fontes de língua inglesa divergem entre si
> sobre o significado dos códigos E1–E8 da Hitachi. Tratar a tabela de erros como **referência
> de partida**, não como verdade absoluta — validar contra o manual oficial do modelo específico.

---

## 1. Logo

| Item | Valor | Confiança |
|---|---|---|
| Logo oficial (SVG) | `https://www.hitachiaircon.com/br/assets/images/logo.svg` | **ALTA** — extraído do site oficial Hitachi Brasil (hitachiaircon.com/br) |

- Re-hospedável: sim (SVG público no domínio do fabricante).
- Observação: a operação BR é da **Johnson Controls-Hitachi Ar Condicionado do Brasil** (também aparece como `jci-hitachi.com.br`). A marca de produto continua "Hitachi". O grupo controlador migrou para **Bosch Home Comfort Group** (ref. no rodapé do site oficial) — pode haver rebrand futuro do domínio/logo.

---

## 2. Modelos por TIPO

### Convenção de código (importante)

A Hitachi BR vende em **kit** (evaporadora + condensadora). O padrão de código encontrado:

- `RPK..C3IVF` / `RPK..C3IVQ` → **evaporadora** (unidade interna Hi-Wall) — `F`=Frio, `Q`=Quente/Frio.
- `RAA..C3IVF` / `RAS..` → **condensadora** (unidade externa).
- `SPK..C3IVF` → aparece em alguns e-commerces como código do **kit/SKU comercial**.

⚠️ **Conflito de rótulo entre lojas**: CentralAr lista `RPK09C3IVF`=evaporadora e `RAA09C3IVF`=condensadora;
Leveros (12k) inverte os rótulos (`RAA12C3IVF`=evaporadora, `RPK12C3IVF`=condensadora). O padrão
da Hitachi (RPK=interna, RAA/RAS=externa) sugere que o **CentralAr está correto** e o Leveros
trocou os rótulos. Confiança no padrão: **MÉDIA-ALTA**; confiança no rótulo loja-a-loja: **BAIXA**.

---

### 2.1 Split Hi-Wall — Linha **airHome 600** (residencial, atual)

- Fonte oficial: https://www.hitachiaircon.com/br/produtos/ar-condicionado-residencial/airhome-600
- Refrigerante: **R-32** | Tensão: **220V monofásico** | Tecnologia: **Inverter (DC)**
- Capacidades oficiais: **9.000, 12.000, 18.000, 24.000 BTU/h** | INMETRO Classe A (IDRS)
- Recursos: FrostWash, sistema "8 AirHealth", 5 níveis de filtragem, Anti-mofo, AQtiv-ion,
  Wi-Fi (app airCloud Go / Alexa / Google Home), 4D Auto-Swing.
- Ciclos: **Frio** (`F`) e **Quente/Frio** (`Q`).

| Linha | BTU | Ciclo | Código (kit / evap+cond) | Foto (CDN direto) | Confiança |
|---|---|---|---|---|---|
| airHome 600 | 9.000 | Frio | `SPK09C3IVF` (kit) / evap `RPK09C3IVF` + cond `RAA09C3IVF` | `https://castaticstorage.blob.core.windows.net/centralar/mds/produtos/hitachi/2023/Split/3289/1000x1000/ar-condicionado-hitachi-inverter-airhome.jpg` | **ALTA** (BTU/ciclo/código) — CentralAr + eFácil + oficial |
| airHome 600 | 12.000 | Frio | `SPK12C3IVF` (kit) — rótulos evap/cond conflitantes entre lojas | `https://www.leveros.com.br/upload/produto/imagem/m_ar-condicionado-split-hw-inverter-hitachi-airhome-600-12-000-btus-s-frio-220v.jpg` | **MÉDIA** — múltiplas lojas; rótulo evap/cond divergente |
| airHome 600 | 12.000 | Quente/Frio | `SPK12C3IVQ` | null | **MÉDIA** — CentralAr |
| airHome 600 | 18.000 | Frio | `SPK18C3IVF` | null | **MÉDIA** — CentralAr |
| airHome 600 | 24.000 | Frio | `SPK24C3IVF` (kit) / `RPK24C3IVF` (evap, p/ Dufrio) + `RAA24C3IVF` (cond) | null (Dufrio bloqueou fetch — confiança no código só por título de listagem) | **MÉDIA** — CentralAr + Dufrio (título) |

> Lacuna: foto CDN direta confirmada apenas para 9k (CentralAr) e 12k (Leveros). 18k/24k não tiveram
> URL de imagem extraída (fetch bloqueado / não inspecionado). Códigos Q (quente/frio) só confirmados
> para 12k; presumível existirem para 9k/18k/24k mas **não confirmado**.

---

### 2.2 Cassete 4 vias 360º — Linha **airCore 600** (split, comercial leve / residencial-comercial)

- Catálogo oficial: https://www.hitachiaircon.com/br/produtos/ar-condicionado-um-ambiente-comercial/aircore-600
- Refrigerante: **R-32** | Inverter DC + válvula de expansão eletrônica (EEV).
- Guia rápido do usuário (Cassete 4V): https://www.leverosintegra.com.br/download/manuais/hitachi/guia-rapido-do-usuario-cassete-4v-inverter-aircore-600.pdf

| Linha | BTU | Ciclo | Código | Foto | Confiança |
|---|---|---|---|---|---|
| airCore 600 Cassete 4V 360º | ❓ (catálogo lista faixas; valores não extraídos) | Frio / Quente-Frio | ❓ (família `RCI` interna provável) | null | **BAIXA** — só confirmada a existência da linha e tipo; BTU/código não extraídos |

> Lacuna grande: capacidades, códigos e fotos do Cassete airCore 600 **não foram extraídos**.
> Próximo passo: baixar o "Catálogo Comercial - Split Inverter Cassete e Piso & Teto airCore 600"
> em https://www.hitachiaircon.com/br/downloads/aircore-600

---

### 2.3 Piso-Teto — Linhas **airCore 600** e **PRIMAIRY**

- Catálogo airCore 600 (Cassete e Piso&Teto): https://www.hitachiaircon.com/br/downloads/aircore-600
- Catálogo PRIMAIRY Piso Teto: https://www.hitachiaircon.com/br/downloads/primairy/comercial-3/catalogo-comercial-primairy-piso-teto

| Linha | BTU | Ciclo | Código | Foto | Confiança |
|---|---|---|---|---|---|
| airCore 600 Piso & Teto | ❓ | Frio / Quente-Frio | ❓ (família `RPF`/`RPI` provável) | null | **BAIXA** — existência confirmada; specs não extraídas |
| PRIMAIRY Piso Teto | ❓ | ❓ | ❓ | null | **BAIXA** — existência confirmada via catálogo oficial; specs não extraídas |

> Lacuna: BTU/código/foto de ambas as linhas piso-teto **não extraídos**. Catálogos PDF oficiais
> identificados (acima) — exigem download/parse para preencher.

---

### 2.4 Multi-Split (bi/tri/multi)

- Sistema **Multi Split Inverter** Hitachi: condensadora p/ até 4 (algumas fontes citam 6) ambientes.
- Refrigerante citado em peças de reposição: **R-410A** (linha multi mais antiga) — ⚠️ difere do R-32 das linhas residenciais novas.
- Famílias de condensadora citadas: `RAS8/10/12/14/16/18`, `RAM-72QH5B`.

| Linha | BTU | Ciclo | Código | Foto | Confiança |
|---|---|---|---|---|---|
| Multi Split Inverter (até 4 evap.) | ~7,2 kW (≈24.500 BTU) na condensadora citada | Quente/Frio | `RAM-72QH5B` (cond.) | null | **BAIXA** — fontes de peças (Refriparts) + busca; sem catálogo oficial cruzado |

> Lacuna: linha multi-split residencial atual da Hitachi BR não foi confirmada no site oficial nesta
> pesquisa. Dados vêm de fornecedores de peças (OLX/Refriparts) — tratar como indicativo.

---

## 3. Códigos de erro

> **Cruzamento de fontes resultou em CONFLITO** entre duas referências de língua inglesa sobre o
> significado de E1–E8. Há duas "famílias" de interpretação:
>
> - **Família A (sensor/componente):** E1=sensor de temp. ambiente, E2=sensor da serpentina interna,
>   E3=motor do ventilador interno, etc. (fonte: blog.usro.net).
> - **Família B (proteção do sistema):** E1=proteção alta pressão do compressor, E2=anti-congelamento,
>   E3=proteção baixa pressão / falta de gás, E5=erro inverter/sobrecarga, E6=falha de comunicação
>   (fonte: arlingtonairconditioningheating.com).
>
> A **Família B** é mais consistente com a documentação profissional Hitachi (RAC/PAC, onde códigos
> "E" historicamente sinalizam ativação de dispositivos de proteção). **Recomendação: usar a Família B
> como default e SEMPRE validar contra o manual do modelo específico.** Confiança geral: **MÉDIA**.

### Tabela consolidada (default = Família B; alternativa = Família A)

| code | title | description | diagnosis | component | confiança |
|---|---|---|---|---|---|
| E0 | Falha de comunicação interna↔externa | Perda de comunicação entre evaporadora e condensadora | Cabeamento de controle interrompido / placa | Cabeamento de controle / PCB | MÉDIA |
| E1 | Proteção de alta pressão do compressor (B) / Sensor de temp. ambiente (A) | Pressão de descarga alta OU sensor de ambiente aberto/curto | Verificar condensação, sujeira na serpentina externa, carga; OU sensor | Compressor/sistema (B) ou sensor ambiente (A) | MÉDIA — conflito A/B |
| E2 | Proteção anti-congelamento (B) / Sensor da serpentina interna (A) | Serpentina interna congelando OU termistor da serpentina com falha | Baixo fluxo de ar, filtro sujo, baixa carga; OU termistor | Serpentina interna / sensor | MÉDIA — conflito A/B |
| E3 | Proteção de baixa pressão / falta de gás (B) / Motor do ventilador interno (A) | Pressão de sucção baixa / pouco refrigerante OU motor travado | Vazamento/baixa carga; OU ventilador interno | Sistema de refrigerante (B) ou ventilador interno (A) | MÉDIA — conflito A/B |
| E4 | Temperatura de descarga alta / Sensor serpentina externa | Descarga superaquecida ou sensor externo com leitura errada | Bloqueio de ar, superaquecimento do compressor / sensor | Compressor-descarga / sensor externo | BAIXA — conflito A/B |
| E5 | Erro de inverter / sobrecorrente | Proteção de sobrecorrente ou erro do drive inverter | Alto consumo, compressor danificado, placa inverter | Circuito inverter / compressor | MÉDIA |
| E6 | Falha de comunicação (B) / Ventilador externo (A) | Falha de transmissão interna↔externa OU motor externo | Cabeamento/placa; OU ventilador externo não gira | PCB/cabeamento (B) ou ventilador externo (A) | MÉDIA — conflito A/B |
| E7 | Temp. de descarga alta / Feedback motor ventilador | Serpentina obstruída, baixo fluxo OU realimentação do motor | Limpeza de serpentina, fluxo de ar / motor | Serpentina condensadora / ventilador | BAIXA — conflito A/B |
| E8 | Falha do drive inverter (A) / Proteção do ventilador interno (B) | Placa de controle defeituosa OU proteção do ventilador interno | PCB / motor do ventilador interno | Placa de controle / ventilador interno | BAIXA — conflito A/B |
| E9 | Proteção de fluxo de água | Falha/bloqueio na bomba de condensado | Bomba de dreno entupida/com falha | Bomba de água / dreno | BAIXA |
| F0 | Sensor de ambiente (retorno de ar) | Termistor de retorno de ar com falha | Sensor desconectado/curto | Sensor de ambiente | BAIXA |
| F1 | Sensor do evaporador / EEPROM interna | Termistor da serpentina interna OU memória da placa interna | Termistor / placa | Sensor serpentina interna / PCB interna | BAIXA |
| F2 | Sensor do condensador / EEPROM externa | Termistor da serpentina externa OU firmware da placa externa | Termistor / placa externa | Sensor serpentina externa / PCB externa | BAIXA |
| 01 | Bóia / nível de água no dreno acionado | Dispositivo de proteção: nível alto na bandeja de dreno | Dreno entupido / bomba | Sistema de dreno | MÉDIA |
| 02 | Proteção interna/externa acionada | Entupimento ou superaquecimento | Verificar fluxo, sujeira | Proteção geral | BAIXA |
| 03 | Anomalia interna↔externa (comunicação/fiação) | Fios soltos, terminal frouxo, fusível queimado | Revisar cabeamento e fusível | Fiação / conexões | MÉDIA |
| 04–06 | Anomalias de comunicação ou tensão | Comunicação ou voltagem entre unidades | Cabeamento / alimentação | Comunicação / energia | BAIXA |
| 07–08 | Carga de refrigerante / controle de temperatura | Problemas de carga ou componentes de controle de temp. | Carga / sensores | Refrigerante / controle | BAIXA |
| CL | Aviso de manutenção (NÃO é erro) | Alerta de limpeza do filtro após ~500h de uso acumulado | Limpar filtro e resetar | Filtro de ar | MÉDIA |

> Observação técnica: falhas tipo sensor (E1/E2/E3/E7/EH na nomenclatura A) podem **auto-recuperar**
> quando o sensor volta à faixa normal — o código some sozinho. Confiança: MÉDIA.
>
> Lacuna: a tabela canônica Hitachi BR vive em PDFs que ficaram **inacessíveis nesta sessão**
> (webarcondicionado retornou ECONNREFUSED repetidas vezes; Scribd não expôs o conteúdo). As linhas
> acima são síntese de fontes secundárias EN + trechos de busca PT-BR. **Para produção, baixar e
> parsear o `hitachi-codigos-de-erro.pdf` oficial e o manual do modelo específico.**

---

## 4. Manuais (PDF)

| Documento | URL | Confiança |
|---|---|---|
| Manual Instalação/Operação/Manutenção — Split Hi-Wall Inverter airHome 600 (oficial) | `https://documentation2.hitachiaircon.com/blbs/files/downloads/HIOM-MSPAR001_Rev02_Dez2023_Split_Hi-Wall_Inverter_airHome_600.pdf` | **ALTA** — domínio oficial Hitachi |
| Portal de documentação airHome 600 (SPK-C3IV-F/Q) | `https://documentation.hitachiaircon.com/br/pt/rac/spk-c3iv-f-q` | **ALTA** — portal oficial |
| Manual Instalação/Operação — HW airHome 600 (distribuidor Leveros) | `https://www.leverosintegra.com.br/download/manuais/hitachi/Manual-de-instalacao-operacao-HW-AirHome%20600.pdf` | **ALTA** — espelho de distribuidor |
| Catálogo airHome 600 (AH600) | `https://www.leverosintegra.com.br/download/manuais/hitachi/Catalogo-airHome-600-AH600.pdf` | **MÉDIA** — distribuidor |
| Guia rápido — Cassete 4V Inverter airCore 600 | `https://www.leverosintegra.com.br/download/manuais/hitachi/guia-rapido-do-usuario-cassete-4v-inverter-aircore-600.pdf` | **MÉDIA** — distribuidor |
| Página oficial de downloads (todos os produtos BR) | `https://www.hitachiaircon.com/br/downloads` | **ALTA** — hub oficial |
| Manual usuário Split Inverter (RACIV09B/12B/18B/22B) — linha anterior | `http://pdf.webarcondicionado.com.br/hitachi/manual/usuario/mdu-split-inverter-raciv09b-raciv12b-raciv18b-raciv22b.pdf` | **BAIXA** — fetch falhou (ECONNREFUSED); URL existe mas não verificada |
| PDF de códigos de erro Hitachi (compilado) | `https://static.webarcondicionado.com.br/pdfs/hitachi-codigos-de-erro.pdf` | **BAIXA** — fetch falhou; conteúdo não verificado nesta sessão |

---

## 5. Fontes

**Oficiais (Hitachi/JCI):**
- https://www.hitachiaircon.com/br/produtos/ar-condicionado-residencial/airhome-600
- https://www.hitachiaircon.com/br/produtos/ar-condicionado-um-ambiente-comercial/aircore-600
- https://www.hitachiaircon.com/br/downloads
- https://documentation2.hitachiaircon.com/blbs/files/downloads/HIOM-MSPAR001_Rev02_Dez2023_Split_Hi-Wall_Inverter_airHome_600.pdf
- https://www.jci-hitachi.com.br/noticia/johnson-controls-hitachi-ar-condicionado-do-brasil-lanca-hi-wall-com-tecnologia-e-sustentabilidade

**E-commerce (BTU/código/foto):**
- https://www.centralar.com.br/p/ar-condicionado-split-hw-inverter-hitachi-airhome-600-9000-btus-frio-220v-monofasico-spk09c3ivf
- https://www.leveros.com.br/ar-condicionado-split-hw-inverter-hitachi-airhome-600-12-000-btus-so-frio-220v
- https://www.dufrio.com.br/ar-condicionado-hi-wall-split-inverter-hitachi-air-home-600-24000-btus-frio-220v.html (bloqueou fetch)
- https://www.efacil.com.br/ (listagem airHome 9k)

**Códigos de erro (secundárias, cruzadas):**
- https://blog.usro.net/2025/06/hitachi-ac-error-codes-list-troubleshooting-guide/ (Família A)
- https://www.arlingtonairconditioningheating.com/hitachi-air-conditioner-error-codes/ (Família B)
- https://www.webarcondicionado.com.br/codigo-erro-ar-condicionado-hitachi (canônica PT-BR — inacessível nesta sessão)
- https://www.blog.auvo.com/codigo-erro-hitachi

---

## 6. LACUNAS (prioridade para próxima rodada)

1. **Cassete e Piso-Teto (airCore 600 / PRIMAIRY)**: BTU, códigos de modelo e fotos NÃO extraídos.
   Catálogos PDF oficiais já identificados — baixar e parsear.
2. **Tabela canônica de erros**: o PDF oficial PT-BR (webarcondicionado) e o Scribd ficaram
   inacessíveis (ECONNREFUSED / sem conteúdo). E1–E8 têm **conflito A/B** não resolvido — resolver
   contra o manual oficial do modelo (HIOM-MSPAR001, baixável).
3. **Fotos CDN**: confirmadas só para 9k (CentralAr) e 12k (Leveros). Faltam 18k, 24k e todos os
   cassete/piso-teto/multi.
4. **Multi-Split residencial atual**: não confirmado no site oficial; dados vêm de fornecedores de
   peças. Confirmar linha/códigos/refrigerante (R-32 vs R-410A) na fonte oficial.
5. **Códigos Q (Quente/Frio)**: confirmados só para 12k. Verificar disponibilidade em 9k/18k/24k.
6. **Rótulo evaporadora vs condensadora**: lojas divergem (CentralAr × Leveros). Confirmar pelo
   manual qual prefixo (`RPK`/`RAA`/`SPK`) é interna, externa e kit.
