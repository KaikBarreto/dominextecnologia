# Pesquisa de Catálogo — KOMECO (Ar-Condicionado / mercado BR)

> Documento de pesquisa. Dados coletados de fontes públicas e cruzados entre ≥2 fontes quando possível.
> **Nada foi inventado.** Lacunas estão marcadas explicitamente. Cada bloco traz nível de confiança e fonte.
> Data da coleta: 2026-06-14.
>
> Legenda de confiança: **Alta** = fonte oficial Komeco (site/PDF técnico) ou ≥2 fontes independentes concordando · **Média** = 1 fonte de e-commerce/revenda confiável · **Baixa** = fonte única secundária/indireta.
>
> Sobre a marca: Komeco (Komlog Importação Ltda — Palhoça/SC) atua com climatização, aquecimento solar/gás, bombas e pressurizadores. Linha de ar-condicionado importada, certificada INMETRO. Loja oficial roda em VTEX (`loja.komeco.com.br`).

---

## 1. Logo

| Ativo | URL pública (re-hospedável) | Confiança | Fonte |
|---|---|---|---|
| Logo Komeco (PNG, site oficial) | `https://www.komeco.com.br/wp-content/uploads/2022/10/cropped-logo-komeco-1.png` | **Alta** | Site oficial komeco.com.br (header) — verificado HTTP 200 `image/png` |
| Logo Komeco (SVG, loja oficial VTEX, footer) | `https://t98697.vtexassets.com/assets/vtex/assets-builder/t98697.store-theme/0.0.74/images/footer/logo-footer___473577cd66efc81a3eea1c18ddd8e9e3.svg` | **Alta** | loja.komeco.com.br (tema oficial VTEX) |

> Observação: ambas as URLs são dos domínios oficiais da Komeco. Para re-hospedagem, o PNG do `wp-content` é o mais simples (raster pronto). Repositórios de logo de terceiros (seeklogo, brandsoftheworld) existem mas são vetores comunitários, possivelmente desatualizados — não recomendados como fonte canônica.

---

## 2. Modelos por TIPO

> Nomenclatura Komeco observada nos códigos: `KO` = Komeco; sufixos de tipo (`P`=Piso-Teto, `C`=Cassete, `D`=Duto, `HI`=Hi-Wall); `FC`=Frio / `QC`=Quente-Frio (reverso); `1HX/2HX`=plataforma (frequentemente Inverter quando aparece `INV`); `1LX/2LX`=plataforma convencional (on/off). Capacidade em mil BTU/h embutida no código (ex.: `36FC`=36.000 frio).
>
> Linha "Maxime" / "Ambient" / "Brize" / "Princess" são **nomes comerciais** das famílias Hi-Wall vendidas no varejo — os códigos técnicos correspondentes aparecem abaixo. A linha residencial atual de inverter no site oficial é a **KOHI** (com versões 1HX R-410A — descontinuada — e a nova geração R-32). A linha Hi-Wall on/off básica é a **KAC**.

### 2.1 Split Hi-Wall (parede)

| Linha / nome comercial | BTU | Ciclo | Código de modelo | Refrig. | URL FOTO (CDN direto) | Confiança | Fonte |
|---|---|---|---|---|---|---|---|
| KOHI Inverter (geração atual, R-32) | 9.000 | Quente/Frio | (SKU varejo ARCON0200530050) | R-32 | `https://t98697.vtexassets.com/arquivos/ids/160303-800-auto` | **Alta** | Leroy Merlin (SKU/CDN VTEX) + loja.komeco.com.br |
| KOHI Inverter 1HX (geração anterior) | 9.000 / 12.000 / 18.000 / 22.000 | FC (frio) e QC (quente/frio) | `KOHI 09/12/18/22 FC 1HX`, `KOHI 09/12/18/22 QC 1HX` | R-410A | `https://www.komeco.com.br/wp-content/uploads/2023/03/ar-condicionado-split-komeco-1000X1000-01.jpg` (genérica da família) | **Alta** (códigos/site oficial; marcada descontinuada) | komeco.com.br/ar-condicionado-split-inverter |
| Maxime (Hi-Wall on/off) | 7.000 / 12.000 / 18.000 | FC e QC | `MXS07QCEG1`, `MXS12FC4LA`, `MXS18QC2LX` (padrão `MXS<btu><ciclo>...`) | R-410A (a confirmar por modelo) | null | **Média** | Peças Pro Ar (peças/controles por modelo) |
| Ambient (Hi-Wall on/off) | 9.000 / 18.000 | FC e QC | `ABS09QC2LX`, `ABS18QC` (padrão `ABS<btu><ciclo>...`) | R-410A | null | **Média** | Zoom + Leroy Merlin + Peças Pro Ar (placa ABS09QC2LX) |
| Brize (Hi-Wall on/off) | 7.000 | Frio | `BZSK07FCEG1` | (a confirmar) | null | **Média** | Peças Pro Ar (controle remoto) |
| Princess (Hi-Wall) | 9.000 | Quente/Frio | (código não capturado) | (a confirmar) | null | **Baixa** | PrimeStore Polar (revenda) |
| KAC (Hi-Wall on/off básica) | 9.000 (e demais da série 09–24) | Frio (`CSA`) e Quente/Frio (`CHSA`) | `KAC-09CHSA1` (Q/F), série `KAC-09..24CSA/CHSA` | R-410A | null | **Média/Alta** | Buscapé + manual oficial KAC-CHSA1 (komeco.com.br) |
| ECO (Hi-Wall) | 22.000 | Frio | `KHXH22UF/121FBBNN` | R-410A | null | **Média** | TemperFrio + komeco.com.br/ar-condicionado-split-eco |

### 2.2 Cassete (teto embutido)

| Linha | BTU | Ciclo | Código U.I. / U.E. | Refrig. | URL FOTO | Confiança | Fonte |
|---|---|---|---|---|---|---|---|
| Cassete Inverter 1HX | 36.000 | Frio | `KOC INV 36FC 1HX` / `KOCP INV 36FC 1HX 220V` | R-410A | null | **Alta** | Catálogo oficial Komeco (PDF) |
| Cassete Inverter 1HX | 48.000 | Frio | `KOC INV 48FC 1HX` / `KOCP INV 48FC 1HX 220V` | R-410A | null | **Alta** | Catálogo oficial Komeco (PDF) |
| Cassete 2LX (on/off) | 36.000 | Frio / Reverso | `KOC 36FC 2LX` / `KOC 36QC 2LX` (U.E. `KOCP ...220V`) | R-410A | null | **Alta** | Catálogo oficial Komeco (PDF) |
| Cassete 2LX (on/off) | 48.000 | Frio / Reverso | `KOC 48FC 2LX` / `KOC 48QC 2LX` (U.E. 220V-3F e 380V-3F) | R-410A | null | **Alta** | Catálogo oficial Komeco (PDF) |
| Painel do cassete (acessório) | 24/36/48 | — | `KOC 24.36.48FCQCG4/1LX/2LX` (950×50×950mm) | — | null | **Alta** | Catálogo oficial Komeco (PDF) |

### 2.3 Piso-Teto

| Linha | BTU | Ciclo | Código U.I. / U.E. | Refrig. | URL FOTO | Confiança | Fonte |
|---|---|---|---|---|---|---|---|
| Piso-Teto 1HX | 36.000 | Frio / Reverso | `KOP 36FC 1HX` / `KOCP 36FC 1HX 220V-1F` · `KOP 36QC 1HX` / `KOCP 36QC 1HX 220V-1F` | R-410A | null | **Alta** | Catálogo oficial Komeco (PDF) |
| Piso-Teto 1HX | 55.000 | Frio / Reverso | `KOP 55FC 1HX` / `KOCP 55FC 1HX` (220V-3F e 380V-3F) · `KOP 55QC 1HX` / `KOCP 55QC 1HX` | R-410A | null | **Alta** | Catálogo oficial Komeco (PDF) |
| Piso-Teto Inverter 2HX | 36.000 | Frio | `KOP INV 36FC 2HX` / `KOCP INV 36FC 2HX 220V-1F` | R-410A | null | **Alta** | Catálogo oficial Komeco (PDF) |
| Piso-Teto Inverter 2HX | 55.000 | Frio | `KOP INV 55FC 2HX` / `KOCP INV 55FC 2HX 220V-1F` | R-410A | null | **Alta** | Catálogo oficial Komeco (PDF) |
| Piso-Teto Inverter 1HX | 36.000 / 55.000 | Frio | `KOP INV 36FC 1HX` / `KOP INV 55FC 1HX` (U.E. `KOCP INV ...220V`) | R-410A | null | **Alta** | Catálogo oficial Komeco (PDF) |
| Piso-Teto 2LX (on/off) | 36.000 | Frio / Reverso | `KOP 36FC 2LX` / `KOP 36QC 2LX` (U.E. 220V-1F) | R-410A | null | **Alta** | Catálogo oficial Komeco (PDF) |
| Piso-Teto 2LX (on/off) | 55.000 | Frio / Reverso | `KOP 55FC 2LX` / `KOP 55QC 2LX` (U.E. 220V-3F e 380V-3F) | R-410A | null | **Alta** | Catálogo oficial Komeco (PDF) |

### 2.4 Multi-Split

| Linha | BTU | Ciclo | Código | Refrig. | URL FOTO | Confiança | Fonte |
|---|---|---|---|---|---|---|---|
| Multi-Split | — | — | — | — | null | **LACUNA** | A Komeco menciona sistemas multi-split na comunicação, mas o catálogo PDF coletado e a loja oficial **não detalham** códigos/capacidades de multi-split. Confirmar diretamente com a Komeco. |

### 2.5 Outros tipos relevantes (bônus — apareceram no catálogo oficial)

| Tipo | BTU | Código U.I. / U.E. | Confiança | Fonte |
|---|---|---|---|---|
| Split Duto (LX) | 36.000 | `KOD 36FC 1LX` / `KOD 36FC 1LX R410A 220V` | **Alta** | Catálogo oficial |
| Split Duto (LX) | 48.000 | `KOD 48FC 1LX` (U.E. 220V-3F e 380V-3F) | **Alta** | Catálogo oficial |
| Cortina de Ar | 900/1200/1500 mm | `KCAF 09C 220V G4` / `KCAF 12C 220V G4` / `KCAF 15C 220V G4` | **Alta** | Catálogo oficial |
| Mini Split (série técnica) | — | série `KOS G2` | **Alta** | Manual técnico oficial KOS G2 (PDF) |

---

## 3. Códigos de Erro

> Komeco usa **dois esquemas** distintos conforme a plataforma:
> - **Linha LX-HX (on/off, display da placa receptora):** códigos `E1`–`E8` + `DF`.
> - **Linha KOHI 1HX (Inverter, contagem de piscadas do LED na PCB externa):** códigos `F1`–`FC` (falhas) e `P2`–`PC` (proteções).
>
> Ambos confirmados por **PDF oficial Komeco (Engenharia / Portal Técnico)** e cruzados com fontes secundárias (FrioClimatizado, Goiânia Ar-Condicionado).

### 3.1 Linha LX-HX (Split Hi-Wall on/off — display E1–E8)

Confiança: **Alta** · Fonte: `AUTO DIAGNOSTICO - LINHA LX-HX.pdf` (Engenharia Komeco).

| code | title | description | diagnosis | component |
|---|---|---|---|---|
| `DF` | Descongelamento (degelo) | Processo de degelo do trocador da unidade externa. Exclusivo de produtos com ciclo reverso. Não é falha. | Aguardar; comportamento normal no modo quente. | Unidade externa (trocador) |
| `E1` | Falha sensor temp. do condensador | Sensor NTC do condensador desconectado, descalibrado, em curto/aberto, ou placa não o identifica. | Medir resistência ôhmica do sensor (NTC; ~5kΩ a 25°C) fora da placa; fora da tabela → trocar sensor; dentro da tabela → trocar placa principal. | Sensor de temperatura (condensador) |
| `E2` | Falha sensor temp. ambiente | Sensor NTC ambiente desconectado, descalibrado, em curto/aberto, ou não identificado. | Mesma rotina de medição NTC do E1. | Sensor de temperatura (ambiente) |
| `E3` | Falha sensor temp. do evaporador | Sensor NTC do evaporador desconectado, descalibrado, em curto/aberto, ou não identificado. | Mesma rotina de medição NTC do E1. | Sensor de temperatura (evaporador) |
| `E4` | Falha na unidade externa | Problema na unidade externa. | Causas: (1) temp. externa >43°C → reinstalar em local ventilado; (2) motor ventilador externo parado/baixa rotação → medir tensão e capacitor; (3) alta pressão → medir sucção/superaquecimento e ajustar carga; (4) compressor alta corrente/inoperante → medir tensão, capacitor, protetor térmico e bobinas. | Unidade externa / ventilador / compressor / capacitor |
| `E5` | Falha motor ventilador da unidade interna | Placa não identifica sinal de funcionamento do ventilador interno. | (1) Medir tensão/capacitor do motor; (2) sensor de rotação com defeito (se gira após trocar placa → trocar motor); (3) ventilador travado/rolamento sem lubrificação. | Motor ventilador (unidade interna) |
| `E6` | Falha na placa eletrônica principal | Funcionamento irregular da placa principal. | (1) Conferir tensão de alimentação (±5%); (2) medir saída do transformador; (3) eliminar interferências externas (RF/IR/campo magnético); persistindo → trocar placa. | Placa eletrônica principal |
| `E7` | Falha de comunicação interna↔externa / alta pressão e alta corrente | Sem comunicação entre placas, ou acionamento de pressostatos / corrente elevada do compressor. | (1) Conferir interligação elétrica (inversão de cabos); (2) medir corrente do compressor (alta → externa desliga); pressostatos de alta/baixa acionados; (3) eliminar interferências; persistindo → trocar placa externa. | Comunicação / unidade externa / compressor / pressostatos |
| `E8` | Falha na unidade interna (aumento de pressão do refrigerante) | Pressão do fluido elevada (tipicamente no modo reverso/quente). | (1) Sensor do trocador descalibrado (medir NTC); (2) ventilador interno baixa rotação/parado; (3) filtro de ar obstruído → limpar; (4) obstrução/excesso de carga no sistema; (5) ventilador externo irregular. | Unidade interna / sensor trocador / ventilador / filtro / sistema de refrigeração |

### 3.2 Linha KOHI 1HX (Split Hi-Wall Inverter — piscadas do LED / display F e P)

Confiança: **Alta** · Fonte: `AUTO DIAGNOSTICO - KOHI 1HX_05.04.2018.pdf` (Komlog/Komeco P&D). Coluna "piscadas" = nº de piscadas do LED da PCB da unidade externa quando aplicável.

| code | title | description | diagnosis | component |
|---|---|---|---|---|
| `F1` (20 piscadas) | Falha de comunicação | Sem comunicação entre unidade interna e externa. | Conferir interligação interna↔externa; medir tensão entre N(2) e cabo comunicação (3) → deve ler 3–16V DC; checar circuitos das PCBs; ver LED da PCB; eliminar interferência externa. | Comunicação / PCBs / fiação |
| `F2` | Falha sensor temp. ambiente (unidade interna) | Sensor ambiente interno com defeito. | Medir resistência do sensor; checar curto/circuito aberto e encaixe do conector na PCB; conferir soldagem; persistindo → trocar PCB. | Sensor temp. ambiente (interna) |
| `F3` | Falha sensor temp. do trocador (unidade interna) | Sensor do trocador de calor interno com defeito. | Mesma rotina de checagem de sensor do F2. | Sensor temp. trocador (interna) |
| `F4` | Falha no motor do ventilador (unidade interna) | Motor do ventilador interno com defeito. | Conferir encaixe do conector do motor na PCB; motor danificado → trocar; checar tiristores e componentes da PCB. | Motor ventilador (interna) |
| `F4` (20 piscadas) | Falha no acionamento do motor do ventilador (unidade interna) | Variante: acionamento do motor interno. | Conferir se cabos de interligação "1" e "2" entre unidades estão conectados corretamente. | Motor ventilador / interligação |
| `F5` (1 piscada) | Falha na PCB módulo inversor (IPM) | Módulo inversor/IPM com falha. | Conferir terminais de alimentação do compressor; fixação IPM+dissipador (dissipação de calor); compressor danificado → trocar; anomalia na PCB → trocar PCB inversor. | PCB módulo inversor (IPM) / compressor |
| `F6` (2 piscadas) | Falha sensor temp. ambiente (unidade externa) | Sensor ambiente externo com defeito. | Mesma rotina de checagem de sensor (resistência, curto/aberto, conector, solda); persistindo → trocar PCB. | Sensor temp. ambiente (externa) |
| `F7` (3 piscadas) | Falha sensor temp. do trocador (unidade externa) | Sensor do trocador externo com defeito. | Mesma rotina de checagem de sensor. | Sensor temp. trocador (externa) |
| `F9` (5 piscadas) | Falha sensor temp. de descarga do compressor (externa) | Sensor de descarga do compressor com defeito. | Mesma rotina de checagem de sensor. | Sensor temp. descarga (compressor) |
| `FC` (7 piscadas) | Acionamento anormal do compressor (externa) | Compressor não aciona corretamente. | Reacionar e verificar funcionamento; conferir terminais de alimentação do compressor; componentes da PCB danificados → trocar PCB. | Compressor / PCB externa |
| `P2` (10 piscadas) | Superaquecimento do módulo inversor (IPM) / proteção sobrecorrente | IPM superaquecido; proteção de sobrecorrente do módulo. | Conferir fixação IPM+dissipador; compressor danificado → trocar; anomalia na PCB inversor → trocar. | Módulo inversor (IPM) / compressor |
| `P3` (11 piscadas) | Proteção de sobrecorrente | Sobrecorrente detectada. | Verificar se temp. ambiente externa excede faixa de operação; circuito de detecção de corrente anormal → trocar controle elétrico. | Controle elétrico / detecção de corrente |
| `P4` (12 piscadas) | Proteção do compressor (alta temp. sensor de descarga) | Alta temperatura no sensor de descarga. | Verificar pressão do sistema; checar sensor, cabo do sensor e circuito de detecção. | Compressor / sensor descarga / sistema |
| `P5` (13 piscadas) | Superaquecimento na parte superior do compressor | Topo do compressor superaquecido. | Verificar pressão do sistema; checar sensor, cabo e circuito de detecção. | Compressor / sensor |
| `P6` (14 piscadas) | Proteção de temperatura (sucção) | Proteção por temperatura de sucção. | Verificar pressão do sistema; checar sensor, cabo e circuito de detecção. | Sensor de sucção / sistema |
| `P7` (15 piscadas) | Proteção baixa/alta tensão de alimentação | Tensão fora de faixa. | Verificar se tensão está fora de 150–270V; circuito de detecção de tensão do IPM danificado → trocar módulo inversor. | Alimentação / módulo inversor |
| `P8` (16 piscadas) | Proteção baixa pressão de sucção | Pressão de sucção baixa. | Verificar pressão em operação; se baixa, checar vazamento → recolher fluido, consertar, limpar, evacuar e recarregar. | Sistema de refrigeração (carga/vazamento) |
| `P9` (17 piscadas) | Proteção alta pressão de descarga | Pressão de descarga alta. | Mesma rotina de vazamento/carga do P8. | Sistema de refrigeração (carga/vazamento) |
| `PA` (18 piscadas) | Proteção alta temp. do trocador (unidade externa) | Trocador externo superaquecido. | Limpar trocador se sujo; corrigir instalação que prejudica troca de calor; checar resistência do sensor. | Trocador externo / instalação / sensor |
| `PC` (19 piscadas) | Proteção temp. ambiente excessiva (unidade externa) | Temp. ambiente externa muito alta. | Verificar temp. de trabalho / fontes de calor próximas; checar resistência do sensor. | Ambiente externo / sensor |

### 3.3 Erros de Cassete trifásico (PCB externa — padrão por LEDs)

Confiança: **Média** · Fonte única secundária (FrioClimatizado, blog técnico) — **não confirmado em PDF oficial**. Inclui: falta de fase A/neutro, falta de fases B/C, proteção de sobrecorrente, sensores condensador/ambiente, pressostatos de alta/baixa, e falhas de interligação. Tratar como referência preliminar até cruzar com manual oficial do cassete.

---

## 4. Manuais (PDF)

| Documento | URL | Confiança | Observação |
|---|---|---|---|
| Auto Diagnóstico — Linha LX-HX (Manual de Serviço, E1–E8) | `https://www.komeco.com.br/portaltecnico/LINHA%20DE%20CONDICIONADORES%20DE%20AR/Auto%20Diagnostico/AUTO%20DIAGNOSTICO%20-%20LINHA%20LX-HX.pdf` | **Alta** | Oficial, verificado HTTP 200. Fonte da seção 3.1 |
| Auto Diagnóstico — KOHI 1HX (códigos F/P) | `https://www.komeco.com.br/portaltecnico/LINHA%20DE%20CONDICIONADORES%20DE%20AR/Auto%20Diagnostico/AUTO%20DIAGNOSTICO%20-%20KOHI%201HX_05.04.2018.pdf` | **Alta** | Oficial, verificado HTTP 200. Fonte da seção 3.2 |
| Manual Técnico — Série KOS G2 (Mini Split) | `https://www.komeco.com.br/portaltecnico/LINHA%20DE%20CONDICIONADORES%20DE%20AR/Manuais%20Tecnicos/MANUAL%20TECNICO%20KOS%20G2.pdf` | **Alta** | Oficial, verificado HTTP 200 |
| Manual do usuário — Split Hi-Wall KAC-CHSA1 (séries 09–24 CSA/CHSA) | `https://www.komeco.com.br/arquivos/manuais/ar-condicionado/split-hi-wall/manual-ar-condicionado-split-kac-chsa1.pdf` | **Alta** | Oficial, verificado HTTP 200 |
| Catálogo geral — Condicionadores de Ar Komeco | `https://www.komeco.com.br/catalogos/catalogo-condicionadores-ar-komeco-web.pdf` | **Alta** | Oficial. Fonte da maior parte da seção 2 (Piso-Teto, Cassete, Duto, Cortina) |
| Boletim Técnico BT001-20 — Guia de Reparo (Inverter) | `https://www.komeco.com.br/portaltecnico/LINHA%20DE%20CONDICIONADORES%20DE%20AR/TCL/Boletim%20Tecnico/BT001-20%20GUIA%20DE%20REPARO%20CONDICIONADOR%20DE%20AR%20INVERTER.pdf` | **Média** | Listado em busca; URL não re-verificada nesta coleta |

> Portal técnico oficial: `https://www.komeco.com.br/portaltecnico/` reúne manuais de serviço, auto-diagnóstico e boletins por linha — boa fonte para expandir.

---

## 5. Fontes

**Oficiais (Alta confiança):**
- Site oficial: https://www.komeco.com.br/ (logo, linhas de produto, portal técnico)
- Loja oficial (VTEX): https://loja.komeco.com.br/ (SKUs, fotos CDN, logo SVG)
- Catálogo PDF oficial: https://www.komeco.com.br/catalogos/catalogo-condicionadores-ar-komeco-web.pdf
- PDFs Auto-Diagnóstico LX-HX e KOHI 1HX (URLs na seção 4)
- Páginas: /ar-condicionado-split-inverter/, /ar-condicionado-split-eco/, /ar-condicionado-cassete-inverter-r-410a/, /ar-condicionado-cassete-r-410a/

**Varejo/terceiros (Média confiança — códigos de modelo, fotos):**
- Leroy Merlin (CDN VTEX t98697.vtexassets.com): https://www.leroymerlin.com.br/
- Peças Pro Ar (códigos de peças/controles por modelo): https://www.pecasproar.com.br/
- Zoom (modelos Ambient): https://www.zoom.com.br/
- Buscapé, TemperFrio, PrimeStore Polar, Horvath (revendas)

**Secundárias técnicas (Média/Baixa — códigos de erro):**
- FrioClimatizado (blog): http://frioclimatizado.blogspot.com/
- Goiânia Ar-Condicionado: https://goianiaarcondicionado.com/codigos-de-erro-do-ar-condicionado-komeco/
- Scribd "Komeco Codigos de Erro"

---

## 6. LACUNAS (o que ficou faltando / a confirmar)

1. **Multi-Split:** não há códigos/capacidades públicas no catálogo nem na loja oficial coletados. **Confirmar diretamente com a Komeco.**
2. **Fotos CDN diretas das linhas Hi-Wall comerciais (Maxime, Ambient, Brize, Princess, KAC, ECO):** só foi capturada foto CDN direta da KOHI Inverter (VTEX da Leroy) e a foto genérica da família no site oficial. Demais → `null` (capturar via VTEX da loja oficial filtrando por SKU, ou e-commerces).
3. **Refrigerante por modelo Hi-Wall on/off (Maxime/Ambient/Brize/Princess):** maioria R-410A nas séries antigas; a geração nova KOHI é **R-32**. Confirmar por modelo exato.
4. **Códigos de modelo completos** de algumas linhas comerciais (Princess sem código capturado; Maxime/Ambient com padrão inferido `MXS.../ABS...` mas não a lista completa de SKUs).
5. **Códigos de erro de Cassete/Piso-Teto trifásico:** só há fonte secundária (blog). Falta o PDF oficial de auto-diagnóstico específico desses tipos.
6. **Mapeamento nome comercial ↔ plataforma técnica:** confirmar oficialmente se "Maxime/Ambient/Brize" = famílias `2LX/4LA` etc. (inferido por códigos de peças, não por catálogo).
7. **Fotos do tipo Piso-Teto/Cassete/Duto:** todas em `null` — o catálogo é PDF (imagens embutidas, não URLs); capturar via loja/e-commerce.
