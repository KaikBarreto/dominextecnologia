---
name: dominex-copy-assets
description: Use quando o Kaik pedir mensagem para WhatsApp, cliente final, comunicado, aviso, resposta a bug, texto pronto para colar, ou quando pedir "template 1", "estilo 1" ou prompt de arte para ChatGPT sobre release, feature ou comunicacao da Dominex.
---

# Dominex Copy Assets

## Mensagem Para WhatsApp

- Entregar sempre dentro de bloco de codigo, pronta para copiar e colar.
- Usar formatacao de WhatsApp: negrito com `*um asterisco*`, nunca markdown `**`.
- Separar paragrafos com linha em branco.
- Usar linguagem humana, simples, profissional e direta.
- Nao usar travessao.
- Evitar jargao tecnico, nome de tabela, hook, edge function, tenant, path interno ou detalhe de implementacao.
- Se houver telefone, formatar de forma legivel.
- Quando for bug/correcao, assumir responsabilidade com calma, explicar impacto em linguagem simples e fechar com proximo passo claro.
- Quando for release/novidade, focar no beneficio percebido pelo cliente.

Modelo base:

```text
Oi, [nome]. Tudo bem?

*[assunto principal em uma frase curta]*

[explicacao simples, com o que mudou ou o que sera feito.]

[beneficio pratico para o cliente ou proximo passo.]

Qualquer coisa, me chama por aqui.
```

## Template 1 Para Arte No ChatGPT

Quando o Kaik pedir "template 1", "estilo 1" ou prompt para arte no ChatGPT explicando release/feature, usar este molde adaptado:

```text
Crie uma arte em formato [formato] para comunicar [release/feature/beneficio] da Dominex.

Estilo visual: dark tech/SaaS premium, moderno, limpo, com alto contraste e aparencia profissional.

Identidade: usar verde Dominex como cor de destaque, fundo escuro sofisticado, elementos de interface SaaS, linhas sutis, profundidade leve e visual de produto digital real.

Texto principal na arte:
"[headline curta]"

Texto secundario:
"[subtexto curto]"

Elementos visuais:
- [prints/mockups/icone/fluxo desejado]
- interface organizada, cards discretos, indicadores de status e detalhes que remetam a software de gestao
- leitura boa no celular

Evitar:
- visual generico de IA
- excesso de texto
- poluicao visual
- logos inventados
- pessoas com maos/rostos distorcidos
- promessas que a feature nao entrega

A composicao deve parecer uma comunicacao oficial de produto SaaS B2B, com foco no beneficio para empresas de servico de campo.
```

## Handoff

- Se faltar contexto da feature, perguntar no maximo o essencial.
- Se a mensagem envolver cliente irritado, bug em producao, financeiro, fiscal ou seguranca, manter tom cuidadoso e nao prometer prazo sem confirmacao.
- Se o output for para cliente final, deixar pronto para colar, sem explicacoes fora do bloco salvo se houver alerta necessario.
