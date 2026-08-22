# Evolution API (auto-hospedada) — setup do add-on "Avisos de WhatsApp"

Este diretório sobe a **Evolution API** open source (Baileys) num **VPS brasileiro** dedicado. É o servidor que conecta o WhatsApp de cada tenant via **QR code** e envia os avisos ao cliente final quando a OS muda de status.

> Não é a API oficial da Meta. É a Evolution API (open source). O número do próprio tenant é conectado — por isso a blindagem anti-ban do lado das edges (sorteio de template, throttle, aquecimento, opt-out).

## 1. Pré-requisitos

- VPS Linux **no Brasil** (IP brasileiro reduz risco de ban), Docker + Docker Compose.
- Um subdomínio HTTPS apontando pro VPS (ex.: `wa.suaempresa.com.br`).
- Proxy reverso com TLS (Caddy recomendado pela simplicidade, ou Nginx + certbot).

## 2. Subir os containers

```bash
cd infra/whatsapp-evolution
cp .env.example .env
# preencha .env: EVOLUTION_API_KEY, POSTGRES_PASSWORD, EVOLUTION_SERVER_URL
#   openssl rand -hex 32   # para gerar cada segredo
docker compose up -d
```

Sessão persiste em volumes nomeados (`evolution_instances`, `evolution_pg`, `evolution_redis`) — reiniciar o VPS **não** derruba as conexões dos tenants.

## 3. Blindagem (obrigatória — a API NUNCA fica exposta aberta)

1. **A porta 8080 só escuta em `127.0.0.1`** (já configurado no compose). O acesso público é **exclusivamente** via proxy HTTPS.
2. **HTTPS obrigatório** no proxy. Exemplo `Caddyfile`:
   ```
   wa.suaempresa.com.br {
       reverse_proxy 127.0.0.1:8080
   }
   ```
3. **Firewall (ufw)**: fecha tudo, libera só o proxy e o SSH.
   ```bash
   ufw default deny incoming
   ufw allow 22/tcp        # SSH
   ufw allow 443/tcp       # HTTPS (proxy)
   ufw enable
   ```
   > Idealmente, restrinja a **entrada** na Evolution ao(s) IP(s) de saída das Edge Functions do Supabase (a região do projeto). As edges são o **único** cliente legítimo do endpoint REST. Confirme a faixa de IP de egress do seu projeto Supabase e aplique um `ufw allow from <IP> to any port 443`. O webhook é o caminho inverso (Evolution → Supabase) e sai do VPS pela 443 normal.
4. **API key forte** (`AUTHENTICATION_API_KEY`) — vai no header `apikey` de toda chamada. Nunca versionar.
5. **Webhook secret**: cada instância é criada (pela edge `whatsapp-connect`) já apontando o webhook pra `…/functions/v1/whatsapp-webhook` com o header `x-evolution-webhook-secret`. A edge `whatsapp-webhook` só aceita chamadas com esse secret (comparação em tempo constante).

## 4. Secrets do Supabase (edges)

Setar no projeto (NÃO commitar; NÃO gravar em disco):

```bash
supabase secrets set \
  EVOLUTION_API_URL="https://wa.suaempresa.com.br" \
  EVOLUTION_API_KEY="<mesma AUTHENTICATION_API_KEY do .env>" \
  EVOLUTION_WEBHOOK_SECRET="<openssl rand -hex 32>" \
  WHATSAPP_INTERNAL_SECRET="<openssl rand -hex 32>"
```

- `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` — endereço e auth do VPS.
- `EVOLUTION_WEBHOOK_SECRET` — validado no `whatsapp-webhook`.
- `WHATSAPP_INTERNAL_SECRET` — usado pela Onda 3 (chamada server-to-server do `whatsapp-send` no header `x-whatsapp-internal-secret`).

## 5. Deploy das edges (só depois do VPS no ar)

```bash
supabase functions deploy whatsapp-connect --use-api
supabase functions deploy whatsapp-send --use-api
supabase functions deploy whatsapp-webhook --use-api
```

## 6. Checklist pra ir ao ar

- [ ] VPS BR no ar, `docker compose up -d` rodando, HTTPS válido.
- [ ] Firewall fechado (só 22/443; idealmente entrada restrita ao egress das edges).
- [ ] 4 secrets setados no Supabase.
- [ ] Onda 1 (tabelas + `whatsapp_can_send` + módulo `whatsapp`) aplicada.
- [ ] Deploy das 3 edges.
- [ ] Teste: `whatsapp-connect` devolve QR → escanear → webhook marca `connected`.

## 7. Pontos a confirmar em homologação (marcados como TODO no código)

- Shape exato de `/instance/create`, `/instance/connect`, `/message/sendText` do build do VPS (versão da imagem).
- Nomes/valores de evento do webhook (`CONNECTION_UPDATE`, `MESSAGES_UPDATE`, `MESSAGES_UPSERT`) e o campo de `statusReason` que indica **ban** (403).
