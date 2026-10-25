import { ArrowUpRight, BarChart3, ChevronRight, CreditCard, Globe2, ShieldCheck, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import heroValidator from "../../imports/HeroValidator.webp";

const red = "#C8102E";
const redGradient = "linear-gradient(135deg, #C8102E, #7f1d1d)";

function MiniChart() {
  return (
    <div className="premium-chart" aria-label="Growing account balance chart">
      <svg viewBox="0 0 420 140" role="img" aria-hidden="true" preserveAspectRatio="none">
        <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={red} stopOpacity=".32" /><stop offset="1" stopColor={red} stopOpacity="0" /></linearGradient></defs>
        <path d="M0 117 C38 112 48 93 78 99 S116 79 145 87 S188 52 220 66 S260 48 285 54 S327 22 350 35 S391 7 420 14 V140 H0Z" fill="url(#chartFill)" />
        <path d="M0 117 C38 112 48 93 78 99 S116 79 145 87 S188 52 220 66 S260 48 285 54 S327 22 350 35 S391 7 420 14" fill="none" stroke={red} strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function PremiumHome({ onApply, onBusiness }: { onApply: () => void; onBusiness: () => void }) {
  return (
    <div className="premium-home">
      <motion.section className="premium-hero" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
        <div className="premium-ambient premium-ambient-one" />
        <div className="premium-ambient premium-ambient-two" />
        <div className="premium-shell premium-hero-grid">
          <div className="premium-hero-copy">
            <p className="premium-kicker"><span className="premium-kicker-dot" /> Banking, re-engineered for Africa</p>
            <h1>Money should move<br /><em>at your speed.</em></h1>
            <p className="premium-lede">VINK is the financial operating system for people who ride, drive and build the future of Africa.</p>
            <div className="premium-actions"><button className="premium-button" onClick={onApply}>Open a VINK account <ArrowUpRight size={17} /></button><button className="premium-text-button" onClick={onBusiness}>Explore business <ChevronRight size={16} /></button></div>
            <div className="premium-proof"><div><strong>R2.4B</strong><span>processed securely</span></div><div><strong>99.99%</strong><span>platform uptime</span></div><div><strong>24/7</strong><span>human support</span></div></div>
          </div>
          <div className="premium-dashboard-wrap">
            <div className="premium-dashboard-glow" />
            <div className="premium-dashboard">
              <div className="premium-dashboard-top"><span className="premium-logo-word">VINK<span>.</span></span><span className="premium-live"><i /> Live account</span></div>
              <div className="premium-balance-label">Available balance <span>•••</span></div><div className="premium-balance">R 84,920.40</div><div className="premium-balance-change">+R 12,840.00 <span>this month</span></div>
              <MiniChart />
              <div className="premium-dashboard-footer"><span>Jan 01</span><span>Today</span><button aria-label="Open dashboard"><ArrowUpRight size={16} /></button></div>
            </div>
            <div className="premium-float-card premium-float-transfer"><span className="premium-icon"><ArrowUpRight size={17} /></span><div><strong>Transfer complete</strong><small>Today, 09:42</small></div><b>+R 4,500</b></div>
            <div className="premium-float-card premium-float-card-mini"><CreditCard size={18} /><span>VINK Black<br /><small>•••• 2048</small></span></div>
          </div>
        </div>
      </motion.section>
      <motion.section className="premium-shell premium-bento-section" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}><div className="premium-section-heading"><div><p className="premium-kicker">The VINK advantage</p><h2>One platform.<br /><span>Every possibility.</span></h2></div><p>Designed around how Africa really moves — with clarity, control and zero friction.</p></div>
        <div className="premium-bento-grid"><article className="premium-bento premium-bento-large"><div className="premium-bento-icon"><BarChart3 size={20} /></div><p className="premium-card-label">Built for momentum</p><h3>See the whole picture.</h3><p>Real-time insights across every account, route and revenue stream. No spreadsheets. No surprises.</p><MiniChart /></article><article className="premium-bento"><div className="premium-bento-icon"><ShieldCheck size={20} /></div><p className="premium-card-label">Protected by design</p><h3>Your money, fortified.</h3><p>Smart security that stays out of your way and steps in when it matters.</p></article><article className="premium-bento premium-bento-red"><div className="premium-bento-icon"><Globe2 size={20} /></div><p className="premium-card-label">Made to move</p><h3>Across borders. Without friction.</h3><p>Payments, cards and tools that keep pace with your world.</p><button className="premium-card-link" onClick={onApply}>Get started <ArrowUpRight size={15} /></button></article></div>
      </motion.section>
      <motion.section className="premium-shell premium-quote" initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: 0.5 }}><div className="premium-quote-mark">“</div><blockquote>We are not building another bank. We are building the infrastructure for Africa's next chapter.</blockquote><div className="premium-quote-line"><span /> VINK / OUR NORTH STAR</div>      </motion.section>
    </div>
  );
}
