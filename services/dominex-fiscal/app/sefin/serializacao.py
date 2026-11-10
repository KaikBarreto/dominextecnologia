"""PONTO ÚNICO de serialização XML do padrão nacional.

┌──────────────────────────────────────────────────────────────────────────────┐
│ ⚠️⚠️⚠️  LEIA ANTES DE MEXER  ⚠️⚠️⚠️                                          │
│                                                                              │
│ A `nfelib` fica ATRÁS do servidor do governo. Isso não é acidente, é a regra │
│ do jogo: o Sefin Nacional publica layout novo e a biblioteca demora semanas  │
│ para alcançar. A armadilha nº6 do spike (`nPedRegEvento`, que a nfelib v1.00 │
│ gera e o `SefinNacional_1.6.0` não conhece mais) é a prova disso.            │
│                                                                              │
│ Por isso TODA divergência entre biblioteca e servidor mora AQUI, em UMA      │
│ lista. O próximo ajuste de layout tem que ser uma linha nesta lista, nunca   │
│ uma caçada por sete arquivos.                                                │
│                                                                              │
│ Sintoma típico: `E1235 invalid child element '<tag>'`. Quando aparecer,      │
│ acrescente a tag em `TAGS_REMOVIDAS` e documente a data e o erro.            │
└──────────────────────────────────────────────────────────────────────────────┘
"""

from __future__ import annotations

from lxml import etree
from xsdata.formats.dataclass.serializers import XmlSerializer
from xsdata.formats.dataclass.serializers.config import SerializerConfig

NS = "http://www.sped.fazenda.gov.br/nfse"

#: Tags que a `nfelib` gera e o servidor NÃO aceita mais.
#: Formato: nome da tag → motivo (erro observado + data).
TAGS_REMOVIDAS: dict[str, str] = {
    # Armadilha 6 (spike 2026-09-02): o esquema em produção (SefinNacional_1.6.0)
    # não tem mais este campo no pedido de registro de evento; a nfelib v1.00
    # ainda o emite. Sem remover → E1235 "invalid child element".
    "nPedRegEvento": "E1235 no SefinNacional_1.6.0 — removido do layout do evento (2026-09-02)",
}

#: Campos obrigatórios na produção restrita (ambiente 2) que ainda não existem
#: nos bindings fixados da `nfelib`. A produção (ambiente 1) usa outro XSD e
#: rejeita `finNFSe` com E1235; por isso esta lista nunca pode ser aplicada sem
#: considerar o ambiente da DPS.
#: Cada entrada informa a tag imediatamente anterior, o valor e o motivo.
CAMPOS_INSERIDOS_HOMOLOGACAO: dict[str, tuple[str, str, str]] = {
    # O XSD v1.01 da produção restrita publicado em 2026-10-20 tornou
    # `finNFSe` obrigatório entre `tpEmit` e `cLocEmi`. O domínio vigente só
    # aceita "0" (NFS-e regular). Sem o campo, o Portal devolve E1235.
    "finNFSe": (
        "tpEmit",
        "0",
        "E1235 no XSD v1.01 da produção restrita — campo obrigatório (2026-10-20)",
    ),
}

#: Elementos cujo conteúdo continua válido, mas mudou de posição no xs:sequence
#: apenas da produção restrita. A produção ainda espera a ordem dos bindings.
#: Formato: (pai, elemento, elemento seguinte obrigatório).
CAMPOS_REORDENADOS_HOMOLOGACAO: tuple[tuple[str, str, str], ...] = (
    # A nfelib 2.5.2 serializa `cNBS` depois de `xDescServ`. No XSD v1.01 ele
    # passou a vir antes da descrição; manter a ordem antiga também gera E1235.
    ("cServ", "cNBS", "xDescServ"),
)


def _remover_divergencias(root: etree._Element) -> None:
    for tag in TAGS_REMOVIDAS:
        for elemento in list(root.iter("{%s}" % NS + tag)):
            pai = elemento.getparent()
            if pai is not None:
                pai.remove(elemento)


def _inserir_divergencias(root: etree._Element, *, ambiente: int | None) -> None:
    inf_dps = root.find(f".//{{{NS}}}infDPS")
    if inf_dps is None or ambiente != 2:
        return

    for tag, (tag_anterior, valor, _) in CAMPOS_INSERIDOS_HOMOLOGACAO.items():
        if inf_dps.find(f"{{{NS}}}{tag}") is not None:
            continue

        anterior = inf_dps.find(f"{{{NS}}}{tag_anterior}")
        if anterior is None:
            continue

        elemento = etree.Element(etree.QName(NS, tag))
        elemento.text = valor
        anterior.addnext(elemento)


def _reordenar_divergencias(root: etree._Element, *, ambiente: int | None) -> None:
    if ambiente != 2:
        return

    for tag_pai, tag, tag_seguinte in CAMPOS_REORDENADOS_HOMOLOGACAO:
        for pai in root.iter(f"{{{NS}}}{tag_pai}"):
            elemento = pai.find(f"{{{NS}}}{tag}")
            seguinte = pai.find(f"{{{NS}}}{tag_seguinte}")
            if elemento is None or seguinte is None:
                continue

            pai.remove(elemento)
            seguinte.addprevious(elemento)


def serializar(objeto, *, ambiente: int | None = None) -> bytes:
    """Objeto da `nfelib` → XML pronto para assinar, já sem as divergências.

    Passar por aqui é OBRIGATÓRIO. Chamar o `XmlSerializer` direto em qualquer
    outro lugar do serviço é bug esperando para acontecer.
    """
    cfg = SerializerConfig(pretty_print=False, xml_declaration=True, encoding="UTF-8")
    xml = XmlSerializer(config=cfg).render(objeto, ns_map={None: NS})
    root = etree.fromstring(xml.encode("utf-8"))
    _remover_divergencias(root)
    _inserir_divergencias(root, ambiente=ambiente)
    _reordenar_divergencias(root, ambiente=ambiente)
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8")
