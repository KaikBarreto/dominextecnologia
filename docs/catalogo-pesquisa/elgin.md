# Elgin — Ar-Condicionado (pesquisa de catálogo, mercado BR)

> Pesquisa de dados PÚBLICOS para catálogo interno. Cada item marca **confiança** (Alta / Média / Baixa) e a fonte.
> Nada inventado: lacunas estão explicitamente marcadas como `null` / "LACUNA".
> Data da coleta: 2026-06-14.

---

## 1. Logo

| Campo | Valor |
|---|---|
| URL pública re-hospedável | `https://elgin.vtexassets.com/assets/vtex/assets-builder/elgin.store/1.0.140/images/logos/logo___8c0ef161d2fcb8c5f07910f575842820.svg` |
| Formato | SVG (vetorial, ideal pra re-hospedar) |
| Confiança | **Média** — extraída do HTML do site oficial (loja VTEX da Elgin). URL versionada (`1.0.140`) pode mudar em deploy futuro do site; baixar e re-hospedar é recomendado. |
| Fonte | elgin.com.br (loja VTEX) |

---

## 2. Modelos por TIPO

> Observação: Elgin nomeia famílias (linhas) e variações por BTU. Os códigos de modelo costumam ser separados por **evaporadora (interna)** e **condensadora (externa)**. Onde só havia um código no anúncio, está marcado.

### 2.1 Split Hi-Wall (parede)

| Linha | BTU | Ciclo | Código de modelo | URL foto (CDN) | Confiança | Fonte |
|---|---|---|---|---|---|---|
| Eco Inverter II Wi-Fi | 9.000 | Só Frio | LACUNA (não confirmado) | null | Média | Leveros, Arcerto |
| Eco Inverter II Wi-Fi | 12.000 | Só Frio | `HJFE12C2CB` (cond.) / `HJFI12C2WB` (evap.) — ref. 5000011216 | `https://www.leveros.com.br/upload/produto/imagem/m_ar-condicionado-split-hw-elgin-eco-inverter-ii-wi-fi-12-000-btus-r-32-s-frio-220v.jpg` | **Alta** | Leveros (página do produto) |
| Eco Inverter II Wi-Fi | 18.000 | Só Frio | LACUNA | null | Média | Leveros |
| Eco Inverter II | 30.000 | Só Frio | LACUNA | null | Média | Arcerto |

- **Faixa da linha Eco Inverter II:** 9.000 a 30.000 Btu/h, versões Frio e Quente-Frio. Gás R-32, classe A Inmetro/Procel. Garantia 3 anos (aparelho) / 10 anos (compressor). Confiança **Alta** (descrição cruzada em Leveros + Arcerto).

### 2.2 Cassete (K7 / teto)

| Linha | BTU | Ciclo | Código de modelo | URL foto (CDN) | Confiança | Fonte |
|---|---|---|---|---|---|---|
| Cassete Inverter Eco | 48.000 | Só Frio | LACUNA (página 404 na coleta) | null | Média | Centro Elétrico, loja Elgin |

- **Faixa da linha Cassete:** 18.000 a 58.000 Btu/h, distribuição de ar 360°, gás R-32. Confiança **Alta** (loja oficial Elgin).

### 2.3 Piso-Teto

| Linha | BTU | Ciclo | Código de modelo | URL foto (CDN) | Confiança | Fonte |
|---|---|---|---|---|---|---|
| Inverter Plus R-32 | 24.000 | Só Frio | `45PDFI24C2DA` (evap.) / `45PDFE24C2CA` (cond.) — SKU 750760 | `https://centroeletrico.fbitsstatic.net/img/p/split-piso-teto-inverter-plus-gas-r-32-elgin-24000-btus-frio-220v-monofasico-84073/270587-1.jpg` | **Alta** | Centro Elétrico (página do produto) |
| Inverter Plus | 36.000 | Só Frio | LACUNA | null | Média | loja Elgin |
| Inverter Plus | 56.000 | Só Frio | LACUNA | null | Média | Arcerto, loja Elgin |
| Inverter Eco | 30.000 | Quente-Frio | LACUNA | null | Média | loja Elgin |
| Inverter Eco | 48.000 | Só Frio | LACUNA | null | Média | Centro Elétrico, loja Elgin |
| Inverter Eco | 58.000 | Só Frio | LACUNA | null | Média | loja Elgin |

- **Faixa da linha Piso-Teto:** título oficial diz 24.000 a 80.000 Btu/h. Linhas Eco e Plus; ciclos Frio e Quente-Frio; 220V; tecnologia Inverter. Confiança **Alta** na faixa, **Média** nos modelos individuais.

### 2.4 Multi-Split

| Linha | BTU | Ciclo | Código de modelo | URL foto (CDN) | Confiança | Fonte |
|---|---|---|---|---|---|---|
| Multi Split (família) | LACUNA | LACUNA | LACUNA | null | **Baixa** | só listado como categoria na home Elgin |

- **LACUNA:** o site oficial lista "Multi Split" como categoria, mas não consegui cruzar BTU/códigos/fotos de modelos específicos em ≥2 fontes nesta coleta.

### Faixas de BTU oferecidas (home oficial Elgin)
9.000 · 12.000 · 18.000 · 24.000 · 30.000 · 36.000 · 48.000 · 56.000 · 58.000 Btu/h (+ outras). Confiança **Alta**.

### Tipos/famílias citados no site oficial
Split Hi-Wall · Split Inverter · Multi Split · Split Piso-Teto · Split Cassete · Splitão · Cortina de Ar. Confiança **Alta**.

---

## 3. Códigos de erro

> Atenção: os códigos **variam por linha**. Listadas abaixo as duas linhas Inverter com tabela textual confirmada. Para linhas antigas (High Wall, Eco Logic, Atualle), a Elgin publica só imagens (não extraível como texto nesta coleta) — LACUNA.

### 3.1 Linha **Eco Plus II** (Split Hi-Wall) — Confiança **Alta** (suporteelgin.wordpress.com)

| code | title | description | diagnosis | component |
|---|---|---|---|---|
| E1 | Falha no EEPROM | Falha no EEPROM (Unidade Interna) | Defeito na placa/memória da interna | Placa unidade interna |
| E2 | Erro de Sinal do Cruzamento Zero | Erro de Sinal do Cruzamento Zero | Problema de detecção de sinal elétrico | Placa eletrônica / alimentação |
| E3 | Mau funcionamento motor ventilador interno | Mau Funcionamento do Motor Ventilador (Unidade Interna) | Motor/ventilador da interna travado ou em falha | Motor ventilador interno |
| E5 | Falha sensor temperatura ambiente interno | Falha no Sensor de Temperatura Ambiente Interno | Termistor de ambiente defeituoso/desconectado | Sensor temperatura ambiente (interna) |
| E6 | Falha sensor temperatura evaporador | Falha no Sensor de Temperatura Evaporador | Termistor do evaporador defeituoso/desconectado | Sensor evaporador |
| E7 | Falha sensor temperatura externo | Falha no Sensor de Temperatura Condensador ou Ambiente Externo | Sensor da externa defeituoso/desconectado | Sensor condensador/externo |
| E8 | Mau funcionamento motor ventilador externo | Mau Funcionamento do Motor Ventilador (Unidade Externa) | Motor/ventilador da externa travado ou em falha | Motor ventilador externo |
| E9 | Falha de comunicação entre unidades | Falha de Comunicação Entre as Unidades | Cabo de comunicação/placa interna↔externa | Comunicação interna↔externa |
| EC | Detecção de vazamento de refrigerante | Detecção do Vazamento de Refrigerante | Perda de carga de gás no sistema | Circuito de refrigerante |
| P6 | Proteção de pressão | Proteção Contra Alta/Baixa Pressão | Sobrecarga/restrição no compressor | Compressor / sistema de pressão |

### 3.2 Linha **Eco Life Inverter** — Confiança **Alta** (suporteelgin.wordpress.com)

| code | title | description | diagnosis | component |
|---|---|---|---|---|
| E0 | Falha no EEPROM (interna) | Falha no EEPROM (Unidade Interna) | Memória/placa da interna | Placa unidade interna |
| E1 | Falha de comunicação | Falha de Comunicação Entre as Unidades | Cabo/placa de comunicação | Comunicação interna↔externa |
| E3 | Mau funcionamento motor ventilador interno | Mau Funcionamento do Motor Ventilador (Unidade Interna) | Motor da interna travado/falha | Motor ventilador interno |
| E4 | Falha sensor temp. ambiente interno | Falha no Sensor de Temperatura Ambiente Interno | Termistor de ambiente | Sensor temperatura ambiente (interna) |
| E5 | Falha sensor temp. evaporador | Falha no Sensor de Temperatura Evaporador (Unidade Interna) | Termistor do evaporador | Sensor evaporador |
| EC | Detecção de vazamento de refrigerante | Detecção do Vazamento de Refrigerante | Perda de gás | Circuito de refrigerante |
| EE | Mau funcionamento alarme nível de água | Mau Funcionamento do Alarme de Nível de Água | Bóia/sensor de dreno | Sensor de nível de água |
| F0 | Proteção contra sobrecarga | Proteção Contra Sobre Carga | Corrente elevada no sistema | Sistema elétrico |
| F1 | Falha sensor temp. ambiente externo | Falha no Sensor de Temperatura Ambiente Externo | Termistor externo | Sensor temperatura ambiente (externa) |
| F2 | Falha sensor temp. condensador | Falha no Sensor de Temperatura do Condensador | Termistor do condensador | Sensor condensador |
| F3 | Falha sensor saída de ar | Falha no Sensor de Saída de Ar | Termistor de descarga de ar | Sensor saída de ar |
| F4 | Falha no EEPROM (externa) | Falha no EEPROM (Unidade Externa) | Memória/placa da externa | Placa unidade externa |
| F5 | Mau funcionamento motor ventilador externo | Mau Funcionamento do Motor Ventilador da Unidade Externa | Motor da externa travado/falha | Motor ventilador externo |
| P0 | Proteção do módulo Inverter (IPM) | Proteção do Módulo Inverter IPM | Sobreaquecimento/sobrecorrente do IPM | Módulo Inverter (IPM) |
| P1 | Proteção de pressão | Proteção Contra Alta/Baixa Pressão | Restrição/sobrecarga no circuito | Sistema de pressão |
| P2 | Alta temperatura do compressor | Proteção Contra Alta Temperatura do Compressor | Compressor superaquecido | Compressor |
| P3 | Baixa temp. unidade externa | Proteção de Baixa Temperatura da Unidade Externa | Operação em temperatura externa baixa | Unidade externa |
| P4 | Falha no drive do compressor | Falha no Drive do Compressor | Acionamento/driver do compressor | Drive do compressor |
| P5 | Modo conflito | Modo Conflito | Conflito de modo de operação (multi/seleção) | Lógica de operação |

> Nota de confiança transversal: códigos da família "E/F/P" são padrão de muitos OEMs; os mapeamentos acima vieram de página de suporte Elgin específica por linha. **Confirme sempre contra o manual do modelo exato** antes de uso operacional — diagnósticos/components foram inferidos do título oficial (confiança Média no campo `diagnosis`).

### 3.3 Outras linhas (High Wall, Eco Logic, Atualle Eco, Piso-Teto, Cassete K7)
**LACUNA** — a Elgin publica essas tabelas apenas como imagem (não extraível como texto nesta coleta). Também há PDFs consolidados em webarcondicionado.com.br (ver Fontes) que não consegui parsear nesta sessão.

---

## 4. Manuais

| Recurso | URL | Confiança | Observação |
|---|---|---|---|
| PDF consolidado de códigos de erro (Split) | `https://static.webarcondicionado.com.br/blog/uploads/2022/09/codigo-erro-ar-condicionado-split-elgin.pdf` | **Média** | Terceiro (WebArCondicionado), não oficial Elgin; não verifiquei o conteúdo nesta coleta |
| PDF consolidado de códigos de erro (Piso-Teto) | `https://static.webarcondicionado.com.br/blog/uploads/2022/09/codigo-erro-ar-condicionado-piso-teto-elgin.pdf` | **Média** | Terceiro |
| PDF de códigos de erro Elgin (geral) | `https://static.webarcondicionado.com.br/pdfs/elgin-codigos-de-erro.pdf` | **Média** | Terceiro |
| Documento Scribd "Elgin Códigos de Erro" | `https://www.scribd.com/document/433797039/Elgin-Codigos-de-Erro` | **Baixa** | Scribd exige login/conta; conteúdo não verificado |
| Manuais oficiais por produto | LACUNA — não localizei URL direta de PDF de manual no domínio oficial elgin.com.br nesta coleta | **—** | Buscar em elgin.com.br > suporte/downloads do modelo específico |

---

## 5. Fontes

- **Site oficial:** elgin.com.br/ar-condicionado · loja.elgin.com.br · elgin.com.br/ar-condicionado/ar-condicionado-piso-teto (logo, famílias, faixas de BTU, faixas por tipo).
- **Suporte oficial Elgin (blog SAC):** suporteelgin.wordpress.com — páginas Eco Plus II (2021/10/22), Eco Life Inverter (2021/10/25), índice de erros (2018/07/10). Base das tabelas de erro.
- **E-commerce (modelos/fotos/códigos):** leveros.com.br (Eco Inverter II 9/12/18k), arcerto.com (Eco II 12/30k), centroeletrico.com (Piso-Teto Inverter Plus 24k, Cassete Inverter Eco 48k), novalar.com.br.
- **Terceiros (manuais/erros):** webarcondicionado.com.br (página + PDFs), scribd.com.

### Critério de cruzamento (≥2 fontes)
- Linha Eco Inverter II e faixa 9–30k: **Leveros + Arcerto + descrição oficial** → Alta.
- Faixas por tipo (cassete 18–58k, piso-teto 24–80k): **site oficial + e-commerce** → Alta.
- Códigos de erro Eco Plus II / Eco Life Inverter: fonte única (suporte oficial Elgin) por linha → **Alta na origem**, mas não cruzada com 2ª fonte → tratar `diagnosis`/`component` como Média.

---

## 6. LACUNAS (resumo)

1. **Multi-Split:** sem BTU/códigos/fotos de modelos específicos cruzados — confiança Baixa.
2. **Códigos de modelo** (evap./cond.) faltam para a maioria das variações de BTU (só 12k Hi-Wall e 24k Piso-Teto confirmados).
3. **URLs de foto CDN** confirmadas só para 12k Hi-Wall (Leveros) e 24k Piso-Teto (Centro Elétrico); demais = `null`.
4. **Cassete 48k:** página de produto retornou 404 na coleta — sem código/foto.
5. **Tabelas de erro** das linhas High Wall, Eco Logic, Atualle Eco, Piso-Teto e K7: publicadas só como imagem → não extraídas.
6. **Manuais oficiais (PDF) no domínio elgin.com.br:** não localizada URL direta — só fontes de terceiro.
7. **Campos `diagnosis` e `component`** das tabelas de erro: parcialmente inferidos do título oficial (não literais) → validar no manual do modelo exato.
