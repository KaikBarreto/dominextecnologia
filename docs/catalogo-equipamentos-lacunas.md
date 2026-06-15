# Catálogo GLOBAL de equipamentos — mapa de lacunas

> Companheiro de `catalogo-equipamentos.md`. Lista só o que AINDA falta / tem confiança baixa.
> Atualizado em 2026-06-14 (pós re-hospedagem de fotos/manuais/logos no Storage próprio).

## 0) Estado atual
- 17 marcas, 4 categorias (Split Hi-Wall, Cassete, Piso-Teto, Multi-Split), 60 modelos, 261 códigos de erro.
- **Fotos: 60/60** — todas re-hospedadas no bucket próprio `equipment-catalog` (path `models/<id>.<ext>`). Sem hotlink de terceiro.
- **Manuais: 60/60** — todos em PDF re-hospedados no `equipment-catalog` (path `manuals/<id>.pdf`). Sem dependência de site de fabricante.
- **Logos** — re-hospedados (`logos/<slug>.png`); Agratto/Philco/Komeco corrigidos. (As demais marcas ainda têm logo_url externo estável — re-hospedar quando der.)
- Bucket `equipment-catalog`: público (leitura), escrita só super_admin.

## 1) Entradas "linha geral" sem BTU específico (PRIORIDADE)
8 marcas têm UMA entrada genérica de linha, SEM potência no nome (não aparecem no filtro de BTU, card sem selo de potência):
- **Gree** (Split Hi-Wall Inverter), **Midea** (Split Inverter Springer Midea), **Consul** (Bem Estar/Maxi), **Daikin** (EcoSwing/SkyAir), **Electrolux** (Color Adapt), **Fujitsu** (Airstage), **LG** (Dual Inverter), **Samsung** (WindFree/Digital Inverter).
- Ação sugerida: expandir cada uma em modelos POR BTU (9k/12k/18k/24k...), como as demais marcas — exige rodada de pesquisa por marca (códigos do modelo, códigos de erro por plataforma, foto e manual por BTU). Enquanto não expandir, esses 8 aparecem sem selo de potência.

## 2) Confiança / ressalvas de códigos de erro (mantidas)
- Brastemp = plataforma Consul (equivalência ALTA, texto exato merece 2ª fonte). `E5` Brastemp não semeado.
- Carrier/Springer = só tabela Midea inverter; convenção "pisca N vezes" e Cassete/Piso-Teto (40KVCB/42XQA/42BQA) não semeados.
- Hitachi E1–E8 têm conflito A/B entre fontes; E4/E7/E8 + F0–F2 fora. Validar contra HIOM-MSPAR001.
- Philco: só F1–F5 inverter genérica; E1–E10 do ITQFM9W e "EA" não entraram.
- Elgin: só Eco Plus II; Eco Life Inverter e linhas antigas (só imagem) fora.
- TCL: códigos de portais técnicos (média), não validados linha-a-linha.
- Komeco: Cassete/Piso-Teto trifásico só fonte secundária; Multi-Split sem dados.

## 3) Multi-Split — quase tudo em aberto
Só Springer tem 1 modelo Multi-Split. Demais marcas sem modelos/códigos de Multi-Split nas fontes públicas.

## 4) Categorias ainda ausentes
Existem 4 (Split Hi-Wall, Cassete, Piso-Teto, Multi-Split). Faltam (criar quando houver modelos): Janela, Portátil, Duto, Splitão, Cortina de Ar.

## 5) Observações de re-hospedagem
- Algumas fotos de modelos "linha geral" e variantes específicas usam imagem representativa da linha (não do SKU exato) — aceitável, marcado nas fontes.
- 2 pares de modelos compartilham a mesma imagem de origem (Agratto Piso-Teto 36k/55k; Brastemp Clean) — cada um tem seu próprio arquivo no bucket.
- Whirlpool = N/A no BR (não vende AC; opera via Brastemp/Consul). Não semear.
