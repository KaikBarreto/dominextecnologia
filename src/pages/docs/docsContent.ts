export type DocStep = {
  title: string;
  detail: string;
};

export type DocEndpoint = {
  method: 'GET' | 'POST';
  path: string;
  description: string;
  scope: string;
};

export type DocCodeVariant = {
  label: string;
  language: string;
  code: string;
};

export type DocArticleImage = {
  src: string;
  alt: string;
  caption: string;
};

export type DocBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'steps'; items: DocStep[] }
  | { type: 'code'; language: string; label?: string; code: string; variants?: DocCodeVariant[]; collapsible?: boolean }
  | { type: 'callout'; tone: 'info' | 'warning' | 'success'; title: string; text: string }
  | { type: 'flow'; items: DocStep[] }
  | { type: 'details'; items: DocStep[] }
  | { type: 'response'; eyebrow: string; status: string; title: string; items: DocStep[] }
  | { type: 'prompt'; title: string; description: string; prompt: string; snippets: DocCodeVariant[] }
  | { type: 'endpoints'; items: DocEndpoint[] }
  | { type: 'table'; headers: string[]; rows: string[][] };

export type DocSection = {
  id: string;
  number: string;
  title: string;
  lead?: string;
  blocks: DocBlock[];
};

export type DocArticle = {
  path: string;
  title: string;
  eyebrow: string;
  description: string;
  readingTime: string;
  keywords: string[];
  image?: DocArticleImage;
  sections: DocSection[];
};

export type DocNavGroup = {
  label: string;
  items: Array<{ label: string; path: string }>;
};

const BASE_URL = 'https://api.dominex.app/v1';

const SECURITY_RULES = `Requisitos obrigatorios de seguranca:
- Execute toda chamada somente no servidor. Nunca exponha DOMINEX_API_KEY no navegador, app mobile, log, analytics ou resposta ao usuario.
- Leia a chave exclusivamente de process.env.DOMINEX_API_KEY.
- Use timeout de 10 segundos e valide Content-Type antes de interpretar a resposta.
- Em 429, respeite Retry-After e aplique backoff com jitter. Nunca faca loop agressivo.
- Em 500, 503 ou timeout de criacao, repita exatamente o mesmo JSON com a mesma Idempotency-Key.
- Nao registre payloads integrais, telefone, documento, e-mail, Authorization ou a chave.
- Nunca invente UUIDs, servicos, responsaveis ou horarios; use apenas valores devolvidos pela API.
- Propague X-Request-Id em logs tecnicos sanitizados para suporte.`;

const QUICKSTART_PROMPT = `Implemente uma integracao server-to-server em TypeScript com a API Publica Dominex v1.

Base URL: ${BASE_URL}
Autenticacao: Authorization: Bearer process.env.DOMINEX_API_KEY

Crie um cliente DominexApi reutilizavel com:
1. getCapabilities() chamando GET /capabilities.
2. listServiceTypes() chamando GET /service-types.
3. listAvailability() chamando GET /availability com datas ISO 8601 contendo offset.
4. resolveCustomer() chamando POST /customers/resolve.
5. createServiceOrder() chamando POST /service-orders e exigindo uma Idempotency-Key estavel por evento de origem.
6. getServiceOrder() chamando GET /service-orders/{id}.

Modele erros application/problem+json com type, title, status, code, detail e request_id. Crie testes unitarios para 401, 409 schedule_conflict, 429 com Retry-After, 503 e replay idempotente.

${SECURITY_RULES}`;

const AUTH_PROMPT = `Crie o modulo de autenticacao de uma integracao com a API Publica Dominex v1 em TypeScript.

Use a variavel de ambiente DOMINEX_API_KEY no formato dmx_live_<public_id>.<secret>. Envie-a somente no header Authorization: Bearer. Implemente uma funcao requestDominex(path, init) que:
- recuse executar no browser;
- nunca aceite a chave como argumento vindo do cliente;
- aplique timeout de 10 segundos;
- envie Accept: application/json;
- transforme respostas application/problem+json em erro tipado;
- exponha apenas status, code e request_id em logs sanitizados;
- trate 401 como credencial invalida, expirada ou revogada sem revelar detalhes internos.

Inclua exemplo de .env.example apenas com DOMINEX_API_KEY=, sem segredo real, e testes que garantam que Authorization nunca aparece no logger.

${SECURITY_RULES}`;

const CREATE_ORDER_PROMPT = `Implemente um fluxo generico de criacao de ordem de servico com a API Publica Dominex v1.

Origem: uma aplicacao server-to-server, como CRM, ERP, formulario, portal, automacao, chatbot ou agente de IA.
Stack: TypeScript/Node.js. API: ${BASE_URL}. Chave em process.env.DOMINEX_API_KEY.

Fluxo obrigatorio:
1. Valide a autenticidade e o schema do evento recebido da aplicacao de origem.
2. Derive external_id e Idempotency-Key de um identificador imutavel desse evento.
3. Consulte GET /capabilities e adapte o fluxo ao distribution_mode e ao timezone retornados.
4. Consulte GET /service-types e use apenas IDs existentes.
5. Resolva o cliente com POST /customers/resolve; nunca associe por aproximacao de nome.
6. Consulte GET /availability e aceite apenas um slot devolvido pela Dominex.
7. Chame POST /service-orders com os campos permitidos pelo OpenAPI.
8. Em 409 schedule_conflict, consulte novos horarios. Em 429, respeite Retry-After.
9. Persista o id, external_id, numero, status e public_tracking_url retornados.

Crie uma camada adaptadora que mantenha as regras da Dominex separadas do formato do sistema de origem. Inclua testes de evento duplicado, timeout apos criacao, concorrencia, cliente ambiguo, campos proibidos e rate limit.

${SECURITY_RULES}`;

const WHATSAPP_PROMPT = `Implemente o fluxo de agendamento de ordem de servico da Dominex a partir de um agente de IA no WhatsApp.

Stack: TypeScript/Node.js. API: ${BASE_URL}. Chave em process.env.DOMINEX_API_KEY.

Fluxo obrigatorio:
1. Receba um evento do WhatsApp e valide assinatura/autenticidade antes de processar.
2. Use o ID imutavel da mensagem como referencia externa e base da Idempotency-Key.
3. Consulte GET /capabilities e adapte o fluxo ao distribution_mode.
4. Consulte GET /service-types; nunca deixe a IA inventar service_type_id.
5. Resolva o cliente com POST /customers/resolve. Se nao existir, monte customer com name e telefone E.164.
6. Consulte GET /availability antes de oferecer horarios. Mostre somente slots retornados.
7. Depois da confirmacao explicita do cliente, chame POST /service-orders.
8. Em 409 schedule_conflict, consulte novos horarios e volte a perguntar. Em 429, respeite Retry-After.
9. Responda no WhatsApp somente apos confirmar a resposta 200/201, usando numero da OS, horario e link publico retornados.

Crie uma maquina de estados simples para impedir criacao antes da confirmacao do cliente. Inclua testes de webhook duplicado, timeout apos criacao, conflito de agenda, cliente ambiguo e rate limit.

${SECURITY_RULES}`;

const AVAILABILITY_PROMPT = `Implemente a consulta de disponibilidade da API Dominex v1 em TypeScript.

Primeiro chame GET /capabilities e use o timezone retornado. Depois chame GET /availability com from, to, duration_minutes e, quando aplicavel, service_type_id/resource_id. O periodo consultado deve ter no maximo 31 dias e a duracao precisa ficar entre 15 e 480 minutos.

Converta os slots ISO 8601 apenas para exibicao; ao criar a OS, envie exatamente o starts_at escolhido, preservando o offset. No modo agent_selects, mantenha o resource devolvido junto do slot. Nunca calcule disponibilidade localmente nem ofereca um horario que nao veio da resposta.

Trate lista vazia, 409, 422, 429 com Retry-After e 503. Inclua testes para virada de dia e horario de verao.

${SECURITY_RULES}`;

const CUSTOMER_PROMPT = `Implemente a resolucao exata de clientes na API Dominex v1.

Use POST ${BASE_URL}/customers/resolve com somente um identificador confiavel por tentativa. Priorize external_id persistido pela sua integracao; como alternativas, use document normalizado, phone em E.164 ou email normalizado. Nao implemente busca aproximada por nome.

Trate 200 como cliente encontrado, 404 como not_found e 409 ambiguous_customer como necessidade de revisao humana. Nunca altere automaticamente um cliente existente. Se for criar uma OS para cliente novo, envie name e ao menos phone, document, email ou external_id dentro de customer.

Armazene apenas o id/external_id necessario para o vinculo. Mascare dados pessoais nos logs e crie testes para duplicidade, cliente inexistente e retry.

${SECURITY_RULES}`;

const STATUS_PROMPT = `Implemente a consulta de uma OS criada pela mesma integracao na API Dominex v1.

Forneca dois metodos: GET /service-orders/{id} e GET /service-orders/by-external-id/{external_id}. Codifique external_id com encodeURIComponent. Retorne um DTO minimo com id, number, customer, scheduled_at, status, assignment e public_tracking_url.

Trate 404 de forma neutra, sem inferir se o recurso pertence a outro tenant. Em 429 respeite Retry-After. Nao use polling mais frequente que o necessario; aplique backoff e encerre em estados concluida ou cancelada.

${SECURITY_RULES}`;

const PRODUCTION_PROMPT = `Revise uma integracao com a API Publica Dominex v1 antes de producao.

Gere um checklist automatizavel que valide:
- DOMINEX_API_KEY somente no secret manager do servidor;
- menor conjunto de escopos possivel;
- allowlist de IP/CIDR quando a infraestrutura tiver saida fixa;
- rotacao de chave antes de 180 dias e procedimento de revogacao;
- Idempotency-Key estavel e replay do mesmo payload;
- timeout, retry somente para falhas transitorias e respeito a Retry-After;
- redacao de Authorization e dados pessoais em logs/APM;
- alertas para 401, 403, 409, 429 e 5xx;
- testes de concorrencia para evitar OS duplicada;
- fallback humano quando cliente for ambiguo ou nao houver horario.

Produza testes e um runbook de incidente sem incluir qualquer segredo real.

${SECURITY_RULES}`;

const ERRORS_PROMPT = `Crie um tratador robusto para respostas da API Publica Dominex v1.

Interprete application/problem+json com type, title, status, code, detail e request_id. Mapeie:
- 400/422: corrija a requisicao, nao repita automaticamente;
- 401: interrompa e alerte sobre chave invalida, expirada ou revogada;
- 403: interrompa e verifique escopo, assinatura ou allowlist;
- 404: recurso nao encontrado, sem revelar tenant;
- 409 schedule_conflict: consulte disponibilidade novamente;
- 409 idempotency_conflict: incidente de programacao, nunca gere outra chave para mascarar;
- 429: espere Retry-After com jitter;
- 500/503/timeout: retry limitado; em criacao preserve payload e Idempotency-Key.

Inclua uma politica de no maximo 3 tentativas transitorias e testes com relogio falso. Logs devem conter apenas endpoint, status, code, duracao e request_id.

${SECURITY_RULES}`;

export const CREATE_ORDER_CODE_VARIANTS: DocCodeVariant[] = [
  {
    label: 'Node.js',
    language: 'typescript',
    code: `const payload = {
  external_id: "crm-event-01JABC",
  customer: {
    external_id: "crm-contact-42",
    name: "Cliente Exemplo",
    phone: "+5511999999999",
  },
  os_type: "visita_tecnica",
  description: "Avaliação técnica solicitada pelo sistema parceiro.",
  scheduled_at: "2026-10-21T09:30:00-03:00",
  duration_minutes: 90,
};

const response = await fetch("https://api.dominex.app/v1/service-orders", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + process.env.DOMINEX_API_KEY,
    "Idempotency-Key": "crm-event-01JABC",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(10_000),
});

const result = await response.json();
if (!response.ok) throw new Error(result.code ?? "dominex_request_failed");
console.log(result.id, result.number, result.status);`,
  },
  {
    label: 'Python',
    language: 'python',
    code: `import json
import os
from urllib.request import Request, urlopen

payload = {
    "external_id": "crm-event-01JABC",
    "customer": {
        "external_id": "crm-contact-42",
        "name": "Cliente Exemplo",
        "phone": "+5511999999999",
    },
    "os_type": "visita_tecnica",
    "description": "Avaliação técnica solicitada pelo sistema parceiro.",
    "scheduled_at": "2026-10-21T09:30:00-03:00",
    "duration_minutes": 90,
}

request = Request(
    "https://api.dominex.app/v1/service-orders",
    data=json.dumps(payload).encode("utf-8"),
    method="POST",
    headers={
        "Authorization": "Bearer " + os.environ["DOMINEX_API_KEY"],
        "Idempotency-Key": "crm-event-01JABC",
        "Content-Type": "application/json",
    },
)

with urlopen(request, timeout=10) as response:
    result = json.load(response)
    print(result["id"], result["number"], result["status"])`,
  },
  {
    label: 'PHP',
    language: 'php',
    code: `<?php
$payload = [
    "external_id" => "crm-event-01JABC",
    "customer" => [
        "external_id" => "crm-contact-42",
        "name" => "Cliente Exemplo",
        "phone" => "+5511999999999",
    ],
    "os_type" => "visita_tecnica",
    "description" => "Avaliação técnica solicitada pelo sistema parceiro.",
    "scheduled_at" => "2026-10-21T09:30:00-03:00",
    "duration_minutes" => 90,
];

$request = curl_init("https://api.dominex.app/v1/service-orders");
curl_setopt_array($request, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . getenv("DOMINEX_API_KEY"),
        "Idempotency-Key: crm-event-01JABC",
        "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_THROW_ON_ERROR),
]);

$body = curl_exec($request);
if ($body === false) throw new RuntimeException(curl_error($request));
$status = curl_getinfo($request, CURLINFO_HTTP_CODE);
$result = json_decode($body, true, flags: JSON_THROW_ON_ERROR);
if ($status >= 400) throw new RuntimeException($result["code"] ?? "dominex_request_failed");
print_r([$result["id"], $result["number"], $result["status"]]);`,
  },
];

function createReadCodeVariants(path: string): DocCodeVariant[] {
  const url = BASE_URL + path;
  return [
    {
      label: 'Node.js',
      language: 'typescript',
      code: `const response = await fetch("${url}", {
  headers: {
    Authorization: "Bearer " + process.env.DOMINEX_API_KEY,
    Accept: "application/json",
  },
  signal: AbortSignal.timeout(10_000),
});

const result = await response.json();
if (!response.ok) throw new Error(result.code ?? "dominex_request_failed");
console.log(result);`,
    },
    {
      label: 'Python',
      language: 'python',
      code: `import json
import os
from urllib.request import Request, urlopen

request = Request(
    "${url}",
    headers={
        "Authorization": "Bearer " + os.environ["DOMINEX_API_KEY"],
        "Accept": "application/json",
    },
)

with urlopen(request, timeout=10) as response:
    result = json.load(response)
    print(result)`,
    },
    {
      label: 'PHP',
      language: 'php',
      code: `<?php
$request = curl_init("${url}");
curl_setopt_array($request, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . getenv("DOMINEX_API_KEY"),
        "Accept: application/json",
    ],
]);

$body = curl_exec($request);
if ($body === false) throw new RuntimeException(curl_error($request));
$status = curl_getinfo($request, CURLINFO_HTTP_CODE);
$result = json_decode($body, true, flags: JSON_THROW_ON_ERROR);
if ($status >= 400) throw new RuntimeException($result["code"] ?? "dominex_request_failed");
print_r($result);`,
    },
  ];
}

function createPostCodeVariants(path: string, payload: Record<string, string>): DocCodeVariant[] {
  const url = BASE_URL + path;
  const prettyPayload = JSON.stringify(payload, null, 2);
  const compactPayload = JSON.stringify(payload);
  return [
    {
      label: 'Node.js',
      language: 'typescript',
      code: `const payload = ${prettyPayload};

const response = await fetch("${url}", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + process.env.DOMINEX_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(10_000),
});

const result = await response.json();
if (!response.ok) throw new Error(result.code ?? "dominex_request_failed");
console.log(result);`,
    },
    {
      label: 'Python',
      language: 'python',
      code: `import json
import os
from urllib.request import Request, urlopen

payload = json.loads('''${compactPayload}''')
request = Request(
    "${url}",
    data=json.dumps(payload).encode("utf-8"),
    method="POST",
    headers={
        "Authorization": "Bearer " + os.environ["DOMINEX_API_KEY"],
        "Content-Type": "application/json",
    },
)

with urlopen(request, timeout=10) as response:
    result = json.load(response)
    print(result)`,
    },
    {
      label: 'PHP',
      language: 'php',
      code: `<?php
$payload = json_decode('${compactPayload}', true, flags: JSON_THROW_ON_ERROR);
$request = curl_init("${url}");
curl_setopt_array($request, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . getenv("DOMINEX_API_KEY"),
        "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_THROW_ON_ERROR),
]);

$body = curl_exec($request);
if ($body === false) throw new RuntimeException(curl_error($request));
$status = curl_getinfo($request, CURLINFO_HTTP_CODE);
$result = json_decode($body, true, flags: JSON_THROW_ON_ERROR);
if ($status >= 400) throw new RuntimeException($result["code"] ?? "dominex_request_failed");
print_r($result);`,
    },
  ];
}

const CAPABILITIES_CODE_VARIANTS = createReadCodeVariants('/capabilities');
const AVAILABILITY_CODE_VARIANTS = createReadCodeVariants(
  '/availability?from=2026-10-21T08%3A00%3A00-03%3A00&to=2026-10-24T18%3A00%3A00-03%3A00&duration_minutes=90',
);
const STATUS_CODE_VARIANTS = createReadCodeVariants('/service-orders/by-external-id/crm-event-01JABC');
const CUSTOMER_CODE_VARIANTS = createPostCodeVariants('/customers/resolve', {
  external_id: 'crm-contact-42',
});

export const DOC_NAV_GROUPS: DocNavGroup[] = [
  {
    label: 'COMEÇAR',
    items: [
      { label: 'Visão geral', path: '/docs' },
      { label: 'Quickstart', path: '/docs/comecar/quickstart' },
      { label: 'Autenticação', path: '/docs/comecar/autenticacao' },
      { label: 'Preparar produção', path: '/docs/comecar/producao' },
    ],
  },
  {
    label: 'GUIAS POR OBJETIVO',
    items: [
      { label: 'Criar uma OS', path: '/docs/guias/criar-os' },
      { label: 'Consultar disponibilidade', path: '/docs/guias/disponibilidade' },
      { label: 'Encontrar ou criar cliente', path: '/docs/guias/clientes' },
      { label: 'Acompanhar uma OS', path: '/docs/guias/acompanhar-os' },
      { label: 'Exemplo: WhatsApp', path: '/docs/guias/criar-os-whatsapp' },
    ],
  },
  {
    label: 'API E FERRAMENTAS',
    items: [
      { label: 'Referência da API', path: '/docs/api/referencia' },
      { label: 'Para agentes de IA', path: '/docs/api/agentes-de-ia' },
      { label: 'Erros e limites', path: '/docs/api/erros-e-limites' },
    ],
  },
];

export const DOC_ARTICLES: DocArticle[] = [
  {
    path: '/docs/comecar/quickstart',
    title: 'Sua primeira ordem de serviço',
    eyebrow: 'DO ZERO À PRIMEIRA OS',
    description: 'Faça uma integração mínima, segura e idempotente em poucos passos.',
    readingTime: '8 min',
    keywords: ['quickstart', 'primeira requisição', 'curl', 'começar'],
    sections: [
      {
        id: 'prepare', number: '01', title: 'Prepare a integração',
        lead: 'Crie uma integração no painel, conceda apenas os escopos necessários e copie a chave uma única vez.',
        blocks: [
          { type: 'steps', items: [
            { title: 'Abra Configurações → Integrações → API Pública.', detail: 'Defina modo de distribuição, pool de responsáveis e expediente.' },
            { title: 'Gere uma chave de servidor.', detail: 'Salve o segredo em um secret manager. A Dominex não o exibirá novamente.' },
            { title: 'Consulte as capacidades.', detail: 'A resposta informa timezone, escopos, modo e limites vigentes.' },
          ] },
          { type: 'code', language: 'bash', code: `curl '${BASE_URL}/capabilities' \\\n  -H 'Authorization: Bearer dmx_live_PUBLIC_ID.SECRET' \\\n  -H 'Accept: application/json'` },
          { type: 'callout', tone: 'warning', title: 'Somente no servidor', text: 'A chave dá acesso ao tenant vinculado. Nunca a coloque em frontend, aplicativo distribuído, repositório, analytics ou prompt compartilhado.' },
        ],
      },
      {
        id: 'create', number: '02', title: 'Crie a OS com idempotência',
        lead: 'Use uma referência estável do seu sistema como Idempotency-Key. Em caso de timeout, repita a mesma chave e o mesmo JSON.',
        blocks: [
          { type: 'code', language: 'bash', label: 'cURL', collapsible: true, variants: CREATE_ORDER_CODE_VARIANTS, code: `curl --request POST '${BASE_URL}/service-orders' \\\n  -H 'Authorization: Bearer dmx_live_PUBLIC_ID.SECRET' \\\n  -H 'Idempotency-Key: crm-event-01JABC' \\\n  -H 'Content-Type: application/json' \\\n  --data '{
    "external_id": "crm-event-01JABC",
    "customer": {
      "external_id": "crm-contact-42",
      "name": "Cliente Exemplo",
      "phone": "+5511999999999"
    },
    "os_type": "visita_tecnica",
    "description": "Avaliação técnica solicitada pelo sistema parceiro.",
    "scheduled_at": "2026-10-21T09:30:00-03:00",
    "duration_minutes": 90
  }'` },
          { type: 'callout', tone: 'success', title: 'Retry sem duplicação', text: 'A mesma chave com o mesmo payload devolve a resposta persistida. A mesma chave com outro payload retorna 409 idempotency_conflict.' },
        ],
      },
      {
        id: 'delegate', number: '03', title: 'Implemente o cliente da API',
        lead: 'Cole o prompt abaixo no seu agente de código. Ele já inclui o contrato de segurança e os casos de teste essenciais.',
        blocks: [{ type: 'prompt', title: 'Prompt: cliente completo da API', description: 'Compatível com Codex, Claude Code, Cursor e outros agentes com acesso ao seu projeto.', prompt: QUICKSTART_PROMPT, snippets: CREATE_ORDER_CODE_VARIANTS }],
      },
    ],
  },
  {
    path: '/docs/comecar/autenticacao',
    title: 'Autenticação',
    eyebrow: 'A CHAVE FICA COM VOCÊ',
    description: 'Autentique chamadas de servidor sem expor o segredo da integração.',
    readingTime: '6 min',
    keywords: ['bearer', 'chave', 'token', 'autenticação', 'segredo'],
    image: {
      src: '/docs/images/api-authentication.jpg',
      alt: 'Escudo de acrílico transparente protegendo uma chave de servidor preta iluminada em verde',
      caption: 'Credenciais protegidas do painel ao seu servidor.',
    },
    sections: [
      {
        id: 'create-key', number: '01', title: 'Crie a chave no painel',
        lead: 'Cada integração tem configuração e escopos próprios. As chaves podem ser rotacionadas sem perder referências externas.',
        blocks: [
          { type: 'steps', items: [
            { title: 'Escolha a integração.', detail: 'Separe produção, parceiros e agentes quando precisarem de escopos ou allowlists diferentes.' },
            { title: 'Gere e copie o segredo.', detail: 'O token completo aparece uma única vez. Depois, a interface mostra somente prefixo e últimos caracteres.' },
            { title: 'Armazene no servidor.', detail: 'Use o secret manager da sua infraestrutura e disponibilize como DOMINEX_API_KEY.' },
          ] },
          { type: 'table', headers: ['Propriedade', 'Comportamento'], rows: [
            ['Formato', 'dmx_live_<public_id>.<secret>'],
            ['Validade', '180 dias'],
            ['Rotação', 'Sobreposição controlada por até 7 dias'],
            ['Revogação', 'Efeito imediato'],
          ] },
          { type: 'flow', items: [
            { title: 'Gere', detail: 'O segredo aparece apenas uma vez.' },
            { title: 'Proteja', detail: 'Guarde no secret manager do servidor.' },
            { title: 'Use', detail: 'Envie somente no header Authorization.' },
            { title: 'Rotacione', detail: 'Troque a chave antes do vencimento.' },
          ] },
        ],
      },
      {
        id: 'authenticated-request', number: '02', title: 'Faça uma consulta autenticada',
        lead: 'Envie o token no header Bearer. Nunca use query string, cookie ou corpo para transportar a chave.',
        blocks: [
          { type: 'code', language: 'http', label: 'HTTP', variants: CAPABILITIES_CODE_VARIANTS, collapsible: true, code: `GET /v1/capabilities HTTP/1.1
Host: api.dominex.app
Authorization: Bearer dmx_live_PUBLIC_ID.SECRET
Accept: application/json` },
          { type: 'callout', tone: 'info', title: 'Falha fechada', text: 'Chave ausente, inválida, expirada ou revogada retorna 401. Escopo, assinatura ou IP não autorizado retorna 403.' },
        ],
      },
      {
        id: 'rotate-key', number: '03', title: 'Rotacione sem interromper a integração',
        lead: 'Uma rotação cria uma nova credencial e mantém uma janela curta para trocar o segredo com segurança.',
        blocks: [
          { type: 'flow', items: [
            { title: 'Crie a nova chave', detail: 'Mantenha a chave anterior ativa durante a implantação.' },
            { title: 'Atualize o cofre', detail: 'Troque o segredo no ambiente e reinicie os processos necessários.' },
            { title: 'Faça uma chamada', detail: 'Confirme /capabilities e monitore 401 antes de avançar.' },
            { title: 'Revogue a anterior', detail: 'Encerre a sobreposição assim que a nova chave estiver validada.' },
          ] },
          { type: 'details', items: [
            { title: 'E se a chave vazar?', detail: 'Revogue imediatamente no painel, gere outra credencial, atualize o secret manager e investigue os request IDs recentes. Não espere a janela normal de rotação.' },
            { title: 'Como separar ambientes?', detail: 'Crie integrações distintas quando produção, homologação ou parceiros precisarem de escopos, IPs permitidos ou ciclos de rotação diferentes.' },
          ] },
        ],
      },
      {
        id: 'ai-auth', number: '04', title: 'Implemente a autenticação',
        blocks: [{ type: 'prompt', title: 'Prompt: autenticação segura', description: 'Peça ao agente para criar o módulo e seus testes sem jamais ler ou imprimir o segredo real.', prompt: AUTH_PROMPT, snippets: CAPABILITIES_CODE_VARIANTS }],
      },
    ],
  },
  {
    path: '/docs/comecar/producao',
    title: 'Preparar para produção',
    eyebrow: 'ANTES DE LIBERAR',
    description: 'Revise credenciais, retries, observabilidade e recuperação antes do primeiro agendamento real.',
    readingTime: '7 min',
    keywords: ['produção', 'segurança', 'rotate', 'allowlist', 'runbook'],
    sections: [
      {
        id: 'checklist', number: '01', title: 'Feche o checklist operacional',
        blocks: [
          { type: 'steps', items: [
            { title: 'Aplique privilégio mínimo.', detail: 'Conceda somente os escopos usados e configure allowlist quando houver IP de saída fixo.' },
            { title: 'Teste idempotência e concorrência.', detail: 'Retries e eventos duplicados devem produzir exatamente uma OS.' },
            { title: 'Sanitize a observabilidade.', detail: 'Registre request ID, rota, status e latência — nunca Authorization ou dados pessoais.' },
            { title: 'Prepare rotação e revogação.', detail: 'Documente quem troca o segredo e como interromper acesso em um incidente.' },
          ] },
          { type: 'callout', tone: 'warning', title: 'Sem sandbox dedicado na v1', text: 'Valide a integração em um tenant de demonstração com dados fictícios antes de apontar para a empresa real.' },
        ],
      },
      {
        id: 'review-ai', number: '02', title: 'Valide a integração em produção',
        blocks: [{ type: 'prompt', title: 'Prompt: auditoria pré-produção', description: 'Use este prompt depois da implementação e antes de liberar tráfego real.', prompt: PRODUCTION_PROMPT, snippets: CAPABILITIES_CODE_VARIANTS }],
      },
    ],
  },
  {
    path: '/docs/guias/criar-os',
    title: 'Criar uma ordem de serviço',
    eyebrow: 'GUIA POR OBJETIVO',
    description: 'Conecte qualquer aplicação server-to-server à agenda da Dominex com criação atômica e idempotente.',
    readingTime: '10 min',
    keywords: ['ordem de serviço', 'os', 'crm', 'erp', 'formulário', 'automação', 'integração'],
    image: {
      src: '/docs/images/whatsapp-service-order.jpg',
      alt: 'Evento de uma aplicação externa conectado a uma ordem de serviço confirmada na Dominex',
      caption: 'Um evento confiável entra; uma OS completa e reservada sai.',
    },
    sections: [
      {
        id: 'source-event', number: '01', title: 'Comece por um evento confiável',
        lead: 'O fluxo pode nascer em um CRM, ERP, portal, formulário, automação, chatbot ou agente de IA. A origem muda; as garantias da API não.',
        blocks: [
          { type: 'steps', items: [
            { title: 'Valide o evento de origem.', detail: 'Confira assinatura, autenticação e schema antes de usar qualquer dado recebido.' },
            { title: 'Escolha uma referência imutável.', detail: 'Use o ID do evento ou registro da origem como external_id e base da Idempotency-Key.' },
            { title: 'Mapeie somente dados permitidos.', detail: 'Não envie company_id, status, valores financeiros, created_by ou outros campos internos.' },
          ] },
          { type: 'flow', items: [
            { title: 'Receba', detail: 'Valide a origem e o schema do evento.' },
            { title: 'Descubra', detail: 'Leia capacidades, serviços e timezone.' },
            { title: 'Resolva', detail: 'Localize o cliente por identificador exato.' },
            { title: 'Agende', detail: 'Escolha somente um slot devolvido pela API.' },
            { title: 'Concilie', detail: 'Persista IDs, status e link de acompanhamento.' },
          ] },
          { type: 'callout', tone: 'info', title: 'Integração desacoplada', text: 'Mantenha um adaptador entre o modelo do seu sistema e o contrato Dominex. Isso facilita trocar a origem sem reimplementar segurança, retries e agenda.' },
        ],
      },
      {
        id: 'atomic-create', number: '02', title: 'Crie cliente, OS e reserva com segurança',
        lead: 'POST /service-orders revalida o tenant e a agenda dentro da mesma transação. Se qualquer etapa falhar, nada fica parcialmente criado.',
        blocks: [
          { type: 'endpoints', items: [
            { method: 'GET', path: '/capabilities', description: 'Descobre timezone, escopos e modo de distribuição.', scope: 'autenticado' },
            { method: 'GET', path: '/service-types', description: 'Lista serviços reais disponíveis.', scope: 'catalogs:read' },
            { method: 'POST', path: '/customers/resolve', description: 'Localiza o cliente por identificador exato.', scope: 'customers:resolve' },
            { method: 'GET', path: '/availability', description: 'Lista até 50 slots válidos.', scope: 'availability:read' },
            { method: 'POST', path: '/service-orders', description: 'Cria cliente, OS, responsáveis e reserva atomicamente.', scope: 'service_orders:create' },
          ] },
          { type: 'response', eyebrow: 'CRIAÇÃO CONFIRMADA', status: '201', title: 'Cliente, OS e reserva foram persistidos.', items: [
            { title: 'id + number', detail: 'Identificadores internos seguros para suporte e exibição.' },
            { title: 'external_id', detail: 'Referência imutável para conciliar com o sistema de origem.' },
            { title: 'scheduled_at', detail: 'Horário confirmado com offset do tenant.' },
            { title: 'public_tracking_url', detail: 'Link que pode ser entregue ao cliente final.' },
          ] },
          { type: 'callout', tone: 'warning', title: 'Retry precisa preservar a identidade', text: 'Depois de timeout, 500 ou 503, repita exatamente a mesma Idempotency-Key e o mesmo JSON. Gerar outra chave pode duplicar a OS.' },
        ],
      },
      {
        id: 'integration-ai', number: '03', title: 'Implemente na sua aplicação',
        blocks: [{ type: 'prompt', title: 'Prompt: qualquer aplicação → Dominex', description: 'Use como base em CRMs, ERPs, portais, formulários, automações, chatbots ou agentes.', prompt: CREATE_ORDER_PROMPT, snippets: CREATE_ORDER_CODE_VARIANTS }],
      },
    ],
  },
  {
    path: '/docs/guias/criar-os-whatsapp',
    title: 'Exemplo: criar OS pelo WhatsApp',
    eyebrow: 'EXEMPLO DE INTEGRAÇÃO',
    description: 'Transforme uma conversa confirmada em agendamento sem duplicar clientes ou horários.',
    readingTime: '12 min',
    keywords: ['whatsapp', 'agente', 'ia', 'ordem de serviço', 'agendamento'],
    sections: [
      {
        id: 'conversation-flow', number: '01', title: 'Conduza a conversa antes de gravar',
        lead: 'O agente coleta intenção e dados; a API continua sendo a fonte de verdade para serviços, clientes e agenda.',
        blocks: [
          { type: 'steps', items: [
            { title: 'Identifique o cliente.', detail: 'Use uma referência estável do contato e normalize o telefone para E.164.' },
            { title: 'Entenda o serviço.', detail: 'Mapeie a intenção para um item real de GET /service-types.' },
            { title: 'Ofereça horários reais.', detail: 'Mostre somente opções devolvidas por GET /availability.' },
            { title: 'Obtenha confirmação explícita.', detail: 'Repita serviço, data, horário e endereço antes de criar.' },
          ] },
        ],
      },
      {
        id: 'atomic-create', number: '02', title: 'Crie tudo em uma transação',
        lead: 'POST /service-orders resolve ou cria o cliente, revalida a agenda, escolhe o responsável e cria a reserva de forma atômica.',
        blocks: [
          { type: 'endpoints', items: [
            { method: 'GET', path: '/capabilities', description: 'Descobre timezone e modo de distribuição.', scope: 'autenticado' },
            { method: 'GET', path: '/service-types', description: 'Lista serviços reais disponíveis.', scope: 'catalogs:read' },
            { method: 'GET', path: '/availability', description: 'Lista até 50 slots válidos.', scope: 'availability:read' },
            { method: 'POST', path: '/service-orders', description: 'Cria cliente, OS e reserva atomicamente.', scope: 'service_orders:create' },
          ] },
          { type: 'callout', tone: 'warning', title: 'Conflito de agenda', text: 'A API pública nunca sobrescreve conflito. Ao receber 409 schedule_conflict, consulte a disponibilidade novamente e ofereça novas opções.' },
        ],
      },
      {
        id: 'whatsapp-ai', number: '03', title: 'Implemente o fluxo do WhatsApp',
        blocks: [{ type: 'prompt', title: 'Prompt: agente de WhatsApp → Dominex', description: 'Inclui máquina de estados, confirmação humana, retries seguros e testes.', prompt: WHATSAPP_PROMPT, snippets: CREATE_ORDER_CODE_VARIANTS }],
      },
    ],
  },
  {
    path: '/docs/guias/disponibilidade',
    title: 'Consultar disponibilidade',
    eyebrow: 'GUIA POR OBJETIVO',
    description: 'Ofereça somente horários livres no fuso e no modo de distribuição configurados pela empresa.',
    readingTime: '8 min',
    keywords: ['agenda', 'horário', 'slot', 'timezone', 'disponibilidade'],
    image: {
      src: '/docs/images/schedule-availability.jpg',
      alt: 'Calendário de acrílico com horários disponíveis iluminados em verde',
      caption: 'Slots reais, no fuso e no modo configurados pelo tenant.',
    },
    sections: [
      {
        id: 'timezone', number: '01', title: 'Comece pelo timezone do tenant',
        blocks: [
          { type: 'paragraph', text: 'Consulte /capabilities a cada início de execução relevante. O timezone retornado é canônico; não deduza o fuso pelo telefone, IP ou localização do agente.' },
          { type: 'code', language: 'bash', label: 'cURL', variants: AVAILABILITY_CODE_VARIANTS, collapsible: true, code: `curl --get '${BASE_URL}/availability' \\\n  -H 'Authorization: Bearer dmx_live_PUBLIC_ID.SECRET' \\\n  --data-urlencode 'from=2026-10-21T08:00:00-03:00' \\\n  --data-urlencode 'to=2026-10-24T18:00:00-03:00' \\\n  --data-urlencode 'duration_minutes=90'` },
        ],
      },
      {
        id: 'distribution', number: '02', title: 'Respeite o modo de distribuição',
        blocks: [
          { type: 'flow', items: [
            { title: 'Leia o fuso', detail: 'Use o timezone retornado em /capabilities.' },
            { title: 'Defina a janela', detail: 'Consulte no máximo 31 dias por chamada.' },
            { title: 'Escolha um slot', detail: 'Mantenha horário, offset e recurso juntos.' },
            { title: 'Revalide ao criar', detail: 'O banco confirma o slot novamente na transação.' },
          ] },
          { type: 'table', headers: ['Modo', 'Como usar'], rows: [
            ['agent_selects', 'Escolha um resource devolvido pela API e envie-o na criação.'],
            ['round_robin', 'Mostre horários agregados; o banco escolhe o próximo responsável disponível.'],
            ['unassigned', 'Valide o expediente; a OS retorna assignment_pending.'],
          ] },
          { type: 'callout', tone: 'info', title: 'Intervalos adjacentes são válidos', text: 'Reservas usam [início, fim): uma OS pode começar exatamente quando a anterior termina.' },
          { type: 'details', items: [
            { title: 'Por que não calcular os horários na minha aplicação?', detail: 'O motor da Dominex combina expediente, exceções, antecedência, horizonte, reservas, equipe e modo de distribuição. Um cálculo local pode oferecer um horário inválido.' },
            { title: 'O que fazer quando nenhum slot voltar?', detail: 'Amplie a janela dentro do limite, permita outra duração ou encaminhe o atendimento para uma pessoa. Nunca invente um horário como fallback.' },
            { title: 'O slot fica bloqueado depois da consulta?', detail: 'Não. A disponibilidade é revalidada durante POST /service-orders; por isso 409 schedule_conflict deve levar a uma nova consulta.' },
          ] },
        ],
      },
      {
        id: 'availability-ai', number: '03', title: 'Implemente a consulta',
        blocks: [{ type: 'prompt', title: 'Prompt: disponibilidade e timezone', description: 'O prompt impede cálculo local de agenda e cobre horário de verão.', prompt: AVAILABILITY_PROMPT, snippets: AVAILABILITY_CODE_VARIANTS }],
      },
    ],
  },
  {
    path: '/docs/guias/clientes',
    title: 'Encontrar ou criar cliente',
    eyebrow: 'GUIA POR OBJETIVO',
    description: 'Resolva identidades de forma exata, sem alterar cadastros existentes nem misturar tenants.',
    readingTime: '7 min',
    keywords: ['cliente', 'cpf', 'cnpj', 'telefone', 'email', 'external id'],
    image: {
      src: '/docs/images/customer-identity.jpg',
      alt: 'Cartões de cliente em acrílico protegidos por uma chave',
      caption: 'Identidade exata antes de qualquer criação ou associação.',
    },
    sections: [
      {
        id: 'resolution-order', number: '01', title: 'Use identificadores exatos',
        lead: 'A resolução não faz busca aproximada por nome. Isso evita associar uma conversa ao cliente errado.',
        blocks: [
          { type: 'steps', items: [
            { title: 'external_id da integração', detail: 'É a opção preferida quando você já persistiu o vínculo.' },
            { title: 'CPF ou CNPJ', detail: 'A pontuação é removida pelo servidor antes da comparação.' },
            { title: 'Telefone E.164', detail: 'Envie código do país, DDD e número, por exemplo +5511999999999.' },
            { title: 'E-mail normalizado', detail: 'Use como último identificador exato disponível.' },
          ] },
          { type: 'flow', items: [
            { title: 'external_id', detail: 'Vínculo mais estável da sua integração.' },
            { title: 'Documento', detail: 'CPF ou CNPJ normalizado.' },
            { title: 'Telefone', detail: 'Número completo no padrão E.164.' },
            { title: 'E-mail', detail: 'Comparação exata após normalização.' },
          ] },
          { type: 'code', language: 'http', label: 'HTTP', variants: CUSTOMER_CODE_VARIANTS, collapsible: true, code: `POST /v1/customers/resolve HTTP/1.1
Host: api.dominex.app
Authorization: Bearer dmx_live_PUBLIC_ID.SECRET
Content-Type: application/json

{
  "external_id": "crm-contact-42"
}` },
        ],
      },
      {
        id: 'not-found', number: '02', title: 'Crie somente quando necessário',
        blocks: [
          { type: 'paragraph', text: 'Quando a resolução retornar 404, envie os dados do novo cliente dentro de POST /service-orders. O nome é obrigatório junto de ao menos telefone, documento, e-mail ou referência externa.' },
          { type: 'details', items: [
            { title: 'O que significa ambiguous_customer?', detail: 'Mais de um cadastro correspondeu ao identificador recebido. Pare a automação e peça revisão humana; escolher pelo nome ou pelo primeiro resultado pode associar a OS à pessoa errada.' },
            { title: 'Posso corrigir o telefone do cliente durante a criação?', detail: 'Não. A API v1 não altera cliente existente nesse fluxo. Faça a atualização pelo processo interno autorizado e tente novamente.' },
          ] },
          { type: 'callout', tone: 'warning', title: 'Cliente existente é imutável neste fluxo', text: 'A criação de OS nunca atualiza automaticamente telefone, e-mail, documento ou endereço de um cadastro já existente.' },
        ],
      },
      {
        id: 'customers-ai', number: '03', title: 'Implemente a resolução',
        blocks: [{ type: 'prompt', title: 'Prompt: identidade do cliente', description: 'Inclui privacidade, ambiguidade e criação segura.', prompt: CUSTOMER_PROMPT, snippets: CUSTOMER_CODE_VARIANTS }],
      },
    ],
  },
  {
    path: '/docs/guias/acompanhar-os',
    title: 'Acompanhar uma OS',
    eyebrow: 'GUIA POR OBJETIVO',
    description: 'Consulte uma ordem criada pela mesma integração e entregue o link público ao cliente.',
    readingTime: '5 min',
    keywords: ['status', 'acompanhar', 'tracking', 'external id', 'ordem de serviço'],
    image: {
      src: '/docs/images/service-order-tracking.jpg',
      alt: 'Rota de atendimento em acrílico conectando uma ordem de serviço ao ponto de destino',
      caption: 'A mesma referência acompanha a OS do agendamento à conclusão.',
    },
    sections: [
      {
        id: 'lookup', number: '01', title: 'Escolha a referência de consulta',
        blocks: [
          { type: 'endpoints', items: [
            { method: 'GET', path: '/service-orders/{id}', description: 'Consulta pelo UUID devolvido na criação.', scope: 'service_orders:read' },
            { method: 'GET', path: '/service-orders/by-external-id/{external_id}', description: 'Consulta pela referência estável do seu sistema.', scope: 'service_orders:read' },
          ] },
          { type: 'callout', tone: 'info', title: 'Isolamento por integração', text: 'A consulta retorna somente OS criadas pela mesma integração. Recurso inexistente ou de outro tenant recebe o mesmo 404.' },
          { type: 'flow', items: [
            { title: 'Persista a referência', detail: 'Guarde id e external_id depois da criação.' },
            { title: 'Consulte com moderação', detail: 'Faça polling apenas quando a experiência exigir.' },
            { title: 'Mostre o link público', detail: 'Entregue o acompanhamento devolvido pela API.' },
            { title: 'Pare no estado final', detail: 'Encerre consultas em concluída ou cancelada.' },
          ] },
        ],
      },
      {
        id: 'read-response', number: '02', title: 'Use uma resposta mínima e previsível',
        lead: 'A API devolve apenas os dados necessários para reconhecer a OS, informar o cliente e decidir se o acompanhamento continua.',
        blocks: [
          { type: 'response', eyebrow: 'RESPOSTA DA API', status: '200', title: 'A ordem foi localizada.', items: [
            { title: 'Identidade', detail: 'id, number e external_id para conciliação.' },
            { title: 'Agendamento', detail: 'scheduled_at com offset e timezone do tenant.' },
            { title: 'Operação', detail: 'status atual e responsável quando já atribuído.' },
            { title: 'Cliente', detail: 'public_tracking_url seguro para compartilhamento.' },
          ] },
          { type: 'details', items: [
            { title: 'Qual frequência de consulta devo usar?', detail: 'Prefira eventos do seu próprio fluxo e consultas sob demanda. Quando polling for necessário, aumente o intervalo progressivamente e respeite qualquer 429 com Retry-After.' },
            { title: 'Por que uma OS existente pode retornar 404?', detail: 'Somente a integração que criou a OS pode consultá-la. O mesmo 404 é usado para recurso inexistente, de outra integração ou de outro tenant.' },
          ] },
        ],
      },
      {
        id: 'status-ai', number: '03', title: 'Implemente a consulta',
        blocks: [{ type: 'prompt', title: 'Prompt: status e acompanhamento', description: 'Inclui polling moderado, estados finais e logs sem vazamento.', prompt: STATUS_PROMPT, snippets: STATUS_CODE_VARIANTS }],
      },
    ],
  },
  {
    path: '/docs/api/referencia',
    title: 'Referência da API',
    eyebrow: 'CONTRATO V1',
    description: 'Endpoints estáveis para catálogos, agenda, clientes e ordens de serviço.',
    readingTime: '10 min',
    keywords: ['openapi', 'endpoint', 'scope', 'referência', 'api'],
    image: {
      src: '/docs/images/api-reference-network.jpg',
      alt: 'Rede modular de blocos de acrílico conectada a um núcleo preto da API Dominex',
      caption: 'Um contrato estável conecta diferentes aplicações à mesma operação.',
    },
    sections: [
      {
        id: 'endpoints', number: '01', title: 'Endpoints disponíveis',
        blocks: [{ type: 'endpoints', items: [
          { method: 'GET', path: '/capabilities', description: 'Versão, timezone, escopos, modo e limites.', scope: 'autenticado' },
          { method: 'GET', path: '/service-types', description: 'Serviços ativos, sem preço ou dado fiscal.', scope: 'catalogs:read' },
          { method: 'GET', path: '/booking-resources', description: 'Responsáveis permitidos em agent_selects.', scope: 'catalogs:read' },
          { method: 'GET', path: '/availability', description: 'Slots livres com offset e timezone.', scope: 'availability:read' },
          { method: 'POST', path: '/customers/resolve', description: 'Resolução exata sem alterar cadastro.', scope: 'customers:resolve' },
          { method: 'POST', path: '/service-orders', description: 'Criação atômica e idempotente.', scope: 'service_orders:create' },
          { method: 'GET', path: '/service-orders/{id}', description: 'Consulta por UUID.', scope: 'service_orders:read' },
          { method: 'GET', path: '/service-orders/by-external-id/{external_id}', description: 'Consulta por referência externa.', scope: 'service_orders:read' },
        ] }],
      },
      {
        id: 'request-lifecycle', number: '02', title: 'Entenda o ciclo de cada requisição',
        lead: 'Autenticação, isolamento de tenant, escopo e limites são verificados antes da regra de negócio.',
        blocks: [
          { type: 'flow', items: [
            { title: 'Autenticar', detail: 'Valida chave, expiração, assinatura e IP.' },
            { title: 'Autorizar', detail: 'Confere o escopo exigido pela rota.' },
            { title: 'Executar', detail: 'Revalida recursos no tenant derivado da chave.' },
            { title: 'Responder', detail: 'Retorna JSON permitido e um request ID.' },
          ] },
          { type: 'details', items: [
            { title: 'Quais headers aparecem em toda resposta?', detail: 'X-Request-Id identifica a chamada para suporte e Cache-Control: no-store evita armazenamento acidental de respostas privadas.' },
            { title: 'A API aceita company_id?', detail: 'Não. O tenant é sempre derivado da chave. IDs externos e UUIDs recebidos são revalidados antes do uso.' },
            { title: 'Posso chamar a API direto do navegador?', detail: 'Não. A API v1 é exclusivamente server-to-server e não habilita CORS para aplicações de navegador.' },
          ] },
        ],
      },
      {
        id: 'openapi', number: '03', title: 'Use o contrato OpenAPI',
        lead: 'O schema OpenAPI 3.1.1 é a fonte canônica para gerar clientes, validar exemplos e alimentar agentes de código.',
        blocks: [
          { type: 'code', language: 'text', code: 'https://api.dominex.app/v1/openapi.json' },
          { type: 'callout', tone: 'success', title: 'Contrato versionado', text: 'Mudanças aditivas permanecem em /v1. Qualquer mudança incompatível exige uma nova versão da API.' },
        ],
      },
      {
        id: 'reference-ai', number: '04', title: 'Gere um cliente tipado',
        blocks: [{ type: 'prompt', title: 'Prompt: cliente tipado a partir do OpenAPI', description: 'Forneça este prompt junto do openapi.json ao seu agente.', prompt: QUICKSTART_PROMPT, snippets: CREATE_ORDER_CODE_VARIANTS }],
      },
    ],
  },
  {
    path: '/docs/api/agentes-de-ia',
    title: 'Para agentes de IA',
    eyebrow: 'DOCUMENTAÇÃO AI-NATIVE',
    description: 'Entregue contexto confiável ao seu agente sem misturar instruções com segredos.',
    readingTime: '6 min',
    keywords: ['llms.txt', 'codex', 'claude', 'cursor', 'prompt', 'agente'],
    sections: [
      {
        id: 'context-files', number: '01', title: 'Dê ao agente a fonte certa',
        blocks: [
          { type: 'endpoints', items: [
            { method: 'GET', path: '/docs/llms.txt', description: 'Resumo textual, regras e links para agentes.', scope: 'público' },
            { method: 'GET', path: '/v1/openapi.json', description: 'Contrato completo e legível por ferramentas.', scope: 'público' },
          ] },
          { type: 'callout', tone: 'warning', title: 'Contexto não é cofre', text: 'Nunca cole uma chave real em chat, issue, prompt, arquivo Markdown ou contexto persistente do agente.' },
        ],
      },
      {
        id: 'agent-workflow', number: '02', title: 'Use um fluxo verificável',
        blocks: [
          { type: 'steps', items: [
            { title: 'Anexe openapi.json ou aponte a URL.', detail: 'Peça para o agente tratar esse contrato como fonte da verdade.' },
            { title: 'Cole o prompt do guia correspondente.', detail: 'Cada prompt inclui segurança, retries e casos de teste daquele objetivo.' },
            { title: 'Revise o plano antes da edição.', detail: 'Confirme linguagem, framework, local de armazenamento de segredos e estratégia de testes.' },
            { title: 'Execute testes com dados fictícios.', detail: 'Use tenant de demonstração e confira logs antes de liberar produção.' },
          ] },
        ],
      },
      {
        id: 'master-prompt', number: '03', title: 'Comece com o prompt mestre',
        blocks: [{ type: 'prompt', title: 'Prompt: integração Dominex completa', description: 'Uma base segura para o agente adaptar à sua stack.', prompt: QUICKSTART_PROMPT, snippets: CREATE_ORDER_CODE_VARIANTS }],
      },
    ],
  },
  {
    path: '/docs/api/erros-e-limites',
    title: 'Erros e limites',
    eyebrow: 'OPERAÇÃO PREVISÍVEL',
    description: 'Trate falhas sem loops agressivos, vazamento de dados ou criação duplicada.',
    readingTime: '7 min',
    keywords: ['erro', '429', 'retry-after', 'rate limit', 'problem json'],
    image: {
      src: '/docs/images/rate-limit-resilience.jpg',
      alt: 'Fila de requisições em acrílico atravessando um limitador com indicadores âmbar e verde',
      caption: 'Controle de tráfego, retries limitados e recuperação previsível.',
    },
    sections: [
      {
        id: 'problem-json', number: '01', title: 'Leia application/problem+json',
        blocks: [
          { type: 'code', language: 'json', code: `{
  "type": "https://api.dominex.app/problems/schedule-conflict",
  "title": "Conflito de agendamento",
  "status": 409,
  "code": "schedule_conflict",
  "detail": "O responsável não está disponível nesse horário.",
  "request_id": "018f9c91-8c0c-7c15-a9c1-c6245482aaaa"
}` },
          { type: 'paragraph', text: 'Guarde request_id nos logs técnicos sanitizados. Ele permite investigar a chamada sem armazenar o payload ou o segredo.' },
          { type: 'details', items: [
            { title: '400 ou 422: devo repetir?', detail: 'Não automaticamente. Corrija schema, tipos, campos ou regras de validação antes de criar uma nova tentativa.' },
            { title: '409: todo conflito permite retry?', detail: 'Não. schedule_conflict pede nova disponibilidade; idempotency_conflict indica que a mesma chave foi usada com outro payload e precisa de correção no código.' },
            { title: '500, 503 ou timeout: como repetir uma criação?', detail: 'Faça poucas tentativas com backoff e jitter, preservando exatamente o mesmo JSON e a mesma Idempotency-Key.' },
          ] },
        ],
      },
      {
        id: 'limits', number: '02', title: 'Respeite os limites por chave',
        blocks: [
          { type: 'table', headers: ['Categoria', 'Limite padrão'], rows: [
            ['Todas as requisições', '60 por minuto'],
            ['Disponibilidade', '30 por minuto'],
            ['Mutações', '10 por minuto'],
            ['Corpo da requisição', '64 KiB'],
            ['Janela de disponibilidade', '31 dias'],
            ['Opções por resposta', '50 slots'],
          ] },
          { type: 'callout', tone: 'warning', title: '429 exige espera', text: 'Use o valor de Retry-After em segundos. Filas e backoff com jitter protegem sua integração e a experiência do cliente.' },
          { type: 'flow', items: [
            { title: 'Pare a tentativa', detail: 'Não repita imediatamente.' },
            { title: 'Leia Retry-After', detail: 'Use o tempo informado pelo servidor.' },
            { title: 'Adicione jitter', detail: 'Evite que todos os workers voltem juntos.' },
            { title: 'Limite retries', detail: 'Depois de três falhas, encaminhe para recuperação.' },
          ] },
          { type: 'response', eyebrow: 'RESPOSTA DE LIMITE', status: '429', title: 'A chamada precisa aguardar.', items: [
            { title: 'Retry-After', detail: 'Quantidade de segundos antes da próxima tentativa.' },
            { title: 'request_id', detail: 'Correlação segura para investigação e suporte.' },
            { title: 'code', detail: 'rate_limit_exceeded para tratamento programático.' },
          ] },
        ],
      },
      {
        id: 'errors-ai', number: '03', title: 'Implemente a política de erros',
        blocks: [{ type: 'prompt', title: 'Prompt: erros, retries e rate limit', description: 'Gera um tratador com política limitada e testes determinísticos.', prompt: ERRORS_PROMPT, snippets: STATUS_CODE_VARIANTS }],
      },
    ],
  },
];

export const DOC_ARTICLE_BY_PATH = new Map(DOC_ARTICLES.map((article) => [article.path, article]));

export const DOC_SEARCH_ITEMS = [
  { path: '/docs', title: 'Visão geral', description: 'Conecte qualquer aplicação server-to-server à Dominex.', keywords: ['início', 'visão geral', 'api pública', 'crm', 'erp', 'automação'] },
  ...DOC_ARTICLES.map(({ path, title, description, keywords }) => ({ path, title, description, keywords })),
];

export { QUICKSTART_PROMPT };
