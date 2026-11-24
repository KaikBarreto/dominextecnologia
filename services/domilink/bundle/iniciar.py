"""Inicialização manual pelo Python do ambiente virtual, sem daemon ou instalação automática."""
import subprocess
import sys
from pathlib import Path


def main():
    directory = Path(__file__).resolve().parent
    relative_python = "Scripts/python.exe" if sys.platform == "win32" else "bin/python"
    executable = directory / ".venv" / relative_python
    if not executable.is_file() or not (directory / "config.toml").is_file():
        print("Prepare o ambiente Python e a configuração conforme LEIA-ME.txt antes de iniciar.")
        return 2
    return subprocess.call(
        [str(executable), "-m", "domilink.cli", "--config", str(directory / "config.toml")],
        cwd=directory,
    )


if __name__ == "__main__":
    raise SystemExit(main())
