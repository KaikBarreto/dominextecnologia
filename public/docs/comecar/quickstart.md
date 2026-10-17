# Quickstart — primeira OS pela API Dominex

Base URL: `https://api.dominex.app/v1`

## 1. Consulte as capacidades

```bash
curl 'https://api.dominex.app/v1/capabilities' \
  -H 'Authorization: Bearer dmx_live_PUBLIC_ID.SECRET' \
  -H 'Accept: application/json'
```

Use o `timezone`, os `scopes`, o `distribution_mode` e os limites devolvidos. O segredo acima é fictício.

## 2. Consulte serviços e disponibilidade

```bash
curl 'https://api.dominex.app/v1/service-types' \
  -H 'Authorization: Bearer dmx_live_PUBLIC_ID.SECRET'

curl --get 'https://api.dominex.app/v1/availability' \
  -H 'Authorization: Bearer dmx_live_PUBLIC_ID.SECRET' \
  --data-urlencode 'from=2026-10-21T08:00:00-03:00' \
  --data-urlencode 'to=2026-10-24T18:00:00-03:00' \
  --data-urlencode 'duration_minutes=90'
```

## 3. Crie a OS

```bash
curl --request POST 'https://api.dominex.app/v1/service-orders' \
  -H 'Authorization: Bearer dmx_live_PUBLIC_ID.SECRET' \
  -H 'Idempotency-Key: crm-event-01JABC' \
  -H 'Content-Type: application/json' \
  --data '{
    "customer": {
      "external_id": "crm-contact-42",
      "name": "Cliente Exemplo",
      "phone": "+5511999999999"
    },
    "os_type": "visita_tecnica",
    "description": "Avaliação solicitada pelo sistema parceiro.",
    "scheduled_at": "2026-10-21T09:30:00-03:00",
    "duration_minutes": 90
  }'
```

## Prompt para agente de código

```text
Crie um cliente TypeScript para a API Dominex v1 com getCapabilities,
listServiceTypes, listAvailability, resolveCustomer, createServiceOrder e
getServiceOrder. Leia DOMINEX_API_KEY somente do ambiente do servidor.
Modele application/problem+json. Em 429 respeite Retry-After. Em criação,
exija Idempotency-Key e preserve a mesma chave e payload depois de timeout,
500 ou 503. Nunca registre chave ou dados pessoais. Escreva testes unitários.
```
