"""Contrato de `GET /v1/infra/metricas` — DONO: 🖥️ Dev Infra.

O que estes testes defendem, em ordem de importância:

1. **Nada de segredo sai na resposta.** Token, KEK, material de certificado e
   caminho de arquivo de segredo. Este é o teste que impede que alguém, um dia,
   acrescente um campo "pra ajudar a depurar" e exponha a KEK no painel.
2. **"Deste serviço" não se mistura com "da box".** A VPS é compartilhada com o
   EcoSistema; se a resposta não separar, a tela mente pro CEO.
3. **Degradação honesta.** Sem o coletor do host, a rota diz que não tem o dado
   — nunca inventa e nunca finge que está tudo verde.

Nada aqui toca rede, Docker ou certificado real.
"""

from __future__ import annotations

import json
import os
import time

import pytest
from fastapi.testclient import TestClient

from app import metricas as metricas_mod
from app.main import app

TOKEN = os.environ["FISCAL_SERVICE_TOKEN"]
ROTA = "/v1/infra/metricas"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def cliente() -> TestClient:
    return TestClient(app)


@pytest.fixture
def estado_vazio(tmp_path, monkeypatch):
    """Diretório de retrato existente, porém sem nenhum arquivo do coletor."""
    monkeypatch.setattr(metricas_mod, "DIR_ESTADO", str(tmp_path))
    return tmp_path


@pytest.fixture
def sem_alarme_de_recurso(monkeypatch):
    """Neutraliza os limiares de disco/RAM da MÁQUINA DE QUEM RODA O TESTE.

    Sem isto, o teste passaria ou falharia conforme o disco do Mac do dev —
    e teste que depende do ambiente é teste que ninguém acredita.
    """
    monkeypatch.setattr(metricas_mod, "LIMITE_DISCO_PCT", 100.0)
    monkeypatch.setattr(metricas_mod, "LIMITE_RAM_BOX_PCT", 100.0)
    monkeypatch.setattr(metricas_mod, "LIMITE_RAM_SERVICO_PCT", 100.0)


# =============================================================================
# 1. Autenticação — a rota nasce fechada
# =============================================================================
def test_sem_token_401_sem_pista(cliente):
    resposta = cliente.get(ROTA)
    assert resposta.status_code == 401
    assert resposta.content == b""


def test_token_errado_401(cliente):
    resposta = cliente.get(ROTA, headers={"Authorization": "Bearer nao-e-o-token"})
    assert resposta.status_code == 401


def test_metrics_do_prometheus_continua_nao_existindo(cliente):
    """A decisão de blindagem não foi relaxada: só a rota nova é que existe."""
    for caminho in ("/metrics", "/v1/metrics"):
        assert cliente.get(caminho, headers=AUTH).status_code == 404


# =============================================================================
# 2. Forma da resposta
# =============================================================================
def test_responde_200_e_tem_os_blocos_do_contrato(cliente, estado_vazio):
    resposta = cliente.get(ROTA, headers=AUTH)
    assert resposta.status_code == 200
    corpo = resposta.json()
    for bloco in ("ok", "status", "geradoEm", "avisos", "servico", "box",
                  "stacks", "custodia", "fumaca", "governo"):
        assert bloco in corpo, f"bloco '{bloco}' sumiu do contrato"
    assert corpo["status"] in ("ok", "degradado")
    assert isinstance(corpo["avisos"], list)


def test_sempre_200_mesmo_degradado(cliente, estado_vazio):
    """Igual ao /readyz: o veredito vai no corpo, não no código HTTP.

    Monitor simples descarta o corpo em erro — e é o corpo que diz o que quebrou.
    """
    assert cliente.get(ROTA, headers=AUTH).status_code == 200


def test_fora_do_linux_degrada_em_vez_de_estourar(cliente, estado_vazio):
    """No Mac não existe cgroup nem /proc. A rota tem que responder assim mesmo."""
    corpo = cliente.get(ROTA, headers=AUTH).json()
    assert corpo["servico"]["memoria"]["fonte"] in (
        "cgroup-v2", "cgroup-v1", "indisponivel"
    )


# =============================================================================
# 3. A separação que impede a tela de mentir
# =============================================================================
def test_box_se_declara_compartilhada_e_lista_os_ocupantes(cliente, estado_vazio):
    box = cliente.get(ROTA, headers=AUTH).json()["box"]
    assert box["compartilhada"] is True
    # O aviso é lido pelo humano na tela. Tem que citar o outro produto.
    assert "EcoSistema" in box["aviso"]
    assert "servico" in box["aviso"], "o aviso precisa apontar onde está o número do serviço"
    ocupantes = " ".join(box["ocupantes"])
    assert "whatsapp-evolution" in ocupantes and "ecosistema-dfe" in ocupantes


def test_servico_e_box_nao_compartilham_campos(cliente, estado_vazio):
    """RAM do serviço é cgroup; RAM da box é /proc. Misturar é o bug a evitar."""
    corpo = cliente.get(ROTA, headers=AUTH).json()
    servico, box = corpo["servico"], corpo["box"]
    # O serviço mede a si mesmo contra o LIMITE do container.
    assert "limiteMb" in servico["memoria"]
    # A box mede o total físico. Se um dia alguém colar "totalMb" no serviço,
    # a tela passa a mostrar 8 GB como se fosse consumo do motor fiscal.
    assert "totalMb" not in servico["memoria"]
    assert "totalMb" in box["memoria"]
    assert "compartilhada" not in servico


def test_stacks_separa_por_projeto_do_compose(cliente, estado_vazio, tmp_path):
    (tmp_path / "box.json").write_text(json.dumps({
        "coletadoEm": "2026-09-24T21:00:00-03:00",
        "discoUsadoPct": 27.0,
        "containers": [
            {"stack": "whatsapp-evolution", "container": "evolution_api",
             "estado": "running", "saude": "healthy", "reinicios": 0,
             "memMb": 410.2, "memLimiteMb": None, "cpuPct": 1.1,
             "oomUltimaParada": False, "criadoEm": "2026-08-03T10:00:00"},
            {"stack": "dominex-fiscal", "container": "dominex-fiscal",
             "estado": "running", "saude": "healthy", "reinicios": 2,
             "memMb": 148.0, "memLimiteMb": 512.0, "cpuPct": 0.3,
             "oomUltimaParada": False, "criadoEm": "2026-09-03T10:00:00"},
        ],
    }), encoding="utf-8")

    stacks = cliente.get(ROTA, headers=AUTH).json()["stacks"]
    assert stacks["disponivel"] is True
    assert stacks["atualizado"] is True
    assert {i["stack"] for i in stacks["itens"]} == {"whatsapp-evolution", "dominex-fiscal"}
    fiscal = next(i for i in stacks["itens"] if i["stack"] == "dominex-fiscal")
    assert fiscal["reinicios"] == 2 and fiscal["memLimiteMb"] == 512.0


# =============================================================================
# 4. NADA DE SEGREDO — o teste mais importante deste arquivo
# =============================================================================
def test_resposta_nao_carrega_nenhum_segredo(cliente, estado_vazio):
    from app.config import get_config

    cfg = get_config()
    bruto = cliente.get(ROTA, headers=AUTH).text

    assert TOKEN not in bruto, "o token de serviço vazou na resposta"
    assert cfg.token not in bruto
    for kek in cfg.keks.values():
        import base64

        assert base64.b64encode(kek.chave).decode() not in bruto, "KEK vazou"
        assert kek.chave.hex() not in bruto

    proibidos = (
        "FISCAL_KEKS",
        "FISCAL_SERVICE_TOKEN",
        "KEK_FISCAL_FILE",
        "BEGIN PRIVATE KEY",
        "BEGIN RSA PRIVATE KEY",
        "BEGIN CERTIFICATE",
        "service.env",
        "/etc/dominex-fiscal",
        ".pfx",
        "senha",
    )
    for agulha in proibidos:
        assert agulha not in bruto, f"'{agulha}' não pode aparecer na resposta"


def test_nao_expoe_caminho_do_tmpfs_de_custodia(cliente, estado_vazio):
    """O caminho não ajuda quem está na tela e ajuda quem está procurando alvo."""
    from app.config import get_config

    bruto = cliente.get(ROTA, headers=AUTH).text
    assert get_config().tmpfs_dir not in bruto
    # Mas a CONFORMIDADE continua visível — é o que interessa operacionalmente.
    tmpfs = cliente.get(ROTA, headers=AUTH).json()["servico"]["tmpfsCustodia"]
    assert set(("ok", "emRam", "noexec", "nosuid")).issubset(tmpfs)


def test_nao_expoe_hostname_nem_ip_da_vps(cliente, estado_vazio):
    import socket

    bruto = cliente.get(ROTA, headers=AUTH).text
    assert socket.gethostname() not in bruto
    assert "46.202.149.193" not in bruto


def test_campo_desconhecido_do_coletor_nao_atravessa(cliente, estado_vazio, tmp_path):
    """Lista fechada: o coletor não consegue empurrar campo novo pra API.

    Cenário real que isto cobre: alguém edita o `collect-box.sh` e, sem querer,
    passa a incluir a saída de `docker inspect` inteira (que tem `Env`, que tem
    a KEK). A allowlist de campos corta antes de virar resposta.
    """
    (tmp_path / "box.json").write_text(json.dumps({
        "coletadoEm": "2026-09-24T21:00:00-03:00",
        "containers": [{
            "stack": "dominex-fiscal",
            "container": "dominex-fiscal",
            "estado": "running",
            "Env": ["FISCAL_KEKS=1:AAAA", "FISCAL_SERVICE_TOKEN=segredo"],
            "campoNovoInesperado": "valor-que-nao-pode-passar",
        }],
    }), encoding="utf-8")

    bruto = cliente.get(ROTA, headers=AUTH).text
    assert "campoNovoInesperado" not in bruto
    assert "valor-que-nao-pode-passar" not in bruto
    assert "Env" not in bruto
    assert "segredo" not in bruto


def test_texto_do_smoke_e_saneado(cliente, estado_vazio, tmp_path):
    """Mensagem de falha do smoke é texto livre; passa pela redação."""
    (tmp_path / "fumaca.json").write_text(json.dumps({
        "executadoEm": "2026-09-24T21:00:00-03:00",
        "modo": "light",
        "resultado": "falha",
        "falhas": [
            "não consigo ler o token de /etc/dominex-fiscal/service.env",
            "token apresentado: " + "a1b2c3d4" * 8,
        ],
        "detalhes": ["nfelib=2.0.9"],
        "coberturaEmissao": False,
    }), encoding="utf-8")

    corpo = cliente.get(ROTA, headers=AUTH).json()
    falhas = " ".join(corpo["fumaca"]["falhas"])
    assert "/etc/dominex-fiscal" not in falhas
    assert "<arquivo de segredo do host>" in falhas
    assert ("a1b2c3d4" * 8) not in falhas
    assert "<redigido>" in falhas
    # O que interessa (versões das libs) continua legível.
    assert "nfelib=2.0.9" in " ".join(corpo["fumaca"]["detalhes"])


# =============================================================================
# 5. Degradação honesta — a lacuna aparece, sem pintar tudo de vermelho
# =============================================================================
def test_sem_coletor_diz_que_nao_tem_em_vez_de_inventar(cliente, estado_vazio):
    corpo = cliente.get(ROTA, headers=AUTH).json()
    assert corpo["stacks"]["disponivel"] is False
    assert corpo["stacks"]["itens"] == []
    assert "RUNBOOK" in corpo["stacks"]["motivo"]
    assert corpo["fumaca"]["disponivel"] is False
    assert corpo["fumaca"]["coberturaEmissao"] is False


def test_sem_smoke_vira_aviso_nao_incidente(cliente, estado_vazio, sem_alarme_de_recurso):
    """A ausência do canário é AVISO. Vermelho permanente faz o operador parar
    de olhar a tela — e aí o vermelho de verdade também passa batido."""
    corpo = cliente.get(ROTA, headers=AUTH).json()
    assert any("fumaça" in a for a in corpo["avisos"])
    assert corpo["ok"] is True, "lacuna conhecida não pode derrubar a saúde técnica"


def test_retrato_velho_e_marcado_como_velho(cliente, estado_vazio, tmp_path):
    caminho = tmp_path / "fumaca.json"
    caminho.write_text(json.dumps({
        "executadoEm": "2026-09-20T07:10:00-03:00",
        "modo": "light", "resultado": "ok", "falhas": [], "detalhes": [],
        "coberturaEmissao": False,
    }), encoding="utf-8")
    antigo = time.time() - 6 * 3600
    os.utime(caminho, (antigo, antigo))

    corpo = cliente.get(ROTA, headers=AUTH).json()
    assert corpo["fumaca"]["disponivel"] is True
    assert corpo["fumaca"]["atualizado"] is False
    assert corpo["fumaca"]["idadeSegundos"] > 20 * 60
    assert any("velho" in a for a in corpo["avisos"])


def test_smoke_com_falha_vira_aviso(cliente, estado_vazio, tmp_path):
    (tmp_path / "fumaca.json").write_text(json.dumps({
        "executadoEm": "2026-09-24T21:00:00-03:00",
        "modo": "full", "resultado": "falha",
        "falhas": ["AUTOTESTE DE ASSINATURA FALHOU"],
        "detalhes": [], "coberturaEmissao": True,
    }), encoding="utf-8")

    corpo = cliente.get(ROTA, headers=AUTH).json()
    assert any("FALHOU" in a for a in corpo["avisos"])


def test_retrato_ilegivel_nao_derruba_a_rota(cliente, estado_vazio, tmp_path):
    (tmp_path / "box.json").write_text("{isto nao e json", encoding="utf-8")
    corpo = cliente.get(ROTA, headers=AUTH).json()
    assert corpo["stacks"]["disponivel"] is False
    assert "ilegível" in corpo["stacks"]["motivo"]


def test_retrato_gigante_e_ignorado(cliente, estado_vazio, tmp_path):
    """Coletor com defeito não enche a RAM do motor fiscal."""
    (tmp_path / "box.json").write_text("x" * (metricas_mod.TETO_ARQUIVO_BYTES + 1),
                                       encoding="utf-8")
    corpo = cliente.get(ROTA, headers=AUTH).json()
    assert corpo["stacks"]["disponivel"] is False
    assert "grande demais" in corpo["stacks"]["motivo"]


# =============================================================================
# 6. Sinais que o operador precisa ver
# =============================================================================
def test_custodia_reporta_saude_sem_material(cliente, estado_vazio):
    custodia = cliente.get(ROTA, headers=AUTH).json()["custodia"]
    assert custodia["kekAbreOQueFecha"] is True
    assert custodia["keksConfiguradas"] == 2  # conftest configura duas
    assert custodia["acervoNestaVps"] is False


def test_versoes_das_libs_aparecem(cliente, estado_vazio):
    """É o canário de deriva do governo: `nfelib` atrasada quebrou o spike."""
    versoes = cliente.get(ROTA, headers=AUTH).json()["governo"]["versoesBibliotecas"]
    assert "nfelib" in versoes and "signxml" in versoes


def test_uptime_e_identidade_do_servico(cliente, estado_vazio):
    servico = cliente.get(ROTA, headers=AUTH).json()["servico"]
    assert servico["nome"] == "dominex-fiscal"
    assert servico["uptimeSegundos"] >= 0
    assert servico["python"].startswith("3.")
    assert "iniciadoEm" in servico


def test_oom_do_servico_e_declarado(cliente, estado_vazio):
    """Fora do Linux o campo vem None — "não sei" e "não aconteceu" são coisas
    diferentes, e confundir as duas é como um alarme começa a mentir."""
    oom = cliente.get(ROTA, headers=AUTH).json()["servico"]["oom"]
    assert "aconteceu" in oom
    assert oom["aconteceu"] in (True, False, None)


# =============================================================================
# 7. Leitura do cgroup — o que roda na VPS e não roda no Mac
# =============================================================================
# Estes testes fabricam um cgroup v2 falso em disco. Sem eles, TODO o cálculo de
# memória/CPU/OOM do serviço só seria exercitado em produção — e o caminho
# "indisponivel" do macOS passaria a ilusão de cobertura.
@pytest.fixture
def cgroup_falso(tmp_path, monkeypatch):
    raiz = tmp_path / "cgroup"
    raiz.mkdir()
    (raiz / "cgroup.controllers").write_text("cpu memory pids\n")
    (raiz / "memory.current").write_text(str(157 * 1024 * 1024) + "\n")
    (raiz / "memory.max").write_text(str(512 * 1024 * 1024) + "\n")
    (raiz / "memory.peak").write_text(str(201 * 1024 * 1024) + "\n")
    (raiz / "memory.events").write_text("low 0\nhigh 0\nmax 4\noom 1\noom_kill 2\n")
    (raiz / "cpu.stat").write_text(
        "usage_usec 120000000\nnr_periods 10\nnr_throttled 3\nthrottled_usec 500000\n"
    )
    (raiz / "pids.current").write_text("9\n")
    (raiz / "pids.max").write_text("256\n")
    monkeypatch.setattr(metricas_mod, "_CG", str(raiz))
    return raiz


def test_memoria_do_servico_vem_do_cgroup(cgroup_falso):
    memoria = metricas_mod.memoria_do_servico()
    assert memoria["fonte"] == "cgroup-v2"
    assert memoria["usadoMb"] == 157.0
    assert memoria["limiteMb"] == 512.0
    assert memoria["picoMb"] == 201.0
    assert memoria["usoPct"] == 30.7


def test_memoria_sem_limite_nao_inventa_percentual(cgroup_falso):
    (cgroup_falso / "memory.max").write_text("max\n")
    memoria = metricas_mod.memoria_do_servico()
    assert memoria["limiteMb"] is None
    assert memoria["usoPct"] is None


def test_oom_do_servico_conta_mortes_e_teto(cgroup_falso):
    oom = metricas_mod.oom_do_servico()
    assert oom["mortesDesdeQueSubiu"] == 2
    assert oom["aconteceu"] is True
    assert oom["vezesQueBateuNoTeto"] == 4


def test_cpu_do_servico_calcula_media_e_estrangulamento(cgroup_falso):
    cpu = metricas_mod.cpu_do_servico(uptime_s=600.0, nucleos=2)
    assert cpu["usoSegundos"] == 120.0
    # 120 s de CPU em 600 s de vida com 2 núcleos = 10%.
    assert cpu["mediaPctDesdeQueSubiu"] == 10.0
    assert cpu["vezesEstrangulado"] == 3
    assert cpu["estranguladoSegundos"] == 0.5


def test_processos_do_servico(cgroup_falso):
    assert metricas_mod.processos_do_servico() == {"atual": 9, "limite": 256}


def test_oom_derruba_a_saude_e_gera_aviso(cliente, estado_vazio, cgroup_falso,
                                          sem_alarme_de_recurso):
    corpo = cliente.get(ROTA, headers=AUTH).json()
    assert corpo["ok"] is False
    assert any("OOM" in a for a in corpo["avisos"])


def test_disco_do_host_ganha_do_overlay_quando_fresco(cliente, estado_vazio, tmp_path):
    """O `df /` do host é a medida autoritativa; o statvfs do container mede o
    overlay. Duas verdades sobre disco cheio é exatamente o que não pode ter."""
    (tmp_path / "box.json").write_text(json.dumps({
        "coletadoEm": "2026-09-24T21:00:00-03:00",
        "discoUsadoPct": 31.0,
        "containers": [],
    }), encoding="utf-8")
    disco = cliente.get(ROTA, headers=AUTH).json()["box"]["disco"]
    assert disco["usadoPct"] == 31.0
    assert disco["fonte"] == "coletor do host (df /)"


def test_disco_de_retrato_velho_nao_e_usado(cliente, estado_vazio, tmp_path):
    caminho = tmp_path / "box.json"
    caminho.write_text(json.dumps({"discoUsadoPct": 31.0, "containers": []}),
                       encoding="utf-8")
    antigo = time.time() - 6 * 3600
    os.utime(caminho, (antigo, antigo))
    disco = cliente.get(ROTA, headers=AUTH).json()["box"]["disco"]
    assert disco["fonte"] == "container (overlay sobre o disco da box)"


def test_sanear_redige_caminho_e_blob():
    saida = metricas_mod._sanear(
        "falha ao ler /etc/dominex-fiscal/service.env com " + "Z" * 40
    )
    assert "/etc/dominex-fiscal" not in saida
    assert "Z" * 40 not in saida


def test_sanear_corta_texto_gigante():
    assert len(metricas_mod._sanear("a" * 5000)) <= metricas_mod._TETO_TEXTO


# =============================================================================
# 8. O contrato entre os scripts do HOST e esta API
# =============================================================================
# O acoplamento é por nome de campo dentro de um JSON — não tem compilador pra
# avisar. Se alguém renomear um campo no shell, o painel passa a mostrar `null`
# em silêncio (que é indistinguível de "container saudável sem dado"). Estes
# dois testes são o compilador que falta.
_RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_collect_box_escreve_todos_os_campos_que_a_api_le():
    fonte = open(os.path.join(_RAIZ, "collect-box.sh"), encoding="utf-8").read()
    for campo in metricas_mod._CAMPOS_STACK:
        assert f'"{campo}"' in fonte, (
            f"a API lê '{campo}' mas collect-box.sh não escreve — a tela mostraria null"
        )
    assert '"containers"' in fonte and '"discoUsadoPct"' in fonte


def test_smoke_escreve_todos_os_campos_do_bloco_fumaca():
    fonte = open(os.path.join(_RAIZ, "smoke-test.sh"), encoding="utf-8").read()
    for campo in ("executadoEm", "modo", "resultado", "falhas", "detalhes",
                  "coberturaEmissao"):
        assert f'"{campo}"' in fonte, f"smoke-test.sh não escreve '{campo}'"


def test_nenhum_script_do_host_usa_docker_inspect_sem_filtro():
    """`docker inspect` sem `-f` despeja o bloco Env — que tem a KEK e o token.

    Isto já é regra escrita no cabeçalho do collect-box.sh; aqui vira trava.
    """
    import re

    for nome in ("collect-box.sh", "smoke-test.sh"):
        fonte = open(os.path.join(_RAIZ, nome), encoding="utf-8").read()
        for linha in fonte.splitlines():
            if "docker inspect" in linha and not linha.lstrip().startswith("#"):
                assert re.search(r"docker inspect\s+(-f|--format)", linha), (
                    f"{nome}: `docker inspect` sem -f vaza Env (KEK/token): {linha.strip()}"
                )
