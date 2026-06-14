# Catálogo GLOBAL de equipamentos — espelho do semeado

> Catálogo GLOBAL (tabelas **sem** `company_id`): `equipment_brands`, `equipment_model_categories`, `equipment_models`, `equipment_error_codes`.
> Não confundir com `equipment_categories` (tabela MULTI-TENANT de cliente — **não tocada**).
> Categoria usada nos modelos hi-wall: **Split Hi-Wall**.
> `solution` fica NULL em todos os códigos novos; `description = title` quando não há descrição própria; `image_url` NULL (sem foto confiável).

Atualizado em 2026-06-14 pela migration `20260614170000_equipment_catalog_seed_six_brands.sql`.

## Totais atuais
- Marcas: 8 (Gree, Midea + 6 novas)
- Modelos: 8 (1 por marca)
- Códigos de erro: 126 (18 Gree/Midea pré-existentes + 108 novos)

| Marca | sort | Logo | Modelo principal | Manual | Códigos |
|---|---|---|---|---|---|
| Gree | 1 | — | Split Hi-Wall Inverter | — | 6 |
| Midea | 2 | — | Split Inverter (Springer Midea) | — | 12 |
| Samsung | 3 | ✓ | Split Inverter (WindFree / Digital Inverter) | ✓ | 22 |
| LG | 4 | ✓ | Split Dual Inverter (linha geral) | ✓ | 20 |
| Daikin | 5 | ✓ | EcoSwing / SkyAir (linha geral) | ✓ | 30 |
| Consul | 6 | ✓ | Bem Estar / Maxi Inverter (linha geral) | ✓ | 7 |
| Electrolux | 7 | ✓ | Color Adapt / Inverter (linha geral) | ✓ | 6 |
| Fujitsu | 8 | ✓ | Airstage Inverter (linha geral) | ✓ | 23 |

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
