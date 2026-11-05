import Script from "next/script";
import { BUSINESS } from "@/lib/assistant/business";

const SERVICES = [
  { name: "Heating", text: "Furnace repair, tune-ups, and new high-efficiency systems." },
  { name: "Cooling", text: "AC repair, heat pumps, and ductless mini-splits." },
  { name: "Water heaters", text: "Tank and tankless repair, flushes, and replacement." },
  { name: "Plumbing", text: "Drains, leaks, fixtures, softeners, and sewer camera inspections." },
];

const SAMPLE_QUESTIONS = [
  "How much is a furnace tune-up?",
  "Do you serve Lehi?",
  "What does Comfort Club Plus include?",
  "I smell gas, what should I do?",
];

export default function HomePage() {
  return (
    <>
      <div className="demo-banner" role="note">
        Demo only: Timpanogos Heating &amp; Plumbing is a fictional company. Every price, policy,
        and phone number on this site is made up.
      </div>

      <header className="site-header">
        <div className="wrap header-row">
          <span className="logo">{BUSINESS.name}</span>
          <span className="header-phone">
            Office {BUSINESS.officePhone} · 24/7 emergencies {BUSINESS.emergencyPhone}
          </span>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="wrap">
            <h1>Heating, cooling, and plumbing for Provo, Orem, and Lehi</h1>
            <p>
              Upfront flat-rate pricing, 2-hour arrival windows, and a 24/7 emergency line. Have a
              question? Our virtual front desk answers from our own policies and price list, and
              hands you to a person when it isn&apos;t sure.
            </p>
            <p className="hint">Open the chat in the corner and try:</p>
            <ul className="samples">
              {SAMPLE_QUESTIONS.map((q) => (
                <li key={q}>&ldquo;{q}&rdquo;</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="wrap">
          <h2>What we do</h2>
          <div className="grid">
            {SERVICES.map((s) => (
              <article key={s.name} className="card">
                <h3>{s.name}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="wrap two-col">
          <div>
            <h2>Service area</h2>
            <p>
              Core area: Provo, Orem, and Lehi. Extended area (trip fee applies): American Fork,
              Pleasant Grove, Lindon, Vineyard, and Saratoga Springs.
            </p>
          </div>
          <div>
            <h2>Hours</h2>
            <p>
              {BUSINESS.officeHours}. Sunday closed. Emergency line answered 24/7 at{" "}
              {BUSINESS.emergencyPhone}.
            </p>
          </div>
        </section>

        <section className="wrap embed">
          <h2>Add the assistant to any website</h2>
          <p>
            The chat in the corner is one script tag. A business can paste it into its own site:
          </p>
          <pre>
            <code>{`<script src="https://YOUR-HOST/widget.js" data-frontdesk-widget
        data-api="https://YOUR-HOST"
        data-business="${BUSINESS.name}"
        data-phone="${BUSINESS.officePhone}" defer></script>`}</code>
          </pre>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          Synthetic demo data. Not a real business; do not call these numbers or rely on this
          information.
        </div>
      </footer>

      <Script
        src="/widget.js"
        strategy="afterInteractive"
        data-frontdesk-widget=""
        data-business={BUSINESS.name}
        data-phone={BUSINESS.officePhone}
      />
    </>
  );
}
