const PARTNERS = [
  { name: "ABSA", logo: <svg viewBox="0 0 90 30" className="h-7 w-24"><rect x="0" y="3" width="24" height="24" rx="3" fill="#C8102E"/><text x="4" y="21" fontSize="14" fontWeight="900" fill="white" fontFamily="Arial">ABSA</text><text x="30" y="21" fontSize="13" fontWeight="700" fill="#C8102E" fontFamily="Arial">Group</text></svg> },
  { name: "Nedbank", logo: <svg viewBox="0 0 110 30" className="h-7 w-28"><rect x="0" y="4" width="22" height="22" rx="3" fill="#007A4D"/><text x="4" y="21" fontSize="13" fontWeight="900" fill="white" fontFamily="Arial">N</text><text x="28" y="22" fontSize="15" fontWeight="700" fill="#007A4D" fontFamily="Arial">NEDBANK</text></svg> },
  { name: "FNB", logo: <svg viewBox="0 0 80 30" className="h-7 w-20"><rect x="0" y="2" width="26" height="26" rx="3" fill="#E8781A"/><text x="4" y="22" fontSize="15" fontWeight="900" fill="white" fontFamily="Arial">FNB</text><text x="32" y="22" fontSize="13" fontWeight="700" fill="#E8781A" fontFamily="Arial">Bank</text></svg> },
  { name: "Standard Bank", logo: <svg viewBox="0 0 130 30" className="h-7 w-32"><rect x="0" y="3" width="22" height="24" rx="3" fill="#0033A0"/><text x="3" y="21" fontSize="13" fontWeight="900" fill="white" fontFamily="Arial">SB</text><text x="28" y="21" fontSize="12" fontWeight="700" fill="#0033A0" fontFamily="Arial">Standard Bank</text></svg> },
  { name: "Mercantile Bank", logo: <svg viewBox="0 0 140 30" className="h-7 w-36"><rect x="0" y="3" width="22" height="24" rx="3" fill="#5B2D8E"/><text x="3" y="21" fontSize="13" fontWeight="900" fill="white" fontFamily="Arial">MB</text><text x="28" y="21" fontSize="12" fontWeight="700" fill="#5B2D8E" fontFamily="Arial">Mercantile Bank</text></svg> },
  { name: "MTN Financial Services", logo: <svg viewBox="0 0 80 30" className="h-7 w-20"><rect x="0" y="2" width="26" height="26" rx="13" fill="#FFC200"/><text x="4" y="20" fontSize="12" fontWeight="900" fill="#333" fontFamily="Arial">MTN</text><text x="32" y="21" fontSize="10" fontWeight="600" fill="#555" fontFamily="Arial">Finance</text></svg> },
];

import { memo } from "react";

export const FinancialInstitutionsSection = memo(function FinancialInstitutionsSection() {
  return (
    <section className="bg-white py-14 border-t" style={{ borderColor: "#F0EEFF" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Trusted Partners</p>
          <h2 className="text-lg sm:text-xl font-bold text-gray-800">
            Find a Vink card through your preferred financial institution or partner network.
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-10 md:gap-14">
          {PARTNERS.map((p, i) => (
            <a key={i} href="#" title={p.name} className="opacity-50 hover:opacity-100 transition-all hover:scale-110">
              {p.logo}
            </a>
          ))}
        </div>
        <p className="text-center text-xs text-gray-400 mt-8">
          VMS partners with leading banks, telcos, and financial institutions across Southern Africa to deliver seamless payment experiences for commuters, drivers, and businesses.
        </p>
      </div>
    </section>
  );
});
