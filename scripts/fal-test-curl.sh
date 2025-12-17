#!/bin/bash
# Test fal.ai > OpenRouter > GPT-5.1 connection
# Usage: FAL_KEY="your-key" ./scripts/fal-test-curl.sh

set -euo pipefail

FAL_KEY="${FAL_KEY:-}"

if [ -z "$FAL_KEY" ]; then
  echo "Error: FAL_KEY environment variable is required"
  echo "Usage: FAL_KEY='your-fal-key' ./scripts/fal-test-curl.sh"
  exit 1
fi

echo "Testing fal.ai > OpenRouter > openai/gpt-5.1 connection..."
echo ""

# Using openai/gpt-5.1 (NOT gpt-5-pro which is expensive)
curl -s https://fal.run/openrouter/router/openai/v1/chat/completions \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-5.1",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant. Be very brief."},
      {"role": "user", "content": "Say hello and confirm you are GPT-5.1 in exactly one sentence."}
    ],
    "max_tokens": 500
  }' | jq .

echo ""
echo "Test complete!"
