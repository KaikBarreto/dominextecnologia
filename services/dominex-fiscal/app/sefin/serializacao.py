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


def _remover_divergencias(root: etree._Element) -> None:
    for tag in TAGS_REMOVIDAS:
        for elemento in list(root.iter("{%s}" % NS + tag)):
            pai = elemento.getparent()
            if pai is not None:
                pai.remove(elemento)


def serializar(objeto) -> bytes:
    """Objeto da `nfelib` → XML pronto para assinar, já sem as divergências.

    Passar por aqui é OBRIGATÓRIO. Chamar o `XmlSerializer` direto em qualquer
    outro lugar do serviço é bug esperando para acontecer.
    """
    cfg = SerializerConfig(pretty_print=False, xml_declaration=True, encoding="UTF-8")
    xml = XmlSerializer(config=cfg).render(objeto, ns_map={None: NS})
    root = etree.fromstring(xml.encode("utf-8"))
    _remover_divergencias(root)
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8")
