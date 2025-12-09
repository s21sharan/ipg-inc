"""
OpenAI LLM client wrapper for agent orchestration.

Provides a singleton client with model configuration, structured output
support, and embedding generation for the memory stream.

Reference: SyntheticCohorts Framework Section 5.1 (Backend Infrastructure)
"""

from functools import lru_cache

from openai import OpenAI
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from ..config import get_settings


# Default model for agent reasoning (gpt-5-nano for cost efficiency)
DEFAULT_MODEL = "gpt-5-nano"
# Embedding model for memory retrieval
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536


class LLMClient:
    """
    Unified LLM client for agent cognitive operations.

    Provides both raw OpenAI client access and LangChain-compatible
    ChatOpenAI for integration with LangGraph workflows.
    """

    _instance: "LLMClient | None" = None
    _openai_client: OpenAI | None = None
    _chat_model: ChatOpenAI | None = None

    def __new__(cls) -> "LLMClient":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @property
    def openai(self) -> OpenAI:
        """Get raw OpenAI client (lazy initialization)."""
        if self._openai_client is None:
            settings = get_settings()
            self._openai_client = OpenAI(api_key=settings.openai_api_key)
        return self._openai_client

    @property
    def chat(self) -> ChatOpenAI:
        """Get LangChain ChatOpenAI for LangGraph integration."""
        if self._chat_model is None:
            settings = get_settings()
            self._chat_model = ChatOpenAI(
                model=DEFAULT_MODEL,
                api_key=settings.openai_api_key,
                temperature=0.7,  # Allow some creativity for persona variation
                max_tokens=500,  # Keep responses conversational
            )
        return self._chat_model

    def get_chat_model(
        self,
        model: str = DEFAULT_MODEL,
        temperature: float = 0.7,
        max_tokens: int = 500,
    ) -> ChatOpenAI:
        """
        Get a configured ChatOpenAI model.

        Args:
            model: Model identifier (default: gpt-5-nano)
            temperature: Sampling temperature (0.0-2.0)
            max_tokens: Maximum response tokens

        Returns:
            Configured ChatOpenAI instance
        """
        settings = get_settings()
        return ChatOpenAI(
            model=model,
            api_key=settings.openai_api_key,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    def generate_embedding(self, text: str) -> list[float]:
        """
        Generate embedding vector for text.

        Used for memory stream relevance scoring and semantic search.

        Args:
            text: Text to embed

        Returns:
            Embedding vector (1536 dimensions)
        """
        response = self.openai.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text,
            dimensions=EMBEDDING_DIMENSIONS,
        )
        return response.data[0].embedding

    def generate_embeddings_batch(self, texts: list[str]) -> list[list[float]]:
        """
        Generate embeddings for multiple texts efficiently.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
        if not texts:
            return []

        response = self.openai.embeddings.create(
            model=EMBEDDING_MODEL,
            input=texts,
            dimensions=EMBEDDING_DIMENSIONS,
        )
        return [item.embedding for item in response.data]

    def score_importance(self, memory_content: str) -> float:
        """
        Score the importance/poignancy of a memory (1-10 scale).

        Distinguishes between mundane events (eating breakfast = 2) and
        pivotal moments (receiving promotion = 9).

        Reference: Framework Section 2.1.1 (Importance scoring)

        Args:
            memory_content: Natural language description of the memory

        Returns:
            Importance score (1.0 to 10.0)
        """
        prompt = f"""Rate the importance/poignancy of this memory on a scale of 1-10.

1 = Mundane, routine event (e.g., "ate breakfast", "checked email")
5 = Moderately significant (e.g., "had an interesting conversation", "learned something new")
10 = Life-changing or pivotal moment (e.g., "got promoted", "major relationship change")

Memory: "{memory_content}"

Respond with ONLY a number between 1 and 10."""

        # Note: gpt-5-nano is a reasoning model and needs more tokens
        # for internal reasoning before producing the score
        response = self.openai.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=500,
        )

        try:
            score = float(response.choices[0].message.content.strip())
            return max(1.0, min(10.0, score))  # Clamp to valid range
        except (ValueError, AttributeError):
            return 5.0  # Default to moderate importance

    def generate_structured(
        self,
        prompt: str,
        response_model: type[BaseModel],
        system_prompt: str | None = None,
    ) -> BaseModel:
        """
        Generate a structured response using Pydantic model.

        Args:
            prompt: User prompt
            response_model: Pydantic model for response structure
            system_prompt: Optional system prompt

        Returns:
            Parsed Pydantic model instance
        """
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = self.openai.beta.chat.completions.parse(
            model=DEFAULT_MODEL,
            messages=messages,
            response_format=response_model,
            # Note: gpt-5-nano only supports temperature=1 (default)
        )

        return response.choices[0].message.parsed

    def complete(
        self,
        prompt: str,
        system_prompt: str | None = None,
        max_tokens: int = 2000,
    ) -> str:
        """
        Simple text completion.

        Args:
            prompt: User prompt
            system_prompt: Optional system prompt
            max_tokens: Maximum completion tokens (includes reasoning for gpt-5-nano)

        Returns:
            Generated text response
        """
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        # Note: gpt-5-nano is a reasoning model - it uses tokens for internal
        # reasoning before producing output. We need higher limits to ensure
        # enough tokens remain for the actual response after reasoning.
        response = self.openai.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=messages,
            max_completion_tokens=max_tokens,
            # Note: gpt-5-nano only supports temperature=1 (default)
        )

        return response.choices[0].message.content or ""


@lru_cache()
def get_llm_client() -> LLMClient:
    """Get the singleton LLM client instance."""
    return LLMClient()


def get_chat_model() -> ChatOpenAI:
    """FastAPI dependency to get LangChain ChatOpenAI."""
    return get_llm_client().chat
