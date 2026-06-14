# Catálogo de pesquisa — TCL (Ar-condicionado, mercado BR)

> Pesquisa de dados PÚBLICOS para catálogo interno. Cruzamento de ≥2 fontes quando possível.
> Confiança: **ALTA** (fonte oficial / ≥2 fontes confiáveis batem) · **MÉDIA** (1 fonte confiável) · **BAIXA** (indício isolado / inferência).
> Data da pesquisa: 2026-06-14. Marca distribuída no BR pela SEMP TCL.

---

## 1. Logo

| Item | Valor | Confiança |
|---|---|---|
| URL pública re-hospedável (SVG) | `https://upload.wikimedia.org/wikipedia/commons/2/2a/Logo_of_the_TCL_Corporation.svg` | **ALTA** |
| Página de origem | https://commons.wikimedia.org/wiki/File:Logo_of_the_TCL_Corporation.svg | ALTA |
| Licença | Domínio público (abaixo do threshold de originalidade — só formas/texto simples). Sujeito a marca registrada. | ALTA |
| Dimensões | 1.000 × 596 px (SVG, ~4 KB) | ALTA |

Alternativas no Wikimedia (caso queira variação): `File:TCL-Global-logo.svg` (2000×2000, CC BY-SA 4.0) e `File:Semp_TCL_logo.svg` (variante da marca brasileira SEMP TCL).

---

## 2. Modelos por tipo

> Código de modelo TCL: padrão `TAC-<BTU><sufixos>-INV`. `C`=cooling/inverter, `H`=quente-frio (heat pump), `G`=geração/linha, sufixo `-I` em alguns SKUs = unidade interna. Sem o `H` → só frio.
> URLs de FOTO: link direto de CDN de e-commerce quando confirmado; senão `null`.

### 2.1 Split Hi-Wall

| Linha | BTU | Ciclo | Código modelo | Foto (CDN) | Confiança | Fonte |
|---|---|---|---|---|---|---|
| T-Pro 2.0 | 9.000 | Frio | TAC-09CTG2-INV | null | ALTA | Leveros + TCL.com |
| T-Pro 2.0 | 9.000 | Quente-frio | TAC-09CHTG2-INV | null | ALTA | TCL.com |
| T-Pro 2.0 | 12.000 | Frio | TAC-12CTG2(-INV) | `https://martinelloeletrodomesticos.fbitsstatic.net/img/p/ar-condicionado-tcl-split-inverter-12000-btus-tac-12ctg2-frio-220v-80007/266599.jpg` | ALTA | Martinello (foto) + Leveros |
| T-Pro 2.0 | 12.000 | Quente-frio | TAC-12CHTG2-INV | null | MÉDIA | TCL.com / e-commerce |
| T-Pro 2.0 | 18.000 | Frio | TAC-18CTG2(-INV) | null | ALTA | Martinello + Leveros |
| T-Pro 2.0 | 24.000 | Frio | TAC-24CTG2-INV | null | ALTA | Leveros + TCL.com |
| T-Pro (Gen 1) | 12.000 | Quente-frio | TAC-12CHTG1-INV | null | MÉDIA | TCL.com |
| BreezeIN AI | 9.000 | Quente-frio | TAC-09CHTG3-INV-I | null | MÉDIA | TCL.com |
| BreezeIN AI | 9.000 | Frio | TAC-09CTG3-INV-I | null | MÉDIA | TCL.com |
| FreshIN 3.0 | 12.000 | Quente-frio | TAC-12CFG3W-INV | null | MÉDIA | TCL.com |
| FreshIN 2.0 | 12.000 | Quente-frio | TAC-12CHFG2O-INV | null | MÉDIA | TCL.com |
| Série A2 Inverter | 9.000 | Frio | TAC-09CSA2-INV | null | MÉDIA | TCL.com |
| Série A2 Inverter | 9.000 | Quente-frio | TAC-09CHSA2-INV | null | MÉDIA | TCL.com |
| Elite GV (top discharge) | 9.000 | Frio | TAC-09CGV-INV | null | BAIXA | TCL.com (1 fonte) |

> Refrigerante das linhas atuais (T-Pro 2.0 / FreshIN / piso-teto e cassete R-32): **R-32**. (Leveros / TCL.com).

### 2.2 Cassete (inverter)

| Linha | BTU | Ciclo | Código modelo | Foto (CDN) | Confiança | Fonte |
|---|---|---|---|---|---|---|
| Cassete Inverter | 24.000 | Quente-frio | TAC-24CHSG/CT-INV | null | MÉDIA | TCL.com |
| Cassete Inverter | 36.000 | Frio | TAC-36CSG/CT-INV (R-32) | null | MÉDIA | TCL.com |
| Cassete Inverter | 36.000 | Quente-frio | TAC-36CSA/CT-INV | null | MÉDIA | TCL.com |

### 2.3 Piso-Teto (inverter)

| Linha | BTU | Ciclo | Código modelo | Foto (CDN) | Confiança | Fonte |
|---|---|---|---|---|---|---|
| Piso-Teto Inverter | 36.000 | Quente-frio | TAC-36CSA/CF-INV | null | MÉDIA | TCL.com |
| Piso-Teto Inverter R-32 | 36.000 | Quente-frio | TAC-36CSG/CF-INV | null | MÉDIA | TCL.com |

### 2.4 Multi-Split

| Linha | BTU | Ciclo | Código modelo | Foto | Confiança | Fonte |
|---|---|---|---|---|---|---|
| Multi-Split (linha existe no BR) | 9.000–55.000 (faixa) | — | (códigos não confirmados) | null | BAIXA | TCL.com (página existe, SKUs não capturados) |

> LACUNA: a linha Multi-Split aparece no site TCL Brasil mas não foi possível capturar códigos/BTU por evaporadora nesta passada.

---

## 3. Códigos de erro

> Cruzamento: nomenclatura idêntica entre **tudosobreac.com.br** (lista T-Pro 2.0) e **webarcondicionado.com.br** (página de códigos TCL); a tabela detalhada veio de tudosobreac. **Komeco** (assistência técnica TCL no BR) publica o "Guia de Reparo Condicionador de Ar Inverter" para a mesma família — confirma o padrão E-series (falha) / P-series (proteção) / CL (manutenção). Confiança geral: **MÉDIA-ALTA** (texto de portal técnico, não o manual oficial PDF legível).
> Convenção: E = falha de componente/sensor · P = proteção automática (muitas auto-recuperam) · CL = alerta de manutenção.

| code | title | description | diagnosis | component | confiança |
|---|---|---|---|---|---|
| E0 | Falha de comunicação interna/externa | Ausência de sinal entre placa da evaporadora e condensadora | Conferir cabos de interligação (1,2,3); verificar LED da condensadora; trocar módulo de potência se tensão 220V OK | Circuito de comunicação | MÉDIA |
| E1 | Sensor de temperatura ambiente | Termistor de ar interno defeituoso/desconectado | Conferir conector na placa; medir resistência (~5kΩ a 25°C); trocar sensor | Termistor ambiente interno | MÉDIA |
| E2 | Sensor de serpentina (evaporadora) | Sensor da serpentina interna rompido; afeta anticongelamento/desumidificação | Conferir fixação na serpentina; medir resistência; trocar se aberto/curto | Termistor serpentina interna | MÉDIA |
| E3 | Sensor de temperatura da condensadora | Termistor da serpentina externa falhou | Conferir conector CN1 da placa externa; medir resistência; pode auto-recuperar | Termistor serpentina externa | MÉDIA |
| E4 | Falha geral do sistema | Funcionamento anormal do circuito de refrigeração | Verificar carga R-32; inspecionar válvula de expansão; checar restrições; requer instrumentação | Circuito de refrigeração | MÉDIA |
| E5 | Configuração de modelo / EEPROM | Placa não reconhece configuração do modelo; memória corrompida | Reenergizar; conferir chip EEPROM; trocar placa principal se persistir | Memória EEPROM | MÉDIA |
| E6 | Falha do motor do ventilador interno | Motor turbina não responde; bloqueio mecânico, capacitor ou driver | Checar bloqueios; medir resistência da bobina; trocar placa/motor | Motor ventilador interno | MÉDIA |
| E7 | Sensor de temperatura externa | Termistor de ar externo falhou | Conferir conector e integridade na condensadora; trocar se curva anormal | Termistor ambiente externo | MÉDIA |
| E8 | Sensor de descarga do compressor | Termistor na saída de gás quente do compressor falhou (sem proteção térmica) | Conferir sensor/conector da linha de descarga; trocar; não operar com código (risco de queima) | Termistor linha de descarga | MÉDIA |
| E9 | Falha do módulo de potência (IPM) | Módulo inversor do compressor falhou; LED anormal | Checar LED do IPM; se placa-fonte pisca e IPM não, trocar IPM; verificar conexões | Módulo de potência inverter | MÉDIA |
| EA | Falha do sensor de corrente | Sensor de corrente do compressor com defeito; compromete proteção de sobrecorrente | Checar conectores do IPM; medir U/V/W (>DC 2,5V ±0,2V); trocar IPM/PCB | Sensor de corrente / IPM | MÉDIA |
| EC | Falha de comunicação da condensadora | Falha entre placa-fonte e módulo IPM externo | Verificar conector CN5 entre placa-fonte e IPM; reconectar; trocar placa-fonte/IPM | Comunicação condensadora | MÉDIA |
| EE | Falha de EEPROM (firmware) | Erro de leitura/corrupção da memória de parâmetros | Reenergizar após 5 min; conferir chip; geralmente trocar placa de controle | Chip EEPROM | MÉDIA |
| EF | Falha do motor do ventilador externo (DC) | Ventilador da condensadora não funciona; superaquecimento por falta de dissipação | Checar bloqueio mecânico; testar capacitor; trocar motor/placa | Motor ventilador externo DC | MÉDIA |
| EH | Sensor de sucção do compressor | Termistor da temperatura de retorno (entrada do compressor) falhou; afeta superaquecimento | Conferir sensor/conector da linha de sucção; trocar se resistência fora da faixa | Termistor linha de sucção | MÉDIA |
| EP | Atuação do termostato/bimetálico do topo do compressor | Pressostato ou chave bimetálica do topo atuou por superaquecimento | Conferir conector CN3 da placa-fonte; modelos 1–1.5P sem chave usam jumper; investigar causa do superaquecimento | Proteção térmica do compressor | MÉDIA |
| EU | Falha do sensor de tensão | Sensor de tensão de entrada ou placa-fonte com defeito | Medir tensão (198–242V); se normal e código persiste, trocar placa-fonte | Sensor de tensão / placa-fonte | MÉDIA |
| P1 | Proteção de sub/sobretensão | Tensão fora da faixa segura (198–242V p/ 220V) | Medir tensão na unidade externa; se fora, acionar concessionária; se OK, trocar placa-fonte | Proteção (auto-recupera) | MÉDIA |
| P2 | Proteção de sobrecorrente | Corrente do compressor/circuito acima do limite; motor travado, capacitor ou IPM | Checar bloqueio/capacitor do ventilador externo; trocar componente; pode indicar IPM | Proteção (crítica — técnico) | MÉDIA |
| P4 | Proteção de superaquecimento de descarga | Temperatura do gás na saída do compressor acima do limite | Verificar entrada/saída de ar da condensadora; checar ventilador externo; verificar carga | Proteção (auto-recupera) | MÉDIA |
| P5 | Proteção de subresfriamento (frio) | Serpentina interna abaixo do mínimo (risco de congelar); filtro sujo/fluxo bloqueado | Limpar filtro; remover obstruções; evitar operar abaixo de 18°C ambiente | Proteção (usuário) | MÉDIA |
| P6 | Proteção superaquecimento serpentina externa (frio) | Serpentina da condensadora acima do limite; falha de dissipação ou carga | Verificar ventilação da condensadora; remover obstruções; checar carga | Proteção (crítica — técnico) | MÉDIA |
| P7 | Proteção de superaquecimento (modo quente) | Serpentina interna excessiva em bomba de calor; fluxo bloqueado | Verificar filtro/saída de ar; checar sensor da serpentina interna; chamar assistência se recorrente | Proteção (crítica — técnico) | MÉDIA |
| P9 | Proteção do drive inverter (software) | Software do inverter detectou condição anormal; comum em reinício imediato | Aguardar ≥3 min antes de religar; conferir conexões L/N internas e externas; trocar IPM se persistir | Proteção (auto-recupera) | MÉDIA |
| CL | Alerta de limpeza do filtro | Alerta automático de manutenção após 500h acumuladas (não é falha) | Limpar filtro (sabão neutro + água); religar (controle/disjuntor); reseta sozinho | Manutenção (informativo) | MÉDIA |

> Suporte oficial citado: TCL SEMP CAC — 0800 7367 825.
> LACUNA: lista não confirmada contra o manual oficial PDF da TCL (PDF da Komeco veio como binário ilegível nesta passada). Pode haver códigos adicionais por linha/modelo.

---

## 4. Manuais

| Documento | URL | Confiança |
|---|---|---|
| Guia de Reparo — Condicionador de Ar Inverter (Komeco / assistência TCL, BT001-20) | http://www.komeco.com.br/portaltecnico/LINHA%20DE%20CONDICIONADORES%20DE%20AR/TCL/Boletim%20Tecnico/BT001-20%20GUIA%20DE%20REPARO%20CONDICIONADOR%20DE%20AR%20INVERTER.pdf | ALTA (PDF existe, ~356 KB) |
| Página de manuais TCL (índice) | https://www.webarcondicionado.com.br/manual-do-ar-condicionado-tcl | MÉDIA |

> LACUNA: não localizado nesta passada o link direto do PDF do **manual do proprietário** por modelo no site oficial TCL/SEMP; recomendável buscar em tcl.com/br por SKU.

---

## 5. Fontes

- TCL Brasil (oficial): https://www.tcl.com/br/pt/air-conditioners/inverter , .../split-cassete-inverter , .../piso-teto-inverter , .../multi-split
- Leveros (e-commerce HVAC): páginas T-Pro 2.0 9/12/18/24k
- Martinello Eletrodomésticos (e-commerce): TAC-12CTG2 e TAC-18CTG2 (foto CDN confirmada p/ 12k)
- tudosobreac.com.br: lista detalhada de códigos de erro T-Pro 2.0
- webarcondicionado.com.br: página de códigos de erro e índice de manuais TCL
- Komeco (assistência técnica TCL): Guia de Reparo Inverter (BT001-20)
- Wikimedia Commons: File:Logo_of_the_TCL_Corporation.svg (logo)

## LACUNAS (resumo)

1. **Fotos por CDN**: só confirmada a do TAC-12CTG2 (Martinello). Demais SKUs ficaram `null` — preencher via página de produto de cada SKU.
2. **Multi-Split**: linha existe, mas códigos/BTU por evaporadora não capturados.
3. **Manual do proprietário por modelo (PDF oficial)**: não localizado link direto; o PDF Komeco veio como binário ilegível (não foi possível conferir texto), mas a URL é válida.
4. **Códigos de erro**: confiança MÉDIA — derivados de portais técnicos, não validados linha-a-linha contra o manual oficial. Possível variação por linha (A2, FreshIN, BreezeIN).
5. **Refrigerante por SKU**: R-32 confirmado nas linhas atuais; SKUs mais antigos podem usar R-410A (não verificado individualmente).
6. **Códigos de cassete/piso-teto** com barra (ex.: `TAC-36CSA/CF-INV`) vêm de 1 fonte (TCL.com) — confiança MÉDIA.
