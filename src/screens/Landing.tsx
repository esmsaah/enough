// Landing B2 (2026-10-08). One responsive page, mobile first, breakpoint 900px.
// Navy header + hero with the marked-up receipt, ground trust + how-it-works,
// navy price band, ground footer. Follows the B2 handoff; no invented styles.
import { useState, type DragEvent } from 'react';
import { useStore } from '../app/store';
import { formatMoney, AUDIT_PRICE_EUR } from '../app/money';
import { QUICK_PICKS } from '../app/catalog';
import { importStatement } from '../app/statementImport';
import { researchMerchants } from '../app/merchantResearch';
import '../styles/landing-fonts.css';
import '../styles/landing.css';

const PRICE = formatMoney(AUDIT_PRICE_EUR, 'EUR'); // €5.99

export function Landing() {
  const { state, dispatch } = useStore();
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);

  const start = () => dispatch({ type: 'goto', step: 'quickstart' });
  const upload = () => dispatch({ type: 'goto', step: 'addstatement' });

  const startWith = (key: string) => {
    const pick = QUICK_PICKS.find((p) => p.merchantKey === key);
    if (pick) dispatch({ type: 'toggleQuickPick', pick });
    start();
  };

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    setUploadError('');
    setUploading(true);
    try {
      const result = await importStatement(files);
      if (state.aiRecognition) await researchMerchants(result.transactions, result.meta.displayCurrency);
      dispatch({ type: 'statementParsed', result });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'This statement could not be read.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="screen landing-screen b2">
      {/* 1 — Header */}
      <header className="b2-header">
        <a className="b2-logo" href="#top" aria-label="Enough home">
          Enough<span className="b2-logo__dot" aria-hidden="true">.</span>
        </a>
        <nav className="b2-nav">
          <a href="#how">How it works</a>
          <a href="#trust" className="b2-nav__trust">Is it safe?</a>
        </nav>
      </header>

      {/* 2 — Hero */}
      <section className="b2-hero" id="top">
        <div className="b2-hero__inner">
        <div className="b2-hero__copy">
            <p className="b2-eyebrow">Your subscriptions, audited once.</p>
            <h1 className="b2-h1">Tap what<span className="b2-mobile-break"><br /></span> you pay for.</h1>
            <p className="b2-sub">
              Netflix, gym, phone, that app you forgot about. See what it all costs you a year, and what to cut.
            </p>

            <p className="b2-eyebrow b2-eyebrow--chips">Tap one to start</p>
            <div className="b2-chips">
              <button type="button" className="b2-chip" onClick={() => startWith('netflix')}><span aria-hidden="true">+</span> Netflix</button>
              <button type="button" className="b2-chip" onClick={() => startWith('spotify')}><span aria-hidden="true">+</span> Spotify</button>
              <button type="button" className="b2-chip" onClick={() => startWith('gym')}><span aria-hidden="true">+</span> Gym</button>
              <button type="button" className="b2-chip" onClick={() => startWith('phone')}><span aria-hidden="true">+</span> Phone plan</button>
              <button type="button" className="b2-more" onClick={start}>and 40 more</button>
            </div>

            <div className="b2-cta-row">
              <button type="button" className="b2-btn b2-btn--lime" onClick={start}>Start tapping</button>
              <span className="b2-price-inline">{PRICE} once.</span>
            </div>
          </div>

          <div className="b2-hero__aside">
            <ReceiptCard />
          </div>
        </div>
      </section>

      {/* 3 — Trust */}
      <section className="b2-section b2-section--ground" id="trust">
        <div className="b2-section__inner">
          <p className="b2-eyebrow b2-eyebrow--ink">Your statements</p>
          <h2 className="b2-h2">Your statements, your phone.</h2>

          <div className="b2-cols">
            <div className="b2-col">
              <span className="b2-rule" aria-hidden="true" />
              <h3 className="b2-col__title">Too lazy to tap?</h3>
              <p className="b2-col__text">Drop in your last 3 bank statements and we'll find everything.</p>
              <div
                className={`b2-drop${dragOver ? ' is-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <button type="button" className="b2-btn b2-btn--indigo" onClick={upload}>{uploading ? 'Reading on this device…' : 'Upload your statements'}</button>
                <span className="b2-drop__hint">or drop the PDFs here</span>
                {uploadError && <span className="b2-drop__error" role="alert">{uploadError}</span>}
              </div>
            </div>

            <div className="b2-col">
              <span className="b2-rule" aria-hidden="true" />
              <h3 className="b2-col__title">Don't trust us with your statement? Fair.</h3>
              <p className="b2-col__text">
                Only the paranoid survive. <button type="button" className="b2-link" onClick={start}>Tapping works too.</button>
              </p>
              <StatementSlip />
              <p className="b2-col__text b2-col__text--small">It's read on your phone. We couldn't see it if we tried.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4 — How it works */}
      <section className="b2-section b2-section--ground" id="how">
        <div className="b2-section__inner">
          <p className="b2-eyebrow b2-eyebrow--ink">How it works</p>
          <h2 className="b2-h2">Three steps, about five minutes.</h2>

          <ol className="b2-steps">
            <li className="b2-step">
              <span className="b2-rule" aria-hidden="true" />
              <p className="b2-step__n">Step 01</p>
              <div className="b2-tile">
                <span className="b2-tile-chip is-on">Netflix</span>
                <span className="b2-tile-chip is-on">Gym</span>
                <span className="b2-tile-chip">iCloud+</span>
              </div>
              <h3 className="b2-step__title">Pick what you pay for.</h3>
              <p className="b2-step__text">Tap the ones you have. Or upload statements and we find them.</p>
            </li>

            <li className="b2-step">
              <span className="b2-rule" aria-hidden="true" />
              <p className="b2-step__n">Step 02</p>
              <div className="b2-tile b2-tile--center">
                <span className="b2-tile__label">GYM VISITS PER MONTH</span>
                <span className="b2-stepper"><i>−</i><b>3</b><i>+</i></span>
              </div>
              <h3 className="b2-step__title">Say how much you use it.</h3>
              <p className="b2-step__text">A few honest taps per item. About a minute.</p>
            </li>

            <li className="b2-step">
              <span className="b2-rule" aria-hidden="true" />
              <p className="b2-step__n">Step 03</p>
              <div className="b2-tile b2-tile--center">
              <span className="b2-gym"><s>€480</s><b className="b2-mark">€288</b></span>
                <span className="b2-tile__label">pay per visit</span>
              </div>
              <h3 className="b2-step__title">See what to cut.</h3>
              <p className="b2-step__text">Cut, keep or pay per use, with the yearly money next to each.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* 5 — Price band */}
      <section className="b2-section b2-section--navy b2-price-band">
        <div className="b2-section__inner b2-price-band__inner">
          <p className="b2-eyebrow">The price</p>
          <span className="b2-rule b2-rule--white" aria-hidden="true" />
          <p className="b2-price-huge">{PRICE} once.</p>
          <p className="b2-price-sub">Ironically, not a subscription. No account either.</p>
          <button type="button" className="b2-btn b2-btn--lime" onClick={start}>Start tapping</button>
        </div>
      </section>

      {/* 6 — Footer */}
      <footer className="b2-section b2-section--ground b2-footer">
        <div className="b2-section__inner">
          <p className="b2-footer__logo">Enough.</p>
          <p className="b2-footer__by">Made by one person who also had too many subscriptions.</p>
          <nav className="b2-footer__links">
            <a href="#top">About</a>
            <a href="#trust">Privacy</a>
            <a href="#how">How it works</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** The paper receipt with torn edges, a circled before/after amount and the
 *  lime-marked total from the B2 board. */
function ReceiptCard() {
  return (
    <figure className="b2-receipt" aria-label="Example audit receipt">
      <TornEdge />
      <div className="b2-receipt__paper">
        <div className="b2-rrow b2-rrow--cap"><span>RECEIPT #0001</span><span>CASHIER: YOU</span></div>
        <hr className="b2-rsep" />
        <div className="b2-rrow b2-rrow--gym">
          <span>FitZone Gym</span>
          <span className="b2-gym"><s>€480.00</s><b className="b2-circled">€288.00<Circle /></b></span>
        </div>
        <div className="b2-rrow"><span className="b2-struck">YouTube Premium<Strike /></span><span className="b2-struck">€167.88<Strike /></span></div>
        <div className="b2-rrow"><span className="b2-struck">Disney+<Strike /></span><span className="b2-struck">€131.88<Strike /></span></div>
        <div className="b2-rrow"><span>Spotify</span><span>€131.88</span></div>
        <div className="b2-rrow"><span>+ 6 more</span><span>€576.40</span></div>
        <hr className="b2-rsep b2-rsep--dash" />
        <div className="b2-rrow"><span>You pay a year</span><strong className="b2-struck">€1,488.04<Strike /></strong></div>
        <div className="b2-rrow b2-rrow--found">
          <span>FOUND</span>
          <span className="b2-found"><mark>€699.60</mark><small>a year</small></span>
        </div>
        <p className="b2-receipt__foot">THANK YOU FOR NOT SUBSCRIBING</p>
      </div>
      <TornEdge flip />
    </figure>
  );
}

function StatementSlip() {
  return (
    <div className="b2-slip" aria-label="Your statement, redacted on your phone">
      <div className="b2-slip__line"><span className="b2-slip__k">Name</span><span className="b2-bar">REMOVED</span></div>
      <div className="b2-slip__line"><span className="b2-slip__k">IBAN</span><span className="b2-bar">REMOVED</span></div>
      <hr className="b2-rsep" />
      <div className="b2-slip__row"><span>03/04 Spotify</span><span>€10.99</span></div>
      <div className="b2-slip__row"><span>05/04 Dropbox</span><span>€11.99</span></div>
    </div>
  );
}

function Circle() {
  return (
    <svg className="b2-circle" viewBox="0 0 70 34" preserveAspectRatio="none" aria-hidden="true">
      <path d="M10 18 C 7 7, 34 3, 52 6 C 66 9, 66 26, 48 30 C 28 34, 6 30, 5 17 C 4 11, 12 6, 22 5" />
    </svg>
  );
}

function Strike() {
  return <svg className="b2-strike" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><path d="M2 9 C28 4 69 7 98 2" /></svg>;
}

function TornEdge({ flip }: { flip?: boolean }) {
  return (
    <svg className={`b2-torn${flip ? ' b2-torn--flip' : ''}`} viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 4 L4 0 L8 4 L12 0 L16 4 L20 0 L24 4 L28 0 L32 4 L36 0 L40 4 L44 0 L48 4 L52 0 L56 4 L60 0 L64 4 L68 0 L72 4 L76 0 L80 4 L84 0 L88 4 L92 0 L96 4 L100 0 L100 4 Z" />
    </svg>
  );
}
