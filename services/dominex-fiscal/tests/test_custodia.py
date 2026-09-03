"""C3 — testes do ciclo de custódia.

O que estes testes protegem (nesta ordem de importância):
  1. cifra→decifra ida e volta preserva byte a byte o .pfx e a senha;
  2. KEK errada FALHA (é isso que torna o vazamento da Supabase inofensivo);
  3. envelope de OUTRA empresa não abre (separação criptográfica entre tenants);
  4. o tmpfs fica limpo no `finally` — inclusive quando dá exceção no meio.
"""

from __future__ import annotations

import os
import stat

import pytest

from app import custodia
from app.custodia import ErroDeCustodia, abrir, materializar_pem, selar

EMPRESA = "7a1b3c4d-0000-4000-8000-abcdefabcdef"
OUTRA_EMPRESA = "9f9f9f9f-0000-4000-8000-abcdefabcdef"


# -----------------------------------------------------------------------------
# 1. Ida e volta
# -----------------------------------------------------------------------------


def test_ida_e_volta_preserva_pfx_e_senha(cfg, pfx_de_teste):
    pfx, senha = pfx_de_teste
    envelope = selar(pfx, senha, EMPRESA, cfg)

    pfx_de_volta, senha_de_volta = abrir(envelope, EMPRESA, cfg)

    assert pfx_de_volta == pfx
    assert senha_de_volta == senha


def test_nada_do_material_em_claro_aparece_no_envelope(cfg, pfx_de_teste):
    pfx, senha = pfx_de_teste
    envelope = selar(pfx, senha, EMPRESA, cfg)

    serializado = "".join(
        [envelope.pfx_cifrado_b64, envelope.dek_envelopada_b64, envelope.senha_cifrada_b64]
    )
    assert senha not in serializado
    # E o repr não pode vazar material (aparece em traceback e em log de erro).
    assert senha not in repr(envelope)
    assert envelope.pfx_cifrado_b64 not in repr(envelope)


def test_cada_selagem_usa_dek_e_nonce_novos(cfg, pfx_de_teste):
    """Nonce repetido com a mesma chave quebra o AES-GCM. Não pode acontecer."""
    pfx, senha = pfx_de_teste
    a = selar(pfx, senha, EMPRESA, cfg)
    b = selar(pfx, senha, EMPRESA, cfg)

    assert a.pfx_cifrado_b64 != b.pfx_cifrado_b64
    assert a.dek_envelopada_b64 != b.dek_envelopada_b64
    assert a.nonce_b64 != b.nonce_b64


# -----------------------------------------------------------------------------
# 2. KEK errada FALHA (a propriedade que o desenho inteiro existe para garantir)
# -----------------------------------------------------------------------------


def test_kek_errada_nao_abre(cfg, cfg_intrusa, pfx_de_teste):
    pfx, senha = pfx_de_teste
    envelope = selar(pfx, senha, EMPRESA, cfg)

    with pytest.raises(ErroDeCustodia):
        abrir(envelope, EMPRESA, cfg_intrusa)


def test_kek_de_rotacao_antiga_continua_abrindo(cfg, pfx_de_teste):
    """Rotação de KEK não pode exigir re-upload de certificado do cliente."""
    pfx, senha = pfx_de_teste
    # Sela com a KEK #1 (a "antiga"), abre com a configuração atual, que tem as duas.
    from app.config import Config

    cfg_antiga = Config(
        token=cfg.token,
        keks={1: cfg.keks[1]},
        kek_atual_id=1,
        tmpfs_dir=cfg.tmpfs_dir,
        timeout_segundos=cfg.timeout_segundos,
        verificar_tls=cfg.verificar_tls,
    )
    envelope = selar(pfx, senha, EMPRESA, cfg_antiga)

    assert abrir(envelope, EMPRESA, cfg)[0] == pfx


# -----------------------------------------------------------------------------
# 3. Separação entre tenants e integridade
# -----------------------------------------------------------------------------


def test_envelope_de_outra_empresa_nao_abre(cfg, pfx_de_teste):
    """Mesmo com a KEK certa: o envelope é amarrado ao company_id (AAD)."""
    pfx, senha = pfx_de_teste
    envelope = selar(pfx, senha, EMPRESA, cfg)

    with pytest.raises(ErroDeCustodia):
        abrir(envelope, OUTRA_EMPRESA, cfg)


def test_ciphertext_adulterado_nao_abre(cfg, pfx_de_teste):
    pfx, senha = pfx_de_teste
    envelope = selar(pfx, senha, EMPRESA, cfg)

    corrompido = envelope.pfx_cifrado_b64
    corrompido = corrompido[:-8] + ("A" * 8 if corrompido[-8] != "A" else "B" * 8)
    adulterado = custodia.Envelope(
        pfx_cifrado_b64=corrompido,
        dek_envelopada_b64=envelope.dek_envelopada_b64,
        senha_cifrada_b64=envelope.senha_cifrada_b64,
        nonce_b64=envelope.nonce_b64,
    )

    with pytest.raises(ErroDeCustodia):
        abrir(adulterado, EMPRESA, cfg)


def test_blob_de_senha_no_lugar_do_pfx_nao_abre(cfg, pfx_de_teste):
    """Domínios de AAD separados impedem trocar um blob pelo outro."""
    pfx, senha = pfx_de_teste
    envelope = selar(pfx, senha, EMPRESA, cfg)

    trocado = custodia.Envelope(
        pfx_cifrado_b64=envelope.senha_cifrada_b64,
        dek_envelopada_b64=envelope.dek_envelopada_b64,
        senha_cifrada_b64=envelope.senha_cifrada_b64,
        nonce_b64=envelope.nonce_b64,
    )

    with pytest.raises(ErroDeCustodia):
        abrir(trocado, EMPRESA, cfg)


def test_nonce_do_banco_inconsistente_falha_cedo(cfg, pfx_de_teste):
    pfx, senha = pfx_de_teste
    envelope = selar(pfx, senha, EMPRESA, cfg)

    mentiroso = custodia.Envelope(
        pfx_cifrado_b64=envelope.pfx_cifrado_b64,
        dek_envelopada_b64=envelope.dek_envelopada_b64,
        senha_cifrada_b64=envelope.senha_cifrada_b64,
        nonce_b64="AAAAAAAAAAAAAAAA",
    )

    with pytest.raises(ErroDeCustodia):
        abrir(mentiroso, EMPRESA, cfg)


def test_material_ilegivel_da_mensagem_em_ptbr(cfg):
    lixo = custodia.Envelope(
        pfx_cifrado_b64="nao-e-base64!!",
        dek_envelopada_b64="nao-e-base64!!",
        senha_cifrada_b64="nao-e-base64!!",
        nonce_b64="",
    )
    with pytest.raises(ErroDeCustodia) as exc:
        abrir(lixo, EMPRESA, cfg)
    assert "certificado" in exc.value.mensagem.lower()


# -----------------------------------------------------------------------------
# 4. tmpfs — o PEM NUNCA pode sobreviver à requisição
# -----------------------------------------------------------------------------


def test_pem_existe_só_dentro_do_with_e_com_permissao_0600(cfg, pfx_de_teste):
    pfx, senha = pfx_de_teste

    with materializar_pem(pfx, senha, cfg) as par:
        assert os.path.exists(par.cert_pem)
        assert os.path.exists(par.key_pem)
        for caminho in (par.cert_pem, par.key_pem):
            modo = stat.S_IMODE(os.stat(caminho).st_mode)
            assert modo == 0o600, f"{caminho} com permissão {oct(modo)}"
        assert par.key_pem_bytes.startswith(b"-----BEGIN PRIVATE KEY-----")
        assert par.cert_pem_bytes.startswith(b"-----BEGIN CERTIFICATE-----")
        caminhos = (par.cert_pem, par.key_pem)

    assert not os.path.exists(caminhos[0])
    assert not os.path.exists(caminhos[1])


def test_tmpfs_limpo_mesmo_com_excecao_no_meio(cfg, pfx_de_teste):
    """⚠️ O caso que importa: timeout de rede, rejeição da prefeitura, bug nosso.
    Se o `finally` sumir, o PEM decifrado fica no disco. Este teste é o guarda."""
    pfx, senha = pfx_de_teste
    vistos: list[str] = []

    class FalhaSimulada(RuntimeError):
        pass

    with pytest.raises(FalhaSimulada):
        with materializar_pem(pfx, senha, cfg) as par:
            vistos.extend([par.cert_pem, par.key_pem])
            raise FalhaSimulada("prefeitura fora do ar")

    assert vistos, "o contexto nem chegou a materializar os arquivos"
    for caminho in vistos:
        assert not os.path.exists(caminho), f"{caminho} sobreviveu à exceção"


def test_senha_errada_nao_abre_o_pfx(cfg, pfx_de_teste):
    pfx, _senha = pfx_de_teste
    with pytest.raises(ErroDeCustodia):
        with materializar_pem(pfx, "senha-errada", cfg):
            pass


def test_inspecionar_extrai_validade_e_cnpj(pfx_de_teste):
    """Resolve o `certificate_expires_at` que hoje fica sempre nulo."""
    pfx, senha = pfx_de_teste
    dados = custodia.inspecionar(pfx, senha)

    assert dados["cnpj"] == "12345678000199"
    assert dados["titular"] == "EMPRESA DE TESTE LTDA"
    assert dados["validade_ate"]
