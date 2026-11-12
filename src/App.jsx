import BlackDashboard from './BlackDashboard.jsx';

export default function App() {
  return (
    <div className="app-shell black-only-shell">
      <header className="black-only-topbar">
        <a className="brand" href="#top" aria-label="Nicom-AI Market Intelligence home">
          <span className="brand-mark">◈</span>
          <span>Nicom<span className="brand-accent">-AI</span><small>MARKET INTELLIGENCE · BLACK EDITION</small></span>
        </a>
        <span className="black-only-badge"><i/> PAPER OBSERVATION</span>
      </header>
      <main id="top" className="black-only-main">
        <BlackDashboard />
        <footer className="black-only-footer">NICOM-AI · BLACK MARKET OBSERVATORY · Educational paper observation only · No broker connection or real-money orders</footer>
      </main>
    </div>
  );
}
