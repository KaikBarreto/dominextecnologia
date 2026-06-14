# Catálogo GLOBAL de equipamentos — espelho do semeado

> Catálogo GLOBAL (tabelas **sem** `company_id`): `equipment_brands`, `equipment_model_categories`, `equipment_models`, `equipment_error_codes`.
> Não confundir com `equipment_categories` (tabela MULTI-TENANT de cliente — **não tocada**).
> Categoria usada nos modelos hi-wall: **Split Hi-Wall**.
> `solution` fica NULL em todos os códigos novos; `description = title` quando não há descrição própria; `image_url` NULL (sem foto confiável).

Atualizado em 2026-06-14 pelas migrations `20260614170000_equipment_catalog_seed_six_brands.sql` e `20260614190000_equipment_catalog_seed_nine_brands.sql`.

> Categorias GLOBAIS agora: **Split Hi-Wall, Cassete, Piso-Teto, Multi-Split** (as 3 últimas criadas na seed de 9 marcas).
> A partir da seed de 9 marcas, os modelos passam a ter nomes DESCRITIVOS (tipo + linha + BTU) e podem ter `image_url` quando havia foto CDN verificada na pesquisa.

## Totais atuais
- Marcas: **17** (Gree, Midea + 6 + 9 novas). Whirlpool **não** entra (não vende AC no BR).
- Categorias: **4** (Split Hi-Wall, Cassete, Piso-Teto, Multi-Split)
- Modelos: **60**
- Códigos de erro: **261**

| Marca | sort | Logo | Modelo(s) | Manual | Códigos |
|---|---|---|---|---|---|
| Gree | 1 | — | Split Hi-Wall Inverter | — | 6 |
| Midea | 2 | — | Split Inverter (Springer Midea) | — | 12 |
| Samsung | 3 | ✓ | Split Inverter (WindFree / Digital Inverter) | ✓ | 22 |
| LG | 4 | ✓ | Split Dual Inverter (linha geral) | ✓ | 20 |
| Daikin | 5 | ✓ | EcoSwing / SkyAir (linha geral) | ✓ | 30 |
| Consul | 6 | ✓ | Bem Estar / Maxi Inverter (linha geral) | ✓ | 7 |
| Electrolux | 7 | ✓ | Color Adapt / Inverter (linha geral) | ✓ | 6 |
| Fujitsu | 8 | ✓ | Airstage Inverter (linha geral) | ✓ | 23 |
| Brastemp | 9 | ✓ | 5 (Hi-Wall on/off Clean/ative!) | ✓ | 15 (= plataforma Consul) |
| Philco | 10 | ✓ | 7 (Hi-Wall/Cassete/Piso-Teto Eco Inverter) | — | 5 (plataforma Inverter F1–F5) |
| Komeco | 11 | ✓ | 7 (Hi-Wall KOHI/KAC, Cassete, Piso-Teto) | ✓ | 28 (LX-HX E1–E8 + KOHI 1HX F/P) |
| Agratto | 12 | ✓ | 9 (Hi-Wall NEO/ZEN/FIT, Cassete, Piso-Teto) | ✓ | 19 (família ICS NEO Inverter) |
| Carrier | 13 | ✓ | 6 (Hi-Wall X-Power, Cassete, Piso-Teto) | ✓ | 12 (= tabela Midea global) |
| Springer | 14 | ✓ | 4 (Hi-Wall AirVolution/Xtreme, Piso-Teto, Multi) | ✓ | 12 (= tabela Midea global) |
| TCL | 15 | ✓ | 7 (Hi-Wall T-Pro 2.0, Cassete, Piso-Teto) | — | 25 (E/P-series + CL) |
| Hitachi | 16 | ✓ | 5 (Hi-Wall airHome 600) | ✓ | 9 (Família B = proteção) |
| Elgin | 17 | ✓ | 2 (Hi-Wall Eco Inverter II, Piso-Teto Plus) | — | 10 (Eco Plus II) |

Notas das 9 novas:
- **Brastemp**: só Split Hi-Wall on/off (Clean + ative!); reutiliza os códigos da **Consul** (mesma fabricante Whirlpool LatAm). 1 modelo com foto CDN (BBV12BB).
- **Carrier/Springer**: plataforma **Midea**; códigos inverter = tabela Midea global onde a pesquisa confirmou coincidência.
- **Fotos (`image_url`)**: preenchidas só onde a pesquisa tinha CDN verificada — Brastemp BBV12BB, Philco PAC12FB/Cassete/Piso-Teto, Komeco KOHI, Agratto NEO 9k/Cassete, Carrier X-Power 9k/12k, Springer Multi 42k, TCL 12k, Hitachi airHome 9k/12k, Elgin 12k/24k. Demais NULL.

---

## SAMSUNG — Split Inverter (WindFree / Digital Inverter)
Logo: Samsung wordmark (Wikimedia). Manual: download center oficial Samsung (AR9500T WindFree, PT).

| Código | Título | Componente |
|---|---|---|
| E101 | Erro de comunicação interna↔externa | Comunicação |
| E121 | Sensor de temperatura ambiente (interna) | Evaporadora |
| E122 | Sensor da serpentina interna | Evaporadora |
| E154 | Erro do ventilador interno | Evaporadora |
| E162 | Erro de EEPROM (placa interna) | Placa interna |
| E203 | Comunicação inverter↔micom | Placa inverter |
| E221 | Sensor de temperatura externa | Condensadora |
| E231 | Sensor do condensador | Condensadora |
| E251 | Sensor de descarga | Compressor |
| E416 | Sobretemperatura de descarga | Compressor |
| E422 | EEV / válvula fechada | Sistema |
| E458 | Erro do ventilador externo | Condensadora |
| E461 | Falha de partida do compressor | Compressor |
| E462 | Sobrecorrente de entrada (AC) | Inverter |
| E464 | Sobrecorrente do IPM | Placa inverter |
| E466 | Tensão do barramento DC | Placa inverter |
| E500 | Sobretemperatura do dissipador | Placa inverter |
| E554 | Vazamento de gás | Sistema |
| E1/21 | Sensor de ambiente (modelos básicos) | Evaporadora |
| E1/22 | Sensor da serpentina (modelos básicos) | Evaporadora |
| E1/54 | Ventilador/capacitor (modelos básicos) | Evaporadora |
| E1/63 | EEPROM (modelos básicos) | Placa interna |

## LG — Split Dual Inverter (linha geral)
Logo: LG 2023 (Wikimedia). Manual: suporte oficial LG (LSUH2423RM1).

| Código | Título | Componente |
|---|---|---|
| CH01 | Sensor de temperatura ambiente interno | Evaporadora |
| CH02 | Sensor de tubo/externo | Sistema |
| CH04 | Sensor do dissipador ou boia de dreno | Sistema |
| CH05 | Comunicação interna↔externa | Comunicação |
| CH06 | Pico de corrente DC (inverter) | Placa inverter |
| CH07 | Modos conflitantes (multi) / sobrecorrente do compressor | Compressor |
| CH10 | Trava do fan BLDC / descarga alta | Evaporadora |
| CH21 | Sobrecorrente do compressor / IPM | Placa inverter |
| CH23 | Tensão do barramento DC baixa | Placa inverter |
| CH26 | Posição do compressor DC | Compressor |
| CH32 | Temperatura de descarga muito alta | Sistema |
| CH34 | Alta pressão / sobreaquecimento | Condensadora |
| CH41 | Sensor de descarga (inverter) | Compressor |
| CH44 | Sensor de ar externo | Condensadora |
| CH45 | Sensor do condensador | Condensadora |
| CH46 | Sensor de sucção | Sistema |
| CH60 | Erro de checksum da EEPROM | Placa interna |
| CH62 | Temperatura do dissipador alta | Placa inverter |
| CH67 | Trava do fan BLDC externo | Condensadora |
| CL | Trava de segurança (Child Lock) — não é falha | (sem componente) |

## DAIKIN — EcoSwing / SkyAir (linha geral)
Logo: Daikin (logodownload.org). Manual: Daikin EcoSwing Gold (Leveros Integra).

| Código | Título | Componente |
|---|---|---|
| A1 | Anomalia na placa interna | Placa interna |
| A3 | Falha no sistema de dreno | Evaporadora |
| A5 | Anticongelamento / alta pressão | Evaporadora |
| A6 | Motor do ventilador interno | Evaporadora |
| A9 | Válvula de expansão eletrônica | Sistema |
| C4 | Termistor do tubo de líquido | Evaporadora |
| C5 | Termistor do tubo de gás | Evaporadora |
| C9 | Termistor de ar de sucção (ambiente) | Evaporadora |
| E1 | Defeito na placa externa | Condensadora |
| E3 | Pressostato de alta pressão | Condensadora |
| E4 | Pressostato de baixa pressão | Condensadora |
| E5 | Bloqueio/superaquecimento do compressor inverter | Compressor |
| E6 | Falha de partida/sobrecorrente do compressor | Compressor |
| E7 | Motor do ventilador externo | Condensadora |
| E8 | Sobrecorrente do compressor inverter | Placa inverter |
| EA | Válvula de 4 vias (reversora) | Sistema |
| F3 | Temperatura do tubo de descarga | Compressor |
| F6 | Alta pressão / excesso de gás | Condensadora |
| H6 | Sensor de posição do compressor | Compressor |
| H8 | Sistema de entrada (CT) do compressor | Placa inverter |
| H9 | Termistor de ar externo | Condensadora |
| J3 | Termistor do tubo de descarga | Compressor |
| J6 | Termistor do trocador de calor | Condensadora |
| L4 | Temperatura do dissipador do inverter | Placa inverter |
| L5 | Sobrecorrente instantânea do inverter | Placa inverter |
| P4 | Sensor de temperatura do dissipador | Placa inverter |
| U0 | Falta de refrigerante | Sistema |
| U2 | Tensão / queda de energia | Energia |
| U4 | Transmissão interna↔externa | Comunicação |
| UA | Combinação imprópria interna/externa | Sistema |

## CONSUL — Bem Estar / Maxi Inverter (linha geral)
Logo: Consul (logodownload.org). Manual: split HW Inverter Consul CBF09EBBNA (Central Ar).
Nota: acesso ao código no controle = apertar "Sono" 4x. Plataforma compartilhada com Brastemp/Whirlpool.

| Código | Título | Componente |
|---|---|---|
| E2 | Sensor da serpentina externa | Condensadora |
| E4 | Motor do ventilador interno | Evaporadora |
| E05 | Proteção do módulo IPM | Placa inverter |
| E06 | Tensão de alimentação | Energia |
| E42 | Proteção de subresfriamento | Sistema |
| E43 | Proteção de superaquecimento | Sistema |
| EA | Comunicação interface↔placa interna | Comunicação |

## ELECTROLUX — Color Adapt / Inverter (linha geral)
Logo: Electrolux (companieslogo.com). Manual: Electrolux UI (659201umPT).
Nota: plataforma OEM — significado pode variar por série; confirmar no manual do modelo específico.

| Código | Título | Componente |
|---|---|---|
| F1 | Sensor de temperatura ambiente | Evaporadora |
| F2 | Sensor do evaporador | Evaporadora |
| H6 | Motor do ventilador (evaporadora) | Evaporadora |
| C5 | Tampa do jumper | Placa interna |
| U8 | Motor do ventilador (zero-crossing) | Evaporadora |
| E5 | Proteção elétrica (sobrecorrente/baixa tensão) | Energia |

## FUJITSU — Airstage Inverter (linha geral)
Logo: Fujitsu (Wikimedia). Manual: Fujitsu HW Airstage (Leveros Integra). Códigos: guia oficial Fujitsu General.

| Código | Título | Componente |
|---|---|---|
| 11 | Comunicação serial interna↔externa | Comunicação |
| 12 | Comunicação do controle com fio | Comunicação |
| 41 | Termistor de ambiente (interna) | Evaporadora |
| 42 | Termistor da serpentina (interna) | Evaporadora |
| 51 | Motor do ventilador interno | Evaporadora |
| 62 | Placa principal da externa | Placa externa |
| 63 | Erro do inverter | Placa inverter |
| 64 | Filtro ativo / PFC | Placa inverter |
| 65 | Erro do IPM | Placa inverter |
| 71 | Termistor de descarga | Compressor |
| 72 | Termistor do compressor | Compressor |
| 73 | Termistor do trocador (tubo) | Condensadora |
| 74 | Termistor da externa (ambiente) | Condensadora |
| 77 | Termistor do dissipador (heat sink) | Placa inverter |
| 84 | Sensor de corrente | Placa inverter |
| 86 | Pressostato | Sistema |
| 94 | Sobrecorrente | Condensadora |
| 95 | Controle do compressor (posição do rotor) | Compressor |
| 97 | Motor do ventilador externo | Condensadora |
| 99 | Válvula de 4 vias | Sistema |
| A1 | Temperatura de descarga alta | Compressor |
| A3 | Temperatura do compressor alta | Compressor |
| A5 | Baixa pressão | Sistema |

## BRASTEMP — Split Hi-Wall on/off (plataforma Consul)
Logo: Brastemp (Wikimedia). Códigos ligados ao modelo Clean 12k; equivalência Consul confirmada (mesma fabricante). "E__" no painel; numéricos via Sleep×4.

| Código | Título | Componente |
|---|---|---|
| E2 | Superaquecimento (unidade externa) | Condensadora |
| E4 | Falha do ventilador interno | Evaporadora |
| E6 | Tensão de alimentação fora do especificado | Energia |
| E42 | Proteção de subresfriamento | Sistema |
| E43 | Proteção de superaquecimento | Sistema |
| EA | Erro de comunicação | Comunicação |
| 00 | Falha de comunicação / alimentação | Comunicação |
| 1 | Sensor da serpentina externa | Condensadora |
| 2 | Sensor de descarga (externa) | Compressor |
| 5 | Proteção do módulo IPM | Placa inverter |
| 6 | Proteção de tensão | Energia |
| 7 | Comunicação interna↔externa | Comunicação |
| 13 | Proteção de temperatura do compressor | Compressor |
| 15 | Sensor de temperatura do compressor | Compressor |
| 36 | Comunicação interna↔externa (com atraso) | Comunicação |

## PHILCO — Eco Inverter (plataforma Inverter genérica)
Logo: Philco (Wikimedia). Códigos F1–F5 ligados ao Eco Inverter 12k. (Conjunto E1–E10 do modelo ITQFM9W e plataformas FM/FM2/FM4 ficaram fora — divergem por placa, confiança média/baixa.)

| Código | Título | Componente |
|---|---|---|
| F1 | Falha sensor de temperatura (unidade interna) | Evaporadora |
| F2 | Falha sensor de temperatura (unidade externa) | Condensadora |
| F3 | Falha sensor do evaporador (interna) | Evaporadora |
| F4 | Falha sensor do condensador (externa) | Condensadora |
| F5 | Falha sensor de descarga do compressor | Compressor |

## KOMECO — linha LX-HX (E1–E8) + KOHI 1HX (F/P)
Logo: Komeco (site oficial). Manuais oficiais de auto-diagnóstico (LX-HX e KOHI 1HX). E1–E8 ligados ao KAC on/off; F/P ligados ao KOHI 1HX inverter.

| Código | Título | Componente |
|---|---|---|
| DF | Descongelamento (degelo) | Condensadora |
| E1 | Falha sensor do condensador | Condensadora |
| E2 | Falha sensor ambiente | Evaporadora |
| E3 | Falha sensor do evaporador | Evaporadora |
| E4 | Falha na unidade externa | Condensadora |
| E5 | Falha motor ventilador interno | Evaporadora |
| E6 | Falha na placa eletrônica principal | Placa interna |
| E7 | Comunicação / alta pressão e corrente | Comunicação |
| E8 | Falha na unidade interna (aumento de pressão) | Evaporadora |
| F1 | Falha de comunicação | Comunicação |
| F2 | Sensor ambiente (interna) | Evaporadora |
| F3 | Sensor do trocador (interna) | Evaporadora |
| F4 | Motor do ventilador (interna) | Evaporadora |
| F5 | PCB módulo inversor (IPM) | Placa inverter |
| F6 | Sensor ambiente (externa) | Condensadora |
| F7 | Sensor do trocador (externa) | Condensadora |
| F9 | Sensor de descarga do compressor | Compressor |
| FC | Acionamento anormal do compressor | Compressor |
| P2 | Superaquecimento do IPM / sobrecorrente | Placa inverter |
| P3 | Proteção de sobrecorrente | Placa inverter |
| P4 | Proteção do compressor (alta temp. descarga) | Compressor |
| P5 | Superaquecimento do topo do compressor | Compressor |
| P6 | Proteção de temperatura (sucção) | Sistema |
| P7 | Proteção de baixa/alta tensão | Energia |
| P8 | Proteção de baixa pressão de sucção | Sistema |
| P9 | Proteção de alta pressão de descarga | Sistema |
| PA | Proteção de alta temp. do trocador (externa) | Condensadora |
| PC | Proteção de temp. ambiente excessiva (externa) | Condensadora |

## AGRATTO — família ICS/ICST (NEO Inverter)
Logo: Agratto (SeekLogo). Códigos ligados ao NEO Inverter 9k (fonte ClimaServices/CentralAr).

| Código | Título | Componente |
|---|---|---|
| E1 | Sensor de temperatura ambiente | Evaporadora |
| E2 | Sensor da bobina externa | Condensadora |
| E3 | Sensor da bobina interna | Evaporadora |
| E4 | Motor PG da unidade interna | Evaporadora |
| E5 | Comunicação interna↔externa | Comunicação |
| F0 | Motor CC da unidade externa | Condensadora |
| F1 | Módulo IPM | Placa inverter |
| F2 | Módulo PFC | Placa inverter |
| F3 | Compressor | Compressor |
| F4 | Sensor de descarga (externa) | Compressor |
| F5 | Topo do compressor | Compressor |
| F6 | Sensor ambiente externo | Condensadora |
| F7 | Tensão | Energia |
| F9 | EEPROM da unidade externa | Placa inverter |
| FA | Sensor de sucção | Sistema |
| P4 | Sobrecarga | Compressor |
| P5 | Temperatura de descarga | Compressor |
| P6 | Alta temperatura | Sistema |
| P7 | Congelamento | Sistema |

## CARRIER e SPRINGER — tabela Midea global (inverter)
Logos: Carrier (Wikimedia), Springer (logodownload.org). Grupo Midea Carrier — códigos inverter coincidem com a Midea. Carrier ligado ao X-Power 9k; Springer ao AirVolution Connect 12k (mesma tabela).

| Código | Título | Componente |
|---|---|---|
| E0 | Erro de EEPROM (interna) | Placa interna |
| E1 | Comunicação interna↔externa | Comunicação |
| E2 | Sinal de cruzamento por zero | Energia |
| E3 | Ventilador interno fora de controle | Evaporadora |
| EC | Fuga de gás refrigerante | Sistema |
| F1 | Sensor externo (ambiente T4) | Condensadora |
| F2 | Sensor da serpentina condensadora (T3) | Condensadora |
| F3 | Sensor de descarga (TP) | Compressor |
| F4 | EEPROM da unidade externa | Placa inverter |
| P0 | Módulo IPM / IGBT | Placa inverter |
| P1 | Sub/sobretensão | Energia |
| P4 | Drive do compressor inverter | Compressor |

## TCL — T-Pro 2.0 (E-series falha / P-series proteção / CL)
Logo: TCL (Wikimedia). Códigos ligados ao T-Pro 2.0 12k (fonte tudosobreac + WebArCondicionado).

| Código | Título | Componente |
|---|---|---|
| E0 | Falha de comunicação interna/externa | Comunicação |
| E1 | Sensor de temperatura ambiente | Evaporadora |
| E2 | Sensor da serpentina (evaporadora) | Evaporadora |
| E3 | Sensor de temperatura da condensadora | Condensadora |
| E4 | Falha geral do sistema | Sistema |
| E5 | Configuração de modelo / EEPROM | Placa interna |
| E6 | Falha do motor do ventilador interno | Evaporadora |
| E7 | Sensor de temperatura externa | Condensadora |
| E8 | Sensor de descarga do compressor | Compressor |
| E9 | Falha do módulo de potência (IPM) | Placa inverter |
| EA | Falha do sensor de corrente | Placa inverter |
| EC | Falha de comunicação da condensadora | Comunicação |
| EE | Falha de EEPROM (firmware) | Placa interna |
| EF | Falha do motor do ventilador externo (DC) | Condensadora |
| EH | Sensor de sucção do compressor | Sistema |
| EP | Atuação do termostato do topo do compressor | Compressor |
| EU | Falha do sensor de tensão | Energia |
| P1 | Proteção de sub/sobretensão | Energia |
| P2 | Proteção de sobrecorrente | Compressor |
| P4 | Proteção de superaquecimento de descarga | Compressor |
| P5 | Proteção de subresfriamento (frio) | Evaporadora |
| P6 | Proteção superaquecimento da serpentina externa | Condensadora |
| P7 | Proteção de superaquecimento (modo quente) | Evaporadora |
| P9 | Proteção do drive inverter (software) | Placa inverter |
| CL | Alerta de limpeza do filtro | Evaporadora |

## HITACHI — airHome 600 (Família B = proteção)
Logo: Hitachi (site oficial). Códigos ligados ao airHome 600 9k. Usada a **Família B** (proteção) como default do .md; E4/E7/E8 (conflito A/B = baixa) ficaram de fora.

| Código | Título | Componente |
|---|---|---|
| E0 | Falha de comunicação interna↔externa | Comunicação |
| E1 | Proteção de alta pressão do compressor | Compressor |
| E2 | Proteção anti-congelamento | Evaporadora |
| E3 | Proteção de baixa pressão / falta de gás | Sistema |
| E5 | Erro de inverter / sobrecorrente | Placa inverter |
| E6 | Falha de comunicação | Comunicação |
| 01 | Bóia / nível de água no dreno | Sistema |
| 03 | Anomalia interna↔externa (comunicação/fiação) | Comunicação |
| CL | Aviso de manutenção (não é erro) | Evaporadora |

## ELGIN — Eco Plus II (Split Hi-Wall)
Logo: Elgin (loja VTEX oficial). Códigos ligados ao Eco Inverter II Wi-Fi 12k (fonte suporte oficial Elgin). A tabela Eco Life Inverter (E0/F/P) não foi semeada para evitar conflito de mesmo code/modelo — fica de lacuna.

| Código | Título | Componente |
|---|---|---|
| E1 | Falha no EEPROM (interna) | Placa interna |
| E2 | Erro de sinal do cruzamento zero | Energia |
| E3 | Mau funcionamento do motor ventilador interno | Evaporadora |
| E5 | Falha sensor de temperatura ambiente interno | Evaporadora |
| E6 | Falha sensor de temperatura do evaporador | Evaporadora |
| E7 | Falha sensor de temperatura externo | Condensadora |
| E8 | Mau funcionamento do motor ventilador externo | Condensadora |
| E9 | Falha de comunicação entre unidades | Comunicação |
| EC | Detecção de vazamento de refrigerante | Sistema |
| P6 | Proteção de pressão | Compressor |
