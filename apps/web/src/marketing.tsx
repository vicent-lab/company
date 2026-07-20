import { useState } from 'react';
import { useTheme } from './theme';
import { useHashRoute } from './router';
import { usePlan, PLANS } from './plans';
import { TESTIMONIALS, PARTNERS, FAQ } from './mock';
import { AnimatedCounter, ThemeToggle, Modal, CowPhoto, CowIllustration } from './ui';
import { ArrowRight, Play, Check, Star, Sparkles, Tractor, Milk, ShieldCheck, Bot, MapPin, Moon, Download } from 'lucide-react';
import { fmt } from './format';

export function Marketing() {
  const { theme, setTheme } = useTheme();
  const [, navigate] = useHashRoute();
  const { plan, setPlan } = usePlan();
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [video, setVideo] = useState(false);
  const [roi, setRoi] = useState({ cows: 120, pricePerL: 0.45, waste: 12 });
  const [sent, setSent] = useState(false);

  const selectPlan = (name: 'Starter' | 'Pro' | 'Enterprise') => {
    setPlan(name);
    localStorage.setItem('selectedPlan', name);
  };

  const startTrial = () => {
    localStorage.setItem('selectedPlan', plan);
    navigate('/app');
  };

  const saved = Math.round(roi.cows * roi.pricePerL * 30 * (roi.waste / 100) * 0.6 + roi.cows * 4);
  const yearly = saved * 12;

  return (
    <div className="fade-in">
      <nav className="marketing-nav">
        <div className="brand"><div className="logo"><Milk size={18} /></div><div><b>DairyOS</b><small>SMART DAIRY</small></div></div>
        <div className="links">
          <a href="#features">Features</a><a href="#ai">AI</a><a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a><a href="#contact">Contact</a>
        </div>
        <ThemeToggle theme={theme} setTheme={setTheme} />
        <button className="btn ghost sm" onClick={() => navigate('/app')}>Sign in</button>
        <button className="btn gold sm" onClick={() => navigate('#pricing')}>Start free trial</button>
      </nav>

      {/* HERO */}
      <header className="hero" id="features">
        <div className="hero-bg" />
        <div>
          <div className="eyebrow">AI-POWERED DAIRY MANAGEMENT</div>
          <h1>Manage your dairy farm smarter</h1>
          <p className="sub">Track every cow, liter, and dollar in real time. DairyOS brings AI insights, QR traceability, and beautiful dashboards to farms of any size.</p>
          <div className="row">
            <button className="btn gold" onClick={() => navigate('#pricing')}>Start free trial <ArrowRight size={18} /></button>
            <button className="btn ghost" onClick={() => setVideo(true)}><Play size={16} /> Book a demo</button>
          </div>
          <div className="stat-row four" style={{ marginTop: 36 }}>
            <HeroStat icon={<Tractor size={18} />} value={2400} suffix="+" label="Cows managed" />
            <HeroStat icon={<Milk size={18} />} value={18600} suffix=" L" label="Milk tracked daily" />
            <HeroStat icon={<ShieldCheck size={18} />} value={99.9} suffix="%" decimals={1} label="Uptime" />
            <HeroStat icon={<Bot size={18} />} value={38} suffix="%" label="Yield uplift" />
          </div>
        </div>
        <div className="hero-visual">
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <CowIllustration />
            <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(6px)', borderRadius: 14, padding: '12px 16px', border: '1px solid rgba(255,255,255,0.6)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1c2b22' }}>Live farm overview</div>
              <div style={{ fontSize: 12, color: '#5d6f63', marginTop: 4 }}>Milk today · 18,600 L · +3.1%</div>
              <button className="btn sm mt" style={{ marginTop: 10 }} onClick={() => { localStorage.setItem('selectedPlan', plan); navigate('/app'); }}>Open dashboard →</button>
            </div>
          </div>
        </div>
      </header>

      {/* FEATURE GRID */}
      <section className="section">
        <h2>Everything your farm needs</h2>
        <p className="lead">From herd health to finances, sustainability to customer orders — one calm, connected platform.</p>
        <div className="three">
          {[
            { ic: <Bot size={20} />, t: 'AI farm assistant', d: 'Ask plain-English questions and get instant answers about vaccinations, milk, and feed.' },
            { ic: <MapPin size={20} />, t: 'Interactive farm map', d: 'See barns, grazing, water, and milking stations at a glance. Tap any location for details.' },
            { ic: <ShieldCheck size={20} />, t: 'QR & RFID traceability', d: 'Scan a cow to pull up its full profile, health, and breeding history instantly.' },
            { ic: <Sparkles size={20} />, t: 'AI predictions', d: 'Forecast milk, feed needs, pregnancy success, and disease risk before they happen.' },
            { ic: <Moon size={20} />, t: 'Dark & a11y themes', d: 'Light, dark, and high-contrast modes for any environment or operator.' },
            { ic: <Download size={20} />, t: 'Export anywhere', d: 'Send reports to PDF, Excel, and CSV in one click for your accountant or vet.' },
          ].map((f) => (
            <div className="card reveal" key={f.t}>
              <div className="icon" style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', color: 'var(--primary)', marginBottom: 12 }}>{f.ic}</div>
              <h3 style={{ fontSize: 17 }}>{f.t}</h3>
              <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="section alt">
        <h2>Loved by dairy farmers</h2>
        <p className="lead">Real results from farms running DairyOS every day.</p>
        <div className="testi">
          {TESTIMONIALS.map((t) => (
            <div className="card reveal" key={t.name}>
              <div style={{ color: 'var(--warn)' }} className="row">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={16} fill="currentColor" />)}</div>
              <p style={{ marginTop: 10 }}>“{t.text}”</p>
              <div className="who">
                <CowPhoto name={t.name} color="#2f7d54" size={40} />
                <div><b>{t.name}</b><div className="muted" style={{ fontSize: 12 }}>{t.role}</div></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PARTNERS */}
      <section className="section">
        <h2>Trusted integrations</h2>
        <p className="lead">Connect the tools and hardware you already use.</p>
        <div className="logos">{PARTNERS.map((p) => <span key={p}>{p}</span>)}</div>
      </section>

      {/* AI SECTION */}
      <section className="section alt" id="ai">
        <h2>Your AI assistant, on call 24/7</h2>
        <p className="lead">Ask questions in plain English and get answers from your live farm data.</p>
        <div className="two" style={{ maxWidth: 900, margin: '0 auto' }}>
          {['Which cows need vaccination this week?','Show today’s milk production.','Predict next month’s milk output.','Recommend feed adjustments.'].map((q) => (
            <div className="card reveal" key={q} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div className="icon" style={{ background: 'var(--primary-soft)', color: 'var(--primary)', width: 36, height: 36, borderRadius: 9, display: 'grid', placeItems: 'center' }}><Bot size={18} /></div>
              <span>{q}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ROI */}
      <section className="section" id="roi">
        <h2>Calculate your savings</h2>
        <p className="lead">See the potential ROI of moving to DairyOS.</p>
        <div className="two" style={{ maxWidth: 920, margin: '0 auto' }}>
          <div className="card">
            <div className="field"><label>Herd size (cows)</label><input className="input" type="number" value={roi.cows} onChange={(e) => setRoi({ ...roi, cows: +e.target.value })} /></div>
            <div className="field"><label>Milk price ($ / L)</label><input className="input" type="number" step="0.01" value={roi.pricePerL} onChange={(e) => setRoi({ ...roi, pricePerL: +e.target.value })} /></div>
            <div className="field"><label>Current waste / loss (%)</label><input className="input" type="number" value={roi.waste} onChange={(e) => setRoi({ ...roi, waste: +e.target.value })} /></div>
          </div>
          <div className="card" style={{ background: 'var(--primary-soft)', borderColor: 'transparent' }}>
            <div className="muted">Estimated monthly saving</div>
            <div style={{ fontFamily: 'Playfair Display', fontSize: 44, color: 'var(--primary)' }}>{fmt.money(saved)}</div>
            <div className="muted">Estimated yearly saving</div>
            <div style={{ fontFamily: 'Playfair Display', fontSize: 30 }}>{fmt.money(yearly)}</div>
            <button className="btn gold mt" onClick={() => navigate('#pricing')}>Start free trial</button>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="section alt" id="pricing">
        <h2>Simple, honest pricing</h2>
        <p className="lead">Start free for 14 days. No credit card required.</p>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div className="row" style={{ justifyContent: 'center', marginBottom: 24, gap: 8 }}>
            {PLANS.map((p) => (
              <button key={p.name} className={`btn ${plan === p.name ? 'gold' : 'ghost'} sm`} onClick={() => selectPlan(p.name)}>{p.name}</button>
            ))}
          </div>
          {(() => {
            const p = PLANS.find((x) => x.name === plan)!;
            return (
              <div className="card reveal" style={{ maxWidth: 720, margin: '0 auto', padding: 28 }}>
                {p.feat && <div className="tag" style={{ background: 'var(--primary)', color: '#fff', marginBottom: 12 }}>Most popular</div>}
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><h3 style={{ fontSize: 22 }}>{p.name}</h3><div className="muted">Billed monthly</div></div>
                  <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'Playfair Display', fontSize: 40 }}>{p.price}</div><small className="muted" style={{ fontSize: 16 }}>{p.per}</small></div>
                </div>
                <ul style={{ marginTop: 22, display: 'grid', gap: 12 }}>{p.feats.map((f) => <li key={f} className="row" style={{ gap: 10 }}><Check size={16} color="var(--primary)" /> {f}</li>)}</ul>
                <button className={`btn ${p.feat ? 'gold' : ''} mt`} style={{ marginTop: 24, width: '100%' }} onClick={startTrial}>{p.cta}</button>
              </div>
            );
          })()}
        </div>
      </section>

      {/* FAQ */}
      <section className="section" id="faq">
        <h2>Frequently asked questions</h2>
        <p className="lead">Everything you need to know before starting.</p>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {FAQ.map((f, i) => (
            <div className="faq-item reveal" key={i}>
              <div className="faq-q" onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                {f.q}<span>{faqOpen === i ? '−' : '+'}</span>
              </div>
              {faqOpen === i && <div className="faq-a">{f.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* CONTACT */}
      <section className="section alt" id="contact">
        <h2>Get in touch</h2>
        <p className="lead">Book a demo or ask a question — we reply within one business day.</p>
        <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
          {sent ? <div className="toast" style={{ position: 'static', borderLeftColor: 'var(--primary)' }}><Check color="var(--primary)" /> Thanks! We’ll be in touch soon.</div> :
          <form onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
            <div className="field"><label>Name</label><input className="input" required /></div>
            <div className="field"><label>Email</label><input className="input" type="email" required /></div>
            <div className="field"><label>Message</label><textarea className="input" rows={4} required /></div>
            <button className="btn gold" type="submit">Send message</button>
          </form>}
        </div>
      </section>

      {/* CTA */}
      <section className="section">
        <div className="cta-band">
          <h2>Ready to run a smarter farm?</h2>
          <p style={{ opacity: 0.9, margin: '10px 0 22px' }}>Join thousands of cows already managed with DairyOS.</p>
          <button className="btn light" onClick={() => { localStorage.setItem('selectedPlan', plan); navigate('/app'); }}>Open the dashboard →</button>
        </div>
      </section>

      <footer style={{ padding: '30px 6vw', borderTop: '1px solid var(--border)', color: 'var(--text-soft)', fontSize: 13 }}>
        © {new Date().getFullYear()} DairyOS · Smart Dairy Farm Management · Built with React + Chart.js
      </footer>

      {video && <Modal title="Product walkthrough" onClose={() => setVideo(false)}>
        <div style={{ aspectRatio: '16/9', borderRadius: 12, background: 'linear-gradient(135deg,#2f7d54,#173d2b)', display: 'grid', placeItems: 'center', color: '#fff' }}>
          <div style={{ textAlign: 'center' }}><Play size={48} /><div style={{ marginTop: 10 }}>2-min product walkthrough</div></div>
        </div>
      </Modal>}
    </div>
  );
}

function HeroStat({ icon, value, suffix, label, decimals = 0 }: { icon: React.ReactNode; value: number; suffix?: string; label: string; decimals?: number }) {
  return (
    <div className="card reveal" style={{ padding: 14 }}>
      <div className="icon" style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', color: 'var(--primary)', marginBottom: 8 }}>{icon}</div>
      <div className="value" style={{ fontSize: 26 }}><AnimatedCounter value={value} decimals={decimals} suffix={suffix} /></div>
      <div className="label" style={{ fontSize: 12 }}>{label}</div>
    </div>
  );
}
