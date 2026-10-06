// Mobile and desktop versions follow design/Main and design/LandingDesktop.
import { useStore } from '../app/store';
import { formatMoney } from '../app/money';
import { Button } from '../components/ui';

const EXAMPLE: Array<[string, number]> = [
  ['Netflix', 191.88], ['Disney+', 131.88], ['Dropbox', 143.88], ['FitZone Gym', 480],
];

export function Landing() {
  const { dispatch } = useStore();
  return (
    <div className="screen screen--navy on-navy landing-screen">
      <header className="landing-header">
        <div><strong>Enough.</strong><span>A financial audit that works for you</span></div>
        <a href="#how">How it works</a>
      </header>
      <div className="landing-layout">
        <main className="landing-copy">
          <h1>Know what's worth paying for. <span>Cut the rest.</span></h1>
          <p>Add a bank statement you already have, as PDF, Excel, CSV or a photo. See what each thing you pay for costs a year, and where the money leaks.</p>
          <div className="landing-actions">
            <Button variant="primary" full onClick={() => dispatch({ type: 'goto', step: 'addstatement' })}>I have a bank statement</Button>
            <Button variant="secondary" full onClick={() => dispatch({ type: 'goto', step: 'quickstart' })}>I'll tap what I pay for</Button>
          </div>
          <p className="landing-price">{formatMoney(4.99, 'EUR')} once, only if we find money you can keep</p>
        </main>
        <aside className="landing-example" aria-label="Example yearly costs">
          <div className="landing-example__paper">
            <div className="landing-example__caption"><span>Your year</span><span>Sep 2026</span></div>
            <hr />
            {EXAMPLE.map(([name, amount], index) => <div className={`landing-example__row${index === 1 || index === 2 ? ' landing-example__row--strike' : ''}`} key={name}><span>{name}</span><span>{formatMoney(amount, 'EUR')}</span></div>)}
            <hr />
            <div className="landing-example__total"><span>Found this year</span><strong>{formatMoney(467.76, 'EUR')}</strong></div>
          </div>
          <p className="landing-privacy">We never see your statement. Personal details are removed on this device.</p>
        </aside>
      </div>
      <section className="landing-how" id="how">
        <span>01 · Add a statement or tap what you pay for.</span>
        <span>02 · Review the yearly costs and decide what stays.</span>
        <span>03 · Keep your statement on your device.</span>
      </section>
    </div>
  );
}
