from __future__ import annotations

import base64

from brazilfiscalreport.damdfe import Damdfe


class DamdfeContingencia(Damdfe):
    """BFR marca sem valor se não há protocolo; em contingência produtiva é errado."""

    def _draw_void_watermark(self):
        ide = self.ide
        local = lambda element: str(element.tag).rsplit("}", 1)[-1]
        tp_amb = next((x.text for x in ide if local(x) == "tpAmb"), "")
        tp_emis = next((x.text for x in ide if local(x) == "tpEmis"), "")
        if tp_amb == "1" and tp_emis == "2":
            return
        return super()._draw_void_watermark()

    def draw_rodoviario_info(self, x_margin, y_margin, y_middle, page_width):
        super().draw_rodoviario_info(x_margin, y_margin, y_middle, page_width)
        # A biblioteca imprime somente a tração. As três linhas livres do
        # quadro comportam os reboques que também fazem parte do manifesto.
        namespace = "{http://www.portalfiscal.inf.br/mdfe}"
        trailers = self.inf_modal.findall(f".//{namespace}veicReboque")
        offset = {5: 25, 6: 25, 7: 25, 8: 24, 9: 24, 10: 23}.get(
            self.config.margins.left, 25
        )
        self.set_font(self.default_font, "", 7)
        for index, trailer in enumerate(trailers[:3]):
            y = y_middle + 7.3 + index * 3.1
            for x, tag in ((x_margin, "placa"), (x_margin + offset, "UF"),
                           (x_margin + 50, "RNTRC"), (x_margin + 75, "RENAVAM")):
                element = trailer.find(f"{namespace}{tag}")
                self.set_xy(x=x, y=y)
                self.cell(w=24, h=3, text=element.text if element is not None else "")


def gerar_pdf(xml: str) -> str:
    pdf = DamdfeContingencia(xml).output()
    if isinstance(pdf, str):
        pdf = pdf.encode()
    return base64.b64encode(pdf).decode("ascii")
