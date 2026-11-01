"""Tradução segura de retornos dos portais fiscais para linguagem de usuário.

O código e o motivo oficiais continuam disponíveis para auditoria e suporte. A
orientação é nossa: curta, acionável e sem prometer que uma correção fiscal pode
ser feita sem conferência contábil. Códigos municipais e estaduais mudam; por
isso o catálogo explícito é complementado por classificadores de texto e por um
fallback conservador.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class OrientacaoFiscal:
    origem: str
    codigo_oficial: str | None
    mensagem: str
    plano_acao: tuple[str, ...]
    pode_tentar_novamente: bool
    precisa_contabilidade: bool = False
    motivo_oficial: str | None = None

    def corpo(self) -> dict[str, Any]:
        dados = asdict(self)
        return {
            "origem": dados["origem"],
            "codigoOficial": dados["codigo_oficial"],
            "mensagem": dados["mensagem"],
            "planoAcao": list(dados["plano_acao"]),
            "podeTentarNovamente": dados["pode_tentar_novamente"],
            "precisaContabilidade": dados["precisa_contabilidade"],
            "motivoOficial": dados["motivo_oficial"],
        }


def _limpar(texto: Any, limite: int = 500) -> str:
    valor = re.sub(r"\s+", " ", str(texto or "")).strip()
    return valor[:limite] if valor else ""


def _normalizar(texto: str) -> str:
    decomposed = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def _orientacao(
    origem: str,
    codigo: str,
    motivo: str,
    mensagem: str,
    passos: tuple[str, ...],
    *,
    tentar: bool = False,
    contabilidade: bool = False,
) -> OrientacaoFiscal:
    return OrientacaoFiscal(
        origem=origem,
        codigo_oficial=codigo or None,
        mensagem=mensagem,
        plano_acao=passos,
        pode_tentar_novamente=tentar,
        precisa_contabilidade=contabilidade,
        motivo_oficial=motivo or None,
    )


_CODIGOS: dict[str, tuple[str, tuple[str, ...], bool, bool]] = {
    "DADOS_INVALIDOS": (
        "Há dados incompletos ou inválidos antes do envio ao governo.",
        ("Revise os campos indicados na tela.", "Depois de corrigir, tente novamente."),
        False, False,
    ),
    "DOCUMENTO_NAO_ENCONTRADO": (
        "O documento não foi localizado no portal fiscal consultado.",
        ("Confira chave, CNPJ e ambiente de produção ou homologação.", "Se houve envio recente, aguarde alguns instantes e consulte novamente."),
        True, False,
    ),
    "CERTIFICADO_INVALIDO": (
        "O certificado digital não pôde ser usado.",
        ("Confira validade, senha e CNPJ titular.", "Envie um certificado A1 válido no cadastro fiscal da empresa."),
        False, False,
    ),
    "SERVICO_INDISPONIVEL": (
        "O portal fiscal está temporariamente indisponível ou sem resposta conclusiva.",
        ("Aguarde; o sistema pode consultar novamente com segurança.", "Não reenvie um documento se a tela indicar que ele aguarda confirmação."),
        True, False,
    ),
    "ACESSO_NEGADO": (
        "O órgão fiscal não autorizou o acesso com este certificado.",
        ("Confira se o certificado pertence à empresa e está válido.", "Peça à contabilidade para verificar credenciamento e cadastro no órgão fiscal."),
        False, True,
    ),
    "CONSUMO_INDEVIDO": (
        "O portal fiscal pediu uma pausa nas consultas.",
        ("Aguarde o período indicado.", "Não repita consultas manualmente enquanto o sistema se recupera."),
        True, False,
    ),
    "204": (
        "Esta nota já foi enviada anteriormente.",
        ("Não emita outra nota.", "Consulte a chave já existente e recupere XML e DANFE."),
        False, False,
    ),
    "205": (
        "A nota foi denegada pelo cadastro fiscal de uma das empresas.",
        ("Não reutilize esta numeração.", "Peça à contabilidade para verificar a situação cadastral na SEFAZ."),
        False, True,
    ),
    "215": (
        "O arquivo fiscal foi recusado por formato inválido.",
        ("Não altere a nota manualmente.", "Envie o código e o motivo oficial ao suporte do sistema."),
        False, False,
    ),
    "217": (
        "A nota ainda não foi localizada pela SEFAZ.",
        ("Aguarde alguns instantes e consulte novamente.", "Só reenvie depois que o sistema confirmar que não houve autorização."),
        True, False,
    ),
    "225": (
        "A SEFAZ recusou a estrutura do arquivo fiscal.",
        ("Não altere a nota manualmente.", "Envie o código e o motivo oficial ao suporte do sistema."),
        False, False,
    ),
    "301": (
        "O emitente está com irregularidade cadastral na SEFAZ.",
        ("Não tente reenviar sem corrigir o cadastro.", "Peça à contabilidade para regularizar a empresa na SEFAZ."),
        False, True,
    ),
    "302": (
        "O destinatário está com irregularidade cadastral na SEFAZ.",
        ("Confira CNPJ, inscrição estadual e UF do destinatário.", "Se os dados estiverem corretos, peça ao destinatário ou à contabilidade para regularizar o cadastro."),
        False, True,
    ),
    "429": (
        "O portal fiscal pediu uma pausa antes da próxima consulta.",
        ("Aguarde; o sistema fará a próxima tentativa automaticamente.", "Evite consultas manuais repetidas durante esse período."),
        True, False,
    ),
    "539": (
        "Já existe uma nota com esta numeração, mas os dados enviados são diferentes.",
        ("Não troque a numeração por conta própria.", "Consulte a nota existente e confirme série, número, chave e ambiente antes de continuar."),
        False, False,
    ),
    "573": (
        "Este evento já foi registrado anteriormente.",
        ("Não envie novamente.", "Consulte o evento existente e recupere o protocolo."),
        False, False,
    ),
    "589": (
        "A SEFAZ limitou temporariamente as consultas desta empresa.",
        ("Aguarde o período indicado pela SEFAZ.", "Não faça consultas manuais repetidas enquanto o sistema se recupera."),
        True, False,
    ),
    "656": (
        "A SEFAZ bloqueou temporariamente novas consultas por excesso ou repetição.",
        ("Aguarde pelo menos uma hora.", "Não repita consultas nem altere o último NSU durante esse período."),
        True, False,
    ),
    "778": (
        "O NCM de um produto não foi aceito.",
        ("Confira o NCM indicado no item.", "Peça à contabilidade para confirmar a classificação fiscal antes de reenviar."),
        False, True,
    ),
    "805": (
        "A SEFAZ do destinatário não aceita a inscrição estadual como isenta nesta operação.",
        ("Confira a inscrição estadual e a UF do destinatário.", "Peça à contabilidade para confirmar o enquadramento antes de reenviar."),
        False, True,
    ),
    "806": (
        "Um item com ICMS-ST precisa informar o código CEST.",
        ("Confira o CEST do item indicado.", "Peça à contabilidade para confirmar a classificação antes de reenviar."),
        False, True,
    ),
    "108": (
        "O serviço da SEFAZ está paralisado por pouco tempo.",
        ("Aguarde; o sistema pode tentar novamente com segurança."),
        True, False,
    ),
    "109": (
        "O serviço da SEFAZ está paralisado sem previsão imediata.",
        ("Aguarde a normalização da SEFAZ.", "Use contingência somente quando o sistema indicar que ela está disponível para esta operação."),
        True, False,
    ),
    "136": (
        "O evento foi recebido, mas o vínculo com o documento ainda precisa ser confirmado.",
        ("Não envie o evento novamente.", "Aguarde a consulta automática do status oficial."),
        True, False,
    ),
    "999": (
        "O portal fiscal não conseguiu concluir o processamento.",
        ("Aguarde alguns minutos e tente novamente.", "Se persistir, envie o código e o motivo oficial ao suporte."),
        True, False,
    ),
}


_SUCESSOS = {
    "100", "101", "102", "103", "104", "107", "128", "132", "135", "138", "150", "151", "155",
}


def traduzir_rejeicao(
    origem: str,
    codigo: Any = None,
    motivo: Any = None,
    *,
    operacao: str | None = None,
) -> OrientacaoFiscal | None:
    """Traduz um retorno fiscal; `None` indica resposta de sucesso conhecida."""
    cod = _limpar(codigo, 32).upper()
    texto = _limpar(motivo)
    if cod in _SUCESSOS:
        return None

    regra = _CODIGOS.get(cod)
    if regra:
        mensagem, passos, tentar, contabilidade = regra
        return _orientacao(
            origem, cod, texto, mensagem, passos,
            tentar=tentar, contabilidade=contabilidade,
        )

    normal = _normalizar(f"{cod} {texto}")
    if any(p in normal for p in (
        "timeout", "temporari", "indispon", "manutenc", "paralisad",
        "comunicar", "conexao", "conexão", "sem resposta",
    )):
        return _orientacao(
            origem, cod, texto,
            "O portal fiscal está temporariamente indisponível.",
            ("Aguarde alguns minutos; o sistema pode tentar novamente com segurança.",),
            tentar=True,
        )
    if any(p in normal for p in ("duplic", "ja existe", "já existe")):
        return _orientacao(
            origem, cod, texto,
            "Este documento ou evento parece já ter sido recebido pelo portal fiscal.",
            ("Não envie novamente.", "Consulte o documento existente e recupere seu protocolo."),
        )
    if any(p in normal for p in ("certificado", "assinatura", "cadeia icp", "titular")):
        return _orientacao(
            origem, cod, texto,
            "O certificado ou a assinatura digital não foi aceito.",
            ("Confira validade, senha e titular do certificado A1.", "Se os dados estiverem corretos, envie o código ao suporte."),
        )
    if any(p in normal for p in ("schema", "esquema", "xml", "layout", "leiaute")):
        return _orientacao(
            origem, cod, texto,
            "O portal fiscal recusou a estrutura do documento.",
            ("Não altere o arquivo manualmente.", "Envie o código e o motivo oficial ao suporte do sistema."),
        )
    if any(p in normal for p in ("cnpj", "cpf", "inscricao estadual", "cadastro", "credenci")):
        return _orientacao(
            origem, cod, texto,
            "Há um dado cadastral que o portal fiscal não aceitou.",
            ("Confira CNPJ ou CPF, inscrição estadual, município e UF.", "Se estiverem corretos, peça à contabilidade para verificar o cadastro no órgão fiscal."),
            contabilidade=True,
        )
    if any(p in normal for p in ("ncm", "cfop", "cst", "csosn", "aliquota", "tribut", "ibs", "cbs", "iss")):
        return _orientacao(
            origem, cod, texto,
            "Uma informação tributária do documento precisa ser revisada.",
            ("Confira o campo citado no motivo oficial.", "Peça à contabilidade para confirmar a tributação antes de reenviar."),
            contabilidade=True,
        )
    if any(p in normal for p in ("valor", "total", "base de calculo", "somatorio")):
        return _orientacao(
            origem, cod, texto,
            "Os valores do documento não fecharam na validação fiscal.",
            ("Confira itens, descontos, frete, impostos e total.", "Se houver dúvida tributária, valide com a contabilidade antes de reenviar."),
            contabilidade=True,
        )
    if any(p in normal for p in ("data", "hora", "prazo", "extempor")):
        return _orientacao(
            origem, cod, texto,
            "A data ou o prazo desta operação não foi aceito.",
            ("Confira data de emissão, data do evento e prazo legal.", "Se o prazo venceu, peça orientação à contabilidade."),
            contabilidade=True,
        )

    contexto = f" para {operacao}" if operacao else ""
    return _orientacao(
        origem, cod, texto,
        f"O portal fiscal recusou a operação{contexto}.",
        ("Leia o motivo oficial abaixo.", "Corrija o dado indicado antes de tentar novamente.", "Se o motivo não estiver claro, envie o código ao suporte e confirme com a contabilidade."),
        contabilidade=True,
    )


def anexar_orientacao(
    resposta: dict[str, Any], origem: str, *, operacao: str | None = None
) -> dict[str, Any]:
    """Copia a resposta oficial e acrescenta orientação, sem quebrar campos atuais."""
    resultado = dict(resposta)
    orientacao = traduzir_rejeicao(
        origem,
        resposta.get("cstat", resposta.get("cStat", resposta.get("codigo"))),
        resposta.get("reason", resposta.get("xMotivo", resposta.get("mensagem"))),
        operacao=operacao,
    )
    if orientacao:
        resultado["orientacao"] = orientacao.corpo()
    return resultado


def corpo_orientacao(
    origem: str,
    codigo: Any = None,
    motivo: Any = None,
    *,
    operacao: str | None = None,
) -> dict[str, Any] | None:
    orientacao = traduzir_rejeicao(
        origem, codigo, motivo, operacao=operacao
    )
    return orientacao.corpo() if orientacao else None
