"""Sigla da UF → código do IBGE (cUF), resolvido DENTRO do serviço.

Por que aqui e não no banco: `cUFAutor` é campo OBRIGATÓRIO do
`NFeDistribuicaoDFe`, é uma tabela fechada de 27 linhas que não muda desde 1994
e a edge já manda a sigla (é o que o cadastro do cliente guarda). Consultar
banco para converter "SP" em "35" seria uma ida de rede para um `dict` — e este
serviço não tem banco, por desenho (ver `app/sefaz/__init__.py`).

⚠️ Este código é o da UF do AUTOR da consulta (quem pergunta), não o da UF do
emitente da nota. O webservice é sempre o Ambiente Nacional; o cUFAutor só diz
de onde vem quem pergunta.
"""

from __future__ import annotations

import re

from ..errors import DadosInvalidos

#: As 27 unidades da federação. Fonte: tabela de UF do IBGE (MOC NF-e, anexo).
CODIGO_POR_SIGLA: dict[str, str] = {
    "RO": "11",
    "AC": "12",
    "AM": "13",
    "RR": "14",
    "PA": "15",
    "AP": "16",
    "TO": "17",
    "MA": "21",
    "PI": "22",
    "CE": "23",
    "RN": "24",
    "PB": "25",
    "PE": "26",
    "AL": "27",
    "SE": "28",
    "BA": "29",
    "MG": "31",
    "ES": "32",
    "RJ": "33",
    "SP": "35",
    "PR": "41",
    "SC": "42",
    "RS": "43",
    "MS": "50",
    "MT": "51",
    "GO": "52",
    "DF": "53",
}

SIGLA_POR_CODIGO: dict[str, str] = {v: k for k, v in CODIGO_POR_SIGLA.items()}

#: Código do Ambiente Nacional. Aparece em `cOrgao` do evento de manifestação,
#: NUNCA em `cUFAutor` (a consulta tem que dizer de qual estado é quem pergunta).
CODIGO_AMBIENTE_NACIONAL = "91"


def codigo_uf(valor: str) -> str:
    """Aceita a sigla ("SP", "sp") ou o próprio código ("35"). Devolve 2 dígitos.

    Erro em PT-BR amigável: quem lê é o cliente, que consegue corrigir o estado
    no cadastro da empresa.
    """
    bruto = (valor or "").strip().upper()
    if not bruto:
        raise DadosInvalidos(
            "O estado (UF) da empresa não está preenchido. "
            "Informe a UF no cadastro fiscal para consultar notas destinadas."
        )

    if bruto in CODIGO_POR_SIGLA:
        return CODIGO_POR_SIGLA[bruto]

    so_digitos = re.sub(r"\D", "", bruto)
    if so_digitos in SIGLA_POR_CODIGO:
        return so_digitos

    raise DadosInvalidos(
        f"Estado (UF) inválido: {bruto[:8]}. "
        "Use a sigla de duas letras, como SP, MG ou RJ."
    )
