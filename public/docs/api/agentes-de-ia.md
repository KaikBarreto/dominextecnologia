# Usar a documentação Dominex com agentes de IA

## Fontes para anexar

- Contexto e regras: https://www.dominex.app/docs/llms.txt
- Contrato OpenAPI: https://api.dominex.app/v1/openapi.json
- Documentação humana: https://www.dominex.app/docs

## Fluxo recomendado

1. Dê ao agente o `llms.txt` e o OpenAPI.
2. Cole o prompt do guia que corresponde ao objetivo.
3. Peça um plano que identifique servidor, secret manager, idempotência e testes.
4. Revise o plano antes da edição.
5. Teste com tenant de demonstração e dados fictícios.
6. Inspecione logs para confirmar a redaction.

Nunca anexe uma chave real ao contexto do agente.

## Prompt mestre

```text
Implemente uma integração server-to-server com a API Pública Dominex v1.
Trate https://api.dominex.app/v1/openapi.json como contrato canônico e leia
https://www.dominex.app/docs/llms.txt antes de planejar.

Mantenha DOMINEX_API_KEY somente no secret manager do servidor. Nunca exponha
ou registre Authorization ou dados pessoais. Consulte capacidades, catálogos e
disponibilidade antes de criar. Use apenas IDs e slots retornados. Exija
confirmação explícita. Crie com Idempotency-Key estável por evento de origem.

Quando o objetivo for CRM, consulte /crm/pipelines, use apenas stage_id retornado,
liste com paginação por cursor e crie/atualize cards com POST/PATCH idempotentes.
Nunca envie company_id ou pipeline_id e não invente IDs.

Implemente timeout de 10 segundos, application/problem+json, Retry-After em 429,
retries transitórios limitados e replay exato após criação incerta. Inclua
testes de duplicidade, concorrência, conflito, idempotência e redaction.
```
