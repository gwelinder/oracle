#!/usr/bin/env node
/**
 * Test fal.ai > OpenRouter > GPT-5.1 connection using OpenAI Node.js SDK
 *
 * This script mirrors Oracle's client pattern to validate the integration approach.
 *
 * Usage:
 *   FAL_KEY="your-key" node scripts/fal-test.mjs
 *
 * Or with pnpm:
 *   FAL_KEY="your-key" pnpm exec tsx scripts/fal-test.mjs
 */

import OpenAI from 'openai';

const FAL_KEY = process.env.FAL_KEY;

if (!FAL_KEY) {
  console.error('Error: FAL_KEY environment variable is required');
  console.error('Usage: FAL_KEY="your-fal-key" node scripts/fal-test.mjs');
  process.exit(1);
}

console.log(
  'Testing fal.ai > OpenRouter > openai/gpt-5.1 connection (Node.js SDK)...'
);
console.log('');

// Key insight: fal.ai requires "Authorization: Key <FAL_KEY>" not "Bearer"
// The OpenAI SDK sends "Bearer" by default, so we override via defaultHeaders
const client = new OpenAI({
  baseURL: 'https://fal.run/openrouter/router/openai/v1',
  apiKey: 'fal-proxy', // SDK requires a non-empty string, but we use headers for real auth
  timeout: 60_000,
  defaultHeaders: {
    Authorization: `Key ${FAL_KEY}`,
    'HTTP-Referer': 'https://github.com/steipete/oracle', // Optional for OpenRouter rankings
    'X-Title': 'Oracle CLI fal.ai Test', // Optional
  },
});

try {
  // Using openai/gpt-5.1 (NOT gpt-5-pro which is expensive)
  const response = await client.chat.completions.create({
    model: 'openai/gpt-5.1',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant. Be very brief.',
      },
      {
        role: 'user',
        content:
          'Say hello and confirm you are GPT-5.1 in exactly one sentence.',
      },
    ],
    max_tokens: 500,
  });

  console.log('Response:');
  console.log(response.choices[0].message.content);
  console.log('');
  console.log(`Model: ${response.model}`);
  console.log(
    `Usage: input=${response.usage?.prompt_tokens}, output=${response.usage?.completion_tokens}, total=${response.usage?.total_tokens}`
  );
  console.log('');
  console.log('SUCCESS: fal.ai > OpenRouter > GPT-5.1 connection works!');
} catch (error) {
  console.error('Error:', error.message);
  if (error.response) {
    console.error('Response status:', error.response.status);
    console.error('Response body:', error.response.data);
  }
  process.exit(1);
}
