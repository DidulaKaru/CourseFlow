"""Client for the local Ollama runtime serving the extraction model (CF-232).

``get_llm_client`` is a FastAPI dependency returning anything that satisfies ``LLMClient``; tests (CF-222) replace
it through ``app.dependency_overrides`` with a deterministic mock, so no network or GPU is needed.
"""

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.core.config import settings
from app.services.extraction_contract import ExtractionError

logger = logging.getLogger(__name__)

ChatMessage = dict[str, str]

# Room for the prompt, the few-shot examples and the answer; must stay above what extraction_prompts sends.
_CONTEXT_TOKENS = 12_288
_MAX_ANSWER_TOKENS = 2_048
# CPU-only machines may evaluate a long prompt for minutes before the first token.
_CHAT_TIMEOUT = httpx.Timeout(10.0, read=300.0)
_HEALTH_TIMEOUT = httpx.Timeout(5.0)
_NANOSECONDS = 1_000_000_000


class LLMError(ExtractionError):
    """The language model did not produce a usable answer."""


class LLMUnavailableError(LLMError):
    """The language model runtime or the model itself is not available on this server."""


@dataclass(frozen=True)
class LLMTelemetry:
    """Cost and speed of one completion, as measured by Ollama (first token is wall-clock time)."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    prompt_eval_seconds: float = 0.0
    first_token_seconds: float = 0.0
    tokens_per_second: float = 0.0


@dataclass(frozen=True)
class LLMCompletion:
    """The model's full answer."""

    text: str
    telemetry: LLMTelemetry = LLMTelemetry()


class LLMClient(Protocol):
    """Minimal language model seam used by the extraction pipeline."""

    async def check_health(self) -> None:
        """Raise ``LLMUnavailableError`` unless the model can be used."""
        ...

    async def chat(self, messages: list[ChatMessage], *, json_schema: dict[str, Any]) -> LLMCompletion:
        """Answer ``messages`` with JSON constrained to ``json_schema``, raising ``LLMError`` on failure."""
        ...


def _telemetry(final_chunk: dict[str, Any], first_token_seconds: float) -> LLMTelemetry:
    completion_tokens = final_chunk.get("eval_count", 0)
    generation_seconds = final_chunk.get("eval_duration", 0) / _NANOSECONDS
    return LLMTelemetry(
        prompt_tokens=final_chunk.get("prompt_eval_count", 0),
        completion_tokens=completion_tokens,
        prompt_eval_seconds=final_chunk.get("prompt_eval_duration", 0) / _NANOSECONDS,
        first_token_seconds=first_token_seconds,
        tokens_per_second=completion_tokens / generation_seconds if generation_seconds else 0.0,
    )


class OllamaClient:
    """``LLMClient`` over Ollama's native HTTP API, which reports token counts and timings."""

    def __init__(self, base_url: str, model: str, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._base_url = base_url
        self._model = model
        self._transport = transport

    def _http(self, timeout: httpx.Timeout) -> httpx.AsyncClient:
        if not self._base_url:
            raise LLMUnavailableError("Automatic extraction is not available on this server.")
        return httpx.AsyncClient(base_url=self._base_url, timeout=timeout, transport=self._transport)

    async def check_health(self) -> None:
        """Verify that Ollama answers and the configured model has been pulled."""
        try:
            async with self._http(_HEALTH_TIMEOUT) as http:
                response = await http.get("/api/tags")
                response.raise_for_status()
                models = {model.get("name") for model in response.json().get("models", [])}
        except (httpx.HTTPError, httpx.InvalidURL, ValueError, AttributeError) as error:
            logger.warning("Ollama health check failed: %s", type(error).__name__)
            raise LLMUnavailableError(
                "Automatic extraction is not available on this server: the language model is not running."
            ) from error
        # Ollama lists an untagged model as "<name>:latest".
        if not models & {self._model, f"{self._model}:latest"}:
            logger.warning("Ollama model %s is not pulled", self._model)
            raise LLMUnavailableError(
                "Automatic extraction is not available on this server: the language model is not installed."
            )

    async def chat(self, messages: list[ChatMessage], *, json_schema: dict[str, Any]) -> LLMCompletion:
        """Stream one deterministic completion whose tokens are constrained to ``json_schema``."""
        payload = {
            "model": self._model,
            "messages": messages,
            "stream": True,
            "format": json_schema,
            "options": {
                "temperature": 0,
                "seed": 0,
                "num_ctx": _CONTEXT_TOKENS,
                "num_predict": _MAX_ANSWER_TOKENS,
            },
        }
        # Started before the request: Ollama sends no headers until the prompt has been evaluated.
        started = time.perf_counter()
        try:
            async with self._http(_CHAT_TIMEOUT) as http, http.stream("POST", "/api/chat", json=payload) as response:
                response.raise_for_status()
                completion = await self._collect(response, started)
        except httpx.TimeoutException as error:
            raise LLMError("The language model took too long to answer. Try again later.") from error
        except (httpx.HTTPError, httpx.InvalidURL, ValueError) as error:
            logger.warning("Ollama chat failed: %s", type(error).__name__)
            raise LLMError("The language model could not process the document. Try again later.") from error

        telemetry = completion.telemetry
        logger.info(
            "Ollama %s: prompt_tokens=%d completion_tokens=%d prompt_eval=%.2fs first_token=%.2fs speed=%.1f tokens/s",
            self._model,
            telemetry.prompt_tokens,
            telemetry.completion_tokens,
            telemetry.prompt_eval_seconds,
            telemetry.first_token_seconds,
            telemetry.tokens_per_second,
        )
        return completion

    @staticmethod
    async def _collect(response: httpx.Response, started: float) -> LLMCompletion:
        """Join a newline-delimited JSON stream into one answer."""
        first_token_seconds: float | None = None
        parts: list[str] = []
        async for line in response.aiter_lines():
            if not line.strip():
                continue
            chunk = json.loads(line)
            if "error" in chunk:
                raise ValueError("Ollama reported an error mid-stream")
            content = chunk.get("message", {}).get("content", "")
            if content and first_token_seconds is None:
                first_token_seconds = time.perf_counter() - started
            parts.append(content)
            if chunk.get("done"):
                if chunk.get("done_reason") == "length":
                    raise LLMError("The document is too long for the language model to summarize reliably.")
                return LLMCompletion("".join(parts), _telemetry(chunk, first_token_seconds or 0.0))
        raise ValueError("Ollama closed the stream before finishing")


def get_llm_client() -> LLMClient:
    """FastAPI dependency providing the extraction model. A blank ``OLLAMA_BASE_URL`` disables extraction."""
    return OllamaClient(settings.OLLAMA_BASE_URL, settings.OLLAMA_MODEL)
