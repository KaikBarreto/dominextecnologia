# Catálogo GLOBAL de equipamentos — mapa de lacunas

> Companheiro de `catalogo-equipamentos.md`. Lista o que falta / o que tem confiança baixa, pra priorizar próximas rodadas de curadoria.
> Atualizado em 2026-06-14.

## 1) Fotos faltando (image_url = NULL)
**Todos os modelos** estão sem foto. Nenhuma URL de imagem confiável foi semeada.

| Marca | Modelo | image_url |
|---|---|---|
| Gree | Split Hi-Wall Inverter | faltando |
| Midea | Split Inverter (Springer Midea) | faltando |
| Samsung | Split Inverter (WindFree / Digital Inverter) | faltando |
| LG | Split Dual Inverter (linha geral) | faltando |
| Daikin | EcoSwing / SkyAir (linha geral) | faltando |
| Consul | Bem Estar / Maxi Inverter (linha geral) | faltando |
| Electrolux | Color Adapt / Inverter (linha geral) | faltando |
| Fujitsu | Airstage Inverter (linha geral) | faltando |

Ação sugerida: hospedar foto própria por modelo (evitar hotlink a vitrine de loja, que quebra).

## 2) Logos a validar
Logos novos vieram de fontes mistas (Wikimedia para Samsung/LG/Fujitsu; logodownload.org para Daikin/Consul; companieslogo.com para Electrolux). Wikimedia é estável; os agregadores (logodownload/companieslogo) podem mover/bloquear hotlink. Gree/Midea seguem **sem logo**.

Ação sugerida: re-hospedar todos os logos em storage próprio para não depender de terceiros.

## 3) Modelos sem manual
- **Gree** — sem manual.
- **Midea** — sem manual.

Os 6 novos têm manual_url. Atenção: alguns são links de agregador (Leveros Integra para Daikin/Fujitsu, Central Ar para Consul) — não são domínio oficial do fabricante e podem mudar. Samsung (download center oficial), LG (suporte oficial) e Electrolux (electrolux-ui) são mais estáveis.

## 4) Confiança / ressalvas por marca
- **Electrolux** — plataforma OEM; o significado do código pode variar por série. `E5` em especial muda conforme a capacidade (sobrecorrente em 18/22k, baixa tensão em 9/12k). Confirmar sempre no manual do modelo específico.
- **Consul** — plataforma compartilhada com Brastemp/Whirlpool; mesmos códigos provavelmente servem essas marcas (a confirmar antes de semear Brastemp/Whirlpool).
- **Fujitsu** — base sólida (guia oficial Fujitsu General), mas a lista do fabricante é mais longa que o subconjunto semeado (códigos de cenários específicos de VRF/multi não entraram).
- **Samsung/LG/Daikin** — listas amplas e consistentes em >=2 fontes.

## 5) Códigos NÃO semeados (confiança baixa / fora de escopo)
- Códigos específicos de linhas multi-split / VRF / cassete / piso-teto de cada fabricante (o seed foca em split hi-wall residencial "linha geral").
- Variantes regionais e códigos de firmware/diagnóstico de fábrica que não aparecem na documentação pública de assistência.

## 6) Marcas ainda a fazer (backlog)
Marcas relevantes no mercado BR de refrigeração ainda não semeadas:
- Brastemp / Whirlpool (reaproveitar tabela Consul após confirmação)
- Philco
- Komeco
- Agratto
- Carrier / Springer (Springer já parcialmente coberto via Midea)
- TCL
- Hitachi
- Elgin

## 7) Categorias
Só existe **Split Hi-Wall** em `equipment_model_categories`. Faltam categorias para outros formatos (Piso-Teto, Cassete, Janela, Multi-Split, Portátil) — criar quando houver modelos desses tipos para semear.
