# Criar uma ordem de serviço

Use este fluxo para integrar qualquer aplicação server-to-server — CRM, ERP,
portal, formulário, automação, chatbot ou agente de IA — à agenda da Dominex.

## Fluxo recomendado

1. Valide a autenticidade e o schema do evento de origem.
2. Use um ID imutável do evento como `external_id` e base da `Idempotency-Key`.
3. Consulte `GET /capabilities` para obter timezone, escopos e modo de distribuição.
4. Use somente serviços devolvidos por `GET /service-types`.
5. Resolva o cliente com `POST /customers/resolve`.
6. Consulte `GET /availability` e selecione somente um slot devolvido.
7. Chame `POST /service-orders` com os campos permitidos pelo OpenAPI.
8. Persista o ID, número, status e link público retornados.

## Garantias de segurança

- Todas as chamadas autenticadas são somente server-to-server.
- O tenant é derivado exclusivamente da chave; nunca envie `company_id`.
- A criação de cliente, OS, responsáveis e reserva é atômica.
- Depois de timeout, `500` ou `503`, repita a mesma chave e o mesmo JSON.
- Em `409 schedule_conflict`, consulte novos horários.
- Em `429`, respeite `Retry-After` e aplique jitter limitado.

## Prompt para agente de código

```text
Implemente uma integração server-to-server entre minha aplicação e a API
Pública Dominex v1. Leia https://www.dominex.app/docs/llms.txt e trate
https://api.dominex.app/v1/openapi.json como contrato canônico.

Adapte o evento imutável da aplicação de origem para external_id e
Idempotency-Key. Consulte /capabilities, /service-types, /customers/resolve e
/availability antes de chamar POST /service-orders. Use apenas IDs e slots
retornados pela Dominex.

Mantenha DOMINEX_API_KEY exclusivamente no secret manager do servidor.
Implemente timeout de 10 segundos, application/problem+json, Retry-After em
429, replay idempotente em timeout/500/503 e logs sem Authorization nem dados
pessoais. Inclua testes de evento duplicado, concorrência, conflito de agenda,
cliente ambíguo, campos proibidos e rate limit.
```
