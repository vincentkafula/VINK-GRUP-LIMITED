import { useState, useEffect } from "react";
import { X } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { Footer } from "../Footer";

interface Props { isOpen: boolean; onClose: () => void; initialTab?: string; }
const P = "#5C0A10";

const TABS = [
  { key: "privacy",    label: "Privacy Policy" },
  { key: "terms",      label: "Terms of Use" },
  { key: "regulatory", label: "Banking Regulations" },
  { key: "compliance", label: "Legal & Compliance" },
];

export function LegalComplianceViewer({ isOpen, onClose, initialTab }: Props) {
  const [activeTab, setActiveTab] = useState(initialTab ?? "privacy");
  useEffect(() => { if (isOpen && initialTab) setActiveTab(initialTab); }, [isOpen, initialTab]);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface-2">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-surface border-b border-line shadow-sm">
        <img loading="lazy" decoding="async" src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-2 transition-colors text-fg-muted"><X className="w-5 h-5" /></button>
      </div>

      {/* Hero */}
      <div className="py-12 px-6 text-white" style={{ background: `linear-gradient(135deg,${P},#0C0E14)` }}>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-black mb-2">Legal &amp; Compliance</h1>
          <p className="text-white/70 text-sm">VINK — a division of Vink Group (Pty) Ltd. · Reg: 2018/079316/07</p>
          <p className="text-white/50 text-xs mt-2">⚠️ Legal sections require review by a qualified South African attorney before final publication.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-surface border-b border-line px-5 flex overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className="px-5 py-3 text-sm font-medium flex-shrink-0 transition-colors border-b-2"
            style={{ borderBottomColor: activeTab === tab.key ? P : "transparent", color: activeTab === tab.key ? P : "#6B7280" }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10">

        {activeTab === "privacy" && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black" style={{ color: "var(--vk-crimson-text)" }}>POPIA Privacy Notice</h2>
            <div className="bg-surface rounded-2xl border border-line p-6 space-y-4 text-sm text-fg leading-relaxed">
              <p>VINK collects personal information including your name, ID number, contact details, and transaction history for the purposes of providing financial services, fraud prevention, and regulatory compliance.</p>
              <p>Your data is stored securely, <strong>never sold to third parties</strong>, and retained only for as long as required by law (generally 5 years from the end of the customer relationship).</p>
              <p>You have the right to access, correct, or request deletion of your personal information. Contact our Information Officer at <a href="mailto:privacy@vink.co.za" className="font-semibold" style={{ color: "var(--vk-crimson-text)" }}>privacy@vink.co.za</a>.</p>
              <p>VINK complies fully with the <strong>Protection of Personal Information Act (POPIA), Act 4 of 2013</strong>.</p>
            </div>
          </div>
        )}

        {activeTab === "terms" && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black" style={{ color: "var(--vk-crimson-text)" }}>Terms of Use</h2>
            <div className="bg-surface rounded-2xl border border-line p-6 space-y-4 text-sm text-fg leading-relaxed">
              <p>The VINK website and mobile application are provided for <strong>lawful personal and business use only</strong>.</p>
              <p>Unauthorised access, scraping, reverse engineering, or use of VINK intellectual property without written permission is prohibited.</p>
              <p>VINK reserves the right to suspend access to any user who breaches these terms. Full terms available at <span className="font-semibold" style={{ color: "var(--vk-crimson-text)" }}>vink.co.za/terms</span>.</p>
              <p>By using this platform you agree to comply with all applicable South African laws, including but not limited to the Electronic Communications and Transactions Act (ECTA) and the Financial Intelligence Centre Act (FICA).</p>
            </div>
          </div>
        )}

        {activeTab === "regulatory" && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black" style={{ color: "var(--vk-crimson-text)" }}>Banking Regulations</h2>
            <div className="bg-surface rounded-2xl border border-line p-6 space-y-4 text-sm text-fg leading-relaxed">
              <p>VINK operates in accordance with:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Financial Sector Regulation Act (FSRA), 2017</strong></li>
                <li><strong>National Credit Act (NCA), 2005</strong></li>
                <li><strong>Financial Intelligence Centre Act (FICA), 2001</strong></li>
                <li><strong>Protection of Personal Information Act (POPIA), 2013</strong></li>
                <li><strong>Electronic Communications and Transactions Act (ECTA), 2002</strong></li>
              </ul>
              <p>Vink Group (Pty) Ltd. is registered with the <strong>Companies and Intellectual Property Commission (CIPC)</strong> under registration number <strong>2018/079316/07</strong>.</p>
              <p>FSP and NCRCP registration numbers will be published upon completion of the licensing process. Regulatory enquiries: <a href="mailto:compliance@vink.co.za" className="font-semibold" style={{ color: "var(--vk-crimson-text)" }}>compliance@vink.co.za</a>.</p>
            </div>
          </div>
        )}

        {activeTab === "compliance" && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black" style={{ color: "var(--vk-crimson-text)" }}>Legal &amp; Compliance</h2>
            <div className="bg-surface rounded-2xl border border-line p-6 space-y-4 text-sm text-fg leading-relaxed">
              <p><strong>Company Name:</strong> Vink Group (Pty) Ltd.</p>
              <p><strong>Trading As:</strong> VINK</p>
              <p><strong>Company Registration Number:</strong> 2018/079316/07</p>
              <p><strong>VINK Tax Number:</strong> 9475452232</p>
              <p><strong>VINK Reference Number:</strong> 9465919196</p>
              <p><strong>Registered Address:</strong> 8 Rose Street, Cape Town CBD, State House Building, Cape Town, 8001</p>
              <p><strong>BBBEE Status:</strong> 100% Black-Owned Enterprise</p>
              <p><strong>Anti-Money Laundering:</strong> VINK applies a zero-tolerance policy to money laundering and terrorist financing. All suspicious transactions are reported to the Financial Intelligence Centre (FIC) as required by FICA.</p>
              <p><strong>Customer Due Diligence:</strong> VINK conducts FICA-compliant Know Your Customer (KYC) verification for all account holders, including identity verification, address verification, and ongoing transaction monitoring.</p>
              <p>For compliance enquiries: <a href="mailto:compliance@vink.co.za" className="font-semibold" style={{ color: "var(--vk-crimson-text)" }}>compliance@vink.co.za</a></p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
              ⚠️ <strong>Disclaimer:</strong> This content is for informational purposes only. It does not constitute legal advice. All legal and compliance documents must be reviewed and approved by a qualified South African attorney before publication.
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
