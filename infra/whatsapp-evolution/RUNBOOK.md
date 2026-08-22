# RUNBOOK — Setup da VPS Evolution API (Hostinger KVM 2, Ubuntu 24.04)

> VPS **compartilhada** entre **Dominex** (multi-tenant, N instâncias `dominex_<company_id>`)
> e **EcoSistema** (single-sender, 1 instância `ecosistema_cobranca`).
> **Toda mudança aqui afeta os DOIS produtos.** Restart/upgrade/reconfig derruba ambos.
>
> Alvo: **Hostinger KVM 2** — 2 vCPU · 8 GB RAM · 100 GB NVMe · Ubuntu 24.04 LTS.
> Subdomínio deste servidor: `wa.<DOMINIO>` (ex.: `wa.ecosistematecnologia.com.br`).
>
> Este runbook serve os dois modos: **eu rodo via SSH** ou **Kaik cola os comandos**.
> Convenção: comandos rodam como o **usuário sudo dedicado** (não root). Onde precisa
> root, uso `sudo` explícito. Blocos marcados **⚠️ DESTRUTIVO/ARRISCADO** exigem
> atenção — leia o aviso antes de colar.

---

## Panorama das 3 fases

| Fase | O que faz | Onde está |
|---|---|---|
| **1. Blindagem base** | update, timezone, usuário sudo, SSH por chave, ufw, fail2ban, unattended-upgrades, Docker | **este arquivo, abaixo** |
| **2. Stack + HTTPS** | subir `docker-compose.yml`, preencher `.env`, Caddy no `wa.<DOMINIO>` | resumo abaixo → `docker-compose.yml`, `.env.example`, `Caddyfile`, `README.md` |
| **3. Backup + restore** | cron `pg_dump` + `tar` do volume, offsite plugável, ensaio de restore | `backup.sh`, `restore.md` |

### Fase 2 (resumo — detalhe no README.md)

```bash
# Já dentro da VPS, com Docker instalado (Fase 1 concluída):
mkdir -p ~/whatsapp-evolution && cd ~/whatsapp-evolution
# copie docker-compose.yml, .env.example e Caddyfile deste diretório pra cá
# (scp do Mac, git sparse-checkout, ou cole o conteúdo)

cp .env.example .env
# preencha os 3 valores. Gere cada segredo com:  openssl rand -hex 32
#   EVOLUTION_API_KEY=<rand hex 32>
#   POSTGRES_PASSWORD=<rand hex 32>
#   EVOLUTION_SERVER_URL=https://wa.<DOMINIO>
chmod 600 .env                       # ninguém além do dono lê o segredo

docker compose up -d                 # NUNCA use  down -v  (apaga sessões!)
docker compose ps                    # os 3 serviços "Up"; evolution só em 127.0.0.1:8080
docker volume ls | grep evolution    # 3 volumes nomeados criados
```

Caddy (proxy HTTPS auto-Let's Encrypt) — ver `Caddyfile`. Instalação do Caddy no fim
deste runbook (é parte da Fase 2, mas os pacotes se instalam junto). O DNS
`wa.<DOMINIO>` deve apontar pro IP da VPS **como "DNS only"** na Cloudflare (não
proxied) — ver comentário no `Caddyfile`.

### Fase 3 (resumo)

`backup.sh` + linha de cron + `restore.md`. Roda depois do stack no ar.

---

# FASE 1 — Blindagem base

> **Ordem importa.** O ponto mais perigoso é o SSH: se você desligar a senha
> **antes** de instalar sua chave pública, você se tranca pra fora da VPS.
> Siga na ordem. O passo 4 tem o guard-rail explícito.

## Passo 0 — Primeiro acesso e captura do IP

A Hostinger entrega a VPS com um IP público e uma senha de root (painel hPanel).

```bash
# Do seu Mac. Troque <IP_DA_VPS> pelo IP que a Hostinger mostrou.
ssh root@<IP_DA_VPS>
```

- **Esperar:** prompt de senha (a que a Hostinger gerou), depois shell de root.
- **Validar:** `whoami` → `root`; `lsb_release -a` → `Ubuntu 24.04`.

> Dica: guarde o IP. Ele vira `EVOLUTION` não — o `.env` usa o **domínio**, não o IP.
> O IP só serve pra SSH e pro registro DNS.

---

## Passo 1 — Update / upgrade do sistema

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y autoremove
```

- **Esperar:** lista de pacotes atualizados; pode pedir reinício de serviços (aceite os defaults).
- **⚠️ Pode aparecer** tela roxa "which services to restart" → selecione todos (Tab → OK).
- **Se pedir reboot** (arquivo `/var/run/reboot-required` existe):

```bash
[ -f /var/run/reboot-required ] && sudo reboot
```

- **Validar:** após reconectar, `sudo apt update` não lista upgrades pendentes de segurança.

---

## Passo 2 — Timezone America/Sao_Paulo

```bash
sudo timedatectl set-timezone America/Sao_Paulo
timedatectl
```

- **Esperar/Validar:** `Time zone: America/Sao_Paulo (-03, ...)` e `System clock synchronized: yes`.
- **Por quê:** logs, cron de backup e janelas de manutenção ficam em horário BR.

---

## Passo 3 — Criar usuário sudo dedicado

> Root login por SSH será **desligado** no passo 4. Precisamos de um usuário sudo
> ANTES disso. Troque `deploy` pelo nome que preferir (mantenha minúsculo, sem espaço).

```bash
sudo adduser deploy               # define uma senha forte quando pedir
sudo usermod -aG sudo deploy      # dá poder de sudo
```

- **Esperar:** o `adduser` pergunta senha (2x) e alguns campos opcionais (só Enter).
- **Validar:**

```bash
groups deploy                     # deve conter "sudo"
sudo -l -U deploy | grep -q '(ALL' && echo "sudo OK"
```

---

## Passo 4 — SSH só por chave  ⚠️ DESTRUTIVO/ARRISCADO (risco de se trancar pra fora)

> **LEIA TUDO ANTES DE RODAR.** A sequência correta é:
> **(A)** instalar a chave pública do Mac no usuário `deploy` →
> **(B)** testar que você entra sem senha →
> **(C)** só ENTÃO desligar senha e root login.
> Se inverter, a próxima reconexão falha e você fica fora (recuperação só via
> console do hPanel da Hostinger).

### 4A — Instalar a chave pública do Mac no `deploy`

**No seu Mac** (não na VPS), confira se você tem uma chave. Se não tiver, gere:

```bash
# No Mac. Se ~/.ssh/id_ed25519.pub já existe, PULE o keygen.
ls ~/.ssh/id_ed25519.pub 2>/dev/null || ssh-keygen -t ed25519 -C "kaik-mac"
```

Copie a chave pra VPS. Jeito mais simples (do Mac):

```bash
# No Mac. Vai pedir a senha do usuário deploy (a que você criou no passo 3).
ssh-copy-id deploy@<IP_DA_VPS>
```

Se `ssh-copy-id` não existir no Mac, manual:

```bash
# No Mac: mostra a chave pública
cat ~/.ssh/id_ed25519.pub
# Copie a linha inteira. Depois, na VPS (como deploy):
#   mkdir -p ~/.ssh && chmod 700 ~/.ssh
#   echo "<COLE_A_LINHA_AQUI>" >> ~/.ssh/authorized_keys
#   chmod 600 ~/.ssh/authorized_keys
```

### 4B — TESTAR o login por chave  ⚠️ NÃO PULE

Abra um **novo terminal** no Mac (deixe a sessão root atual ABERTA como rede de segurança) e:

```bash
# No Mac. Deve entrar SEM pedir senha.
ssh deploy@<IP_DA_VPS>
```

- **Esperar:** shell do `deploy` sem prompt de senha.
- **Validar sudo:** `sudo whoami` → `root`.
- **Se pedir senha** → a chave não foi instalada certo. **PARE. Não faça o 4C.**
  Corrija o `authorized_keys` antes de seguir.

### 4C — Desligar senha e root login  ⚠️ só depois do 4B passar

```bash
# Na VPS, como deploy. Backup do arquivo antes de editar.
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak

# Ubuntu 24.04 pode ter drop-ins em /etc/ssh/sshd_config.d/ que sobrescrevem.
# Gravamos nossa config num drop-in de alta prioridade pra vencer qualquer default.
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
ChallengeResponseAuthentication no
KbdInteractiveAuthentication no
EOF

sudo sshd -t            # valida a sintaxe. Se der erro, NÃO reinicie o ssh.
sudo systemctl restart ssh
```

- **⚠️ Validar IMEDIATAMENTE, sem fechar a sessão atual:** abra **outro** terminal no Mac:

```bash
# No Mac. Ainda entra por chave?
ssh deploy@<IP_DA_VPS> "echo login-ok"
# E o login por senha DEVE falhar (esperado):
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password root@<IP_DA_VPS>
#   → "Permission denied (publickey)"  = correto, root/senha bloqueados.
```

- **Se o login por chave ainda funciona** → pode fechar a sessão root antiga. Blindagem SSH OK.
- **Se travou** → use o **Console do navegador** no hPanel da Hostinger pra entrar como
  root e reverter: `sudo rm /etc/ssh/sshd_config.d/99-hardening.conf && sudo systemctl restart ssh`.

---

## Passo 5 — Firewall (ufw)  ⚠️ ARRISCADO (a ordem evita cortar seu SSH)

> **Libere a 22 ANTES de dar `enable`.** Se habilitar o ufw com a política
> `deny incoming` sem antes liberar o SSH, a conexão atual cai.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing      # egress liberado (webhook Evolution→Supabase, ACME, apt)
sudo ufw allow 22/tcp                # SSH
sudo ufw allow 443/tcp               # HTTPS (Caddy) — porta pública do proxy
sudo ufw allow 80/tcp                # HTTP — necessário pro ACME/Let's Encrypt do Caddy
sudo ufw enable                      # confirme "y" quando avisar que pode cortar conexões
```

- **Esperar:** aviso "Command may disrupt existing ssh connections" → `y`.
- **Validar:**

```bash
sudo ufw status verbose
#   Status: active
#   Default: deny (incoming), allow (outgoing)
#   22/tcp ALLOW,  80/tcp ALLOW,  443/tcp ALLOW
```

> **Endurecimento futuro (opcional, depois do stack no ar):** restringir a entrada na
> 443 ao egress das Edge Functions do Supabase (os DOIS projetos — Dominex e
> EcoSistema). As edges são o único cliente legítimo do REST. Fazer só depois de
> confirmar as faixas de IP de egress de cada projeto — senão você corta as próprias
> edges. A 80 pode ser fechada depois que o cert emitir, mas o Caddy renova sozinho e
> precisa dela periodicamente → **deixe a 80 aberta**.
> Não mexer na 22 sem ter um segundo caminho de acesso (console hPanel).

---

## Passo 6 — fail2ban no SSH

```bash
sudo apt -y install fail2ban
# Jail local: banir IP após tentativas de brute-force no SSH.
sudo tee /etc/fail2ban/jail.local >/dev/null <<'EOF'
[sshd]
enabled  = true
port     = ssh
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
sudo systemctl enable --now fail2ban
sudo systemctl restart fail2ban
```

- **Validar:**

```bash
sudo fail2ban-client status sshd
#   deve listar o jail "sshd" ativo (0 banidos no começo é normal)
```

> Com `PasswordAuthentication no` (passo 4), brute-force de senha já é impossível;
> o fail2ban reduz ruído de log e barra scanners insistentes.

---

## Passo 7 — unattended-upgrades (patch de segurança automático do SO)

```bash
sudo apt -y install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # escolha "Yes" na telinha
```

Garanta que as origens de segurança e o reboot automático em janela BR estão ativos:

```bash
sudo tee /etc/apt/apt.conf.d/52unattended-upgrades-local >/dev/null <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
```

- **⚠️ Nota de reboot automático:** `04:30` (BR) reinicia a VPS se um patch exigir kernel
  novo. Isso derruba **os dois produtos** por ~1 min (os containers têm `restart: always`
  e as sessões persistem em volume → reconectam sozinhos, sem re-QR). 04:30 é baixo
  tráfego BR. Se preferir zero reboots automáticos, troque `"true"` por `"false"` e
  reinicie manualmente em janela anunciada.
- **Validar:**

```bash
sudo unattended-upgrades --dry-run --debug 2>&1 | tail -20   # sem erros de config
```

---

## Passo 8 — Docker Engine + Compose plugin (repo oficial)

> Instala do repositório **oficial da Docker** (não o `docker.io` do Ubuntu, que é
> mais velho). Isso traz `docker` + `docker compose` (plugin v2).

```bash
# Dependências e chave GPG oficial
sudo apt -y install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Repositório Docker pra Ubuntu 24.04 (codinome noble)
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Rodar docker sem `sudo` (adiciona `deploy` ao grupo docker):

```bash
sudo usermod -aG docker deploy
# Aplique o novo grupo: saia e reentre por SSH (ou rode `newgrp docker` na sessão atual).
```

- **Validar (reentre por SSH primeiro, pro grupo docker valer):**

```bash
docker --version                 # Docker version 27.x ...
docker compose version           # Docker Compose version v2.x
docker run --rm hello-world      # baixa e roda; imprime "Hello from Docker!"
systemctl is-enabled docker      # "enabled" → sobe sozinho no boot (essencial p/ restart:always)
```

> **`docker run hello-world` sem `sudo` deu erro de permissão?** Você ainda não
> reentrou por SSH pro grupo `docker` valer. Faça logout/login e teste de novo.

---

## Passo 9 — Instalar o Caddy (proxy HTTPS) — ponte pra Fase 2

> O Caddy roda **no host** (não em container) e faz auto-HTTPS via Let's Encrypt.
> Ele fala com a Evolution em `127.0.0.1:8080`. Config no `Caddyfile` deste diretório.

```bash
sudo apt -y install debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
  sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
  sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt update
sudo apt -y install caddy
```

- **Validar:** `caddy version` → `v2.x`. `systemctl is-enabled caddy` → `enabled`.
- **Configurar depois** (Fase 2, com o stack já de pé):

```bash
# Edite /etc/caddy/Caddyfile com o conteúdo do Caddyfile deste diretório
# (troque wa.<DOMINIO> pelo real). Depois:
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

> **Pré-requisito do HTTPS:** o DNS `wa.<DOMINIO>` já precisa apontar pro IP da VPS,
> em modo **"DNS only"** na Cloudflare (nuvem cinza), senão o desafio ACME do
> Let's Encrypt falha. Detalhe no `Caddyfile`.

---

## Fim da Fase 1 — checklist de blindagem

- [ ] `apt upgrade` sem pendências de segurança; timezone `America/Sao_Paulo`.
- [ ] Usuário `deploy` com sudo; login por chave OK; **senha e root SSH desligados** (testado).
- [ ] `ufw status` = active; só 22/80/443 abertos; default deny incoming.
- [ ] `fail2ban-client status sshd` ativo.
- [ ] `unattended-upgrades --dry-run` sem erro.
- [ ] `docker run hello-world` sem sudo; `docker`+`caddy` habilitados no boot.

➡️ Prossiga pra **Fase 2** (README.md → subir o stack; `Caddyfile` → proxy) e depois
**Fase 3** (`backup.sh` + `restore.md`).
