// Enough — the small server. Static files come from ./dist (ASSETS); only /api/*
// runs here. Payment uses Dodo Payments (merchant of record). The key never
// reaches the browser: the browser asks us for a checkout link, and after paying
// asks us to confirm the payment with Dodo before the full list unlocks.

import { onRequestPost as merchants } from '../functions/api/merchants';
import { onRequestPost as analyse } from '../functions/api/analyse';
import type { Env as AiEnv } from '../functions/_lib/ai';

type Env = AiEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Secret, set in Cloudflare: Dodo API key (test or live). */
  DODO_API_KEY?: string;
  /** Plain variable: the product id of "Enough full audit" (pdt_...). */
  DODO_PRODUCT_ID?: string;
  /** Plain variable: "test" or "live". */
  DODO_MODE?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const dodoBase = (env: Env) => (env.DODO_MODE === 'live' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com');

async function checkout(request: Request, env: Env): Promise<Response> {
  if (!env.DODO_API_KEY || !env.DODO_PRODUCT_ID) return json({ error: 'payment not configured' }, 503);
  const origin = new URL(request.url).origin;
  const res = await fetch(`${dodoBase(env)}/checkouts`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.DODO_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ product_cart: [{ product_id: env.DODO_PRODUCT_ID, quantity: 1 }], return_url: `${origin}/?checkout=done` }),
  });
  if (!res.ok) return json({ error: 'checkout failed' }, 502);
  const data = (await res.json()) as { checkout_url?: string };
  return data.checkout_url ? json({ url: data.checkout_url }) : json({ error: 'checkout failed' }, 502);
}

async function verify(request: Request, env: Env): Promise<Response> {
  if (!env.DODO_API_KEY) return json({ error: 'payment not configured' }, 503);
  const id = new URL(request.url).searchParams.get('payment_id') ?? '';
  if (!/^pay_[A-Za-z0-9_]{4,80}$/.test(id)) return json({ paid: false }, 400);
  const res = await fetch(`${dodoBase(env)}/payments/${id}`, { headers: { authorization: `Bearer ${env.DODO_API_KEY}` } });
  if (!res.ok) return json({ paid: false });
  const p = (await res.json()) as { status?: string; product_cart?: Array<{ product_id?: string }> | null };
  const rightProduct = !p.product_cart?.length || !env.DODO_PRODUCT_ID || p.product_cart.some((x) => x.product_id === env.DODO_PRODUCT_ID);
  return json({ paid: p.status === 'succeeded' && rightProduct });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/api/checkout' && request.method === 'POST') return await checkout(request, env);
      if (pathname === '/api/verify' && request.method === 'GET') return await verify(request, env);
      if (pathname === '/api/merchants' && request.method === 'POST') return await merchants({ request, env });
      if (pathname === '/api/analyse' && request.method === 'POST') return await analyse({ request, env });
      if (pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    } catch {
      return json({ error: 'server error' }, 500);
    }
    return env.ASSETS.fetch(request);
  },
};
