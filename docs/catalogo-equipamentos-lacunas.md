# Catálogo GLOBAL de equipamentos — mapa de lacunas

> Companheiro de `catalogo-equipamentos.md`. Lista só o que AINDA falta / tem confiança baixa.
> Atualizado em 2026-06-15 (pós ACJs de janela + tabela Hitachi de fontes secundárias).

## 0) Estado atual
- 17 marcas, **5 categorias** (Split Hi-Wall, Cassete, Piso-Teto, Multi-Split, Janela (ACJ)), **110 modelos**.
- **Fotos: 110/110** — todas no bucket próprio `equipment-catalog` (path `models/<id>.<ext>`). Sem hotlink de terceiro.
- **Manuais: 105/110** — em PDF no `equipment-catalog`. Faltam 5 (4 Philco ACJ + 1 Consul ACJ Inverter — sem PDF público; mostram badge "Manual Indisponível").
- **Códigos de erro:** todos os splits/cassete/piso-teto têm; os **26 ACJ de janela NÃO têm** (são mecânicos/eletrônicos simples, sem display de código — esperado). Brastemp "ative!" (on/off) idem.
- **Hitachi airHome 600:** só o código `EA` é confirmado no manual oficial; os demais (01/03/06/09/10/13) vêm de docs Hitachi RAC da MESMA plataforma (fontes secundárias, confiança média) — registrados pra dar partida ao técnico, validar com a rede autorizada antes de tratar como definitivos.
- **Logos** — re-hospedados (`logos/<slug>.png`); Agratto/Philco/Komeco corrigidos. (Demais marcas com logo_url externo estável — re-hospedar quando der.)
- Bucket `equipment-catalog`: público (leitura), escrita só super_admin.

## 1) Entradas "linha geral" — RESOLVIDO (2026-06-15)
As 8 marcas que tinham 1 entrada genérica sem BTU (Gree, Midea, Consul, Daikin, Electrolux, Fujitsu, LG, Samsung) foram **expandidas em variantes por BTU** (9k/12k/18k/24k; Consul 9/12/18/22k), com SKU real, e cada variante reusa a foto + manual + tabela de códigos da linha. As genéricas foram removidas. 32 variantes criadas.
- Refinamento futuro (não-bloqueante): foto/manual hoje são compartilhados por linha (1 por marca, reusados entre BTUs — splits são visualmente idênticos). Se quiser foto/manual por SKU exato, é nova rodada de pesquisa.
- GC do Storage: as 8 fotos/manuais das genéricas removidas seguem no bucket nos paths com o id antigo (reusados pelas variantes) — NÃO limpar por "id de modelo órfão".

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
