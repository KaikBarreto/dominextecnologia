# restore.md — Restauração da Evolution API a partir do backup

> Restaura o estado da Evolution (Postgres + volume de sessões) gerado pelo `backup.sh`.
> Vale pra dois cenários: **(A)** "oops" do dia na mesma VPS, **(B)** disaster recovery
> numa **box nova** (VPS perdida/suspensa).
>
> **Afeta os DOIS produtos** (Dominex + EcoSistema) — anuncie janela de manutenção.
> **Nunca** use `docker compose down -v` (o `-v` apaga os volumes = perde as sessões).

---

## O que um conjunto de backup contém

Cada pasta `/<BACKUP_DIR>/<timestamp>/` tem:

| Arquivo | Conteúdo |
|---|---|
| `evolution-pg-<ts>.dump` | `pg_dump -Fc` do banco `evolution` (instâncias/sessões no Postgres) |
| `evolution-instances-<ts>.tar.gz` | tar do volume `*_evolution_instances` (creds/estado Baileys em disco) |
| `MANIFEST.txt` | nomes de serviço/db/volume e host de origem |

> Restaure **os dois juntos e do mesmo timestamp**. Postgres e volume são um par
> coerente: misturar timestamps diferentes pode deixar a sessão inconsistente
> (banco aponta pra creds que o volume não tem, ou vice-versa) → re-QR.

---

## Cenário A — restaurar na MESMA VPS (rollback do dia)

Pré-condição: o stack está de pé (`docker compose ps` mostra os 3 serviços).

```bash
cd ~/whatsapp-evolution
SET=/var/backups/whatsapp-evolution/<timestamp>   # escolha o conjunto a restaurar
cat "$SET/MANIFEST.txt"                            # confira serviço/db/volume
```

### A1 — Parar só a Evolution (mantém Postgres e Redis de pé)

```bash
# Para o container da API pra ninguém gravar sessão durante o restore.
# NÃO use down -v. Só stop do serviço evolution.
docker compose stop evolution
```

### A2 — Restaurar o Postgres  ⚠️ sobrescreve dados atuais do banco evolution

```bash
# Restore com --clean --if-exists: dropa objetos existentes e recria do dump.
# -Fc exige pg_restore (não psql).
docker compose exec -T postgres \
	pg_restore -U evolution -d evolution --clean --if-exists \
	< "$SET"/evolution-pg-*.dump
```

- **Esperar:** pode imprimir alguns `NOTICE ... does not exist, skipping` na primeira
  passada (por causa do `--clean --if-exists`) — é normal.
- **Erro fatal** (não-NOTICE) → pare e investigue antes de subir a Evolution.

### A3 — Restaurar o volume de instâncias  ⚠️ sobrescreve o estado de sessão em disco

```bash
# Descobre o nome real do volume (prefixado pelo projeto compose).
VOL=$(docker volume ls --format '{{.Name}}' | grep -E 'evolution_instances$' | head -n1)
echo "volume: $VOL"

# Limpa o conteúdo atual e extrai o do backup, num container efêmero.
docker run --rm \
	-v "$VOL":/data \
	-v "$SET":/backup:ro \
	alpine:3.20 sh -c '
		set -e
		find /data -mindepth 1 -delete
		tar xzf /backup/evolution-instances-*.tar.gz -C /data
	'
```

### A4 — Subir a Evolution e validar

```bash
docker compose up -d evolution
docker compose logs -f evolution   # acompanhe até estabilizar; Ctrl-C pra sair
```

Validação — ver seção **"Validar reconexão"** abaixo.

---

## Cenário B — disaster recovery numa BOX NOVA

Use quando a VPS original se perdeu (disco, suspensão de conta, incidente do provedor).

### B1 — Provisionar a box e a blindagem base

Rode a **Fase 1 inteira** do `RUNBOOK.md` na box nova (update, usuário sudo, SSH por
chave, ufw, fail2ban, Docker, Caddy). Sem isso, não há onde restaurar.

### B2 — Subir o stack VAZIO primeiro

```bash
mkdir -p ~/whatsapp-evolution && cd ~/whatsapp-evolution
# copie docker-compose.yml, .env.example, Caddyfile deste diretório
cp .env.example .env
# ⚠️ CRÍTICO: preencha o .env com os MESMOS segredos da VPS antiga:
#   EVOLUTION_API_KEY  → tem que ser a MESMA (senão as edges dos dois Supabase quebram)
#   POSTGRES_PASSWORD  → tem que ser a MESMA (o dump espera o mesmo usuário/senha)
#   EVOLUTION_SERVER_URL → https://wa.<DOMINIO> (o mesmo subdomínio, re-apontado no DNS)
chmod 600 .env

docker compose up -d      # cria os volumes vazios e sobe os 3 serviços
docker compose ps         # aguarde os 3 "Up" e o Postgres aceitar conexão
```

> **Por que a mesma `EVOLUTION_API_KEY`:** ela é global e as Edge Functions dos dois
> produtos (Dominex + EcoSistema) autenticam com ela no header `apikey`. Gerar uma nova
> obrigaria rotacionar o secret nos dois Supabase ao mesmo tempo. Na DR, reusar a
> antiga é o caminho sem downtime das edges.

### B3 — Restaurar Postgres + volume

Idêntico ao **Cenário A**, passos A1→A3 (aponte `$SET` pro conjunto trazido do
offsite/Hostinger snapshot). Depois A4.

### B4 — Re-apontar o DNS e validar HTTPS

```bash
# Na Cloudflare: atualize o A de wa.<DOMINIO> pro IP da box NOVA (DNS only / nuvem cinza).
# Configure o Caddy (RUNBOOK Passo 9) e recarregue:
sudo cp Caddyfile /etc/caddy/Caddyfile     # com wa.<DOMINIO> real
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
# Aguarde o cert emitir (pode levar 1-2 min na 1ª vez):
curl -sSI https://wa.<DOMINIO>/ | head -1
```

---

## Validar reconexão (os dois cenários)

O objetivo é confirmar que as instâncias voltaram **sem precisar re-parear QR**.

```bash
# Do host (a 8080 só escuta em 127.0.0.1). Precisa da API key do .env.
API_KEY=$(grep -E '^EVOLUTION_API_KEY=' ~/whatsapp-evolution/.env | cut -d= -f2)

# Lista instâncias e o estado de conexão de cada uma:
curl -s -H "apikey: $API_KEY" http://127.0.0.1:8080/instance/fetchInstances | \
	python3 -m json.tool
```

- **Esperar:** as instâncias `dominex_<company_id>` e/ou `ecosistema_cobranca` aparecem
  com estado `open` (conectadas). Pode levar alguns segundos pra reautenticar após o
  restore.
- **Se aparecer `connecting`/`close`** por muito tempo → aquela sessão precisa re-QR
  (as creds daquele número não sobreviveram, ou o WhatsApp derrubou a sessão). Re-parear
  via fluxo normal (edge `whatsapp-connect` → QR). Dói mais no Dominex (multi-tenant),
  por isso o par Postgres+volume deve vir do mesmo timestamp.
- **Do lado do app:** dispare um teste de envio controlado por cada produto e confirme
  que o webhook volta com `connected`/entrega.

---

## Checklist de ENSAIO de restore (backup não-testado é ficção)

> Rode este ensaio periodicamente (ex.: trimestral) numa box **descartável** — nunca
> na produção. Objetivo: provar que o conjunto de backup restaura de fato.

- [ ] Subir uma VPS/box nova (pode ser um droplet barato temporário) com Docker.
- [ ] Trazer um conjunto de backup real (do local **e** do offsite R2/B2, testando os dois caminhos).
- [ ] Rodar Cenário B (stack vazio → restore pg → restore volume → subir).
- [ ] `fetchInstances` mostra as instâncias em `open` **sem** re-QR → sucesso.
- [ ] Medir quanto tempo levou (vira o RTO real, não o teórico).
- [ ] Anotar qualquer passo que travou e corrigir este documento.
- [ ] **Destruir a box de ensaio** (não deixar uma segunda Evolution logada no mesmo
      número rodando — pode conflitar a sessão do WhatsApp em produção).
- [ ] Registrar data do último ensaio bem-sucedido.

**Último ensaio bem-sucedido:** _(preencher: ____/____/______)_
