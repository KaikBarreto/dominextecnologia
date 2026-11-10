from app.errors import DocumentoRejeitado
from app.rejections import anexar_orientacao, traduzir_rejeicao


def test_duplicidade_impede_reenvio_e_preserva_motivo_oficial():
    orientacao = traduzir_rejeicao(
        "sefaz_nfe", "539", "Duplicidade de NF-e, com diferença na Chave de Acesso"
    )
    assert orientacao is not None
    assert orientacao.pode_tentar_novamente is False
    assert "não" in orientacao.plano_acao[0].lower()
    assert orientacao.codigo_oficial == "539"
    assert orientacao.motivo_oficial.startswith("Duplicidade")


def test_consumo_indevido_orienta_espera_sem_intervencao_contabil():
    orientacao = traduzir_rejeicao("sefaz_dfe", 656, "Consumo indevido")
    assert orientacao is not None
    assert orientacao.pode_tentar_novamente is True
    assert orientacao.precisa_contabilidade is False
    assert "hora" in " ".join(orientacao.plano_acao).lower()


def test_codigo_novo_tributario_cai_em_categoria_segura():
    orientacao = traduzir_rejeicao(
        "nfse_nacional", "E9999", "Classificação tributária IBS/CBS incompatível"
    )
    assert orientacao is not None
    assert orientacao.precisa_contabilidade is True
    assert "tributária" in orientacao.mensagem.lower()


def test_codigo_municipal_desconhecido_tem_fallback_com_plano_de_acao():
    orientacao = traduzir_rejeicao(
        "nfse_municipal", "EC4312", "Regra própria do município",
        operacao="emitir a NFS-e",
    )
    assert orientacao is not None
    assert len(orientacao.plano_acao) == 3
    assert orientacao.codigo_oficial == "EC4312"
    assert orientacao.precisa_contabilidade is True


def test_retorno_existente_ganha_orientacao_sem_perder_campos():
    original = {"cstat": "302", "reason": "Uso denegado", "protocol": None}
    resposta = anexar_orientacao(original, "sefaz_nfe")
    assert resposta["cstat"] == original["cstat"]
    assert resposta["reason"] == original["reason"]
    assert resposta["orientacao"]["codigoOficial"] == "302"
    assert resposta["orientacao"]["precisaContabilidade"] is True
    assert "orientacao" not in original


def test_erro_http_mantem_contrato_e_acrescenta_orientacao():
    orientacao = traduzir_rejeicao("nfse_nacional", "E0312", "Código não administrado")
    erro = DocumentoRejeitado(
        orientacao.mensagem,
        codigo="E0312",
        orientacao=orientacao,
    ).corpo()
    assert erro["erro"]["codigo"] == "E0312"
    assert erro["erro"]["mensagem"]
    assert erro["erro"]["orientacao"]["codigoOficial"] == "E0312"
    assert erro["erro"]["orientacao"]["planoAcao"]


def test_sucesso_oficial_nao_recebe_alerta_de_rejeicao():
    resposta = anexar_orientacao(
        {"cstat": "100", "reason": "Autorizado o uso da NF-e"}, "sefaz_nfe"
    )
    assert "orientacao" not in resposta


def test_evento_136_orienta_consulta_sem_reenvio():
    orientacao = traduzir_rejeicao(
        "sefaz_nfe", "136", "Evento registrado, mas não vinculado a NF-e"
    )
    assert orientacao is not None
    assert orientacao.pode_tentar_novamente is True
    assert "não envie" in orientacao.plano_acao[0].lower()
