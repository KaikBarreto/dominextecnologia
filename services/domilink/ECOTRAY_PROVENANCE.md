# Proveniência dos drivers EcoTray

Adaptação autorizada pelo responsável dos dois projetos em 14/11/2026 a partir de
`EcoSistemaSaaS/ecotray`, sem configuração real, credenciais ou dados de clientes.
Não foi encontrado arquivo LICENSE/COPYING do código do projeto na raiz ou em
`ecotray` (licenças de dependências em `.venv` não licenciam o projeto). Nenhuma
licença nova é presumida. O registro de hashes e comparação está em
`docs/integrations/domilink-ecotray-sync.json` na raiz do repositório.

| Origem EcoTray | Destino DomiLink | Adaptação |
| --- | --- | --- |
| `protocols/upx.py` | `adapters/protocols/upx.py` | Parser mantido; apenas ordenação de imports e formatação |
| `protocols/toledo.py` | `adapters/protocols/toledo.py` | Preservar sinal, vírgula, unidade g/kg e status US |
| `protocols/filizola.py` | `adapters/protocols/filizola.py` | Unidade explícita, gramas abaixo de 1000, sinal e framing estrito no fallback |
| `protocols/generic.py` | `adapters/protocols/generic.py` | Preservar sinal/unidade; rejeitar texto de erro contendo números |
| `protocols/__init__.py` | `adapters/protocols/__init__.py` | UPX prioritário, retorno ScaleReading e estabilidade explícita |
| `scale_reader.py` | `adapters/serial.py`, `discovery.py` | ENQ UPX e framing; deadlines, locks e limites; terminação preservada para UPX; descoberta passiva |
| `print_manager.py` | `adapters/windows_gdi.py`, `adapters/system_pdf.py`, `discovery.py` | Mesma função de largura, raster 4x cinza, offsets/GDI e bloqueio de driver texto; limpeza, cópias e limites |
| `requirements.txt` | `pyproject.toml`, `uv.lock` | Dependências de hardware opcionais, versões fixadas; sem instalar hardware nesta entrega |

Não foram copiados o WebSocket, UI desktop, auto-scan ativo nem qualquer fluxo fiscal.
O driver ESC/POS preexistente mantém transportes explícitos e não foi substituído.
`adapters/windows_gdi.py::_compute_target_w` preserva as decisões e o cálculo da
origem (mudanças cosméticas de import, quebra de linhas e comentários).

O extra Windows usa PyMuPDF, cuja distribuição é AGPL ou comercial; é necessário
escolher licença compatível antes de distribuir um aplicativo proprietário com essa
dependência. A autorização de reutilização do EcoTray não altera a licença de terceiros.
Pillow e pywin32 também mantêm suas licenças próprias. Na revisão final foram
instaladas dependências em ambientes virtuais descartáveis para conferir o
pacote de fontes e os transportes opcionais. Raster/GDI e USB usam mocks;
serial também foi validado com PTY virtual do SO e rede com socket simulado.
Nenhum equipamento físico foi aberto nem documento enviado ao spooler real.
