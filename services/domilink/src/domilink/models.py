from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PairRequest(StrictModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    client_name: str = Field(min_length=1, max_length=80)


class PrintRequest(StrictModel):
    device_id: str = Field(min_length=1, max_length=120)
    format: Literal["pdf", "text", "escpos"]
    content_base64: str = Field(min_length=1)
    copies: int = Field(default=1, ge=1, le=20)
    title: str = Field(default="Documento DomiLink", min_length=1, max_length=120)
