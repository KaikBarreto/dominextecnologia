# Criar e gerenciar cards do CRM

A API Pública Dominex permite integrar um ERP, formulário, automação ou CRM externo aos funis comerciais do tenant. Ela não expõe frentes de projetos e não oferece exclusão física de cards.

## Escopos

- `crm_cards:read`: lista funis/etapas e consulta cards do tenant.
- `crm_cards:write`: cria, atualiza e move cards; use junto de `crm_cards:read` quando a integração precisar descobrir IDs.

## Descobrir funis e listar cards

`GET /crm/pipelines` devolve funis comerciais com suas etapas. Use somente os IDs retornados. O `pipeline_id` do card é derivado de `stage_id` e não pode ser enviado.

`GET /crm/cards` aceita `limit` (1 a 100), `cursor`, `pipeline_id`, `stage_id` e `updated_since` em ISO 8601 com offset. Continue a paginação com `next_cursor`; trate o cursor como opaco.

Cards legados podem aparecer com `stage_id: null`. Toda nova criação exige uma etapa; para normalizar um card legado, envie um `stage_id` válido no `PATCH`.

## Criar um card

```http
POST /v1/crm/cards HTTP/1.1
Host: api.dominex.app
Authorization: Bearer dmx_live_PUBLIC_ID.SECRET
Idempotency-Key: erp-opportunity-1042-create
Content-Type: application/json

{
  "external_id": "erp-opportunity-1042",
  "title": "Contrato de manutenção preventiva",
  "stage_id": "018f9c91-8c0c-7c15-a9c1-c6245482b101",
  "customer_id": "018f9c91-8c0c-7c15-a9c1-c6245482b202",
  "value": 18500,
  "probability": 60,
  "source": "ERP parceiro"
}
```

`title` e `stage_id` são obrigatórios. `customer_id`, `value`, `probability`, `source`, `expected_close_date` e `notes` são opcionais. Todos os dados do exemplo são fictícios.

## Consultar, atualizar e mover

- `GET /crm/cards/{id}` consulta pelo UUID.
- `GET /crm/cards/by-external-id/{external_id}` consulta pela referência da integração.
- `PATCH /crm/cards/{id}` atualiza um subconjunto não vazio dos campos públicos.
- Enviar outro `stage_id` no PATCH move o card e registra a mudança no histórico.

POST e PATCH exigem `Idempotency-Key`. Uma repetição incerta deve reutilizar a mesma chave e exatamente o mesmo JSON. A mesma chave com payload diferente retorna `409 idempotency_conflict`.

Nunca envie `company_id`, `pipeline_id`, `created_by`, responsáveis, IDs inventados ou dados financeiros internos. Etapa e cliente são revalidados dentro do tenant da chave; um recurso inexistente ou de outro tenant recebe resposta neutra.

## Prompt para agente de código

```text
Implemente uma integração server-to-server com os endpoints /crm da API Pública
Dominex v1. Consulte /crm/pipelines antes de usar stage_id. Implemente paginação
por cursor e filtros na listagem. Exija Idempotency-Key em POST e PATCH e preserve
a mesma chave e o mesmo JSON em retries. Nunca envie company_id ou pipeline_id.
Trate problem+json, 404 neutro, 409 idempotency_conflict, 422, Retry-After e
falhas transitórias limitadas. Adicione testes de replay, movimento entre etapas,
isolamento de tenant, cursor e redaction de Authorization/PII.
```
