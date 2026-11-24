"""Schema-constrained answers from the language model (CF-233).

Two layers guarantee valid output: Ollama restricts decoding to the model's JSON schema, and Instructor validates
the answer with Pydantic and asks again with the validation errors when a rule the grammar cannot express fails.
"""

import logging
from typing import Any, TypeVar

from pydantic import BaseModel
from pydantic.json_schema import GenerateJsonSchema

from app.services.llm_client import (
    ChatMessage,
    LLMClient,
    LLMError,
    LLMUnavailableError,
)

logger = logging.getLogger(__name__)

ModelT = TypeVar("ModelT", bound=BaseModel)

_MAX_RETRIES = 2


class _EveryFieldRequired(GenerateJsonSchema):
    """Makes the model answer every field explicitly instead of skipping those with a default."""

    def field_is_required(self, field: Any, total: bool) -> bool:
        return True


async def generate_structured(llm: LLMClient, messages: list[ChatMessage], response_model: type[ModelT]) -> ModelT:
    """Ask the model for a ``response_model``, raising ``LLMError`` when it cannot produce a valid one.

    Never pass Instructor's ``context`` here: it renders every message as a Jinja template, and messages
    contain uploaded document text.
    """
    try:
        import instructor  # Not installed on the serverless API, which must still start.
        from instructor.core import InstructorRetryException
        from openai.types.chat import ChatCompletion
    except ImportError:
        raise LLMUnavailableError("Automatic extraction is not available on this server.") from None

    schema = response_model.model_json_schema(by_alias=True, schema_generator=_EveryFieldRequired)
    transport_error: LLMError | None = None

    async def complete(*, messages: list[ChatMessage], **_: Any) -> ChatCompletion:
        nonlocal transport_error
        try:
            completion = await llm.chat(messages, json_schema=schema)
        except LLMError as error:
            transport_error = error
            raise
        return ChatCompletion.model_validate(
            {
                "id": "local",
                "object": "chat.completion",
                "created": 0,
                "model": "local",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": completion.text},
                    }
                ],
            }
        )

    # ``from_litellm`` is Instructor's adapter for any OpenAI-shaped completion function; LiteLLM is not involved.
    client = instructor.from_litellm(complete, mode=instructor.Mode.JSON_SCHEMA, async_client=True)
    try:
        return await client.chat.completions.create(
            model="local", response_model=response_model, messages=messages, max_retries=_MAX_RETRIES
        )
    except InstructorRetryException as error:
        if transport_error is not None:
            raise transport_error from error
        logger.warning("No valid %s after %d attempts", response_model.__name__, _MAX_RETRIES + 1)
        raise LLMError("The language model could not read this document reliably.") from error
