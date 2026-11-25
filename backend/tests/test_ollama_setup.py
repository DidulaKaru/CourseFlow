"""CF-221 regression locks for the local Ollama (SLM) runtime in Docker Compose."""

import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
COMPOSE = REPO_ROOT / "docker-compose.yml"
GPU_COMPOSE = REPO_ROOT / "docker-compose.gpu.yml"
INIT_SCRIPT = REPO_ROOT / "backend" / "scripts" / "init-ollama.sh"
ENV_EXAMPLE = REPO_ROOT / ".env.example"

pytestmark = pytest.mark.skipif(
    not COMPOSE.exists(), reason="repo root not mounted (e.g. inside backend container)"
)


def _service_block(name: str) -> str:
    """Return the text of one top-level compose service (up to the next service/section)."""
    text = COMPOSE.read_text(encoding="utf-8")
    pattern = rf"^  {re.escape(name)}:\n(.*?)(?=^  [\w-]+:\n|^\w+:)"
    match = re.search(pattern, text, re.DOTALL | re.MULTILINE)
    assert match, f"service {name} not found"
    return match.group(1)


def test_ollama_starts_with_default_compose_up():
    # Acceptance: plain `docker compose up` must start Ollama (no `profiles:` gate).
    block = _service_block("ollama")
    assert "profiles:" not in block
    assert "ollama/ollama:latest" in block


def test_model_weights_persist_in_named_volume_and_port_exposed():
    text = COMPOSE.read_text(encoding="utf-8")
    assert "ollama_models:/root/.ollama" in text
    assert "\n  ollama_models:" in text
    assert "11434" in _service_block("ollama")


def test_ollama_has_healthcheck_that_works_without_curl():
    # The official image ships no curl, so a curl probe would never turn healthy.
    block = _service_block("ollama")
    assert "healthcheck:" in block
    assert '["CMD", "ollama", "list"]' in block
    assert "curl" not in block.replace("no curl", "")


def test_backend_never_waits_for_the_model_download():
    backend = _service_block("backend")
    assert "ollama" not in backend.split("depends_on:")[-1]


def test_init_script_pulls_only_when_model_missing_and_uses_lf():
    content = INIT_SCRIPT.read_bytes()
    assert content.startswith(b"#!/bin/sh\n")
    assert b"\r\n" not in content
    text = content.decode()
    assert "qwen2.5:7b-instruct" in text
    assert "ollama pull" in text
    assert "already present" in text


def test_gpu_override_is_optional_and_requests_nvidia():
    text = GPU_COMPOSE.read_text(encoding="utf-8")
    assert "driver: nvidia" in text
    assert "capabilities: [gpu]" in text
    # Default file must stay GPU-free so `docker compose up` works without NVIDIA.
    assert "nvidia" not in COMPOSE.read_text(encoding="utf-8").replace("docker-compose.gpu.yml", "")


def test_env_example_documents_ollama_variables():
    text = ENV_EXAMPLE.read_text(encoding="utf-8")
    assert "OLLAMA_MODEL=qwen2.5:7b-instruct" in text
    assert "OLLAMA_PORT=11434" in text
