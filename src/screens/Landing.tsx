// Mobile and desktop versions follow design/Main and design/LandingDesktop,
// with the copy agreed on 2026-10-07 (tap first, statements optional).
import { useStore } from '../app/store';
import { formatMoney, AUDIT_PRICE_EUR } from '../app/money';
import { Button } from '../components/ui';

const EXAMPLE: Array<[string, number]> = [
  ['Netflix', 191.88], ['Disney+', 131.88], ['Dropbox', 143.88], ['FitZone Gym', 480],
];

const STEPS = [
  ['01', 'Tap or upload', 'Tap what you pay for, or drop in your last 3 bank statements.'],
  ['02', 'Tell us what you actually use', 'A few taps per service. Always, sometimes, almost never.'],
  ['03', 'See what to cut, keep or rotate', 'What it all costs a year, and where the money leaks.'],
];

const TRUST = [
  ['Your statement never leaves your phone.', "It's read right here, on your device. We never see it."],
  ['No account, no bank login.', "We'll never ask for your password. No sign-up either."],
  ['Delete everything in one tap.', 'Nothing stays unless you want a reminder email.'],
  ['One payment, then we’re gone.', 'No subscription, no upsell, no data to sell.'],
];

export function Landing() {
  const { dispatch } = useStore();
  return (
    <div className="screen screen--navy on-navy landing-screen">
      <div className="landing-inner">
        <header className="landing-header">
          <div><strong>Enough.</strong><span>Your subscriptions, audited once.</span></div>
          <a href="#how">How it works</a>
        </header>

        <div className="landing-layout">
          <main className="landing-copy">
            <h1>Tap what you pay for.</h1>
            <p>Netflix, gym, phone, that app you forgot about. See what it all costs you a year, and what to cut.</p>
            <div className="landing-actions">
              <Button variant="primary" full onClick={() => dispatch({ type: 'goto', step: 'quickstart' })}>Start tapping</Button>
            </div>
            <p className="landing-alt">
              Too lazy to tap?{' '}
              <button type="button" className="landing-link" onClick={() => dispatch({ type: 'goto', step: 'addstatement' })}>Drop in your last 3 bank statements</button>
              {' '}and we'll find everything.
            </p>
            <p className="landing-alt landing-alt--quiet">Don't trust us with your statement? Fair. Only the paranoid survive. Tapping works too.</p>
            <p className="landing-price">{formatMoney(AUDIT_PRICE_EUR, 'EUR')} once. Ironically, not a subscription.</p>
          </main>

          <aside className="landing-example" aria-label="Example yearly costs">
            <div className="landing-example__paper">
              <div className="landing-example__caption"><span>Your year</span><span>Example</span></div>
              <hr />
              {EXAMPLE.map(([name, amount], index) => <div className={`landing-example__row${index === 1 || index === 2 ? ' landing-example__row--strike' : ''}`} key={name}><span>{name}</span><span>{formatMoney(amount, 'EUR')}</span></div>)}
              <hr />
              <div className="landing-example__total"><span>Found this year</span><strong>{formatMoney(467.76, 'EUR')}</strong></div>
            </div>
          </aside>
        </div>

        <section className="landing-how" id="how" aria-label="How it works">
          <h2>How it works</h2>
          <ol>
            {STEPS.map(([n, title, text]) => (
              <li key={n}><span className="landing-how__n">{n}</span><strong>{title}</strong><span>{text}</span></li>
            ))}
          </ol>
        </section>

        <section className="landing-trust" aria-label="Why trust us">
          <h2>Why trust us?</h2>
          <ul>
            {TRUST.map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}
