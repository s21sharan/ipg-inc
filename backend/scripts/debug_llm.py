#!/usr/bin/env python3
"""Debug script to test LLM responses directly."""

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env.local")

from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

print("Testing gpt-5-nano...")
print("=" * 50)

try:
    response = client.chat.completions.create(
        model="gpt-5-nano",
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Say hello in one sentence."}
        ],
        max_completion_tokens=1500,
    )

    print(f"Response object: {response}")
    print(f"\nChoices: {response.choices}")
    print(f"\nMessage: {response.choices[0].message}")
    print(f"\nContent: '{response.choices[0].message.content}'")
    print(f"\nUsage: {response.usage}")

    # Check for reasoning content (o-series models have this)
    if hasattr(response.choices[0].message, 'reasoning_content'):
        print(f"\nReasoning content: {response.choices[0].message.reasoning_content}")

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
