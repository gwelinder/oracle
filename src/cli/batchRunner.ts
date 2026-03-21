import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import type { BrowserSessionConfig } from "../sessionStore.js";
import type { RunOracleOptions } from "../oracle.js";
import { readFiles, createFileSections, formatFileSection } from "../oracle.js";
import { resolveBrowserConfig } from "../browser/config.js";
import { runBatchInParallel } from "../browser/tabPool.js";
import type { BatchJob, BatchJobResult, BatchResult, TabPoolOptions } from "../browser/tabPool.js";
import { formatElapsed } from "../oracle/format.js";
import type { BrowserLogger } from "../browser/types.js";
import type { LaunchedChrome } from "chrome-launcher";

export interface BatchManifestEntry {
  slug: string;
  prompt: string;
  files?: string[];
}

export interface BatchRunOptions {
  manifestPath: string;
  parallel: number;
  writeOutputTemplate?: string;
  browserConfig: BrowserSessionConfig;
  cwd: string;
  verbose: boolean;
  log: (message: string) => void;
  chrome: {
    port: number;
    host: string;
    pid?: number;
    userDataDir: string;
  };
}

export async function runBatch(options: BatchRunOptions): Promise<BatchResult> {
  const { manifestPath, parallel, writeOutputTemplate, browserConfig, cwd, verbose, log, chrome } =
    options;

  // Read and validate manifest
  const rawManifest = await fs.readFile(path.resolve(cwd, manifestPath), "utf8");
  let entries: BatchManifestEntry[];
  try {
    entries = JSON.parse(rawManifest) as BatchManifestEntry[];
  } catch (error) {
    throw new Error(
      `Failed to parse batch manifest ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`Batch manifest ${manifestPath} must be a non-empty JSON array.`);
  }

  // Validate entries
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry?.slug || typeof entry.slug !== "string") {
      throw new Error(`Batch manifest entry ${i} is missing a "slug" field.`);
    }
    if (!entry?.prompt || typeof entry.prompt !== "string") {
      throw new Error(`Batch manifest entry ${i} (${entry.slug}) is missing a "prompt" field.`);
    }
  }

  // Build jobs, skipping ones that already have output (resume logic)
  const jobs: BatchJob[] = [];
  let skipped = 0;

  for (const entry of entries) {
    const outputPath = resolveOutputPath(writeOutputTemplate, entry.slug, cwd);

    // Resume: skip if output file already exists and is non-empty
    if (outputPath) {
      try {
        const stat = await fs.stat(outputPath);
        if (stat.isFile() && stat.size > 0) {
          skipped += 1;
          if (verbose) {
            log(chalk.dim(`Skipping ${entry.slug}: output already exists at ${outputPath}`));
          }
          continue;
        }
      } catch {
        // File doesn't exist — proceed
      }
    }

    // Assemble prompt with files
    let composedPrompt = entry.prompt;
    if (entry.files && entry.files.length > 0) {
      try {
        const files = await readFiles(entry.files, { cwd });
        const sections = createFileSections(files, cwd);
        const fileSections = sections.map((s) => formatFileSection(s.displayPath, s.content));
        composedPrompt = [entry.prompt.trim(), ...fileSections].join("\n\n");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(chalk.yellow(`Warning: Failed to read files for ${entry.slug}: ${message}`));
      }
    }

    jobs.push({
      slug: entry.slug,
      prompt: composedPrompt,
      writeOutput: outputPath ?? undefined,
    });
  }

  const totalEntries = entries.length;
  log(
    `Batch: ${totalEntries} jobs total, ${jobs.length} to run, ${skipped} skipped (already complete), ${parallel} parallel tabs`,
  );

  if (jobs.length === 0) {
    log(chalk.green("All jobs already complete — nothing to do."));
    return { results: [], completed: 0, failed: 0, elapsedMs: 0 };
  }

  // Resolve browser config
  const resolvedConfig = resolveBrowserConfig(browserConfig);

  // Build logger
  const batchLogger: BrowserLogger = ((msg: string) => {
    log(msg);
  }) as BrowserLogger;
  batchLogger.verbose = verbose;
  batchLogger.sessionLog = verbose ? log : undefined;

  // Run the batch
  const poolOptions: TabPoolOptions = {
    maxConcurrent: parallel,
    chromePort: chrome.port,
    chromeHost: chrome.host,
    config: resolvedConfig,
    userDataDir: chrome.userDataDir,
    logger: batchLogger,
    verbose,
    onJobStart: (slug, workerIndex) => {
      const remaining = jobs.length - results.length;
      log(chalk.cyan(`[tab-${workerIndex}] Starting: ${slug}`));
    },
    onJobComplete: async (result, completed, total) => {
      const icon = result.status === "completed" ? "✓" : "✗";
      const color = result.status === "completed" ? chalk.green : chalk.red;
      const elapsed = formatElapsed(result.elapsedMs);
      const chars = result.answerText.length.toLocaleString();
      log(
        color(
          `  ${icon} [${completed}/${total}] ${result.slug} ${elapsed} (${chars} chars)`,
        ),
      );

      // Write output file
      if (result.status === "completed" && result.answerText) {
        const outputPath = resolveOutputPath(writeOutputTemplate, result.slug, cwd);
        if (outputPath) {
          try {
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await fs.writeFile(outputPath, result.answerText, "utf8");
            if (verbose) {
              log(chalk.dim(`  Wrote ${outputPath}`));
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            log(chalk.yellow(`  Warning: Failed to write ${outputPath}: ${msg}`));
          }
        }
      }

      // Log errors
      if (result.status === "error" && result.error) {
        log(chalk.red(`  Error: ${result.error}`));
      }
    },
  };

  const results: BatchJobResult[] = [];
  const batchResult = await runBatchInParallel(jobs, poolOptions);

  // Summary
  const elapsed = formatElapsed(batchResult.elapsedMs);
  log("");
  log(
    chalk.bold(
      `Batch complete: ${batchResult.completed} succeeded, ${batchResult.failed} failed, ${skipped} skipped — ${elapsed}`,
    ),
  );

  if (batchResult.failed > 0) {
    log(chalk.yellow("\nFailed jobs:"));
    for (const result of batchResult.results) {
      if (result.status === "error") {
        log(chalk.red(`  ${result.slug}: ${result.error ?? "unknown error"}`));
      }
    }
    log(chalk.dim("\nRe-run the same command to retry failed jobs (completed ones are skipped)."));
  }

  return batchResult;
}

function resolveOutputPath(
  template: string | undefined,
  slug: string,
  cwd: string,
): string | null {
  if (!template) return null;
  const resolved = template.replace(/\{slug\}/g, slug);
  return path.isAbsolute(resolved) ? resolved : path.resolve(cwd, resolved);
}
