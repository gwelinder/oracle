#!/usr/bin/env python3
"""
Test fal.ai > OpenRouter > GPT-5.1 connection using OpenAI SDK

Usage:
    FAL_KEY="your-key" python scripts/fal-test.py

Requirements:
    pip install openai
"""

import os
import sys

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai package not installed")
    print("Run: pip install openai")
    sys.exit(1)

FAL_KEY = os.environ.get("FAL_KEY")

if not FAL_KEY:
    print("Error: FAL_KEY environment variable is required")
    print("Usage: FAL_KEY='your-fal-key' python scripts/fal-test.py")
    sys.exit(1)

print("Testing fal.ai > OpenRouter > openai/gpt-5.1 connection (Python SDK)...")
print("")

# Key insight: fal.ai requires "Authorization: Key <FAL_KEY>" not "Bearer"
# The OpenAI SDK sends "Bearer" by default, so we override via default_headers
client = OpenAI(
    base_url="https://fal.run/openrouter/router/openai/v1",
    api_key="fal-proxy",  # SDK requires a non-empty string, but we use headers for real auth
    default_headers={
        "Authorization": f"Key {FAL_KEY}",
        "HTTP-Referer": "https://github.com/steipete/oracle",  # Optional for OpenRouter rankings
        "X-Title": "Oracle CLI fal.ai Test",  # Optional
    },
)

try:
    # Using openai/gpt-5.1 (NOT gpt-5-pro which is expensive)
    response = client.chat.completions.create(
        model="openai/gpt-5.1",
        messages=[
            {"role": "system", "content": "You are a helpful assistant. Be very brief."},
            {"role": "user", "content": "Say hello and confirm you are GPT-5.1 in exactly one sentence."}
        ],
        max_tokens=500,
    )
    
    print("Response:")
    print(response.choices[0].message.content)
    print("")
    print(f"Model: {response.model}")
    print(f"Usage: {response.usage}")
    print("")
    print("SUCCESS: fal.ai > OpenRouter > GPT-5.1 connection works!")
    
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
