#!/usr/bin/env node
import 'dotenv/config';
import { Command, InvalidArgumentError, Option } from 'commander';
import type { OptionValues } from 'commander';
import chalk from 'chalk';
import kleur from 'kleur';
import {
  ensureSessionStorage,
  initializeSession,
  updateSessionMetadata,
  readSessionMetadata,
  listSessionsMetadata,
  filterSessionsByRange,
  createSessionLogWriter,
  readSessionLog,
  wait,
  SESSIONS_DIR,
  deleteSessionsOlderThan,
} from '../src/sessionManager.js';
import type { SessionMetadata } from '../src/sessionManager.js';
import { runOracle, MODEL_CONFIGS, parseIntOption, renderPromptMarkdown, readFiles } from '../src/oracle.js';
import type { ModelName, PreviewMode, RunOracleOptions } from '../src/oracle.js';

interface CliOptions extends OptionValues {
  prompt?: string;
  file?: string[];
  model: ModelName;
  filesReport?: boolean;
  maxInput?: number;
  maxOutput?: number;
  system?: string;
  silent?: boolean;
  search?: boolean;
  preview?: boolean | string;
  previewMode?: PreviewMode;
  apiKey?: string;
  session?: string;
  execSession?: string;
  renderMarkdown?: boolean;
  sessionId?: string;
}

interface ShowStatusOptions {
  hours: number;
  includeAll: boolean;
  limit: number;
  showExamples?: boolean;
}

interface StatusOptions extends OptionValues {
  hours: number;
  limit: number;
  all: boolean;
}

const VERSION = '1.0.0';


const program = new Command();
program
  .name('oracle')
  .description('One-shot GPT-5 Pro / GPT-5.1 tool for hard questions that benefit from large file context and server-side search.')
  .version(VERSION)
  .option('-p, --prompt <text>', 'User prompt to send to the model.')
  .option('-f, --file <paths...>', 'Paths to files or directories to append to the prompt; repeat, comma-separate, or supply a space-separated list.', collectPaths, [])
  .option('-m, --model <model>', 'Model to target (gpt-5-pro | gpt-5.1).', validateModel, 'gpt-5-pro')
  .option('--files-report', 'Show token usage per attached file (also prints automatically when files exceed the token budget).', false)
  .addOption(
    new Option('--preview [mode]', 'Preview the request without calling the API (summary | json | full).')
      .choices(['summary', 'json', 'full'])
      .preset('summary'),
  )
  .addOption(new Option('--exec-session <id>').hideHelp())
  .option('--render-markdown', 'Emit the assembled markdown bundle for prompt + files and exit.', false)
  .showHelpAfterError('(use --help for usage)');

program
  .command('session [id]')
  .description('Attach to a stored session or list recent sessions when no ID is provided.')
  .option('--hours <hours>', 'Look back this many hours when listing sessions (default 24).', parseFloatOption, 24)
  .option('--limit <count>', 'Maximum sessions to show when listing (max 1000).', parseIntOption, 100)
  .option('--all', 'Include all stored sessions regardless of age.', false)
  .action(async (sessionId, cmd: Command) => {
    const sessionOptions = cmd.opts<StatusOptions>();
    if (!sessionId) {
      const showExamples = usesDefaultStatusFilters(cmd);
      await showStatus({
        hours: sessionOptions.all ? Infinity : sessionOptions.hours,
        includeAll: sessionOptions.all,
        limit: sessionOptions.limit,
        showExamples,
      });
      return;
    }
    await attachSession(sessionId);
  });

const statusCommand = program
  .command('status')
  .description('List recent sessions (24h window by default).')
  .option('--hours <hours>', 'Look back this many hours (default 24).', parseFloatOption, 24)
  .option('--limit <count>', 'Maximum sessions to show (max 1000).', parseIntOption, 100)
  .option('--all', 'Include all stored sessions regardless of age.', false)
  .action(async (cmd: Command) => {
    const statusOptions = cmd.opts<StatusOptions>();
    const showExamples = usesDefaultStatusFilters(cmd);
    await showStatus({
      hours: statusOptions.all ? Infinity : statusOptions.hours,
      includeAll: statusOptions.all,
      limit: statusOptions.limit,
      showExamples,
    });
  });

statusCommand
  .command('clear')
  .description('Delete stored sessions older than the provided window (24h default).')
  .option('--hours <hours>', 'Delete sessions older than this many hours (default 24).', parseFloatOption, 24)
  .option('--all', 'Delete all stored sessions.', false)
  .action(async (cmd: Command) => {
    const clearOptions = cmd.opts<StatusOptions>();
    const result = await deleteSessionsOlderThan({ hours: clearOptions.hours, includeAll: clearOptions.all });
    const scope = clearOptions.all ? 'all stored sessions' : `sessions older than ${clearOptions.hours}h`;
    console.log(`Deleted ${result.deleted} ${result.deleted === 1 ? 'session' : 'sessions'} (${scope}).`);
  });

const isTty = process.stdout.isTTY;
const bold = (text: string): string => (isTty ? kleur.bold(text) : text);
const dim = (text: string): string => (isTty ? kleur.dim(text) : text);

program.addHelpText('beforeAll', () => `${bold(`Oracle CLI v${VERSION}`)} — GPT-5 Pro/GPT-5.1 for tough questions with code/file context.\n`);
program.addHelpText(
  'after',
  () => `
${bold('Tips')}
${dim(' •')} This CLI is tuned for tough questions. Attach source files for best results, but keep total input under ~196k tokens.
${dim(' •')} The model has no built-in knowledge of your project—start each run with a sentence or two about the architecture, key components, and why you’re asking the question if that context matters.
${dim(' •')} Run ${bold('--files-report')} to see per-file token impact before spending money.
${dim(' •')} Non-preview runs spawn detached sessions so requests keep running even if your terminal closes.

${bold('Examples')}
${bold('  oracle')} --prompt "Summarize risks" --file docs/risk.md --files-report --preview
${dim('    Inspect tokens + files without calling the API.')}

${bold('  oracle')} --prompt "Explain bug" --file src/,docs/crash.log --files-report
${dim('    Attach both the src/ directory and docs/crash.log, launch a background session, and note the printed Session ID.')}

${bold('  oracle status')} --hours 72 --limit 50
${dim('    Show sessions from the last 72h (capped at 50 entries).')}

${bold('  oracle session')} <sessionId>
${dim('    Attach to a running/completed session, streaming the saved transcript.')}
`,
);

function collectPaths(value: string | string[] | undefined, previous: string[] = []): string[] {
  if (!value) {
    return previous;
  }
  const nextValues = Array.isArray(value) ? value : [value];
  return previous.concat(nextValues.flatMap((entry) => entry.split(',')).map((entry) => entry.trim()).filter(Boolean));
}

function parseFloatOption(value: string): number {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new InvalidArgumentError('Value must be a number.');
  }
  return parsed;
}

function validateModel(value: string): ModelName {
  if (!(value in MODEL_CONFIGS)) {
    throw new InvalidArgumentError(`Unsupported model "${value}". Choose one of: ${Object.keys(MODEL_CONFIGS).join(', ')}`);
  }
  return value as ModelName;
}

function usesDefaultStatusFilters(cmd: Command): boolean {
  const hoursSource = cmd.getOptionValueSource?.('hours') ?? 'default';
  const limitSource = cmd.getOptionValueSource?.('limit') ?? 'default';
  const allSource = cmd.getOptionValueSource?.('all') ?? 'default';
  return hoursSource === 'default' && limitSource === 'default' && allSource === 'default';
}

const rawArgs = process.argv.slice(2);

function resolvePreviewMode(value: boolean | string | undefined): PreviewMode | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value as PreviewMode;
  }
  if (value === true) {
    return 'summary';
  }
  return undefined;
}

function buildRunOptions(options: CliOptions, overrides: Partial<RunOracleOptions> = {}): RunOracleOptions {
  if (!options.prompt) {
    throw new Error('Prompt is required.');
  }
  return {
    prompt: options.prompt,
    model: options.model,
    file: overrides.file ?? options.file ?? [],
    filesReport: overrides.filesReport ?? options.filesReport,
    maxInput: overrides.maxInput ?? options.maxInput,
    maxOutput: overrides.maxOutput ?? options.maxOutput,
    system: overrides.system ?? options.system,
    silent: overrides.silent ?? options.silent,
    search: overrides.search ?? options.search,
    preview: overrides.preview ?? undefined,
    previewMode: overrides.previewMode ?? options.previewMode,
    apiKey: overrides.apiKey ?? options.apiKey,
    sessionId: overrides.sessionId ?? options.sessionId,
  };
}

function buildRunOptionsFromMetadata(metadata: SessionMetadata): RunOracleOptions {
  const stored = metadata.options ?? {};
  return {
    prompt: stored.prompt ?? '',
    model: (stored.model as ModelName) ?? 'gpt-5-pro',
    file: stored.file ?? [],
    filesReport: stored.filesReport,
    maxInput: stored.maxInput,
    maxOutput: stored.maxOutput,
    system: stored.system,
    silent: stored.silent,
    search: undefined,
    preview: false,
    previewMode: undefined,
    apiKey: undefined,
    sessionId: metadata.id,
  };
}

async function runRootCommand(options: CliOptions): Promise<void> {
  const previewMode = resolvePreviewMode(options.preview);

  if (rawArgs.length === 0) {
    console.log(chalk.yellow('No prompt or subcommand supplied. See `oracle --help` for usage.'));
    program.help({ error: false });
    return;
  }

  if (options.session) {
    await attachSession(options.session);
    return;
  }

  if (options.execSession) {
    await executeSession(options.execSession);
    return;
  }

  if (options.renderMarkdown) {
    if (!options.prompt) {
      throw new Error('Prompt is required when using --render-markdown.');
    }
    const markdown = await renderPromptMarkdown(
      { prompt: options.prompt, file: options.file, system: options.system },
      { cwd: process.cwd() },
    );
    console.log(markdown);
    return;
  }

  if (previewMode) {
    if (!options.prompt) {
      throw new Error('Prompt is required when using --preview.');
    }
    const runOptions = buildRunOptions(options, { preview: true, previewMode });
    await runOracle(runOptions, { log: console.log, write: (chunk: string) => process.stdout.write(chunk) });
    return;
  }

  if (!options.prompt) {
    throw new Error('Prompt is required when starting a new session.');
  }

  if (options.file && options.file.length > 0) {
    await readFiles(options.file, { cwd: process.cwd() });
  }

  await ensureSessionStorage();
  const baseRunOptions = buildRunOptions(options, { preview: false, previewMode: undefined });
  const sessionMeta = await initializeSession(baseRunOptions, process.cwd());
  const liveRunOptions: RunOracleOptions = { ...baseRunOptions, sessionId: sessionMeta.id };
  await runInteractiveSession(sessionMeta, liveRunOptions);
  console.log(chalk.bold(`Session ${sessionMeta.id} completed`));
}

async function runInteractiveSession(sessionMeta: SessionMetadata, runOptions: RunOracleOptions): Promise<void> {
  const { logLine, writeChunk, stream } = createSessionLogWriter(sessionMeta.id);
  let headerAugmented = false;
  const combinedLog = (message = ''): void => {
    if (!headerAugmented && message.startsWith('Oracle (')) {
      headerAugmented = true;
      console.log(`${message}\n${chalk.blue(`Reattach via: oracle session ${sessionMeta.id}`)}`);
      logLine(message);
      logLine(`Reattach via: oracle session ${sessionMeta.id}`);
      return;
    }
    console.log(message);
    logLine(message);
  };
  const combinedWrite = (chunk: string): boolean => {
    writeChunk(chunk);
    return process.stdout.write(chunk);
  };
  try {
    await updateSessionMetadata(sessionMeta.id, { status: 'running', startedAt: new Date().toISOString() });
    const result = await runOracle(runOptions, {
      log: combinedLog,
      write: combinedWrite,
    });
    if (result.mode !== 'live') {
      throw new Error('Unexpected preview result while running an interactive session.');
    }
    await updateSessionMetadata(sessionMeta.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      usage: result.usage,
      elapsedMs: result.elapsedMs,
    });
  } catch (error: unknown) {
    const message = formatError(error);
    combinedLog(`ERROR: ${message}`);
    await updateSessionMetadata(sessionMeta.id, {
      status: 'error',
      completedAt: new Date().toISOString(),
      errorMessage: message,
    });
    throw error;
  } finally {
    stream.end();
  }
}

async function executeSession(sessionId: string) {
  const metadata = await readSessionMetadata(sessionId);
  if (!metadata) {
    console.error(chalk.red(`No session found with ID ${sessionId}`));
    process.exitCode = 1;
    return;
  }
  const runOptions = buildRunOptionsFromMetadata(metadata);
  const { logLine, writeChunk, stream } = createSessionLogWriter(sessionId);
  try {
    await updateSessionMetadata(sessionId, { status: 'running', startedAt: new Date().toISOString() });
    const result = await runOracle(runOptions, {
      cwd: metadata.cwd,
      log: logLine,
      write: writeChunk,
    });
    if (result.mode !== 'live') {
      throw new Error('Unexpected preview result while executing a stored session.');
    }
    await updateSessionMetadata(sessionId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      usage: result.usage,
      elapsedMs: result.elapsedMs,
    });
  } catch (error: unknown) {
    const message = formatError(error);
    logLine(`ERROR: ${message}`);
    await updateSessionMetadata(sessionId, {
      status: 'error',
      completedAt: new Date().toISOString(),
      errorMessage: message,
    });
  } finally {
    stream.end();
  }
}

async function showStatus({ hours, includeAll, limit, showExamples = false }: ShowStatusOptions) {
  const metas = await listSessionsMetadata();
  const { entries, truncated, total } = filterSessionsByRange(metas, { hours, includeAll, limit });
  if (!entries.length) {
    console.log('No sessions found for the requested range.');
    if (showExamples) {
      printStatusExamples();
    }
    return;
  }
  console.log(chalk.bold('Recent Sessions'));
  for (const entry of entries) {
    const status = (entry.status || 'unknown').padEnd(9);
    const model = (entry.model || 'n/a').padEnd(10);
    const created = entry.createdAt.replace('T', ' ').replace('Z', '');
    console.log(`${created} | ${status} | ${model} | ${entry.id}`);
  }
  if (truncated) {
    console.log(
      chalk.yellow(
        `Showing ${entries.length} of ${total} sessions from the requested range. Run "oracle status clear" or delete entries in ${SESSIONS_DIR} to free space, or rerun with --status-limit/--status-all.`,
      ),
    );
  }
  if (showExamples) {
    printStatusExamples();
  }
}

function printStatusExamples(): void {
  console.log('');
  console.log(chalk.bold('Usage Examples'));
  console.log(`${chalk.bold('  oracle status --hours 72 --limit 50')}`);
  console.log(dim('    Show 72h of history capped at 50 entries.'));
  console.log(`${chalk.bold('  oracle status clear --hours 168')}`);
  console.log(dim('    Delete sessions older than 7 days (use --all to wipe everything).'));
  console.log(`${chalk.bold('  oracle session <session-id>')}`);
  console.log(dim('    Attach to a specific running/completed session to stream its output.'));
}

async function attachSession(sessionId: string): Promise<void> {
  const metadata = await readSessionMetadata(sessionId);
  if (!metadata) {
    console.error(chalk.red(`No session found with ID ${sessionId}`));
    process.exitCode = 1;
    return;
  }
  console.log(chalk.bold(`Session ${sessionId}`));
  console.log(`Created: ${metadata.createdAt}`);
  console.log(`Status: ${metadata.status}`);
  console.log(`Model: ${metadata.model}`);

  let lastLength = 0;
  const printNew = async () => {
    const text = await readSessionLog(sessionId);
    const nextChunk = text.slice(lastLength);
    if (nextChunk.length > 0) {
      process.stdout.write(nextChunk);
      lastLength = text.length;
    }
  };

  await printNew();

  // biome-ignore lint/nursery/noUnnecessaryConditions: deliberate infinite poll
  while (true) {
    const latest = await readSessionMetadata(sessionId);
    if (!latest) {
      break;
    }
    if (latest.status === 'completed' || latest.status === 'error') {
      await printNew();
      if (latest.status === 'error' && latest.errorMessage) {
        console.log(`\nSession failed: ${latest.errorMessage}`);
      }
      if (latest.usage) {
        const usage = latest.usage;
        console.log(`\nFinished (tok i/o/r/t: ${usage.inputTokens}/${usage.outputTokens}/${usage.reasoningTokens}/${usage.totalTokens})`);
      }
      break;
    }
    await wait(1000);
    await printNew();
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

program.action(async function (this: Command) {
  const options = this.optsWithGlobals() as CliOptions;
  await runRootCommand(options);
});

await program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(chalk.red('✖'), error.message);
  } else {
    console.error(chalk.red('✖'), error);
  }
  process.exitCode = 1;
});
