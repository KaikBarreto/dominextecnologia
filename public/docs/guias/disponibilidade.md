# Consultar disponibilidade na API Dominex

## Requisição

`GET /availability` exige:

- `from`: ISO 8601 com offset
- `to`: ISO 8601 com offset, no máximo 31 dias após `from`
- `duration_minutes`: inteiro de 15 a 480

Aceita `service_type_id` e `resource_id` opcionais. A resposta tem no máximo 50 slots.

## Regras

- Consulte primeiro `GET /capabilities` e use o timezone retornado.
- Preserve o offset do slot escolhido na criação.
- Não calcule disponibilidade localmente.
- No modo `agent_selects`, mantenha o `resource` associado ao slot.
- Em `round_robin`, o banco escolhe o recurso sob lock.
- Em `unassigned`, a OS pode retornar `assignment_pending`.
- Intervalos usam `[início, fim)`, permitindo horários adjacentes.

## Prompt para agente de código

```text
Implemente listAvailability para a API Dominex v1. Leia timezone e modo em
/capabilities. Valide período máximo de 31 dias e duração de 15 a 480 minutos.
Mostre somente slots devolvidos. Preserve starts_at e seu offset ao criar a OS.
No modo agent_selects preserve também o resource. Trate lista vazia, 422, 429
com Retry-After e 503. Teste virada de dia e horário de verão.
```
