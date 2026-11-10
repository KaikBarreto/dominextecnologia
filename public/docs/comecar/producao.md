# Preparar integração Dominex para produção

## Checklist

- [ ] Chave somente no secret manager do servidor.
- [ ] Menor conjunto de escopos possível.
- [ ] Allowlist de IP/CIDR quando houver saída fixa.
- [ ] Procedimento testado de rotação e revogação.
- [ ] `Idempotency-Key` estável e replay do mesmo payload.
- [ ] Timeout e retry apenas para falhas transitórias.
- [ ] `Retry-After` respeitado em `429`.
- [ ] Authorization e dados pessoais removidos de logs/APM.
- [ ] Alertas para `401`, `403`, `409`, `429` e `5xx`.
- [ ] Teste concorrente produz exatamente uma OS ou uma mutação de card.
- [ ] POST/PATCH de cards reutilizam chave e payload após timeout.
- [ ] Fallback humano para cliente ambíguo e agenda indisponível.
- [ ] Testes feitos em tenant de demonstração com dados fictícios.

## Prompt para revisão

```text
Audite esta integração Dominex v1 para produção. Verifique armazenamento de
segredo, escopos mínimos, allowlist, rotação, idempotência, concorrência,
timeouts, retries, Retry-After, logs sem Authorization/PII, alertas e fallback
humano. Gere findings por severidade, testes ausentes e um runbook de incidente.
Não leia, imprima ou solicite nenhum segredo real.
```
