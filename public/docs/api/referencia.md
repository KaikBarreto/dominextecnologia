# Referência da API Pública Dominex v1

Base: `https://api.dominex.app/v1`

Contrato canônico: https://api.dominex.app/v1/openapi.json

| Método | Endpoint | Escopo | Objetivo |
|---|---|---|---|
| GET | `/capabilities` | autenticado | versão, timezone, modo e limites |
| GET | `/service-types` | `catalogs:read` | serviços ativos |
| GET | `/booking-resources` | `catalogs:read` | usuários/equipes configurados |
| GET | `/availability` | `availability:read` | slots disponíveis |
| POST | `/customers/resolve` | `customers:resolve` | resolução exata de cliente |
| POST | `/service-orders` | `service_orders:create` | criação atômica de cliente/OS/reserva |
| GET | `/service-orders/{id}` | `service_orders:read` | consulta por UUID |
| GET | `/service-orders/by-external-id/{external_id}` | `service_orders:read` | consulta por referência externa |
| GET | `/crm/pipelines` | `crm_cards:read` | funis comerciais e etapas disponíveis |
| GET | `/crm/cards` | `crm_cards:read` | listagem paginada e filtrável de cards |
| POST | `/crm/cards` | `crm_cards:write` | criação idempotente de card |
| GET | `/crm/cards/{id}` | `crm_cards:read` | consulta por UUID |
| PATCH | `/crm/cards/{id}` | `crm_cards:write` | atualização ou movimento idempotente |
| GET | `/crm/cards/by-external-id/{external_id}` | `crm_cards:read` | consulta pela referência externa |

## Cards do CRM

POST exige `title` e `stage_id`; PATCH aceita um subconjunto não vazio dos campos públicos. Ambos exigem `Idempotency-Key`. O servidor deriva `pipeline_id` da etapa, restringe a operação a funis comerciais e revalida etapa e cliente no tenant da chave. A v1 não oferece exclusão física de cards.

## Campos que a criação rejeita

Não envie `company_id`, `created_by`, status arbitrário, valores financeiros, assinaturas, diagnóstico, solução ou check-in/out. O servidor fixa `origin=public_api`, `entry_type=os` e `status=agendada`.

## Prompt para agente de código

```text
Leia https://api.dominex.app/v1/openapi.json e gere um cliente tipado para a
stack deste projeto. O OpenAPI é a fonte da verdade. Não crie endpoints ou
campos ausentes. Adicione validação de entrada, erros application/problem+json,
timeout, Retry-After, idempotência obrigatória em createServiceOrder e testes
que garantam que segredo e PII não aparecem nos logs.
```
