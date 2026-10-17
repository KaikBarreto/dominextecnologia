# Acompanhar uma ordem de serviço

Use um dos endpoints:

- `GET /service-orders/{id}`
- `GET /service-orders/by-external-id/{external_id}`

Escopo: `service_orders:read`.

A integração vê somente as OS que ela própria criou. Um recurso inexistente ou fora do tenant/integração retorna o mesmo `404`.

A resposta resume identificação, número, cliente, horário, responsável, status, assignment e link público de acompanhamento.

## Prompt para agente de código

```text
Crie getServiceOrder(id) e getServiceOrderByExternalId(externalId) para a API
Dominex v1. Use encodeURIComponent no external_id. Retorne DTO mínimo com id,
number, customer, scheduled_at, status, assignment e public_tracking_url.
Trate 404 sem inferir tenant. Em polling use backoff, respeite 429 Retry-After
e encerre em concluida ou cancelada. Não registre dados pessoais.
```
