// Enough — server helpers for the AI endpoints (Cloudflare Pages Functions).
// Request bodies are never logged. Only names (research) or an anonymous
// item list (analyst) ever reach this code.

export type D1Result<T> = { results?: T[] };
export type D1Statement = { bind(...values: unknown[]): D1Statement; first<T>(): Promise<T | null>; all<T>(): Promise<D1Result<T>>; run(): Promise<unknown> };
export type D1Database = { prepare(query: string): D1Statement; batch(statements: D1Statement[]): Promise<unknown> };

export type Env = {
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string; // default below
  AI_DAILY_BUDGET_USD?: string; // default 5
};

export const DEFAULT_MODEL = 'claude-haiku-4-5';

// Approximate list prices in USD, used only for the daily budget cap.
const INPUT_PER_TOKEN = 1 / 1_000_000;
const OUTPUT_PER_TOKEN = 5 / 1_000_000;
const PER_WEB_SEARCH = 10 / 1_000;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function readJson(request: Request, maxBytes = 20_000): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('too large');
  return JSON.parse(text);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function overBudget(env: Env): Promise<boolean> {
  const budget = Number(env.AI_DAILY_BUDGET_USD ?? '5');
  const row = await env.DB.prepare('SELECT usd FROM ai_spend WHERE day = ?').bind(today()).first<{ usd: number }>();
  return (row?.usd ?? 0) >= budget;
}

async function recordSpend(env: Env, usd: number, kind: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO ai_spend (day, usd, calls) VALUES (?, ?, 1) ON CONFLICT(day) DO UPDATE SET usd = usd + excluded.usd, calls = calls + 1').bind(today(), usd),
    env.DB.prepare('INSERT INTO ai_calls (at, kind, usd) VALUES (?, ?, ?)').bind(new Date().toISOString(), kind, usd),
  ]);
}

type Usage = { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } };
type ContentBlock = { type: string; text?: string };

/**
 * One Messages API call. Returns the parsed JSON object from the last text
 * block, or undefined. Spend is recorded either way.
 */
export async function askClaude(env: Env, opts: { system: string; user: string; webSearch?: boolean; maxTokens?: number; kind: string }): Promise<unknown> {
  if (!env.ANTHROPIC_API_KEY) return undefined;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      ...(opts.webSearch ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] } : {}),
    }),
  });
  if (!response.ok) return undefined;
  const data = await response.json() as { content?: ContentBlock[]; usage?: Usage };
  const usage = data.usage ?? {};
  const usd = (usage.input_tokens ?? 0) * INPUT_PER_TOKEN
    + (usage.output_tokens ?? 0) * OUTPUT_PER_TOKEN
    + (usage.server_tool_use?.web_search_requests ?? 0) * PER_WEB_SEARCH;
  await recordSpend(env, usd, opts.kind);
  const texts = (data.content ?? []).filter((block) => block.type === 'text' && block.text).map((block) => block.text!);
  return parseJsonObject(texts[texts.length - 1] ?? '');
}

export function parseJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
