# Autenticação da API Dominex v1

A chave tem formato `dmx_live_<public_id>.<secret>` e deve ser enviada somente no header:

```http
Authorization: Bearer dmx_live_PUBLIC_ID.SECRET
```
## Regras

- Execute chamadas somente em servidor confiável.
- Armazene a chave em secret manager ou variável de ambiente.
- O segredo completo é exibido uma única vez.
- A validade padrão é 180 dias.
- A revogação manual é imediata.
- A rotação pode manter sobreposição controlada por até 7 dias.
- `401` significa chave ausente, inválida, expirada ou revogada.
- `403` pode indicar escopo, allowlist ou assinatura sem acesso.

## Prompt para agente de código

```text
Implemente requestDominex(path, init) em TypeScript. A função deve recusar
execução no browser, ler DOMINEX_API_KEY apenas de process.env, aplicar timeout
de 10 segundos, enviar Bearer e Accept application/json, interpretar
application/problem+json e produzir logs sanitizados apenas com rota, status,
code, latência e request_id. Crie teste que garante que Authorization nunca
aparece no logger ou em mensagens de erro.
```
