# Documentação da API Pública Dominex v1

> Integre qualquer aplicação server-to-server — CRM, ERP, portal, formulário, automação, chatbot ou agente de IA — à operação de campo da Dominex.

- Documentação: https://www.dominex.app/docs
- Base URL: `https://api.dominex.app/v1`
- OpenAPI 3.1.1: https://api.dominex.app/v1/openapi.json
- Contexto para agentes: https://www.dominex.app/docs/llms.txt

## O que é possível fazer

1. Consultar capacidades, timezone, escopos e modo de distribuição.
2. Listar serviços ativos e responsáveis configurados.
3. Consultar horários realmente disponíveis.
4. Encontrar um cliente por identificador exato.
5. Criar cliente e ordem de serviço de forma atômica quando necessário.
6. Consultar uma OS criada pela mesma integração.
7. Criar, listar, consultar, atualizar e mover cards nos funis comerciais do CRM.

## Regras essenciais

- A API é somente server-to-server.
- Nunca exponha `DOMINEX_API_KEY` no navegador, app, log ou prompt.
- Consulte disponibilidade antes de oferecer horários.
- Use `Idempotency-Key` estável em toda criação de OS.
- Em timeout, repita a mesma chave e o mesmo JSON.
- Em `429`, respeite `Retry-After`.
- Em `409 schedule_conflict`, consulte novos horários.
- Nunca envie `company_id`; o tenant vem exclusivamente da chave.

## Guias

- [Quickstart](./comecar/quickstart.md)
- [Autenticação](./comecar/autenticacao.md)
- [Preparar para produção](./comecar/producao.md)
- [Criar uma ordem de serviço](./guias/criar-os.md)
- [Consultar disponibilidade](./guias/disponibilidade.md)
- [Encontrar ou criar cliente](./guias/clientes.md)
- [Gerenciar cards do CRM](./guias/cards-crm.md)
- [Acompanhar uma OS](./guias/acompanhar-os.md)
- [Exemplo: criar OS pelo WhatsApp](./guias/criar-os-whatsapp.md)
- [Referência da API](./api/referencia.md)
- [Para agentes de IA](./api/agentes-de-ia.md)
- [Erros e limites](./api/erros-e-limites.md)

## Prompt inicial para sua IA

```text
Implemente uma integração server-to-server com a API Pública Dominex v1.
Leia https://www.dominex.app/docs/llms.txt e use
https://api.dominex.app/v1/openapi.json como contrato canônico.

Mantenha DOMINEX_API_KEY somente no servidor. Consulte /capabilities,
/service-types e /availability antes de criar uma OS. Use apenas IDs e slots
retornados pela API. Exija confirmação explícita da pessoa antes da criação.

POST /service-orders deve usar uma Idempotency-Key estável derivada do evento
imutável de origem. Implemente timeout, retries limitados, Retry-After em 429,
erros application/problem+json e redaction de Authorization e dados pessoais.
Adicione testes de duplicidade, concorrência, conflito de agenda e timeout.
```
