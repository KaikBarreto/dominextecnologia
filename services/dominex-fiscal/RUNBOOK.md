# RUNBOOK — `dominex-fiscal` (motor NFS-e próprio, Sefin Nacional)

> **O que é:** microserviço Python que emite/consulta/cancela NFS-e **direto na API
> do governo** (Sefin Nacional), com o certificado A1 do cliente. Existe porque as
> Edge Functions da Supabase **não fazem mTLS** e o governo só autentica por mTLS.
>
> **Por que é urgente:** a assinatura da Fisqal foi cancelada. **Hoje nenhum cliente
> da Dominex emite nota fiscal.** Este serviço é o caminho de volta.
>
> **Onde roda:** a mesma VPS Hostinger KVM 2 (Ubuntu 24.04, 8 GB, `46.202.149.193`)
> que já roda a Evolution API.
>
> ## ⚠️ ESTA VPS É COMPARTILHADA
> A Evolution API desta box atende **Dominex E EcoSistema**. Um comando errado aqui
> não derruba só a nota fiscal — derruba o WhatsApp dos dois produtos. A §8
> (“NUNCA faça”) é a lista curta do que quebra os dois.
>
> **Convenções:** comandos rodam como o usuário **`deploy`**
> (`ssh deploy@46.202.149.193`). Onde precisa de root, tem `sudo` explícito. Todo
> passo diz **o que esperar**. Blocos **⚠️** exigem leitura antes de colar.

---

## Índice

| § | Assunto |
|---|---|
| [0](#0-arquitetura-e-por-quê) | Arquitetura e por quê (leia antes de operar) |
| [1](#1-preparar-o-servidor) | Preparar o servidor: arquivos, KEK, token |
| [2](#2-subir-o-serviço) | Subir e **verificar que subiu** |
| [3](#3-rotação-de-segredo) | **Rotação da KEK** e do token |
| [4](#4-dns--caddy-https) | DNS + Caddy (HTTPS) |
| [5](#5-operação-do-dia-a-dia) | Logs, restart, deploy, emissão interrompida |
| [6](#6-teste-de-fumaça-e-alerta) | Teste de fumaça agendado + alerta no WhatsApp |
| [7](#7-capacidade-a-box-é-dividida) | Capacidade (a box é dividida) |
| [8](#8-nunca-faça) | **NUNCA faça** |
| [9](#9-o-que-depende-de-outra-pessoa) | O que depende de outra pessoa |

---

## 0. Arquitetura e por quê

```
  Browser do cliente
        │  (HTTPS — o .pfx sobe uma vez, direto pra edge)
        ▼
  Supabase Edge Function  ── guarda o .pfx CIFRADO no Storage privado
        │                    e a DEK ENVELOPADA no banco
        │  HTTPS + Authorization: Bearer <FISCAL_SERVICE_TOKEN>
        │  corpo = { certificado cifrado + dek envelopada, dados da nota, ambiente }
        ▼
  Caddy (host, :443) ──► dominex-fiscal (container, 127.0.0.1:8099)
                              │  decifra em MEMÓRIA (KEK que só existe aqui)
                              │  grava PEM em tmpfs (RAM), 0600, apaga no finally
                              ▼
                         Sefin Nacional (mTLS)
```

### Contrato HTTP (o que o Caddy libera e o que o smoke test usa)

| Rota | Auth | Dono |
|---|---|---|
| `GET /healthz` | **não** | motor — devolve só `{"ok": true}` |
| `GET /readyz` · `GET /readyz?deep=1` | Bearer | infra |
| `GET /admin/kek/status` · `POST /admin/kek/rewrap` · `POST /admin/smoke` | Bearer | infra |
| `POST /v1/nfse/emitir` · `POST /v1/nfse/{chave}/cancelar` · `GET|POST /v1/nfse/{chave}` · `GET|POST /v1/nfse/{chave}/danfse` · `POST /v1/certificado/selar` | Bearer | motor |
| `GET /v1/nfse/autoteste` | Bearer | motor — canário de layout, **não transmite nada** |

> As rotas do motor também respondem **sem** o prefixo `/v1` (alias). O caminho
> oficial, e o que deve aparecer no log, é o `/v1`.

**Produção x homologação não é config do servidor**: o campo `ambiente`
(`1` = produção, `2` = homologação) vem **no corpo de cada requisição**. Isso é
deliberado — não existe chave global que alguém vire sem querer, e o teste de fumaça
roda em homologação sem tocar em nada do que os clientes usam.

### As quatro decisões que valem explicação

**1. Stack Docker Compose SEPARADO (`~/dominex-fiscal`), não um serviço a mais no
compose da Evolution.**
`docker compose down` no diretório da Evolution derruba o WhatsApp dos dois produtos.
Se o fiscal morasse lá, **todo deploy de nota fiscal viraria janela de risco pro
WhatsApp** — e o fiscal vai ser redeployado com frequência (esteira de layout),
enquanto a Evolution fica pinada e quieta. Projetos separados também significam
prefixos de volume separados: um `down -v` acidental aqui não chega perto de
`evolution_instances` (cuja perda obriga re-parear QR de **todos** os tenants).

**2. O microserviço NÃO fala com a Supabase. Nunca.**
Ele não tem `service_role key`, não tem URL de projeto, não consulta tabela. Quem lê
e escreve o banco é a Edge Function; aqui só entra e sai *blob*. É isso que preserva
a propriedade central da §Custódia: **o acervo de certificados está só na Supabase; a
KEK está só na VPS. Comprometer um lado sozinho não abre nada.** No dia em que
alguém propuser “põe a chave do Supabase no container pra simplificar”, a resposta é
não — isso junta as duas metades no mesmo lugar e joga fora o desenho inteiro.

**3. `tmpfs` é requisito de segurança, não conveniência.**
A `requests` exige **caminho de arquivo** para o mTLS (`cert=(pem, key)`) — não
aceita bytes. A §Custódia proíbe chave privada em disco persistente. Logo: tmpfs
(RAM) em `/run/dominex-fiscal`, `0700`, `noexec,nosuid,nodev`, apagado no `finally`.
O spike gravava PEM em `/tmp` comum; **isso não se repete aqui**.
Detalhe que quase passa batido: **tmpfs é lastreado por swap**. Sem cuidado, uma
página com a chave privada do cliente iria pro disco — e daí pro snapshot semanal da
Hostinger. Por isso o compose tem `memswap_limit == mem_limit`: **swap desligado para
o cgroup**. É esse par (tmpfs + sem swap) que fecha o buraco.

**4. Bearer token, não allowlist de IP.**
A Supabase **não publica faixa estável de IP de egresso** das Edge Functions. Montar
allowlist com IPs observados é pior que não ter: no dia em que a Supabase mudar de
região, a emissão cai para **todos** os clientes, em silêncio, e o diagnóstico é
horrível. Então: token de 48 bytes + TLS + rota fechada no Caddy + `fail2ban` banindo
quem erra o token (§2.6). Se um dia a Supabase publicar faixa estável, dá pra somar
`ufw allow from <faixa> to any port 443` — **somar**, não trocar.

---

## 1. Preparar o servidor

### 1.1 — Entrar e conferir onde você está

```bash
ssh deploy@46.202.149.193
whoami && hostname && docker --version && docker compose version && caddy version
```

- **Esperar:** `deploy`, `srv1876268.hstgr.cloud`, Docker 27+/29+, Compose v2, Caddy v2.
- **Se `docker` der “permission denied”:** você não está no grupo `docker`. Saia e
  entre de novo por SSH.

### 1.2 — Conferir que o WhatsApp está de pé ANTES de mexer em qualquer coisa

> Ponto de referência. Se algo quebrar depois, você precisa saber se já estava assim.

```bash
cd ~/whatsapp-evolution && docker compose ps
free -h && df -h / && swapon --show
```

- **Esperar:** os 3 serviços da Evolution `Up`; RAM com folga; `/` bem abaixo de 85%.
- **`swapon --show` vazio** = a box não tem swap, ótimo. Se listar algo, sem pânico:
  o `memswap_limit` do compose já impede que **este** container use swap.
- **⚠️ Se a Evolution estiver fora**, resolva isso primeiro. Não empilhe incidente.

### 1.3 — Copiar os arquivos pra VPS

Do **seu Mac**, na raiz do repo:

```bash
scp -r services/dominex-fiscal deploy@46.202.149.193:~/dominex-fiscal
```

Na VPS:

```bash
ls -l ~/dominex-fiscal && chmod +x ~/dominex-fiscal/*.sh
```

> O diretório se chama `dominex-fiscal` **de propósito**: o nome do projeto Compose
> vem daí, e é o que torna os nomes de container previsíveis.

### 1.4 — Gerar os segredos ⚠️ (o passo mais importante do runbook)

Tudo num arquivo só, `/etc/dominex-fiscal/service.env` — **fora do repo, fora do git,
fora da imagem Docker**.

```bash
sudo install -d -m 0750 -o root -g root /etc/dominex-fiscal
```

**Gere os dois segredos e monte o arquivo:**

```bash
# Token compartilhado com as Edge Functions (48 bytes → 96 hex).
TOKEN=$(openssl rand -hex 48)

# KEK #1 — a chave que protege os certificados dos clientes (32 bytes em base64).
KEK=$(openssl rand -base64 32)

sudo tee /etc/dominex-fiscal/service.env >/dev/null <<EOF
FISCAL_SERVICE_TOKEN=$TOKEN
FISCAL_SERVICE_TOKEN_PREV=
FISCAL_KEKS=1:$KEK
EOF

# ⚠️ Permissão: o `deploy` precisa LER (é ele quem roda `docker compose up`).
sudo chown root:deploy /etc/dominex-fiscal/service.env
sudo chmod 0640        /etc/dominex-fiscal/service.env

echo "=== ANOTE AGORA (vão pro cofre e pro Supabase) ==="
echo "FISCAL_SERVICE_TOKEN=$TOKEN"
echo "KEK #1 = $KEK"
unset TOKEN KEK
```

- **Validar (sem imprimir segredo):**

```bash
sudo awk -F= '{printf "%s=%s caracteres\n", $1, length($2)}' /etc/dominex-fiscal/service.env
ls -l /etc/dominex-fiscal/service.env
```

- **Esperar:** `FISCAL_SERVICE_TOKEN=96 caracteres`, `FISCAL_SERVICE_TOKEN_PREV=0`,
  `FISCAL_KEKS=46 caracteres` (`1:` + 44 do base64), e permissão
  `-rw-r----- root deploy`.

> **Por que env e não Docker secret?** Como o `env_file` vira variável de ambiente, os
> valores aparecem em `docker inspect` e em `/proc/<pid>/environ`. Só que **quem
> consegue rodar `docker inspect` tem o socket do Docker, o que já equivale a root no
> host — e root lê `/etc/dominex-fiscal` de qualquer jeito.** Ou seja: o env **não
> amplia** quem consegue ver a KEK. O que ele exige é disciplina de log e de dump —
> daí a proibição de `LOG_LEVEL=DEBUG` na §8.

> ### ⚠️⚠️ GUARDE A KEK FORA DA VPS — HOJE, ANTES DE SEGUIR
> Se a KEK se perder (disco, VPS reinstalada, conta suspensa), **nenhum certificado
> de cliente pode mais ser decifrado**. O ciphertext continua na Supabase, mas vira
> lixo — e **todo cliente teria que subir o certificado de novo**. O snapshot semanal
> da Hostinger não resolve: mora na mesma conta que pode ser perdida junto.
> **Faça agora:** grave a KEK no **gerenciador de senhas**, item
> “Dominex — KEK fiscal #1”, com a data. É o único lugar fora da Hostinger e fora da
> Supabase. Sim, isso cria mais um lugar onde a chave existe — é a troca consciente
> entre *risco de vazamento* e *risco de perda total*, e perda total é pior.

**O mesmo token do lado do Supabase.** Do seu Mac, na raiz do repo
(projeto `byqldosixshhuiuarszp`):

```bash
npx supabase secrets set FISCAL_SERVICE_TOKEN='<o token anotado acima>'
npx supabase secrets set FISCAL_SERVICE_URL='https://fiscal.dominex.app'
npx supabase secrets list
```

- **Esperar:** os dois nomes na lista (o valor fica oculto).
- **⚠️ Escopo:** consumir esses secrets no código da edge é da 🛡️ Plataforma (C7).
  Aqui a gente só publica o segredo e a URL.

### 1.5 — `.env` do serviço (sem segredo nenhum)

```bash
cd ~/dominex-fiscal
cp .env.example .env && chmod 600 .env
grep -v '^#' .env | grep .
```

- **Esperar:** `REQ_FILE`, `FISCAL_HTTP_TIMEOUT`, `FISCAL_VER_APLIC`. **Nenhum segredo.**

---

## 2. Subir o serviço

### 2.1 — Build

```bash
cd ~/dominex-fiscal
docker compose build
```

- **Esperar:** build em 2 estágios; o estágio final não instala compilador. ~2–4 min
  na primeira vez.
- **Validar:** `docker images dominex-fiscal:local` → imagem existe, ~250–400 MB.

### 2.2 — Congelar as versões (LOCK) ⚠️ não pule

> Sem isso, um rebuild qualquer traz uma `nfelib` nova no meio da madrugada. É
> exatamente o risco R2 do plano: a biblioteca **já nasceu uma versão de esquema
> atrás** do servidor do governo.

```bash
cd ~/dominex-fiscal
docker compose run --rm --no-deps --entrypoint "" dominex-fiscal \
  /opt/venv/bin/pip freeze > requirements.lock.txt
head -5 requirements.lock.txt
sed -i 's|^REQ_FILE=.*|REQ_FILE=requirements.lock.txt|' .env
docker compose build
```

- **Esperar:** dezenas de linhas `pacote==versão`.
- **Depois:** copie o `requirements.lock.txt` pro repo (`services/dominex-fiscal/`) e
  **commite**. A partir daí, subir versão de biblioteca fiscal é **evento planejado**,
  com o §6 passando antes.

### 2.3 — Subir

```bash
cd ~/dominex-fiscal
docker compose up -d
docker compose ps
```

- **Esperar:** `dominex-fiscal` `Up (health: starting)` e, em ~30s, `Up (healthy)`.
- **Validar a porta (o item de segurança nº 1):**

```bash
sudo ss -ltnp | grep 8099
```

- **Esperar:** `127.0.0.1:8099`.
  **⚠️ Se aparecer `0.0.0.0:8099` ou `*:8099`, PARE** — o serviço está exposto na
  internet e o Docker fura o ufw. Corrija o `ports:` para `"127.0.0.1:8099:8000"` e
  suba de novo.

### 2.4 — Provar que subiu de verdade

```bash
# (1) vivo, sem autenticação
curl -s http://127.0.0.1:8099/healthz
# → {"ok":true}

# (2) sem token = 401 e SEM CORPO (não pode vazar nem "detail")
curl -s -i http://127.0.0.1:8099/readyz | head -3
# → HTTP/1.1 401 Unauthorized   e nenhum corpo

# (3) com token: diagnóstico completo
TOKEN=$(sudo grep -E '^FISCAL_SERVICE_TOKEN=' /etc/dominex-fiscal/service.env | cut -d= -f2-)
curl -s -H "Authorization: Bearer $TOKEN" 'http://127.0.0.1:8099/readyz?deep=1' | python3 -m json.tool
```

Na saída do (3), confira **linha por linha**:

| Campo | Tem que estar |
|---|---|
| `ok` / `status` | `true` / `"ok"` |
| `checks.token.ok` | `true` |
| `checks.kek.ok` / `atual` / `keks` | `true` / `1` / `1` — o teste faz o ciclo **selar→abrir** completo, não só “a variável existe” |
| `checks.tmpfs.em_ram` | `true` ← **se for `false`/`null`, a chave privada do cliente tocaria DISCO** |
| `checks.tmpfs.noexec` / `nosuid` / `modo` | `true` / `true` / `0o700` |
| `checks.assinatura.ok` / `problemas` | `true` / `[]` ← autoteste das armadilhas 1, 2, 3, 4 e 6, com par de chaves efêmero |
| `checks.egresso.ok` / `host` | `true` / `sefin.producaorestrita.nfse.gov.br` |
| `checks.versoes` | versões de `nfelib`, `signxml`, `xsdata`, `lxml` — **anote as do dia 1** |

> As versões que passaram no autoteste em 2026-09-03: `nfelib 2.5.2 · signxml 5.1.0 ·
> xsdata 25.7 · lxml 6.1.3 · cryptography 50.0.1 · requests 2.32.5 · fastapi 0.115.6`.
> Quando o alerta do §6 disparar, a primeira pergunta é “mudou alguma dessas?”.

### 2.5 — Provar a blindagem do container

```bash
docker inspect dominex-fiscal --format \
'user={{.Config.User}} readonly={{.HostConfig.ReadonlyRootfs}} mem={{.HostConfig.Memory}} swap={{.HostConfig.MemorySwap}} caps={{.HostConfig.CapDrop}} nnp={{.HostConfig.SecurityOpt}} pids={{.HostConfig.PidsLimit}}'
```

- **Esperar:** `user=10001:10001`, `readonly=true`, `mem=536870912`,
  `swap=536870912` (**igual ao mem** = sem swap), `caps=[ALL]`,
  `nnp=[no-new-privileges:true]`, `pids=256`.

```bash
docker exec dominex-fiscal sh -c 'mount | grep dominex-fiscal'
```

- **Esperar:** `tmpfs on /run/dominex-fiscal type tmpfs (rw,nosuid,nodev,noexec,...,size=16384k,mode=700,uid=10001,gid=10001)`.

```bash
# A imagem não pode ter segredo nem certificado dentro.
docker run --rm --entrypoint sh dominex-fiscal:local -c \
  'find / -xdev \( -name "*.pfx" -o -name "*.p12" -o -name "service.env" \) 2>/dev/null | head'
```

- **Esperar:** **nada**. Se aparecer algo, o `.dockerignore` foi violado.

### 2.6 — `fail2ban` para quem fica tentando o token

```bash
sudo cp ~/dominex-fiscal/fail2ban/filter.d-dominex-fiscal.conf /etc/fail2ban/filter.d/dominex-fiscal.conf
sudo cp ~/dominex-fiscal/fail2ban/jail.d-dominex-fiscal.conf  /etc/fail2ban/jail.d/dominex-fiscal.conf
sudo systemctl restart fail2ban
sudo fail2ban-client status
```

- **Esperar:** a lista de jails inclui `sshd` **e** `dominex-fiscal`.
- **⚠️ Só funciona depois do §4** (o log `/var/log/caddy/fiscal.access.log` só existe
  quando o bloco do Caddy estiver no ar). Se o fail2ban reclamar de logpath
  inexistente, faça o §4 e reinicie.
- **Testar o filtro sem banir ninguém:**

```bash
sudo fail2ban-regex /var/log/caddy/fiscal.access.log /etc/fail2ban/filter.d/dominex-fiscal.conf
```

- **Desbanir em emergência:** `sudo fail2ban-client set dominex-fiscal unbanip <IP>`.

---

## 3. Rotação de segredo

### 3.1 — Rotacionar a **KEK** ⚠️

> **A propriedade que a §Custódia exige:** rotacionar a KEK **não** obriga cliente
> nenhum a subir o certificado de novo. O desenho garante isso porque a KEK só cifra
> a **DEK** — o `.pfx` cifrado (que mora na Supabase) não é tocado.
>
> **Como o serviço sabe qual KEK usar:** cada blob carrega o `kek_id` dentro dele
> (formato `DXF1|versão|kek_id|nonce|ciphertext`). Por isso a rotação **não precisa
> de migration nem de coluna nova no banco**.
>
> **Quando rotacionar:** suspeita de exposição, saída de alguém com acesso à VPS, ou
> rotina anual.

**Passo 1 — adicionar a KEK nova como ATUAL, mantendo a antiga no anel.**

```bash
# Guarde a nova no cofre ANTES de aplicar.
NOVA=$(openssl rand -base64 32); echo "KEK NOVA (cofre!): $NOVA"

ATUAL=$(sudo grep -E '^FISCAL_KEKS=' /etc/dominex-fiscal/service.env | cut -d= -f2-)
PROXIMO_ID=$(( $(echo "$ATUAL" | cut -d: -f1) + 1 ))

# A PRIMEIRA da lista é a atual; as demais só abrem envelopes antigos.
sudo sed -i "s|^FISCAL_KEKS=.*|FISCAL_KEKS=${PROXIMO_ID}:${NOVA},${ATUAL}|" /etc/dominex-fiscal/service.env
sudo chown root:deploy /etc/dominex-fiscal/service.env && sudo chmod 0640 /etc/dominex-fiscal/service.env
unset NOVA

cd ~/dominex-fiscal && docker compose up -d      # recria o container (~5s)
```

- **Validar:**

```bash
TOKEN=$(sudo grep -E '^FISCAL_SERVICE_TOKEN=' /etc/dominex-fiscal/service.env | cut -d= -f2-)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8099/admin/kek/status
# → {"status":"ok","atual":2,"ids":[1,2]}
```

- Neste ponto: envelopes antigos (KEK 1) continuam abrindo; material **novo** já nasce
  selado com a KEK 2. **Nada quebrou.**
- **⚠️ Janela:** o `docker compose up -d` recria o container. Faça fora do horário de
  faturamento (o `stop_grace_period: 30s` cobre a requisição em voo, mas não convide
  o problema).

**Passo 2 — re-envelopar as DEKs existentes.**

Quem dirige é uma Edge Function (é a única que enxerga o banco). Contrato:

```
POST /admin/kek/rewrap        Authorization: Bearer <FISCAL_SERVICE_TOKEN>
  { "itens": [ { "empresaId": "<uuid>", "dekEnvelopada": "<base64 do blob>" } ] }   (máx. 500)
→ { "kekAtual": 2,
    "itens": [ { "empresaId": "...", "ok": true, "dekEnvelopada": "<novo>", "mudou": true } ] }
```

A edge grava cada `dekEnvelopada` novo em
`company_fiscal_settings.certificado_dek_envelopada` da respectiva empresa.
**A rota nunca devolve DEK em claro** — nem quem tiver o token extrai material daqui.
É idempotente: rodar duas vezes não faz mal (`"mudou": false`).

Teste manual de um envelope só (valor real copiado do banco):

```bash
TOKEN=$(sudo grep -E '^FISCAL_SERVICE_TOKEN=' /etc/dominex-fiscal/service.env | cut -d= -f2-)
curl -s -X POST http://127.0.0.1:8099/admin/kek/rewrap \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"itens":[{"empresaId":"<uuid>","dekEnvelopada":"<blob>"}]}' | python3 -m json.tool
```

**Passo 3 — aposentar a KEK antiga.** Só depois de **confirmar no banco que nenhuma
empresa ficou para trás**.

```bash
# Mantém só a primeira (a atual) na lista.
ATUAL=$(sudo grep -E '^FISCAL_KEKS=' /etc/dominex-fiscal/service.env | cut -d= -f2- | cut -d, -f1)
sudo sed -i "s|^FISCAL_KEKS=.*|FISCAL_KEKS=${ATUAL}|" /etc/dominex-fiscal/service.env
sudo chown root:deploy /etc/dominex-fiscal/service.env && sudo chmod 0640 /etc/dominex-fiscal/service.env
cd ~/dominex-fiscal && docker compose up -d
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8099/admin/kek/status
# → {"status":"ok","atual":2,"ids":[2]}
```

- **⚠️ Se você remover a KEK 1 antes de re-envelopar tudo**, as empresas que ficaram
  para trás **param de emitir**, com a mensagem “Envelope cifrado com a KEK #1, que
  não está configurada neste serviço”. Recuperação: recolocar a KEK 1 na lista
  (por isso a cópia no cofre) e refazer o Passo 2.

### 3.2 — Rotacionar o `FISCAL_SERVICE_TOKEN` (sem downtime de autenticação)

O serviço aceita **dois** tokens ao mesmo tempo (vigente + anterior).

```bash
NOVO=$(openssl rand -hex 48)
ANTIGO=$(sudo grep -E '^FISCAL_SERVICE_TOKEN=' /etc/dominex-fiscal/service.env | cut -d= -f2-)

sudo sed -i "s|^FISCAL_SERVICE_TOKEN=.*|FISCAL_SERVICE_TOKEN=${NOVO}|" /etc/dominex-fiscal/service.env
sudo sed -i "s|^FISCAL_SERVICE_TOKEN_PREV=.*|FISCAL_SERVICE_TOKEN_PREV=${ANTIGO}|" /etc/dominex-fiscal/service.env
sudo chown root:deploy /etc/dominex-fiscal/service.env && sudo chmod 0640 /etc/dominex-fiscal/service.env
cd ~/dominex-fiscal && docker compose up -d

echo "NOVO TOKEN (publique no Supabase): $NOVO"; unset NOVO ANTIGO
```

Depois, do Mac: `npx supabase secrets set FISCAL_SERVICE_TOKEN='<novo>'` + redeploy das
edges (🛡️ Plataforma). **Só quando confirmar que as edges já usam o novo:**

```bash
sudo sed -i "s|^FISCAL_SERVICE_TOKEN_PREV=.*|FISCAL_SERVICE_TOKEN_PREV=|" /etc/dominex-fiscal/service.env
cd ~/dominex-fiscal && docker compose up -d
```

- **Validar no meio:** os dois tokens respondem 200 no `/readyz`.
- **Validar no fim:** o antigo passa a responder **401**.

---

## 4. DNS + Caddy (HTTPS)

### 4.1 — Criar o registro DNS ⚠️ antes de tocar no Caddy

No painel de DNS de `dominex.app`:

| Tipo | Nome | Conteúdo | Proxy |
|---|---|---|---|
| A | `fiscal` | `46.202.149.193` | **DESLIGADO** |

**⚠️ Se o DNS estiver na Cloudflare, o registro TEM que ficar em “DNS only” (nuvem
CINZA).** Com a nuvem laranja: (a) o desafio HTTP-01 do Let's Encrypt não chega na
VPS e o certificado não emite; (b) a Cloudflare passaria a ver **em claro** o corpo
das requisições — que aqui carregam material de certificado e dados fiscais de
cliente. Terceiro no meio do caminho de custódia é inaceitável.
Se o DNS estiver na Vercel, é um registro A comum.

```bash
dig +short fiscal.dominex.app
```

- **Esperar:** exatamente `46.202.149.193`.
- **⚠️ Se voltar `104.x` / `172.6x` / `188.114.x`**, a nuvem laranja está ligada.
  Desligue e espere propagar **antes** de seguir.

### 4.2 — Anexar o bloco ao Caddyfile ⚠️ (não substituir o arquivo)

> O `/etc/caddy/Caddyfile` já tem o bloco `wa.<DOMINIO>` da Evolution, que atende o
> WhatsApp dos **dois** produtos. Sobrescrever derruba os dois.

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)

# ANEXA (tee -a), não sobrescreve.
sudo tee -a /etc/caddy/Caddyfile < ~/dominex-fiscal/Caddyfile >/dev/null

# Valida ANTES de recarregar. Se falhar, NÃO recarregue.
sudo caddy validate --config /etc/caddy/Caddyfile
```

- **Esperar:** `Valid configuration`.
- **Se der erro:** `sudo cp /etc/caddy/Caddyfile.bak.<timestamp> /etc/caddy/Caddyfile` e reveja.

```bash
sudo systemctl reload caddy      # reload, não restart: não derruba a Evolution
sudo systemctl status caddy --no-pager | head -12
```

### 4.3 — Provar o caminho público

```bash
curl -sS https://fiscal.dominex.app/healthz                                        # → {"ok":true}
curl -sS -o /dev/null -w '%{http_code}\n' https://fiscal.dominex.app/readyz        # → 401
curl -sS -o /dev/null -w '%{http_code}\n' https://fiscal.dominex.app/docs          # → 404
curl -sS -o /dev/null -w '%{http_code}\n' https://fiscal.dominex.app/openapi.json  # → 404
curl -sS -o /dev/null -w '%{http_code}\n' https://fiscal.dominex.app/              # → 404
```

- **⚠️ Se `/docs` ou `/openapi.json` responderem 200, PARE** — a superfície da API
  está publicada. O app desliga isso e o Caddy também; se vazou, algo saiu do lugar.

```bash
# E o WhatsApp continua de pé? (o teste que ninguém lembra de fazer)
curl -sS -o /dev/null -w '%{http_code}\n' https://wa.ecosistematecnologia.com.br/
cd ~/whatsapp-evolution && docker compose ps
```

---

## 5. Operação do dia a dia

### 5.1 — Ver logs

```bash
cd ~/dominex-fiscal
docker compose logs -f --tail=100 dominex-fiscal    # aplicação
sudo tail -f /var/log/caddy/fiscal.access.log       # acesso HTTP (JSON)
sudo journalctl -u dominex-fiscal-smoke.service -n 50 --no-pager
sudo tail -50 /var/log/dominex-fiscal/alertas.log   # histórico de alertas
```

**⚠️ Nunca ligue log de depuração em produção.** `requests`/`urllib3` em `DEBUG`
imprimem **header (o Bearer) e corpo (o XML do contribuinte)** no log do container —
que fica em disco e entra no snapshot.

**Rotação do log de alerta** (Docker e Caddy já rotacionam os deles):

```bash
sudo tee /etc/logrotate.d/dominex-fiscal >/dev/null <<'EOF'
/var/log/dominex-fiscal/*.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    copytruncate
}
EOF
sudo logrotate -d /etc/logrotate.d/dominex-fiscal   # -d = simula, não mexe em nada
```

### 5.2 — Reiniciar

```bash
cd ~/dominex-fiscal            # ⚠️ CONFIRA O pwd ANTES DE QUALQUER COMANDO

docker compose restart dominex-fiscal     # reinício simples
docker compose up -d                      # aplica mudança de compose/.env/service.env
docker compose down                       # PARA o fiscal (⚠️ nunca com -v; ver §8)
```

- **⚠️ Rodar `down` dentro de `~/whatsapp-evolution` derruba o WhatsApp do Dominex
  E do EcoSistema.**
- **⚠️ Janela:** o `POST /nfse` do governo é **síncrono**. Reiniciar no meio de uma
  emissão pode deixar a nota **autorizada no governo e perdida pra gente**. O
  `stop_grace_period: 30s` cobre a requisição em voo; ainda assim, prefira fora do
  horário comercial.

### 5.3 — Deploy de versão nova do motor

```bash
# do Mac
scp -r services/dominex-fiscal/app deploy@46.202.149.193:~/dominex-fiscal/

# na VPS
cd ~/dominex-fiscal
docker compose build && docker compose up -d
./smoke-test.sh --quiet          # prova antes de dar por encerrado
```

- **⚠️ Se o deploy trouxer dependência nova**, regere o lock (§2.2) e rode o
  `--full` antes de considerar promovido.
- **⚠️ Confira que o `app/main.py` novo ainda tem o bloco
  `app.include_router(infra_routes.router)`.** Sem ele, `/readyz`, `/admin/kek/*` e o
  teste de fumaça somem — e a operação fica cega **sem avisar**. Teste rápido depois
  de qualquer deploy:
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' https://fiscal.dominex.app/readyz   # 401 (rota existe)
  ```

### 5.4 — Emissão interrompida (restart no meio de uma nota)

Sintoma: o cliente clicou emitir, o serviço reiniciou, e não sabemos se a nota saiu.

O `idDPS` é **determinístico** (município + CNPJ + série + número) e o Sefin expõe
`GET /dps/{id}`. Recuperação: **consultar o `idDPS` daquela tentativa antes de
reemitir**.

**⚠️ Nunca reemita “no susto”.** Reemitir com número de DPS novo depois de uma
autorização silenciosa gera **nota duplicada** — problema fiscal do cliente, e muito
mais caro que 5 minutos consultando.

### 5.5 — Container em restart-loop

```bash
docker compose ps
docker compose logs --tail=200 dominex-fiscal
docker inspect dominex-fiscal --format '{{.RestartCount}} {{.State.OOMKilled}}'
```

- `OOMKilled=true` → bateu nos 512 MB. Ver §7 **antes** de simplesmente subir o
  limite: subir o teto tira o fusível que protege a Evolution.
- “configuração inválida” / 503 → quase sempre `service.env`: token curto, `FISCAL_KEKS`
  vazio ou base64 que não dá 32 bytes. Refaça o §1.4.
- Erro de permissão ao ler `service.env` → `chown root:deploy` + `chmod 0640`.

---

## 6. Teste de fumaça e alerta

> **Por que existe (motivo concreto):** no spike de 02/09 a `nfelib` estava **uma
> versão de esquema atrás** do servidor do governo — gerava um campo `nPedRegEvento`
> que o `SefinNacional_1.6.0` já tinha removido. Layout fiscal muda **sem aviso e sem
> changelog**. Sem este alarme, a gente descobre que quebrou **pelo cliente que não
> conseguiu faturar**.

### 6.1 — Instalar os timers

```bash
sudo install -d -m 0755 /var/lib/dominex-fiscal /var/log/dominex-fiscal
sudo cp ~/dominex-fiscal/systemd/*.service ~/dominex-fiscal/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dominex-fiscal-smoke.timer dominex-fiscal-smoke-full.timer
systemctl list-timers 'dominex-fiscal*' --no-pager
```

- **Esperar:** dois timers com `NEXT` preenchido (raso a cada 15 min; completo às 07:10).
- **Rodar na mão agora, sem alertar ninguém:**

```bash
sudo /home/deploy/dominex-fiscal/smoke-test.sh --quiet
```

- **Esperar:** sequência de `✓` e `RESULTADO: tudo certo (light)`.

### 6.2 — Configurar o canal de alerta (WhatsApp, pela Evolution que já roda aqui)

Sem serviço novo, sem assinatura nova: o alerta sai pela **Evolution API que já está
nesta box**.

```bash
sudo tee /etc/dominex-fiscal/alert.env >/dev/null <<'EOF'
EVOLUTION_URL=http://127.0.0.1:8080
# ⚠️ Instância PRÓPRIA da Dominex. NUNCA use uma instância de tenant
# (dominex_<company_id>): aquele WhatsApp é do CLIENTE.
ALERT_WA_INSTANCE=dominex_infra_alertas
ALERT_WA_TO=55219XXXXXXXX
EVOLUTION_API_KEY=<a mesma EVOLUTION_API_KEY do ~/whatsapp-evolution/.env>
ALERT_COOLDOWN=3600
EOF
sudo chmod 600 /etc/dominex-fiscal/alert.env

sudo /home/deploy/dominex-fiscal/alert.sh teste-canal falha \
  "Teste do canal de alerta do motor fiscal. Se você recebeu isto, o alarme funciona."
```

- **Esperar:** WhatsApp no celular do CEO em segundos + linha em
  `/var/log/dominex-fiscal/alertas.log`.
- **Se não chegar:** confira se a instância `dominex_infra_alertas` existe e está
  conectada. O alerta **nunca se perde** — se o WhatsApp falhar, fica no log e no
  journald.
- **Custo:** uma sessão Baileys a mais, ~30–80 MB de RAM. Já contabilizado no §7.

### 6.3 — ⚠️ A metade que ainda falta do C6 (e por quê)

O teste raso (a cada 15 min) cobre: container de pé e sem restart-loop, TLS válido,
`/healthz`, autenticação (401 sem token), **ciclo completo selar→abrir da KEK**,
conformidade do tmpfs (é RAM? `noexec`? `nosuid`?), **autoteste das armadilhas 1, 2,
3, 4 e 6** com par de chaves efêmero, egresso pro governo, disco e RAM. **Tudo isso
sem certificado de cliente nenhum.**

O que ele **não** cobre é justamente o caso do `nPedRegEvento`: mudança de layout **do
lado do governo**, que só aparece quando você emite de verdade. E emitir de verdade
exige um certificado A1 — que, por decisão de custódia, **não mora nesta VPS** (o
serviço é *stateless*: o material do certificado viaja no corpo de cada requisição).

Duas saídas:

- **Opção A (recomendada) — a emissão de fumaça sai da Supabase.** Uma edge function
  agendada por `pg_cron` (mesmo padrão do `collect-db-health` que já roda no projeto)
  monta a requisição da empresa de teste com `"ambiente": 2` e chama
  `POST /v1/nfse/emitir`. Em caso de falha, registra e dispara o alerta.
  **Vantagem decisiva:** exercita exatamente o mesmo caminho do cliente real (edge →
  token → Caddy → microserviço → `nfelib` → governo). Nenhum certificado toca a VPS
  em repouso. **É código de edge function → é da 🛡️ Plataforma, não da Infra.**
  Registrado como pendência **C6b**.
- **Opção B (não recomendada) — certificado de teste cifrado na VPS.** Guardar o A1
  **da própria Dominex** cifrado pela KEK em `/etc/dominex-fiscal/`, e implementar
  `servico.smoke_homologacao()` (o gancho `POST /admin/smoke` já chama, se existir).
  Funciona sem depender de ninguém, mas **enfraquece a propriedade central do
  desenho**: a VPS deixa de ser stateless quanto a certificado, e comprometê-la passa
  a entregar um certificado real (o nosso). Só com autorização explícita do CEO, e
  sabendo que é dívida.

Enquanto nenhuma das duas existir, o `--full` chama `/admin/smoke`, recebe
`nao_implementado`, **não** trata como falha, e **registra no alerta que a cobertura
está rasa**. Você não fica com um alarme que mente dizendo que está tudo bem.

### 6.4 — Monitor externo (o ponto cego)

O alerta por WhatsApp sai **de dentro da VPS**. Se a box inteira cair, ninguém avisa.
Feche isso com um monitor externo gratuito batendo em
`https://fiscal.dominex.app/healthz` a cada 5 min (é público de propósito e não vaza
nada). O mesmo monitor deve cobrir `https://wa.ecosistematecnologia.com.br/` —
porque a queda da box leva junto o WhatsApp do Dominex **e** do EcoSistema.

---

## 7. Capacidade (a box é dividida)

A VPS tem **8 GB** e serve **dois produtos**. Orçamento atual:

| Componente | RAM típica | Observação |
|---|---|---|
| SO + journald + fail2ban + unattended-upgrades | ~0,5 GB | |
| Caddy (host) | ~50 MB | serve os dois subdomínios |
| Postgres 16 (Evolution) | ~250 MB | |
| Redis 7 (Evolution) | ~50 MB | |
| Evolution API (Node) | ~400 MB + **30–80 MB por sessão** | cresce com nº de empresas conectadas |
| Sessão de alerta (`dominex_infra_alertas`) | ~30–80 MB | §6.2 |
| **`dominex-fiscal`** | **teto 512 MB** (regime ~150 MB) | ~60–90 MB de Python/FastAPI + ~40–80 MB dos bindings `xsdata` da `nfelib` + picos por nota (o XML é KB) |

Com 10 tenants no WhatsApp: ~2,5 GB usados, ~5,5 GB livres. **Não estamos apertados.**

**O limite de 512 MB não é aperto de espaço — é um fusível.** Sem ele, um vazamento
de memória no `lxml`/`xsdata` faria o OOM killer do host escolher a vítima, e a vítima
provável seria a Evolution (o maior processo) — derrubando o WhatsApp dos dois
produtos por causa de um bug no motor fiscal. Com o limite, morre só o container
fiscal e o `restart: always` levanta em segundos.

**Gatilho de upgrade de tier:** RAM sustentada acima de **75%** (≈6 GB) por mais de um
dia → planejar **KVM 4 (16 GB)**. Planejar **antes** de saturar.

```bash
free -h && docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}'
```

**Recomendação de arquitetura, para o Tech Lead decidir:** o risco residual desta
montagem é que a Evolution API (Node, open source, superfície grande, exposta) e a
**KEK que protege os certificados dos clientes** compartilham o mesmo kernel. Um
escape de container na Evolution vira root no host e lê a KEK. As mitigações aqui
(usuário não-root, `cap_drop ALL`, `no-new-privileges`, rootfs read-only, arquivo
`0640 root:deploy`) encurtam o caminho, mas **não eliminam esse cenário**. A mitigação
que elimina custa ~R$30/mês: **VPS separada só pro `dominex-fiscal`**, deixando as
duas classes de risco em kernels diferentes. Não bloqueia a entrega de hoje; é a
evolução natural quando o motor estiver estável.

---

## 8. NUNCA faça

| ❌ Nunca | Por quê |
|---|---|
| `docker compose down -v` em **qualquer** um dos dois diretórios | Em `~/whatsapp-evolution`, apaga `evolution_instances` = **re-parear QR de todos os tenants** dos dois produtos. Em `~/dominex-fiscal` não há volume — o `-v` não tem uso legítimo aqui. |
| Rodar `docker compose` do diretório errado | `down`/`restart` no diretório da Evolution derruba o WhatsApp do Dominex **e** do EcoSistema. **Confira o `pwd` antes.** |
| `sudo tee /etc/caddy/Caddyfile` (com `>`) em vez de `tee -a` | Sobrescreve o bloco da Evolution e derruba os dois produtos. Sempre **anexar** e sempre `caddy validate` antes do reload. |
| Remover uma KEK do `FISCAL_KEKS` antes de re-envelopar todas as DEKs | As empresas que ficaram para trás **param de emitir**. Ordem: adicionar → ativar → re-envelopar tudo → só então remover. |
| Colocar a KEK nova em **segundo** lugar na lista `FISCAL_KEKS` | A **primeira** é a atual. Inverter faz material novo continuar sendo selado com a KEK velha — a rotação vira teatro. |
| Perder a KEK sem cópia no cofre | **Todos** os certificados de cliente viram lixo cifrado; cada cliente teria que subir o dele de novo. |
| Publicar a porta como `8099:8000` (sem `127.0.0.1:`) | O Docker escreve direto na chain `DOCKER` do iptables e **fura o ufw**: o motor fiscal fica aberto na internet. |
| Abrir a 8099 no ufw | Mesma coisa, na mão. A única porta pública é a 443 (e a 80 pro ACME). |
| Fechar a porta 80 no ufw | Quebra a renovação ACME. Em ~90 dias o certificado vence e **os dois** subdomínios param. |
| Ligar a nuvem laranja da Cloudflare em `fiscal.dominex.app` | Quebra o ACME **e** coloca um terceiro lendo em claro o tráfego de custódia. |
| Ligar log de depuração em produção | `requests`/`urllib3` em DEBUG imprimem **o Bearer e o XML do contribuinte** no log — que vai pro disco e pro snapshot. |
| `FISCAL_TLS_VERIFY=0` fora de diagnóstico local | Sem verificar o servidor do governo, o mTLS perde metade do sentido. |
| Gravar `.pfx`/PEM fora de `/run/dominex-fiscal` | Viola a §Custódia. Use `custodia.materializar_pem()`, que apaga no `finally`. |
| Dar ao container uma chave `service_role` da Supabase | Junta as duas metades da custódia (acervo + KEK) no mesmo lugar e **anula o desenho inteiro**. |
| Commitar `service.env`, `.env`, `.pfx` ou qualquer KEK | Segredo em git é para sempre (fica no histórico). |
| Subir versão de `nfelib`/`signxml` sem rodar `smoke-test.sh --full` antes | É exatamente o risco R2 do plano. A biblioteca já nasceu atrás do servidor do governo. |
| Reiniciar o container no meio do expediente sem necessidade | O `POST /nfse` é síncrono: pode deixar nota autorizada no governo e perdida pra gente (§5.4). |
| Reemitir uma nota “no susto” depois de um restart | Gera **nota duplicada**. Consulte `GET /dps/{idDPS}` primeiro. |
| Usar instância de tenant (`dominex_<company_id>`) pra alerta interno | Aquele WhatsApp é do **cliente**. |
| Remover `app.include_router(infra_routes.router)` do `main.py` | A operação fica cega **em silêncio**: sem `/readyz`, sem rotação de KEK, sem teste de fumaça. |

---

## 9. O que depende de outra pessoa

| Item | De quem | Status |
|---|---|---|
| Registro DNS `fiscal.dominex.app` → `46.202.149.193`, **sem proxy** | **CEO** | pendente |
| Rodar os passos §1 a §6 na VPS | **CEO** | pendente |
| Guardar a KEK no gerenciador de senhas | **CEO** | pendente |
| Número + pareamento da instância `dominex_infra_alertas` | **CEO** | pendente |
| `_shared/providers/sefin.ts` — a edge que chama este serviço (C7) | 🛡️ Plataforma | pendente |
| Edge de **rotação de KEK** (lê banco → `POST /admin/kek/rewrap` → grava banco) | 🛡️ Plataforma | pendente |
| Edge de **smoke em homologação** por `pg_cron` (C6b, §6.3 opção A) | 🛡️ Plataforma | pendente |
| Trilha de auditoria de decifra em `fiscal_certificate_audit` | 🛡️ Plataforma (é a edge que enxerga o banco) | pendente |

### Para quem mexer no serviço Python

- **Autenticação já está resolvida.** Toda rota nova nasce protegida por
  `dependencies=[Depends(exigir_token)]` (o `router` de `infra_routes.py` já aplica no
  nível do router). A exceção precisa ser justificada, não o contrário.
- **Não duplique cripto.** KEK/DEK/`.pfx` só em `app/config.py` + `app/custodia.py`.
  `app/security.py` é só o portão de entrada e o diagnóstico do tmpfs.
- **Material mTLS só via `custodia.materializar_pem()`** — é o `finally` dele que
  garante que nenhum PEM sobrevive à requisição.
- **`app/main.py` termina com o bloco de infraestrutura.** Ao reescrever o arquivo,
  preserve `app.include_router(infra_routes.router)` e o handler de 401 vazio.
