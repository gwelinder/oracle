import { InvalidArgumentError, type Command } from 'commander';
import path from 'node:path';
import fg from 'fast-glob';
import type { ModelName, PreviewMode } from '../oracle.js';
import { DEFAULT_MODEL, MODEL_CONFIGS } from '../oracle.js';

export function collectPaths(
	value: string | string[] | undefined,
	previous: string[] = [],
): string[] {
	if (!value) {
		return previous;
	}
	const nextValues = Array.isArray(value) ? value : [value];
	return previous.concat(
		nextValues
			.flatMap((entry) => entry.split(","))
			.map((entry) => entry.trim())
			.filter(Boolean),
	);
}

/**
 * Merge all path-like CLI inputs (file/include aliases) into a single list, preserving order.
 */
export function mergePathLikeOptions(
	file?: string[],
	include?: string[],
	filesAlias?: string[],
	pathAlias?: string[],
	pathsAlias?: string[],
): string[] {
	const withFile = collectPaths(file, []);
	const withInclude = collectPaths(include, withFile);
	const withFilesAlias = collectPaths(filesAlias, withInclude);
	const withPathAlias = collectPaths(pathAlias, withFilesAlias);
	return collectPaths(pathsAlias, withPathAlias);
}

export function dedupePathInputs(
  inputs: string[],
  { cwd = process.cwd() }: { cwd?: string } = {},
): { deduped: string[]; duplicates: string[] } {
  const deduped: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  for (const entry of inputs ?? []) {
    const raw = entry?.trim();
    if (!raw) continue;

    let key = raw;
    if (!raw.startsWith('!') && !fg.isDynamicPattern(raw)) {
      const absolute = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
      key = `path:${path.normalize(absolute)}`;
    } else {
      key = `pattern:${raw}`;
    }

    if (seen.has(key)) {
      duplicates.push(raw);
      continue;
    }
    seen.add(key);
    deduped.push(raw);
  }

  return { deduped, duplicates };
}

export function collectModelList(value: string, previous: string[] = []): string[] {
	if (!value) {
		return previous;
	}
	const entries = value
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	return previous.concat(entries);
}

export function parseFloatOption(value: string): number {
	const parsed = Number.parseFloat(value);
	if (Number.isNaN(parsed)) {
		throw new InvalidArgumentError("Value must be a number.");
	}
	return parsed;
}

export function parseIntOption(value: string | undefined): number | undefined {
	if (value == null) {
		return undefined;
	}
	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed)) {
		throw new InvalidArgumentError("Value must be an integer.");
	}
	return parsed;
}

export function parseHeartbeatOption(value: string | number | undefined): number {
	if (value == null) {
		return 30;
	}
	if (typeof value === "number") {
		if (Number.isNaN(value) || value < 0) {
			throw new InvalidArgumentError("Heartbeat interval must be zero or a positive number.");
		}
		return value;
	}
	const normalized = value.trim().toLowerCase();
	if (normalized.length === 0) {
		return 30;
	}
	if (normalized === "false" || normalized === "off") {
		return 0;
	}
	const parsed = Number.parseFloat(normalized);
	if (Number.isNaN(parsed) || parsed < 0) {
		throw new InvalidArgumentError("Heartbeat interval must be zero or a positive number.");
	}
	return parsed;
}

export function usesDefaultStatusFilters(cmd: Command): boolean {
	const hoursSource = cmd.getOptionValueSource?.("hours") ?? "default";
	const limitSource = cmd.getOptionValueSource?.("limit") ?? "default";
	const allSource = cmd.getOptionValueSource?.("all") ?? "default";
	return hoursSource === "default" && limitSource === "default" && allSource === "default";
}

export function resolvePreviewMode(value: boolean | string | undefined): PreviewMode | undefined {
	if (typeof value === "string" && value.length > 0) {
		return value as PreviewMode;
	}
	if (value === true) {
		return "summary";
	}
	return undefined;
}

export function parseSearchOption(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	if (["on", "true", "1", "yes"].includes(normalized)) {
		return true;
	}
	if (["off", "false", "0", "no"].includes(normalized)) {
		return false;
	}
	throw new InvalidArgumentError("Value must be on/off, true/false, or yes/no.");
}

export function parseTimeoutOption(value: string | undefined): number | undefined {
	if (value == null) {
		return undefined;
	}
	const normalized = value.trim().toLowerCase();
	if (normalized.length === 0) {
		return undefined;
	}
	// Check for time suffixes (s, m, h)
	const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(s|m|h)?$/i);
	if (!match) {
		throw new InvalidArgumentError("Timeout must be a number with optional suffix (s, m, h).");
	}
	const num = Number.parseFloat(match[1]);
	const unit = match[2]?.toLowerCase() ?? "s";
	switch (unit) {
		case "h":
			return num * 60 * 60 * 1000;
		case "m":
			return num * 60 * 1000;
		case "s":
		default:
			return num * 1000;
	}
}

export function normalizeModelOption(model: string | undefined): ModelName {
	if (!model) {
		return DEFAULT_MODEL;
	}
	return model as ModelName;
}

export function normalizeBaseUrl(baseUrl: string | undefined): string | undefined {
	if (!baseUrl) {
		return undefined;
	}
	return baseUrl.replace(/\/+$/, "");
}

export function resolveApiModel(
	model: ModelName,
	config: (typeof MODEL_CONFIGS)[keyof typeof MODEL_CONFIGS],
): string {
	return config?.apiModel ?? model;
}

export function inferModelFromLabel(label: string): ModelName | undefined {
	const lower = label.toLowerCase();
	for (const [key] of Object.entries(MODEL_CONFIGS)) {
		if (lower.includes(key)) {
			return key as ModelName;
		}
	}
	return undefined;
}
