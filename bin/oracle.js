#!/usr/bin/env bun
import 'dotenv/config';
import { Command, InvalidArgumentError } from 'commander';
import chalk from 'chalk';
import {
  MODEL_CONFIGS,
  collectPaths,
  parseIntOption,
  runOracle,
} from '../src/oracle.js';

const program = new Command();
program
  .name('oracle')
  .description('Query GPT-5 Pro or GPT-5.1 via the OpenAI Responses API with optional file context and web search.')
  .requiredOption('-p, --prompt <text>', 'User prompt to send to the model.')
  .option('-f, --file <paths...>', 'Paths to files to append to the prompt; repeat or supply a space-separated list.', collectPaths, [])
  .option('-m, --model <model>', 'Model to target (gpt-5-pro | gpt-5.1).', validateModel, 'gpt-5-pro')
  .option('--search', 'Allow the model to make server-side web_search tool calls.', true)
  .option('--max-input <tokens>', 'Override the max input token budget (defaults to the model limit).', parseIntegerOption)
  .option('--system <text>', 'Override the default system prompt.')
  .option('--max-output <tokens>', 'Hard limit for output tokens (optional).', parseIntegerOption)
  .option('--files-report', 'Show token usage per attached file (also prints automatically when files exceed the token budget).', false)
  .option('--preview', 'Print the exact JSON payload that would be sent to OpenAI and exit.', false)
  .option('--preview-json', 'When using --preview, also dump the full JSON payload.', false)
  .option('--silent', 'Hide the model answer and only print stats.', false)
  .showHelpAfterError('(use --help for usage)');

function parseIntegerOption(value) {
  try {
    return parseIntOption(value);
  } catch (error) {
    throw new InvalidArgumentError(error.message);
  }
}

function validateModel(value) {
  if (!MODEL_CONFIGS[value]) {
    throw new InvalidArgumentError(`Unsupported model "${value}". Choose one of: ${Object.keys(MODEL_CONFIGS).join(', ')}`);
  }
  return value;
}

async function main() {
  const options = program.parse(process.argv).opts();
  await runOracle(options, { apiKey: process.env.OPENAI_API_KEY });
}

main().catch((error) => {
  console.error(chalk.red('✖'), error?.message || error);
  process.exitCode = 1;
});
