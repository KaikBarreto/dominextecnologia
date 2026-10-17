# Criar uma ordem de serviço pelo WhatsApp

## Fluxo recomendado

1. Valide a assinatura do webhook do provedor de WhatsApp.
2. Deduplicate o evento pelo ID imutável da mensagem.
3. Consulte `GET /capabilities`.
4. Liste serviços em `GET /service-types`.
5. Resolva o cliente em `POST /customers/resolve`.
6. Consulte `GET /availability` e mostre somente slots retornados.
7. Peça confirmação explícita de serviço, horário e endereço.
8. Crie com `POST /service-orders` e `Idempotency-Key` estável.
9. Em `409 schedule_conflict`, ofereça novos slots.
10. Responda ao cliente somente após `200` ou `201`.

## Garantias da criação

A operação resolve ou cria o cliente, revalida disponibilidade, seleciona ou valida o responsável, cria OS, assignees, reserva e referência externa em uma única transação.

## Prompt para agente de código

```text
Implemente um fluxo TypeScript/Node.js que transforma um webhook autenticado
do WhatsApp em uma OS Dominex. Use o ID imutável da mensagem como deduplicação,
external_id e base da Idempotency-Key. Adapte-se ao distribution_mode de
/capabilities. Nunca invente UUIDs ou horários. Mostre apenas slots de
/availability e crie somente após confirmação explícita do cliente.

Em 409 schedule_conflict consulte novos horários. Em 429 respeite Retry-After.
Em timeout de criação repita o mesmo payload e Idempotency-Key. Implemente uma
máquina de estados e testes de evento duplicado, cliente ambíguo, conflito,
rate limit e timeout após persistência. Nunca registre chave ou PII.
```
