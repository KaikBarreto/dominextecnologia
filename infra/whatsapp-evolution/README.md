# Evolution API (auto-hospedada) — setup do add-on "Avisos de WhatsApp"

Este diretório sobe a **Evolution API** open source (Baileys) em uma VPS dedicada. É o servidor que conecta o WhatsApp de cada tenant via **QR code** e envia avisos transacionais ao cliente final.

> Não é a API oficial da Meta. **Não existe configuração que garanta ausência de bloqueio**: o fator dominante de banimento não é IP nem cadência, é **denúncia do cliente final**. Dito isso, o Dominex reduz o risco em várias camadas: consentimento, opt-out ("PARAR"), fila serial por empresa, aquecimento gradual (20 a 400 mensagens/dia em 14 dias) e limites conservadores (60/hora, 400/dia, 5 por destinatário). A partir da Onda 3, o Dominex também: respeita **duas janelas de envio por tenant**, no horário de Brasília, porque os dois tipos de aviso têm naturezas opostas: aviso de OS (técnico a caminho, serviço iniciado, serviço concluído) segue a **operação da empresa**, padrão 06:00 às 23:00 todos os dias, porque o cliente chamou o técnico e está esperando aquela mensagem no minuto em que ela acontece; lembrete de cobrança, que é gerado por cron e ninguém pediu, segue a **janela comercial**, padrão 08:00 às 20:00 de segunda a sábado. Fora da janela a mensagem fica na fila e sai na próxima abertura; usa **cadência não uniforme** entre envios (distribuição log-normal, mediana ~35 s, P90 ~3 min, teto 6 min, com pausa longa de 3 a 8 min em cerca de 1 em cada 12 envios, e ritmo 1,6× mais lento nas horas de 8h, 9h, 19h e 20h — substituiu o antigo intervalo uniforme de 8 a 26 s, que era assinatura estatística de máquina); simula **presença humana** ("digitando" por 2,2 a 9 s, proporcional ao tamanho do texto, com presença "disponível" antes e "indisponível" depois do envio); **valida que o número de destino existe no WhatsApp** antes de enviar; e, opcionalmente (desligado por padrão), marca a conversa como lida antes de responder. Cada instância sai por um **proxy residencial estático e fixo**, nunca compartilhado entre tenants (seção 5). Nenhuma dessas camadas garante ausência de bloqueio nem elimina o risco de denúncia do cliente final — o caminho honesto para operar em escala continua sendo a API oficial da Meta Cloud.

> **Recomendação do CEO, vale para toda conexão nova:** conecte um número que a empresa possa perder. Por mais improvável que o bloqueio seja, quem é bloqueado é o número — use um chip dedicado aos avisos automáticos, nunca o WhatsApp principal de atendimento da empresa.

## 1. Pré-requisitos

- VPS Linux estável, Docker + Docker Compose.
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
  EVOLUTION_WEBHOOK_SECRET="<openssl rand -hex 32>"
```

- `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` — endereço e auth do VPS.
- `EVOLUTION_WEBHOOK_SECRET` — validado no `whatsapp-webhook`.
- `CRON_SECRET` — já existente no projeto; autentica o worker interno da fila.

## 5. Proxy residencial por instância (Onda 3)

Cada instância Evolution (cada número de tenant) sai da VPS por um proxy residencial
próprio, nunca pelo IP de datacenter do VPS puro. Objetivo: o tráfego do WhatsApp
parecer originado de uma casa/celular comum, não de um servidor.

### 5.1. Produto certo

- **Residencial estático / ISP** (ex.: IPRoyal, Proxy-Cheap, Webshare), região
  **Brasil**, de preferência no estado do DDD do número. Ordem de grandeza
  (aproximada, confirme com o fornecedor no momento da compra): US$ 2 a 5/mês por IP.
- **Proxy móvel (4G)** é o padrão-ouro de reputação, mas custa US$ 30 a 90/mês por IP.
  Só se justifica para tenant grande.
- **Proxy residencial ROTATIVO não serve.** Sessão sticky de 30 minutos também não
  serve. Qualquer troca de IP no meio de uma sessão WhatsApp conectada é, por si só,
  sinal de conta comprometida — pior que não ter proxy.

### 5.1.1. Degrau intermediário: túnel próprio (`datacenter_tunnel`)

Existe um terceiro tipo aceito pelo pool, de custo quase zero: uma VM própria
(ex.: camada gratuita da Oracle Cloud) rodando SOCKS5, cadastrada no painel como
qualquer outro IP. **Entenda bem o que ele resolve e o que não resolve:**

| Sinal que derruba número | Residencial | Túnel próprio | VPS compartilhado (hoje) |
|---|---|---|---|
| Várias contas saindo do mesmo IP | resolve | **resolve** | não resolve |
| IP ser de datacenter, não de casa | resolve | **não resolve** | não resolve |

Ou seja: o túnel é **degrau intermediário**, não substituto do residencial. Faz
sentido a partir do 3º ou 4º tenant, quando o cluster de contas num IP só começa a
pesar e ainda não se quer gastar. Com 1 ou 2 tenants ele não compra quase nada: a
Oracle é datacenter igual à VPS.

Dois avisos antes de apostar nele: a camada gratuita da Oracle dá poucas máquinas
por conta (não escala indefinidamente), e contas gratuitas são reclamadas sem aviso.
Se a VM cair, o WhatsApp daquele tenant para — a fila pausa e não existe fallback.
Não construa a confiabilidade de um produto pago em cima de camada gratuita.

A arquitetura é agnóstica de fornecedor: o pool guarda host, porta, protocolo e
credencial, e um túnel SOCKS5 preenche exatamente esses campos. Trocar residencial
por túnel (ou misturar os dois) é cadastro, não código.

### 5.2. As duas regras que, se violadas, deixam a situação PIOR que sem proxy

1. **Um IP por instância. Nunca compartilhado entre tenants.** Várias contas de
   WhatsApp saindo do mesmo IP residencial formam um cluster de spam perfeito —
   mais fácil de detectar que o IP de datacenter do VPS.
2. **O IP nunca muda depois de conectado.** A instância nasce atrás do proxy e
   morre atrás do mesmo proxy. Trocar de IP depois de conectado exige reconexão
   (QR novo) — nunca é feito "a quente".

### 5.3. Como é aplicado (não é variável de ambiente)

O proxy da Evolution API v2 é configurado **por instância, via chamada de API**, não
por variável global do container:

- `POST /proxy/set/{instance}` e `GET /proxy/find/{instance}` — aplica/consulta o
  proxy de uma instância já criada (exige reconexão para valer, ver 5.4).
- `POST /instance/create` aceita os campos `proxyHost`, `proxyPort`, `proxyProtocol`,
  `proxyUsername`, `proxyPassword` — é como a instância **nasce** atrás do proxy, sem
  nunca ter saído pelo IP do VPS.

**Por isso não há nada a acrescentar no `.env.example` nem no `docker-compose.yml`
para o proxy.** A Evolution API v2 não tem variável de ambiente de proxy global —
confirmado no fonte do projeto (build `evoapicloud/evolution-api:v2.3.7`). Se uma
versão futura da imagem introduzir uma, confirme no changelog/fonte antes de usar;
não assuma.

### 5.4. Onde moram as credenciais e quem decide

- O **tenant não compra nem vê proxy** — é detalhe de infra, não benefício vendável.
  A Dominex compra e atribui.
- Pool de IPs na tabela `whatsapp_proxies` (banco do Supabase), administrada pelo
  super_admin no **painel master Auctus**.
- Credencial do proxy **nunca** em arquivo na VPS nem em coluna de tabela: vai no
  **Vault do Supabase**, nome `whatsapp_proxy_cred_<proxy_id>`.
- Aplicar proxy numa instância **já conectada** exige **reconexão** — o socket do
  Baileys só assume o proxy ao reabrir. Isso significa **QR novo**: o tenant precisa
  escanear de novo. É operação de janela, avisada com antecedência (ver RUNBOOK.md,
  Fase 2b, para o procedimento operacional completo: validar IP, testar conexão
  longa, atribuir, e o que fazer quando um proxy cai).

## 6. Deploy das edges (só depois do VPS no ar)

```bash
supabase functions deploy whatsapp-connect --use-api
supabase functions deploy whatsapp-connection-select --use-api
supabase functions deploy whatsapp-connection-disconnect --use-api
supabase functions deploy whatsapp-send --use-api
supabase functions deploy whatsapp-send-worker --use-api
supabase functions deploy whatsapp-webhook --use-api
```

## 7. Checklist pra ir ao ar

> ⚠️ **Antes de conectar qualquer número**: confirme com o cliente que é um número
> que a empresa pode perder (chip dedicado aos avisos automáticos, nunca o WhatsApp
> principal de atendimento). Ver recomendação completa no topo deste README.

- [ ] VPS BR no ar, `docker compose up -d` rodando, HTTPS válido.
- [ ] Firewall fechado (só 22/443; idealmente entrada restrita ao egress das edges).
- [ ] Secrets da Evolution configurados e `CRON_SECRET` disponível no Vault/Edge.
- [ ] Migration da fila, conexões e RLS aplicada.
- [ ] Deploy das 6 edges de WhatsApp.
- [ ] Proxy residencial validado e atribuído à instância **antes** de gerar o QR
      (RUNBOOK.md, Fase 2b, Passos 10 a 12) — nunca conectar e só depois tentar
      aplicar o proxy.
- [ ] Teste: `whatsapp-connect` devolve QR → escanear → webhook marca `connected`.
- [ ] Teste: mudança de status da OS gera um job, o worker envia uma vez e o webhook registra entrega/leitura.
- [ ] Teste: “parar” desativa imediatamente novos avisos para o cliente.

## 8. Pontos a confirmar em homologação (marcados como TODO no código)

- Shape exato de `/instance/create`, `/instance/connect`, `/message/sendText` do build do VPS (versão da imagem).
- Nomes/valores de evento do webhook (`CONNECTION_UPDATE`, `MESSAGES_UPDATE`, `MESSAGES_UPSERT`) e o campo de `statusReason` que indica **ban** (403).
