# 🧾 Fisqal — Referência da API (NFS-e e correlatos)

> **O que é este arquivo:** snapshot curado do **contrato que o Dominex vai consumir** da Fisqal. É a fonte de verdade *para o build* — os Devs codam contra isto, sem precisar navegar no site.
> **Fonte canônica (sempre que houver dúvida ou ao mexer na integração, re-validar aqui):**
> - Guia: https://www.fisqal.com.br/docs (SPA de página única, âncoras)
> - Swagger UI: https://api.fisqal.com.br/docs
> - OpenAPI JSON (3.0.0): https://api.fisqal.com.br/docs-json
> **Última leitura:** 2026-06-08.
> **Regra de atualização:** este `.md` é o contrato congelado do que usamos; o **OpenAPI ao vivo é a verdade**. Ao tocar na integração (ou quando a Reforma Tributária IBS/CBS evoluir), reconferir o `docs-json` e atualizar este arquivo.

---

## 1. Visão geral

Fisqal é uma **API fiscal multi-tenant** (REST/JSON) para emitir, consultar e cancelar documentos fiscais brasileiros. Pensada para **SaaS multi-tenant / ERPs / software houses** — exatamente nosso caso (Auctus = workspace; cada empresa cliente = uma `company`).

**Documentos suportados:** NF-e (55), NFC-e (65), **NFS-e (DPS)**, MDF-e (58), CT-e (57/67/64).
**Para o Dominex importa só NFS-e** (prestadores de serviço). Os demais ficam fora de escopo.

- **Base URL:** `https://api.fisqal.com.br`
- **Versão:** `v1` (ex: `/v1/nfse`)
- **Latência média:** <400ms · **SLA:** 99,9%
- **Provedor NFS-e:** SEFIN Nacional (padrão nacional NFS-e / ADN), com parametrização por município.

### Planos / preço (referência comercial, 2026-06-08)
| Plano | Preço/mês | Emissões/mês | CNPJs | Obs |
|---|---|---|---|---|
| Starter | R$ 29,90 | 300 | até 50 | |
| Pro | R$ 199 | 5.000 | até 200 | "mais popular" |
| Scale | R$ 799 | 10.000 | ilimitado | |
| Excedente | R$ 0,01 por emissão acima do limite | | | |

> Decisão de plano é comercial do CEO. O nº de CNPJs = nº de empresas clientes do Dominex que emitem.

---

## 2. Autenticação

API key do **workspace** (obtida no painel Fisqal). Enviar em **um** dos headers:

```
Authorization: Bearer <api_key>
X-API-Key: <api_key>
```

**Escopos (RBAC) que vamos precisar:** `companies:read`, `companies:write`, `certificates:read`, `certificates:write`, `nfse:read`, `nfse:write`, `nfse:cancel`, `webhooks:read`, `webhooks:write`.

> No Dominex a API key vive como **secret do Supabase** (`FISQAL_API_KEY`), nunca no client. É **global da Auctus** — o isolamento entre empresas é por `companyId` da Fisqal + certificado próprio, não por chave separada.

---

## 3. Headers importantes

| Header | Obrigatório | Função |
|---|---|---|
| `Authorization` **ou** `X-API-Key` | Sim (um) | Autenticação |
| `Content-Type` | Quando há body | `application/json` ou `multipart/form-data` |
| `Idempotency-Key` | Não (recomendado em POST fiscal) | Evita emissão duplicada |
| `X-Correlation-Id` | Não | Trace distribuído (máx 64 chars) |

---

## 4. Idempotência

- Enviar `Idempotency-Key` em **POST de endpoints fiscais** (`POST /v1/nfse`, cancel, etc.).
- **Único por operação de negócio** (1 chave por emissão). Persistido **por workspace**. Min 1 / máx 512 chars.
- Reenviar o mesmo POST com a mesma chave → retorna o **202 original**, sem duplicar. Ideal pra timeout/retry (e pro nosso PWA offline: gerar a chave no client junto do ID da emissão).

```
Idempotency-Key: idem_7f3a9c2e1b4d8f6a
```

---

## 5. Fluxo de integração (ordem recomendada)

1. **Criar empresa** → `POST /v1/companies` → recebe `companyId` (UUID).
2. **Subir certificado A1** → `POST /v1/companies/{companyId}/certificates` (multipart: `.pfx`/`.p12` + senha).
3. **Emitir NFS-e** → `POST /v1/nfse` (com `companyId` no body + `Idempotency-Key`) → **202 Accepted**.
4. **Acompanhar status** → polling (`GET /v1/nfse/{id}` ou `/status`) **ou** webhook.

---

## 6. Fluxo fiscal assíncrono

Toda emissão/cancelamento retorna **202 Accepted** na hora; o processamento roda em fila (BullMQ no lado deles).

**Resposta 202 (emissão):**
```json
{ "dpsId": "UUID", "status": "pending", "fiscalRequestId": "UUID" }
```

**Estados do documento:**
```
pending → validated → xml_generated → signed → queued →
processing → sent → authorized | rejected | failed → cancelled
```
- `authorized` — autorizada pela SEFIN.
- `rejected` — recusada pela prefeitura/SEFIN.
- `failed` — erro de sistema no processamento.
- `cancelled` — cancelada após autorização.

**Acompanhamento:** `GET /v1/nfse/{id}/status` devolve timeline com transições + logs.

---

## 7. Erros

**Shape padrão:**
```json
{
  "message": "Descrição legível do erro",
  "code": "ERROR_CODE",
  "statusCode": 400,
  "timestamp": "2026-05-16T10:00:00.000Z"
}
```

**Códigos relevantes:**
| Code | HTTP | Significado |
|---|---|---|
| `UNAUTHORIZED` | 401 | API key ausente/inválida |
| `FORBIDDEN` | 403 | Escopo insuficiente |
| `NOT_FOUND` | 404 | Empresa/documento/cert não encontrado |
| `VALIDATION_ERROR` | 400 | Payload falha schema |
| `CONFLICT` | 409 | Já existe (ex: série+número duplicado) |
| `UNPROCESSABLE_ENTITY` | 422 | Violação de regra de negócio fiscal |
| `PLAN_FORBIDDEN` | 403 | Plano do workspace não inclui o recurso |
| `COMPANY_PLAN_LIMIT` | 403 | Cota da empresa estourada |
| `COMPANY_INACTIVE` | 403 | Empresa inativa, não emite |
| `CERTIFICATE_INVALID` | 400 | Certificado inválido/expirado |
| `FISCAL_PROVIDER_ERROR` | 502 | SEFIN indisponível |
| `RATE_LIMITED` | 429 | Rate limit estourado |
| `NFSE_REJECTED` | 400 | Prefeitura/SEFIN rejeitou a nota |

> Toda mensagem que chega ao usuário final precisa ser **traduzida pra PT-BR amigável** (a Fisqal já manda `message` em PT, mas códigos crus não vão pra tela).

---

## 8. Endpoints NFS-e (mapa completo)

| Ação | Método + path |
|---|---|
| **Emitir** | `POST /v1/nfse` |
| Códigos de serviço (cTribNac) | `GET /v1/nfse/codigos-tributacao` |
| Parâmetros de dedução por serviço | `GET /v1/nfse/servicos/{codigoServico}/parametros` |
| Cobertura nacional (público) | `GET /v1/public/nfse/municipios/cobertura` |
| Cobertura de 1 município | `GET /v1/nfse/municipios/{codigoIbge}/cobertura` |
| Listar | `GET /v1/nfse` |
| Consultar | `GET /v1/nfse/{id}` |
| Consulta na SEFIN | `GET /v1/nfse/{id}/consulta-sefin` |
| Status (timeline) | `GET /v1/nfse/{id}/status` |
| **Cancelar** | `POST /v1/nfse/{id}/cancel` |
| XML (URL assinada) | `GET /v1/nfse/{id}/xml` |
| PDF DANFSE (URL assinada) | `GET /v1/nfse/{id}/pdf` |
| Status do serviço fiscal | `GET /v1/nfse/status/service` |
| Consulta por chave externa | `POST /v1/nfse/consulta-chave` |
| Sincronizar externas | `POST /v1/nfse/external/sync` |

### 8.1 `POST /v1/nfse` — payload (campos conhecidos)
DTO: `CreateNfseDpsDto` (schema completo no OpenAPI ao vivo; abaixo os campos confirmados na doc).

- `companyId` (UUID do emitente)
- `idDps` (ex: `"DPS355030812345678900019900000000001"`)
- `serieDps`, `numeroDps`
- `codigoMunicipioEmissor` (IBGE 7 díg.)
- `tipoInscricaoPrestador` (`"2"` = CNPJ), `inscricaoFederalPrestador` (CNPJ)
- `dataCompetencia` (`YYYY-MM-DD`)
- **`tomador`**: `tipoInscricao`, `inscricaoFederal`, `inscricaoMunicipal`, `razaoSocial`, `email`
- **`servico`**: `codigoServico` (cTribNac, 6 díg.), `municipioIncidencia` (IBGE), `discriminacao` (descrição)
- **`valores`**: `valorServico`
- **`salaoParceiro`** (opcional, dedução `tpDedRed=9`): `documentos[]` (`numeroDocumento`, `dataEmissaoDocumento`, `valorDedutivel`, `valorDeducao`) + `profissionalParceiro`

**Resposta 202:** `{ "dpsId", "status": "pending", "fiscalRequestId" }`

### 8.2 `GET /v1/nfse/codigos-tributacao` — códigos de serviço
```json
{ "items": [ { "codigo": "010101", "descricao": "Análise e desenvolvimento de sistemas.", "itemLc116": "1.01" } ], "total": 337 }
```
Query: `q` (busca), `limit` (máx 400).

### 8.3 Cobertura municipal (de-risca "nota é cidade-a-cidade")
`GET /v1/public/nfse/municipios/cobertura` (público, sem auth):
```json
{
  "fiscalAmbiente": "producao",
  "sincronizadoEm": "<ISO>",
  "resumo": { "emissaoDisponivel": 3734, "aderidosAguardandoParametrizacao": 1753, "emSincronizacao": 93 },
  "municipiosEmissao": [ { "codigoIbge": "3550308", "municipio": "Sao Paulo", "uf": "SP" } ],
  "municipiosAderidosPendentes": [ ... ]
}
```
`GET /v1/nfse/municipios/{codigoIbge}/cobertura` (auth):
```json
{
  "codigoMunicipioIbge": "3550308", "municipio": "Sao Paulo", "uf": "SP",
  "provedor": "sefin-nacional", "padraoNfse": "1.01", "ambiente": "homologacao",
  "nacionalAderido": true, "nacionalParametrizado": true, "podeEmitir": true,
  "syncedAt": "<ISO>", "syncSource": "adn"
}
```
→ Usar `podeEmitir` no onboarding pra avisar antes do cliente tentar emitir.

---

## 9. `POST /v1/companies` — criar empresa (emitente)
DTO: `CreateCompanyDto`. Campos confirmados:
`razao_social`, `nome_fantasia`, `cnpj` (único por workspace), `inscricao_municipal`, `inscricao_estadual`, `codigo_municipio` (IBGE), `municipio`, `uf`, `logradouro`, `numero`, `bairro`, `cep`, `email`, `telefone`, `fiscal_ambiente` (`producao` | `homologacao`).
**Resposta 201:** objeto da empresa com `id`, `workspace_id`, `status`, timestamps.

---

## 10. Certificados A1
`POST /v1/companies/{companyId}/certificates` — **multipart/form-data**: `nome`, `password`, `file` (`.pfx`/`.p12`).
**Resposta 201:** `{ "id": "cert_uuid", "nome": "...", "status": "active" }`.
Demais: `GET` listar, `DELETE` remover, `POST .../{certId}/test` testar.
> Nunca guardamos o `.pfx` nem a senha — só o `id` do certificado e a validade (pra banner de expiração).

---

## 11. Webhooks
- `POST /v1/webhooks` (escopo `webhooks:write`) · `GET` listar · `DELETE /{id}` · `POST /{id}/test`.
- **Eventos NFS-e:** `nfse.authorized`, `nfse.rejected`, `nfse.cancelled`, `nfse.processing`.
- **Payload entregue:**
```json
{
  "event": "nfse.authorized",
  "id": "evt_...",
  "created_at": "2026-05-16T10:05:00Z",
  "data": { "document_id": "<uuid>", "provider": "sefin-nacional", "status": "authorized", "chave_acesso": "...", "protocolo": "..." }
}
```
- **Assinatura:** payload assinado com **HMAC-SHA256**.

> ⚠️ **Lacunas a confirmar com o suporte Fisqal antes do build do webhook** (a doc pública não detalha): (a) **nome exato do header** da assinatura e a string exata que entra no HMAC (body cru? `id`+`created_at`?); (b) **schema do POST de criar webhook** (campos `url`/`events`/`secret`); (c) **política de retry** (nº de tentativas, backoff). Até confirmar, podemos subir com **polling** e plugar o webhook depois.

---

## 12. Reforma tributária
Suporte a **IBS/CBS** (NF-e/NFC-e) conforme notas técnicas da Receita. Para NFS-e, acompanhar parametrização nacional — re-validar este doc quando a reforma avançar.

---

## 13. Pendências abertas (TODO antes/durante o build)
- [ ] Confirmar com Fisqal: detalhes de assinatura HMAC do webhook + schema de criação + retry (seção 11).
- [ ] Puxar do `docs-json` o schema **completo** de `CreateNfseDpsDto` e `CreateCompanyDto` e fixar aqui (campos opcionais, formatos, obrigatoriedade).
- [ ] Confirmar credenciais: ambiente de **homologação** disponível? (campo `fiscal_ambiente: homologacao` sugere que sim — validar 1 município piloto).
- [ ] Conferir cobertura dos **municípios dos clientes atuais** via `/v1/public/nfse/municipios/cobertura`.
