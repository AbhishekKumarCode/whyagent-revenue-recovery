"""Tests for the DeepSeek-backed Q&A fallback behavior — see why_agent/llm_explain.py."""
from __future__ import annotations

import os

from why_agent.llm_explain import llm_answer


def test_returns_none_when_no_api_key(monkeypatch, tmp_path):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    # point the .env loader at an empty temp dir so it can't find a real key either
    monkeypatch.setattr(os.path, "dirname", lambda _: str(tmp_path))
    result = llm_answer({"foo": "bar"}, "why?")
    assert result is None
