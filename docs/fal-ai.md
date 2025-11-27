# fal.ai OpenRouter Proxy

Oracle supports fal.ai's OpenRouter proxy, which provides access to OpenRouter models through fal.ai's infrastructure.

## Setup

```bash
export FAL_KEY="your-fal-key"
```

Get your fal.ai key from [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys).

## Usage

```bash
# Use any OpenRouter model through fal.ai
oracle --base-url "https://fal.run/openrouter/router/openai/v1" \
       --model "openai/gpt-5.1" \
       -p "Your prompt here"

# Use with files
oracle --base-url "https://fal.run/openrouter/router/openai/v1" \
       --model "openai/gpt-5.1" \
       --file src/main.ts \
       -p "Explain this code"
```

## Why use fal.ai?

- **Alternative billing**: Use your fal.ai credits instead of direct OpenRouter billing
- **Infrastructure**: Route through fal.ai's global infrastructure
- **Unified API keys**: If you already use fal.ai for other services (image generation, etc.), you can use the same API key

## Authentication

Oracle automatically detects fal.ai URLs and uses `FAL_KEY` for authentication:

- fal.ai requires the `Authorization: Key <FAL_KEY>` header format (not `Bearer`)
- Oracle handles this automatically when you use a fal.ai base URL

## Supported Models

Any model available on OpenRouter can be accessed through fal.ai's proxy. Use the OpenRouter model ID format:

- `openai/gpt-5.1`
- `openai/gpt-5-pro`
- `anthropic/claude-4.5-sonnet`
- `google/gemini-3-pro`
- etc.

## Model Resolution

When using fal.ai, Oracle still fetches model metadata from OpenRouter's catalog (if `OPENROUTER_API_KEY` is also set) to get accurate pricing and context limits. If not available, Oracle uses conservative defaults.

## Verbose Mode

Use `--verbose` to see which API key is being used:

```bash
oracle --base-url "https://fal.run/openrouter/router/openai/v1" \
       --model "openai/gpt-5.1" \
       -p "Hello" \
       --verbose
```

Output will show:
```
Using FAL_KEY=3528****617c for model openai/gpt-5.1
Base URL: https://fal.run/openrouter/...
```

## Endpoint URLs

The fal.ai OpenRouter proxy is available at:

- `https://fal.run/openrouter/router/openai/v1`
- `https://fal.ai/openrouter/router/openai/v1` (alternate)

Oracle recognizes both `fal.run` and `fal.ai` hostnames.
