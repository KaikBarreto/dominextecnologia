"""C4 — as 6 armadilhas do spike, cada uma com um teste que a trava.

Cada armadilha custou UMA tentativa de emissão real em 2026-09-02. Se algum
destes testes começar a falhar, a emissão vai voltar a ser rejeitada pelo
governo — não "conserte o teste", entenda por que o comportamento mudou.

Referência: docs/planos/2026-09-03-nfse-motor-proprio-sefin-nacional.md §armadilhas
"""

from __future__ import annotations

from lxml import etree

from app.schemas import Dps, EmitirRequest
from app.sefin import evento as evento_mod
from app.sefin.assinatura import XMLDSIG, assinar
from app.sefin.dps import montar
from app.sefin.serializacao import NS, TAGS_REMOVIDAS, serializar

CHAVE = "33045572234901457000199000000000002326090032891987"

CORPO_BASE = {
    "empresaId": "7a1b3c4d-0000-4000-8000-abcdefabcdef",
    "ambiente": 2,
    "certificado": {
        "pfxCifradoB64": "x",
        "dekEnvelopadaB64": "x",
        "senhaCifradaB64": "x",
        "nonceB64": "",
    },
    "dps": {
        "id": "DPS" + "3304557" + "2" + "34901457000199" + "00001" + "000000000000001",
        "serie": "00001",
        "numero": "1",
        "dataCompetencia": "2026-09-03",
        "codigoMunicipioEmissor": "3304557",
    },
    "prestador": {
        "tipoInscricao": "2",
        "inscricaoFederal": "34901457000199",
        "email": "financeiro@exemplo.com.br",
        "opSimpNac": "3",
        "regApTribSN": "1",
    },
    "tomador": {
        "tipoInscricao": "2",
        "inscricaoFederal": "66730202000105",
        "razaoSocial": "CLIENTE EXEMPLO LTDA",
        "email": "cliente@exemplo.com.br",
        "endereco": {
            "municipioIbge": "3304557",
            "cep": "21360430",
            "logradouro": "Rua Exemplo",
            "numero": "14",
            "bairro": "Madureira",
        },
    },
    "servico": {
        "codigoServico": "140101",
        "codigoNbs": "120016000",
        "municipioIncidencia": "3304557",
        "discriminacao": "Manutenção preventiva de sistema de refrigeração.",
        "codigoTributacaoMunicipal": "001",
    },
    "valores": {
        "valorServico": 1500.0,
        "tribIssqn": "1",
        "tpRetIssqn": "1",
        "percentualTotalTributosSimplesNacional": 6.0,
    },
}


def _pedido(**alteracoes) -> EmitirRequest:
    corpo = {**CORPO_BASE}
    for chave, valor in alteracoes.items():
        if isinstance(valor, dict) and isinstance(corpo.get(chave), dict):
            corpo[chave] = {**corpo[chave], **valor}
        else:
            corpo[chave] = valor
    return EmitirRequest.model_validate(corpo)


def _arvore(xml: bytes):
    return etree.fromstring(xml)


def _tags(xml: bytes, caminho: str) -> list:
    return _arvore(xml).xpath(caminho, namespaces={"n": NS})


# -----------------------------------------------------------------------------
# Armadilha 1 — E0312: falta cTribMun
# -----------------------------------------------------------------------------


def test_armadilha_1_ctribmun_vai_no_xml():
    """`14.01.01.001` = cTribNac(6) + cTribMun(3). Sem o municipal → E0312."""
    xml = montar(_pedido())
    assert [e.text for e in _tags(xml, "//n:cServ/n:cTribNac")] == ["140101"]
    assert [e.text for e in _tags(xml, "//n:cServ/n:cTribMun")] == ["001"]


def test_armadilha_1_ctribmun_fora_do_formato_e_omitido():
    """Mandar lixo para a prefeitura devolve erro indecifrável; omitir, não."""
    xml = montar(_pedido(servico={"codigoTributacaoMunicipal": "1"}))
    assert _tags(xml, "//n:cServ/n:cTribMun") == []


# -----------------------------------------------------------------------------
# Armadilhas 2 e 3 — E0121 / E0128: dados do prestador que NÃO se envia
# -----------------------------------------------------------------------------


def test_armadilha_2_prestador_sem_xnome():
    xml = montar(_pedido())
    assert _tags(xml, "//n:prest/n:xNome") == [], "E0121: prest/xNome não pode ir"


def test_armadilha_3_prestador_sem_endereco():
    xml = montar(_pedido())
    assert _tags(xml, "//n:prest/n:end") == [], "E0128: prest/end não pode ir"


def test_prestador_sem_inscricao_municipal():
    """E0120: o Rio não tem info complementar no CNC NFS-e — não mandar IM."""
    xml = montar(_pedido())
    assert _tags(xml, "//n:prest/n:IM") == []


def test_tomador_mantem_nome_e_endereco():
    """O que vale para o emitente NÃO vale para o cliente: aqui os dados vão."""
    xml = montar(_pedido())
    assert [e.text for e in _tags(xml, "//n:toma/n:xNome")] == ["CLIENTE EXEMPLO LTDA"]
    assert [e.text for e in _tags(xml, "//n:toma/n:end/n:endNac/n:cMun")] == ["3304557"]


# -----------------------------------------------------------------------------
# Armadilha 4 — E1228: assinatura NÃO pode ter prefixo de namespace
# -----------------------------------------------------------------------------


def test_armadilha_4_assinatura_sem_prefixo_de_namespace(pfx_de_teste, cfg):
    from app.custodia import materializar_pem

    pfx, senha = pfx_de_teste
    xml = montar(_pedido())
    with materializar_pem(pfx, senha, cfg) as par:
        assinado = assinar(xml, par.key_pem_bytes, par.cert_pem_bytes)

    raiz = _arvore(assinado)
    assinaturas = raiz.xpath("//*[local-name()='Signature']")
    assert assinaturas, "o XML saiu sem assinatura"

    for elemento in assinaturas[0].iter():
        if isinstance(elemento.tag, str) and elemento.tag.startswith("{" + XMLDSIG):
            prefixo = elemento.prefix
            assert prefixo is None, (
                f"E1228: elemento <{prefixo}:...> saiu com prefixo de namespace"
            )


def test_armadilha_4_referencia_aponta_para_o_id_do_infdps(pfx_de_teste, cfg):
    from app.custodia import materializar_pem

    pfx, senha = pfx_de_teste
    pedido = _pedido()
    xml = montar(pedido)
    with materializar_pem(pfx, senha, cfg) as par:
        assinado = assinar(xml, par.key_pem_bytes, par.cert_pem_bytes)

    raiz = _arvore(assinado)
    uris = raiz.xpath("//*[local-name()='Reference']/@URI")
    assert uris == ["#" + pedido.dps.id]


# -----------------------------------------------------------------------------
# Armadilha 5 — Id do pedido de evento: 56 dígitos, SEM sequencial
# -----------------------------------------------------------------------------


def test_armadilha_5_id_do_evento_tem_56_digitos_sem_sequencial():
    """⚠️ Contagem que confunde: são **56 DÍGITOS** (chave 50 + tipo 6), que com
    o prefixo literal "PRE" dão 59 CARACTERES. A `nfelib` declara
    `PRE[0-9]{59}` — 59 DÍGITOS, ou seja, espera 3 dígitos de sequencial no fim.
    É ela que está desatualizada: com o sequencial, o servidor devolve E1235."""
    ide = evento_mod.id_do_evento(CHAVE)
    assert ide == "PRE" + CHAVE + "101101"
    assert len(ide) == 59
    assert len(ide) - len("PRE") == 56, "56 dígitos: chave(50) + tipoEvento(6)"
    assert ide[3:].isdigit()


def test_armadilha_5_id_no_xml_do_evento_bate():
    xml = evento_mod.montar_cancelamento(
        chave=CHAVE,
        cnpj_autor="34901457000199",
        motivo="Emissao de teste de integracao do sistema.",
    )
    ids = _arvore(xml).xpath("//n:infPedReg/@Id", namespaces={"n": NS})
    assert ids == ["PRE" + CHAVE + "101101"]
    assert len(ids[0][3:]) == 56  # sem sequencial no fim


# -----------------------------------------------------------------------------
# Armadilha 6 — nPedRegEvento: a nfelib gera, o servidor não conhece
# -----------------------------------------------------------------------------


def test_armadilha_6_npedregevento_nao_sai_no_xml():
    xml = evento_mod.montar_cancelamento(
        chave=CHAVE,
        cnpj_autor="34901457000199",
        motivo="Emissao de teste de integracao do sistema.",
    )
    assert _tags(xml, "//n:nPedRegEvento") == [], (
        "E1235: SefinNacional_1.6.0 não tem nPedRegEvento"
    )


def test_armadilha_6_a_lista_de_divergencias_e_o_ponto_unico():
    """Guarda do desenho: se alguém remover a tag da lista, o teste avisa.

    A remoção NÃO pode migrar para o montador — o dia em que o layout mudar de
    novo, o próximo dev tem que achar tudo em `TAGS_REMOVIDAS`.
    """
    assert "nPedRegEvento" in TAGS_REMOVIDAS
    assert TAGS_REMOVIDAS["nPedRegEvento"], "toda divergência precisa de motivo escrito"


def test_serializador_e_o_unico_caminho_do_xml():
    """Qualquer XML que passe pelo serializador sai limpo das divergências."""
    from nfelib.nfse.bindings.v1_0 import ped_reg_evento_v1_00 as pre
    from nfelib.nfse.bindings.v1_0 import tipos_eventos_v1_00 as te
    from nfelib.nfse.bindings.v1_0 import tipos_simples_v1_00 as ts

    inf = te.TcinfPedReg(
        tpAmb=ts.TstipoAmbiente("2"),
        verAplic="teste",
        dhEvento="2026-09-03T10:00:00-03:00",
        CNPJAutor="34901457000199",
        chNFSe=CHAVE,
        nPedRegEvento="1",  # a nfelib insiste; o serializador tira
        e101101=te.Te101101(
            xDesc=te.Te101101XDesc.CANCELAMENTO_DE_NFS_E,
            cMotivo=ts.TscodJustCanc("1"),
            xMotivo="Motivo com mais de quinze caracteres.",
        ),
        Id="PRE" + CHAVE + "101101",
    )
    xml = serializar(pre.PedRegEvento(infPedReg=inf, versao="1.00"))
    assert b"nPedRegEvento" not in xml


# -----------------------------------------------------------------------------
# Regras fiscais que já regrediram uma vez (2026-09-02) — não podem voltar
# -----------------------------------------------------------------------------


def test_tpret_issqn_padrao_e_nao_retido():
    """O default estava INVERTIDO e toda nota declarava ISS retido inexistente."""
    xml = montar(_pedido(valores={"tpRetIssqn": None}))
    assert [e.text for e in _tags(xml, "//n:tribMun/n:tpRetISSQN")] == ["1"]


def test_aliquota_so_vai_quando_a_edge_manda():
    """Supressão da E0625 é decisão da edge (que conhece o regime). Aqui não se chuta."""
    sem = montar(_pedido())
    assert _tags(sem, "//n:tribMun/n:pAliq") == []

    com = montar(_pedido(valores={"aliquotaIssqn": 5}))
    assert [e.text for e in _tags(com, "//n:tribMun/n:pAliq")] == ["5.00"]


def test_simples_nacional_leva_opsimpnac_e_regaptribsn():
    xml = montar(_pedido())
    assert [e.text for e in _tags(xml, "//n:regTrib/n:opSimpNac")] == ["3"]
    assert [e.text for e in _tags(xml, "//n:regTrib/n:regApTribSN")] == ["1"]
    assert [e.text for e in _tags(xml, "//n:totTrib/n:pTotTribSN")] == ["6.00"]


def test_ambiente_vem_do_request_nunca_chumbado():
    assert [e.text for e in _tags(montar(_pedido(ambiente=2)), "//n:infDPS/n:tpAmb")] == ["2"]
    assert [e.text for e in _tags(montar(_pedido(ambiente=1)), "//n:infDPS/n:tpAmb")] == ["1"]


def test_id_da_dps_precisa_ter_45_caracteres():
    import pytest

    from app.errors import DadosInvalidos

    with pytest.raises(DadosInvalidos):
        montar(_pedido(dps={"id": "DPS123"}))


def test_valor_do_servico_sai_com_duas_casas():
    xml = montar(_pedido(valores={"valorServico": 1500}))
    assert [e.text for e in _tags(xml, "//n:vServPrest/n:vServ")] == ["1500.00"]
