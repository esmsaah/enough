/// <reference types="vite/client" />
// Enough — paying once for the full list (Dodo Payments, via our /api).
// The browser never sees the API key. After checkout, Dodo sends the person
// back with ?payment_id=…; we ask our server to confirm it before unlocking.

export type CheckoutResult = { ok: true } | { ok: false; message: string };

/** Open the Dodo checkout. In local development there is no server: unlock directly. */
export async function startCheckout(unlockForDev: () => void): Promise<CheckoutResult> {
  if (import.meta.env.DEV) { unlockForDev(); return { ok: true }; }
  try {
    const res = await fetch('/api/checkout', { method: 'POST' });
    const data = (await res.json()) as { url?: string };
    if (!res.ok || !data.url) return { ok: false, message: "Payment isn't available right now. Please try again in a minute." };
    window.location.href = data.url;
    return { ok: true };
  } catch {
    return { ok: false, message: 'No connection. Check your internet and try again.' };
  }
}

/** The payment id Dodo appended to our return URL, if this page load is a return from checkout. */
export function returnedPaymentId(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('payment_id');
  return id && /^pay_[A-Za-z0-9_]{4,80}$/.test(id) ? id : undefined;
}

/** Remove the checkout parameters from the address bar. */
export function clearReturnParams(): void {
  window.history.replaceState(null, '', window.location.pathname);
}

/** Ask our server whether Dodo marks this payment as succeeded. */
export async function confirmPayment(paymentId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`/api/verify?payment_id=${encodeURIComponent(paymentId)}`);
      const data = (await res.json()) as { paid?: boolean };
      if (data.paid) return true;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); // a card payment can take a moment
  }
  return false;
}
