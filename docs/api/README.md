# API Pública Dominex v1

A API Pública Dominex é exclusiva para integrações entre servidores. A chave secreta nunca deve ser colocada em frontend, aplicativo distribuído, planilha pública ou conversa de suporte.

- Base: `https://api.dominex.app/v1`
- Contrato: `https://api.dominex.app/v1/openapi.json`
- Autenticação: `Authorization: Bearer dmx_live_<public_id>.<secret>`
- Criação de OS e mutações de cards CRM: exigem `Idempotency-Key`
- Datas: ISO 8601 com offset; o timezone canônico vem de `GET /capabilities`
- Rate limit: 60 requisições/minuto, 30 consultas de disponibilidade/minuto e 10 mutações/minuto por chave
- Tamanho máximo do corpo: 64 KiB

## Fluxo recomendado para um agente de IA

1. Consulte `/capabilities` e mantenha os limites somente durante a execução atual.
2. Consulte `/service-types` e, no modo `agent_selects`, `/booking-resources`.
3. Consulte `/availability` antes de oferecer horários ao cliente.
4. Resolva o cliente por identificador exato em `/customers/resolve`.
5. Crie a OS com uma `Idempotency-Key` estável para a tentativa.
6. Em timeout, repita a mesma chave e exatamente o mesmo JSON. Nunca gere outra chave para “tentar de novo”.

Para CRM, consulte `/crm/pipelines`, liste com `/crm/cards` e use POST/PATCH com
idempotência. O servidor deriva `pipeline_id` de `stage_id`, restringe a API a
funis comerciais e não oferece exclusão física. Guia: `/docs/guias/cards-crm`.

## cURL

O exemplo abaixo considera uma integração em `round_robin` ou `unassigned`.
No modo `agent_selects`, envie também o `resource` retornado por
`/booking-resources` e por `/availability`.

```bash
curl --request POST 'https://api.dominex.app/v1/service-orders' \
  --header 'Authorization: Bearer dmx_live_PUBLIC_ID.SECRET' \
  --header 'Idempotency-Key: whatsapp-msg-01JABC' \
  --header 'Content-Type: application/json' \
  --data '{
    "external_id": "whatsapp-msg-01JABC",
    "customer": {
      "external_id": "whatsapp-contact-5511999999999",
      "name": "Cliente Exemplo",
      "phone": "+5511999999999"
    },
    "os_type": "visita_tecnica",
    "description": "Avaliação técnica solicitada pelo WhatsApp.",
    "scheduled_at": "2026-10-21T09:30:00-03:00",
    "duration_minutes": 90
  }'
```

## Node.js

```js
const response = await fetch('https://api.dominex.app/v1/service-orders', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${process.env.DOMINEX_API_KEY}`,
    'content-type': 'application/json',
    'idempotency-key': event.messageId,
  },
  body: JSON.stringify(payload),
});

const result = await response.json();
if (!response.ok) {
  console.error(result.code, result.request_id);
  throw new Error(`Dominex API: ${result.title}`);
}
```

## Regras para agentes de IA

- O agente deve oferecer apenas slots devolvidos por `/availability`.
- Nunca invente UUIDs, horários, serviços ou responsáveis.
- Trate `404` como “não encontrado”, sem revelar a possibilidade de outro tenant.
- Em `409 schedule_conflict`, consulte disponibilidade novamente.
- Em `429`, respeite `Retry-After` e não faça loop agressivo.
- Em `500` ou `503`, preserve a mesma `Idempotency-Key` antes de repetir uma criação.
- Não envie diagnóstico, solução, preço, assinatura, `company_id`, `created_by` ou status: esses campos são recusados.
- Em cards, não envie `pipeline_id`; use uma etapa devolvida por `/crm/pipelines`.

O arquivo [`openapi.v1.yaml`](./openapi.v1.yaml) é a fonte canônica do contrato.

## Nota de implantação

O Cloudflare Worker definido em `wrangler.public-api.toml` e a edge devem
compartilhar `PUBLIC_API_PROXY_SECRET`, com
valor aleatório de pelo menos 256 bits. A edge falha fechado quando esse segredo
não está configurado ou não confere, impedindo acesso direto pela URL do projeto.

O Worker é a única borda oficial de `api.dominex.app`: limita o corpo a 64 KiB,
não oferece CORS, encaminha somente headers permitidos e usa o IP fornecido pela
Cloudflare. A própria edge mantém o rate limit persistente e revalida chave,
escopos, assinatura, tenant e allowlist de IP.
