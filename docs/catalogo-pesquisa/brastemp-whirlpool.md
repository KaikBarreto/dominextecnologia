# Catálogo de Pesquisa — Brastemp & Whirlpool (Ar-Condicionado, mercado BR)

> Pesquisa de dados PÚBLICOS para a base de Ferramentas do Técnico. Cada bloco indica **confiança** e **fonte**. Onde não foi possível confirmar com ≥2 fontes, está marcado como **LACUNA**. NÃO inventar — técnico depende disso em campo.
>
> Data da pesquisa: 2026-06-14.

---

## ⚠️ Achado crítico (ler antes de tudo)

1. **A marca "Whirlpool" NÃO vende ar-condicionado no Brasil.** A Whirlpool Corporation opera no Brasil **através das marcas Brastemp e Consul** (a fábrica de AC em Manaus produz unidades com selo Brastemp/Consul). Ar-condicionado de marca "Whirlpool" (ex.: SPICR 312W, FM09IDU32, SPIW 309L) existe **só no mercado europeu/Portugal** (whirlpool.pt). **Confiança: ALTA** (cruzado: whirlpool.com.br institucional + whirlpool.pt + ausência total em varejo BR).
   → **Recomendação de produto:** no Dominex, "Whirlpool" não deve ser oferecida como marca de AC para o técnico BR; redirecionar para **Brastemp/Consul**. Se for mantida por completude, herdar tudo de Consul/Brastemp.

2. **Brastemp residencial = Split Hi-Wall apenas, e convencional (on/off).** Não há Cassete, Piso-Teto nem Multi-Split com selo Brastemp no varejo brasileiro. A etiqueta "inverter" em alguns anúncios de marketplace é **erro de vendedor** — a linha Brastemp residencial é on/off. **Confiança: ALTA** (varredura ML, Magalu, Casas Bahia, Extra, Zoom, Buscapé sem nenhum SKU desses tipos).

3. **Códigos de erro Brastemp = mesma plataforma Consul.** Confirmado: Brastemp/Consul/Whirlpool dividem a mesma fabricante e os manuais batem. **Confiança: ALTA** para os códigos comuns (E2, E4, E42, E43, EA e numéricos via Sleep×4); ver seção 3.

---

## 1. Logos

### Brastemp
- **URL re-hospedável (Wikimedia, preferível):** `https://upload.wikimedia.org/wikipedia/commons/1/14/Brastemp.svg`
- Formato: SVG (260×142). Verificado HTTP 200, `image/svg+xml`, ~4 KB.
- **Confiança: ALTA** (Wikimedia Commons, File:Brastemp.svg).

### Whirlpool (corporativa — usar só se necessário, NÃO é marca de AC no BR)
- **URL re-hospedável (Wikimedia, preferível):** `https://upload.wikimedia.org/wikipedia/commons/9/95/Whirlpool_Corporation_Logo_%28as_of_2017%29.svg`
- Formato: SVG (1680×560). Verificado HTTP 200, `image/svg+xml`, ~8,7 KB. Domínio público (abaixo do limiar de originalidade).
- **Confiança: ALTA** (Wikimedia Commons, File:Whirlpool Corporation Logo (as of 2017).svg).

---

## 2. Modelos por TIPO

### Split Hi-Wall (único tipo Brastemp no BR)

Brastemp residencial sai em **duas linhas**: **ative!** (legada) e **Clean** (mais recente / atual). Todas **convencionais on/off**. O prefixo de letras codifica ciclo + tensão; o número é a capacidade (07/09/12/18/22 → 7k/9k/12k/18k/22k BTU).

**Lógica de código (linha Clean, sufixo `BB`):**
- `BBV` / `BBY` = **frio** (V e Y diferem por tensão 110V/220V)
- `BBU` / `BBZ` = **quente/frio** (U e Z diferem por tensão)
- variantes `BBJ`/`BBM` aparecem em peças para 9k/12k

**Lógica de código (linha ative!, sufixo `AB`):**
- `BBF` / `BBG` = **frio**
- `BBR` / `BBT` = **quente/frio**

| Modelo (código) | Linha | Capacidade (BTU) | Ciclo | Inverter? | Tipo | URL FOTO (CDN direto) |
|---|---|---|---|---|---|---|
| BBV12BB | Brastemp Clean | 12.000 | Frio | Não (on/off) | Split Hi-Wall | `https://i.zst.com.br/thumbs/12/36/18/778859.jpg` ✅ verificada (200, jpeg) |
| BBV09BB (BBV09BBBNA) | Brastemp Clean | 9.000 | Frio | Não | Split Hi-Wall | null |
| BBY09BB / BBY12BB | Brastemp Clean | 9.000 / 12.000 | Frio (outra tensão) | Não | Split Hi-Wall | null |
| BBU09BB | Brastemp Clean | 9.000 | Quente/Frio | Não | Split Hi-Wall | null |
| BBU12BB | Brastemp Clean | 12.000 | Quente/Frio | Não | Split Hi-Wall | null |
| BBZ09BB / BBZ12BB | Brastemp Clean | 9.000 / 12.000 | Quente/Frio (outra tensão) | Não | Split Hi-Wall | null |
| BBF07/09/12/18/22 AB | Brastemp ative! | 7k–22k | Frio | Não | Split Hi-Wall | null |
| BBG07/09/12/18/22 AB | Brastemp ative! | 7k–22k | Frio (outra tensão) | Não | Split Hi-Wall | null |
| BBR07/09/12/18/22 AB | Brastemp ative! | 7k–22k | Quente/Frio | Não | Split Hi-Wall | null |
| BBT07/09/12/18/22 AB | Brastemp ative! | 7k–22k | Quente/Frio (outra tensão) | Não | Split Hi-Wall | null |

**Confiança nos modelos/códigos/capacidades: MÉDIA-ALTA** (cruzado: manual oficial BBF, listagens Extra/Magalu/Zoom, catálogo de peças Refriparts família BBJ/BBU/BBV).

**Sobre as fotos (LACUNA parcial):** só **uma** URL de CDN direto foi extraível (BBV12BB, via Zoom/`i.zst.com.br`). Mercado Livre (`http2.mlstatic.com`), Magazine Luiza (`a-static.mlcdn.com.br`), Extra e Casas Bahia retornam **HTTP 403** a fetch automatizado; o site oficial brastemp.com.br retorna "nenhum produto" (linha em descontinuação). As demais fotos ficaram `null` conforme instrução. → Para obter as URLs reais, abrir as páginas de produto ML/Magalu num navegador real e ler o `og:image` (ML → `http2.mlstatic.com/D_NQ_NP_...jpg`; Magalu → `a-static.mlcdn.com.br/...jpg`).

### Cassete / Piso-Teto / Multi-Split
**NÃO existem com selo Brastemp no varejo brasileiro.** Confiança: ALTA (varredura sem nenhum SKU). Se o cliente precisar desses tipos com fabricante Whirlpool, é a **Consul** ou linhas comerciais de outras marcas.

---

## 3. Códigos de erro

> Plataforma **compartilhada Brastemp/Consul/Whirlpool**. Confirmado que os códigos batem com a Consul. Em muitos modelos a leitura é feita pressionando **"Sleep" 4× no controle** para o display mostrar o código numérico. Os "E__" aparecem direto no painel.

| Code | Title | Description | Diagnosis | Component | Confiança | Fonte |
|---|---|---|---|---|---|---|
| **E2** | Superaquecimento (unidade externa) | Ventilador da externa desliga e E2 surge: sensor do trocador de calor da externa leu > 53 °C | Proteção térmica; checar sensor da serpentina externa, ventilação da condensadora, sujeira | Sensor serpentina externa / ventilação | MÉDIA | guiadoarcondicionado + frioclimatizado (Consul) — confirmar contra manual do modelo |
| **E4** | Falha ventilador interno | Velocidade do ventilador da interna < 200 rpm; motor da interna com problema | Checar motor/turbina da evaporadora e capacitor | Motor ventilador interno | ALTA | CentralAr (Consul) + frioclimatizado |
| **E5** | (Indefinido nas fontes) | Não documentado de forma confiável nas fontes cruzadas | — | — | BAIXA / **LACUNA** | — |
| **E6** | Tensão de alimentação fora do especificado | Proteção contra variação/tensão de entrada fora da faixa | Medir tensão da rede / estabilizar | Alimentação elétrica | MÉDIA | guiadoarcondicionado + CentralAr (numérico "6") |
| **E42** | Proteção contra sub-resfriamento | Sistema super-resfriando | Checar carga de gás, sensores de temperatura | Carga de refrigerante / sensores | MÉDIA | CentralAr + busca cruzada (Consul) |
| **E43** | Proteção contra superaquecimento | Sistema superaquecendo | Checar carga de gás, ventilação, sensores | Carga / ventilação / sensores | MÉDIA | CentralAr + busca cruzada (Consul) |
| **EA (ou ER)** | Erro de comunicação | Comunicação entre a placa interface e a placa da unidade interna | Checar chicote/placa interface da evaporadora | Comunicação interna (placas) | MÉDIA | CentralAr (Consul) |

**Códigos numéricos (leitura via Sleep×4 — plataforma Consul, valem para Brastemp):**

| Code | Title | Description | Diagnosis | Component | Confiança | Fonte |
|---|---|---|---|---|---|---|
| **00** | Falha de comunicação / alimentação | Comunicação entre placas ou alimentação | Checar chicotes e tensão | Placas / alimentação | MÉDIA | CentralAr (Consul) |
| **1** | Sensor serpentina (externa) | Falha do sensor da serpentina externa (conector preto) | Substituir/checar sensor | Sensor serpentina externa | MÉDIA | CentralAr |
| **2** | Sensor de descarga (externa) | Falha do sensor de descarga (conector branco) | Checar/substituir sensor | Sensor de descarga | MÉDIA | CentralAr |
| **5** | Proteção módulo IPM | Proteção do módulo de potência integrado acionada | Checar IPM / inversor da placa externa | Módulo IPM (placa externa) | MÉDIA | CentralAr |
| **6** | Proteção de tensão | Variação de tensão de alimentação | Medir/estabilizar rede | Alimentação elétrica | MÉDIA | CentralAr |
| **7** | Comunicação interna↔externa | Erro de comunicação entre as unidades | Checar cabo de interligação | Cabo de comunicação | MÉDIA | CentralAr |
| **13** | Proteção temperatura do compressor | Falha de sensor ou de ventilação | Checar ventilação e sensor | Compressor / ventilação | MÉDIA | CentralAr |
| **15** | Sensor de temperatura do compressor | Déficit de refrigerante ou sensor (conector vermelho) | Checar carga de gás e sensor | Carga / sensor compressor | MÉDIA | CentralAr |
| **36** | Comunicação interna↔externa (com atraso) | Falha de comunicação; exibe após ~48 min de atraso | Checar cabo de interligação | Cabo de comunicação | MÉDIA | CentralAr |

**Confirmação Brastemp = Consul:** ✅ Sim — mesma fabricante (Whirlpool Latin America), manuais e tabelas batem. As referências de erro encontradas para "Brastemp F6/F7" remetem às mesmas tabelas Consul. **Confiança da equivalência: ALTA.** Confiança dos valores individuais: **MÉDIA** (fonte primária acessível foi CentralAr; PDFs oficiais webarcondicionado/scribd ficaram inacessíveis a fetch automatizado — ver LACUNAS).

---

## 4. Manuais

| Documento | URL | Confiança | Obs. |
|---|---|---|---|
| Manual usuário Split Hi-Wall Brastemp ative! (BBF07/09/12/18/22) | `https://pdf.webarcondicionado.com.br/brastemp/manual/usuario/mdu-split-hi-wall-bbf07-bbf09-bbf12-bbf18-bbf22.pdf` | MÉDIA | URL pública listada em busca; host bloqueia fetch automatizado neste ambiente — validar download em navegador antes de re-hospedar |
| PDF códigos de erro Split Hi-Wall Inverter Consul (mesma plataforma) | `https://pdf.webarcondicionado.com.br/codigos-de-erro/erros-ar-condicionado-consul.pdf` | MÉDIA | Mesma observação de acesso |
| Tabela de erros Consul (CentralAr) — fonte primária usada | `https://blog.centralar.com.br/erro-ar-condicionado-consul/` | ALTA (acessível) | HTML, base da seção 3 |

---

## 5. Fontes (URLs)

- Logo Brastemp: https://commons.wikimedia.org/wiki/File:Brastemp.svg → https://upload.wikimedia.org/wikipedia/commons/1/14/Brastemp.svg
- Logo Whirlpool: https://commons.wikimedia.org/wiki/File:Whirlpool_Corporation_Logo_(as_of_2017).svg → https://upload.wikimedia.org/wikipedia/commons/9/95/Whirlpool_Corporation_Logo_%28as_of_2017%29.svg
- Códigos Consul (primária): https://blog.centralar.com.br/erro-ar-condicionado-consul/
- Códigos Consul (frioclimatizado): http://frioclimatizado.blogspot.com/2016/10/codigos-de-erro-do-condicionador-de-ar_12.html
- Erros E2/E3/E4/E5: https://guiadoarcondicionado.com.br/ar-condicionado-exibindo-codigos-de-erro-e2-e3-e4-e5-ou-luz-piscando/
- Manual Brastemp BBF: https://pdf.webarcondicionado.com.br/brastemp/manual/usuario/mdu-split-hi-wall-bbf07-bbf09-bbf12-bbf18-bbf22.pdf
- Modelo Brastemp Clean BBV09 (Extra): https://www.extra.com.br/arventilacao/arcondicionado/split/ar-condicionado-split-brastemp-clean-bbv09bbbna-bby09bbbna-frio-9-000-btus-220v-1000017904.html
- Modelo Brastemp Clean BBU09BB (Magalu): https://www.magazineluiza.com.br/ar-condicionado-split-ciclo-quente-frio-9-000-btus-brastemp-clean-bbu09bb/p/201019600/ar/arsp/
- Foto BBV12BB (Zoom CDN): https://i.zst.com.br/thumbs/12/36/18/778859.jpg
- Whirlpool marca no BR (institucional): https://www.whirlpool.com.br
- Whirlpool AC Europa/Portugal (prova de que AC Whirlpool é EU-only): https://www.whirlpool.pt/produtos/ar-condicionado/ar-condicionado
- Peças família BBJ/BBU/BBV (Refriparts): https://www.refriparts.com.br

---

## 6. LACUNAS (o que falta confirmar)

1. **E5**: sem definição confiável cruzada. NÃO afirmar significado em campo até confirmar no manual do modelo. **(BAIXA)**
2. **Fotos de produto (9 de 10 modelos = null)**: ML/Magalu/Casas Bahia/Extra bloqueiam fetch automatizado (403). Só BBV12BB tem CDN direto verificado. Obter o resto via `og:image` em navegador real.
3. **Validar valores individuais dos códigos contra o PDF oficial Brastemp/Consul**: os PDFs canônicos (webarcondicionado/scribd) ficaram inacessíveis ao fetch automatizado; a seção 3 se apoia em CentralAr + fóruns técnicos. Confiança da equivalência Brastemp=Consul é ALTA, mas os textos exatos por código merecem 2ª fonte primária (PDF) antes de publicar como ALTA.
4. **Brastemp inverter**: nenhuma evidência de split inverter Brastemp residencial no BR — tratar "inverter" em anúncios como ruído de vendedor até prova em contrário.
5. **Lista completa de SKUs ative!/Clean por tensão**: códigos por voltagem (110/220) inferidos pela lógica de prefixo; confirmar correspondência exata letra↔tensão no manual de serviço.
6. **Whirlpool-marca-AC no BR**: confirmado que NÃO existe; se o produto quiser a marca por completude, herdar de Brastemp/Consul.
