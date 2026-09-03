# =============================================================================
# dominex-fiscal — motor NFS-e próprio (Sefin Nacional), Python 3.12
# =============================================================================
# Por que este container existe: as Edge Functions da Supabase NÃO fazem mTLS, e o
# Sefin Nacional só autentica por mTLS com o certificado A1 do emitente. Este é o
# único lugar da stack que toca material criptográfico de cliente.
#
# Postura de segurança da imagem (todas obrigatórias — não relaxar sem o Tech Lead):
#   - multi-stage: compilador e headers ficam SÓ no builder; a imagem final não tem
#     gcc, make, nem *-dev. Menos binário = menos escada pra escalada de privilégio.
#   - usuário NÃO-root fixo (uid/gid 10001). O uid é numérico e estável de propósito:
#     os arquivos de segredo no host são chowneados pra ESSE gid (ver RUNBOOK §1.4).
#   - NENHUM certificado, .pfx, senha, KEK ou token entra na imagem. Nunca. A imagem
#     é pública-safe: se vazar, não tem segredo dentro.
#   - PYTHONDONTWRITEBYTECODE: o rootfs sobe read-only no compose; escrever .pyc
#     quebraria. Os .pyc já vêm compilados do builder (compileall).
#
# Build:  docker compose build          (ver RUNBOOK §2)
# =============================================================================

# ---------- Estágio 1: builder (tem compilador; NÃO vai pra imagem final) ----------
FROM python:3.12-slim-bookworm AS builder

# libxml2-dev/libxslt1-dev/zlib1g-dev + gcc são rede de segurança: hoje lxml e
# cryptography têm wheel manylinux pra cp312 (não compila nada), mas se um dia um
# pacote perder o wheel o build continua funcionando em vez de quebrar em produção.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libxml2-dev \
        libxslt1-dev \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# venv isolado — copiado inteiro pro estágio final.
ENV VIRTUAL_ENV=/opt/venv
RUN python -m venv "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# REQ_FILE: por padrão usa requirements.txt (sem pin). Depois do primeiro build bem
# sucedido, gere o lock e passe --build-arg REQ_FILE=requirements.lock.txt.
# ⚠️ Ir pra produção SEM lock é o risco R2 do plano (esteira de layout fiscal):
# um `pip install nfelib` sem pin pode trazer versão nova no meio da madrugada.
ARG REQ_FILE=requirements.txt
COPY requirements.txt requirements.lock.tx[t] ./
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r "${REQ_FILE}" \
    && pip freeze > /opt/venv/requirements.frozen.txt

# ---------- Estágio 2: runtime (sem build tools) ----------
FROM python:3.12-slim-bookworm AS runtime

# Só as libs de RUNTIME do lxml (caso ele tenha sido compilado no builder; com wheel
# manylinux elas nem são usadas, mas ~2 MB e evita um "ImportError" surpresa).
# ca-certificates: TLS de saída pro gov (o mTLS do cliente é carregado em memória).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libxml2 \
        libxslt1.1 \
        ca-certificates \
        tzdata \
    && rm -rf /var/lib/apt/lists/*

# Usuário não-root com uid/gid FIXOS (o host chowneia os segredos pra 10001).
RUN groupadd --gid 10001 fiscal \
    && useradd --uid 10001 --gid 10001 --home-dir /app --no-create-home --shell /usr/sbin/nologin fiscal

ENV VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    TZ=America/Sao_Paulo \
    HOME=/tmp \
    TMPDIR=/tmp \
    FISCAL_TMPFS_DIR=/run/dominex-fiscal

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
# Código do motor. app/main.py, app/security.py, app/infra_routes.py e (C4) app/routes_nfse.py
COPY --chown=root:root app/ /app/app/

# Pré-compila os .pyc AGORA (com rootfs ainda gravável). Em runtime o rootfs é
# read-only e PYTHONDONTWRITEBYTECODE=1 — sem isso, todo import recompilaria em RAM.
RUN python -m compileall -q /app/app /opt/venv/lib || true

# O código é root:root e 0555 — o processo (uid 10001) LÊ mas não ESCREVE o próprio
# código. Se alguém conseguir RCE, não consegue persistir alterando o app.
RUN chmod -R a-w /app

USER 10001:10001

EXPOSE 8000

# O HEALTHCHECK vive no docker-compose.yml (uma fonte só, e é lá que o operador
# olha). Ele usa a stdlib do Python porque NÃO instalamos curl de propósito:
# menos binário na imagem = menos ferramenta pronta pra quem conseguir um RCE.

# 1 worker de propósito: a KEK e o estado ficam em UM processo só (menos cópias de
# material sensível em RAM) e a carga é baixíssima (poucas notas/minuto). Escalar =
# subir o limite de RAM e só então avaliar workers. --proxy-headers porque quem
# termina o TLS é o Caddy no host.
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "1", \
     "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1", \
     "--no-server-header", \
     "--timeout-keep-alive", "15"]
