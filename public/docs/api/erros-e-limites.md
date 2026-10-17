# Erros e limites da API Dominex v1

Erros usam `application/problem+json`:

```json
{
  "type": "https://api.dominex.app/problems/schedule-conflict",
  "title": "Conflito de agendamento",
  "status": 409,
  "code": "schedule_conflict",
  "detail": "O responsável não está disponível nesse horário.",
  "request_id": "018f9c91-8c0c-7c15-a9c1-c6245482aaaa"
}
```
## Recuperação

- `400`/`422`: corrija; não repita automaticamente.
- `401`: interrompa e corrija/rotacione a credencial.
- `403`: verifique escopo, allowlist e assinatura.
- `404`: trate como não encontrado sem inferir tenant.
- `409 schedule_conflict`: consulte disponibilidade novamente.
- `409 idempotency_conflict`: incidente de implementação; não gere outra chave para mascarar.
- `429`: aguarde `Retry-After` com jitter.
- `500`/`503`/timeout: retry limitado; em criação preserve chave e payload.

## Limites padrão

- 60 requisições/minuto por chave.
- 30 consultas de disponibilidade/minuto.
- 10 mutações/minuto.
- Corpo máximo de 64 KiB.
- Disponibilidade: até 31 dias e 50 slots.

Leia os limites vigentes em `GET /capabilities`.

## Prompt para agente de código

```text
Crie um tratador tipado para application/problem+json da API Dominex. Implemente
no máximo 3 tentativas para falhas transitórias, Retry-After com jitter em 429,
reconsulta de agenda em schedule_conflict e interrupção em erros de contrato.
Em criação, preserve payload e Idempotency-Key. Logs podem conter somente rota,
status, code, duração e request_id. Escreva testes com relógio falso.
```
