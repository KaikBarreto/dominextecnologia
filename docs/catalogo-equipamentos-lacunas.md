# Catálogo GLOBAL de equipamentos — mapa de lacunas

> Companheiro de `catalogo-equipamentos.md`. Lista só o que AINDA falta / tem confiança baixa, pra priorizar próximas rodadas de curadoria.
> Atualizado em 2026-06-14 (pós-seed de 9 marcas, migration `20260614190000`).

## 0) Estado atual
- 17 marcas, 4 categorias (Split Hi-Wall, Cassete, Piso-Teto, Multi-Split), 60 modelos, 261 códigos de erro.
- O backlog de marcas (item 6 da versão anterior) está **zerado**: todas as marcas relevantes do BR foram semeadas. **Whirlpool é N/A** (não vende AC no BR — ver §6).

## 1) Fotos faltando (image_url = NULL)
A seed de 9 marcas preencheu foto onde havia CDN verificada. Ainda faltam fotos em:
- **Todos os modelos das 8 primeiras marcas** (Gree, Midea, Samsung, LG, Daikin, Consul, Electrolux, Fujitsu) — seguem sem `image_url`.
- Boa parte dos modelos por BTU das 9 novas (só ~13 modelos têm foto CDN). Sem foto, por marca:
  - Brastemp: 4 de 5 (só BBV12BB tem).
  - Philco: 4 de 7 (Hi-Wall 9k/12k IFM15 e 24k sem foto).
  - Komeco: 6 de 7 (só KOHI Inverter 9k tem).
  - Agratto: 7 de 9 (só NEO 9k e Cassete 36k têm).
  - Carrier: 4 de 6 (Cassete 36k, Piso-Teto e 18k sem foto).
  - Springer: 3 de 4 (só Multi 42k tem).
  - TCL: 6 de 7 (só T-Pro 12k tem).
  - Hitachi: 3 de 5 (18k/24k sem foto).
  - Elgin: 0 de 2 com lacuna (ambos têm foto). ✓

Ação sugerida: hospedar foto própria por modelo (evitar hotlink a vitrine de loja, que quebra). As URLs CDN semeadas (Zoom, VTEX de Friopecas/WebContinental/Leroy, Leveros, Centro Elétrico, fbits) podem expirar — re-hospedar.

## 2) Logos a validar / re-hospedar
- Gree e Midea seguem **sem logo**.
- Wikimedia (Brastemp, Philco, Carrier, TCL + Samsung/LG/Fujitsu) é estável.
- **Agregadores instáveis a re-hospedar**: Springer (logodownload.org), Agratto (SeekLogo — terceiro), Daikin/Consul (logodownload.org), Electrolux (companieslogo.com).
- **URLs versionadas/de site (risco de mudar em deploy)**: Komeco (wp-content), Hitachi (assets/logo.svg), Elgin (VTEX com versão `1.0.140` no path).

Ação sugerida: baixar e re-hospedar todos os logos em storage próprio.

## 3) Modelos sem manual
- **Gree**, **Midea** — sem manual.
- Das 9 novas, **sem manual_url**: Philco (links servlet.shepherd retornaram 404 em fetch isolado — não semeados), TCL (PDF Komeco veio binário ilegível), Elgin (sem URL oficial direta localizada).
- Manuais semeados de agregador podem mudar: Brastemp (webarcondicionado), Agratto (CentralAr/blob), Carrier (carrierdobrasil — oficial, ok), Springer (midea.com — oficial, ok), Komeco/Hitachi (oficiais, ok).

## 4) Confiança / ressalvas por marca (novas)
- **Brastemp** — códigos = plataforma Consul (equivalência ALTA), mas o texto exato por código merece 2ª fonte primária (PDF oficial) antes de tratar como ALTA. `E5` Brastemp NÃO foi semeado (sem definição confiável).
- **Carrier/Springer** — só a tabela Midea global (inverter) foi semeada. A convenção Carrier "antiga" (pisca N vezes: E1/E2/E3/E5/E6/EC/E9) NÃO entrou: E1 tem significado conflitante (EEPROM vs. falta de gás) → confiança baixa. Códigos Cassete/Piso-Teto (40KVCB / 42XQA / 42BQA) = fonte única, não semeados.
- **Hitachi** — E1–E8 têm **conflito A/B** entre fontes EN. Semeada só a Família B (proteção) nos códigos sem conflito forte; E4/E7/E8 e a tabela F0–F2 ficaram de fora (baixa). Validar contra o manual HIOM-MSPAR001.
- **Philco** — várias plataformas (FM/FM2/FM4/Inverter/ITQFM9W) com códigos divergentes; semeada só a F1–F5 (inverter genérica). E1–E10 do ITQFM9W e o erro real "EA" (Reclame Aqui) NÃO entraram.
- **Elgin** — semeada só Eco Plus II. A Eco Life Inverter (E0/E1/E3/E4/E5/EC/EE/F0–F5/P0–P5) NÃO foi semeada para evitar colisão de mesmo `code` no mesmo modelo; linhas antigas (High Wall, Eco Logic, Atualle, Cassete K7) só existem como imagem (não extraídas).
- **TCL** — códigos derivados de portais técnicos (média), não validados linha-a-linha contra manual oficial; pode variar por linha (A2/FreshIN/BreezeIN).
- **Komeco** — Cassete/Piso-Teto trifásico só tem fonte secundária (blog); não semeado. Multi-Split sem dados.

## 5) Códigos NÃO semeados (confiança baixa / fora de escopo)
- Brastemp E5; Carrier convenção "pisca N vezes" e Cassete/Piso-Teto; Hitachi E4/E7/E8 + F0–F2; Philco ITQFM9W (E1–E10) + plataformas FM/FM2/FM4 + "EA"; Elgin Eco Life Inverter + linhas antigas (só imagem); Komeco Cassete/Piso-Teto trifásico.
- Códigos específicos de multi-split / VRF / cassete / piso-teto que não saíram da documentação pública confiável.
- Variantes regionais e códigos de firmware/diagnóstico de fábrica.

## 6) Whirlpool — N/A no BR
A marca **Whirlpool NÃO vende ar-condicionado no Brasil** (opera via Brastemp/Consul; AC "Whirlpool" existe só na Europa). **Não semear** como marca de AC. Se um dia for exigida por completude, herdar de Brastemp/Consul. Confiança: ALTA.

## 7) Multi-Split — quase tudo em aberto
Só **Springer** tem 1 modelo Multi-Split semeado (condensadora 38MBPA42M5, foto CDN). Multi-Split de **Philco, Komeco, Agratto, TCL, Hitachi, Elgin** ficou sem modelos/BTU/códigos/fotos nas fontes públicas — confirmar direto com cada fabricante.

## 8) Categorias
Existem 4: **Split Hi-Wall, Cassete, Piso-Teto, Multi-Split**. Ainda faltam (criar quando houver modelos): **Janela, Portátil, Duto, Splitão, Cortina de Ar** (Komeco/Philco/Elgin têm esses formatos no catálogo, mas não foram semeados).
