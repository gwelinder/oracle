import type { ModelConfig, ModelName, KnownModelName, TokenizerFn, ProModelName } from './types.js';
import { MODEL_CONFIGS, PRO_MODELS } from './config.js';
import { countTokens as countTokensGpt5Pro } from 'gpt-tokenizer/model/gpt-5-pro';
import { pricingFromUsdPerMillion } from 'tokentally';

const OPENROUTER_DEFAULT_BASE = "https://openrouter.ai/api/v1";
const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function isKnownModel(model: string): model is KnownModelName {
	return Object.hasOwn(MODEL_CONFIGS, model);
}

export function isOpenRouterBaseUrl(baseUrl: string | undefined): boolean {
	if (!baseUrl) return false;
	try {
		const url = new URL(baseUrl);
		return url.hostname.includes("openrouter.ai");
	} catch {
		return false;
	}
}

/**
 * Check if the base URL points to fal.ai's OpenRouter proxy.
 * fal.ai proxies requests to OpenRouter, so it functions similarly for model resolution.
 */
export function isFalAiBaseUrl(baseUrl: string | undefined): boolean {
	if (!baseUrl) return false;
	try {
		const url = new URL(baseUrl);
		return url.hostname.includes("fal.run") || url.hostname.includes("fal.ai");
	} catch {
		return false;
	}
}

/**
 * Check if the base URL is an OpenRouter-compatible endpoint (OpenRouter or fal.ai proxy).
 */
export function isOpenRouterCompatibleBaseUrl(baseUrl: string | undefined): boolean {
	return isOpenRouterBaseUrl(baseUrl) || isFalAiBaseUrl(baseUrl);
}

export function defaultOpenRouterBaseUrl(): string {
	return OPENROUTER_DEFAULT_BASE;
}

export function normalizeOpenRouterBaseUrl(baseUrl: string): string {
	try {
		const url = new URL(baseUrl);
		if (url.pathname.endsWith("/responses")) {
			url.pathname = url.pathname.replace(/\/responses\/?$/, "");
		}
		return url.toString().replace(/\/+$/, "");
	} catch {
		return baseUrl;
	}
}

export function safeModelSlug(model: string): string {
	return model.replace(/[/\\]/g, "__").replace(/[:*?"<>|]/g, "_");
}

interface OpenRouterModelInfo {
	id: string;
	context_length?: number;
	pricing?: {
		prompt?: number;
		completion?: number;
	};
}

const catalogCache = new Map<string, { fetchedAt: number; models: OpenRouterModelInfo[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchOpenRouterCatalog(
	apiKey: string,
	fetcher: FetchFn,
): Promise<OpenRouterModelInfo[]> {
	const cached = catalogCache.get(apiKey);
	const now = Date.now();
	if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
		return cached.models;
	}
	const response = await fetcher(OPENROUTER_MODELS_ENDPOINT, {
		headers: {
			authorization: `Bearer ${apiKey}`,
		},
	});
	if (!response.ok) {
		throw new Error(`Failed to load OpenRouter models (${response.status})`);
	}
	const json = (await response.json()) as { data?: OpenRouterModelInfo[] };
	const models = json?.data ?? [];
	catalogCache.set(apiKey, { fetchedAt: now, models });
	return models;
}

function mapToOpenRouterId(
	candidate: string,
	catalog: OpenRouterModelInfo[],
	providerHint?: string,
): string {
	if (candidate.includes("/")) return candidate;
	const byExact = catalog.find((entry) => entry.id === candidate);
	if (byExact) return byExact.id;
	const bySuffix = catalog.find((entry) => entry.id.endsWith(`/${candidate}`));
	if (bySuffix) return bySuffix.id;
	if (providerHint) {
		return `${providerHint}/${candidate}`;
	}
	return candidate;
}

export async function resolveModelConfig(
	model: ModelName,
	options: {
		baseUrl?: string;
		openRouterApiKey?: string;
		fetcher?: FetchFn;
	} = {},
): Promise<ModelConfig> {
	const known = isKnownModel(model) ? (MODEL_CONFIGS[model] as ModelConfig) : null;
	const fetcher: FetchFn = options.fetcher ?? globalThis.fetch.bind(globalThis);
	const openRouterActive =
		isOpenRouterBaseUrl(options.baseUrl) || Boolean(options.openRouterApiKey);

	if (known && !openRouterActive) {
		return known;
	}

	if (openRouterActive && options.openRouterApiKey) {
		try {
			const catalog = await fetchOpenRouterCatalog(options.openRouterApiKey, fetcher);
			const targetId = mapToOpenRouterId(
				typeof model === 'string' ? model : String(model),
				catalog,
				known?.provider,
			);
			const info = catalog.find((entry) => entry.id === targetId) ?? null;
			if (info) {
				return {
					...(known ?? {
						model,
						tokenizer: countTokensGpt5Pro as TokenizerFn,
						inputLimit: info.context_length ?? 200_000,
						reasoning: null,
					}),
					apiModel: targetId,
					openRouterId: targetId,
					provider: known?.provider ?? 'other',
					inputLimit: info.context_length ?? known?.inputLimit ?? 200_000,
					pricing:
						info.pricing && info.pricing.prompt != null && info.pricing.completion != null
							? (() => {
									const pricing = pricingFromUsdPerMillion({
										inputUsdPerMillion: info.pricing.prompt,
										outputUsdPerMillion: info.pricing.completion,
									});
									return {
										inputPerToken: pricing.inputUsdPerToken,
										outputPerToken: pricing.outputUsdPerToken,
									};
								})()
							: known?.pricing ?? null,
					supportsBackground: known?.supportsBackground ?? true,
					supportsSearch: known?.supportsSearch ?? true,
				};
			}
			return {
				...(known ?? {
					model,
					tokenizer: countTokensGpt5Pro as TokenizerFn,
					inputLimit: 200_000,
					reasoning: null,
				}),
				apiModel: targetId,
				openRouterId: targetId,
				provider: known?.provider ?? 'other',
				supportsBackground: known?.supportsBackground ?? true,
				supportsSearch: known?.supportsSearch ?? true,
				pricing: known?.pricing ?? null,
			};
		} catch {
			// If catalog fetch fails, fall back to a synthesized config.
		}
	}

	return {
		...(known ?? {
			model,
			tokenizer: countTokensGpt5Pro as TokenizerFn,
			inputLimit: 200_000,
			reasoning: null,
		}),
		provider: known?.provider ?? "other",
		supportsBackground: known?.supportsBackground ?? true,
		supportsSearch: known?.supportsSearch ?? true,
		pricing: known?.pricing ?? null,
	};
}

export function isProModel(model: ModelName): boolean {
	if (isKnownModel(model) && PRO_MODELS.has(model as KnownModelName & ProModelName)) {
		return true;
	}
	const lowerModel = model.toLowerCase();
	return (
		lowerModel.includes("gpt-5-pro") ||
		lowerModel.includes("gpt-5.1-pro") ||
		lowerModel.includes("gpt-5.2-pro") ||
		lowerModel.includes("claude-4.1-opus") ||
		lowerModel.includes("claude-opus-4") ||
		lowerModel.includes("claude-4.5-sonnet") ||
		lowerModel.includes("claude-sonnet-4") ||
		lowerModel.includes("gemini-3-pro") ||
		lowerModel.includes("gemini-2.5-pro") ||
		lowerModel.includes("gemini-2-pro") ||
		lowerModel.includes("gemini-pro")
	);
}
