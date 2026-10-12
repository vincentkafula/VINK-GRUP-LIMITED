/**
 * The picture at the top of each Investor Relations card, as the design draws them (SVG, so they stay sharp at any size and cost no download).
 * These are fixed drawings written here, never built from anything a visitor types, so they are safe to put in the page as markup.
 */
const line = (c: string, pts: string) => `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
const grid = (c: string) => {
  let s = "";
  for (let i = 1; i < 6; i++) s += `<path d="M0 ${i * 22}H420" stroke="${c}" stroke-opacity=".18"/>`;
  for (let i = 1; i < 10; i++) s += `<path d="M${i * 42} 0V130" stroke="${c}" stroke-opacity=".12"/>`;
  return s;
};

export const CARD_ART: Record<string, string> = {
  a: '<rect width="420" height="130" fill="#0b2347"/>' + grid("#7fb2ff") + line("#4fd1ff", "10,110 60,96 100,102 150,70 200,84 250,48 300,60 350,30 410,14") +
    '<path d="M10 110 60 96 100 102 150 70 200 84 250 48 300 60 350 30 410 14V130H10z" fill="#4fd1ff" opacity=".12"/><path d="M330 96l70-30" stroke="#0b1226" stroke-width="9" stroke-linecap="round"/>',
  b: '<rect width="420" height="130" fill="#3a2a1c"/><rect width="420" height="130" fill="#1b2d4d" opacity=".55"/>' +
    [0, 1, 2, 3, 4, 5].map((i) => `<rect x="${30 + i * 34}" y="${100 - i * 11 - 14}" width="22" height="${i * 11 + 30}" fill="#5b8bd6" opacity=".7"/>`).join("") +
    [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((k) => `<ellipse cx="${300 + k * 30}" cy="${112 - r * 12}" rx="22" ry="7" fill="#e0a43c" stroke="#8a5a12" stroke-width="1.5"/>`).join("")).join(""),
  c: '<rect width="420" height="130" fill="#dbe3f1"/><rect x="40" y="40" width="190" height="110" rx="6" fill="#fff" transform="rotate(-8 130 90)"/><rect x="200" y="20" width="200" height="130" rx="8" fill="#16233f" transform="rotate(8 300 85)"/><rect x="214" y="34" width="172" height="86" rx="4" fill="#2d4a85" transform="rotate(8 300 85)"/><circle cx="110" cy="40" r="16" fill="#8a96b4"/><path d="M80 130c0-26 12-40 30-40s30 14 30 40z" fill="#26324f"/>',
  d: '<rect width="420" height="130" fill="#e9edf5"/><rect x="30" y="26" width="170" height="130" fill="#fff" transform="rotate(-10 115 90)" stroke="#c8d0e2"/><rect x="120" y="14" width="190" height="130" fill="#fff" transform="rotate(5 215 80)" stroke="#c8d0e2"/><path d="M140 40h110M140 54h90M140 68h100" stroke="#c3cadc" stroke-width="4" stroke-linecap="round"/><g fill="#2d7de0"><rect x="250" y="92" width="14" height="30"/><rect x="270" y="78" width="14" height="44"/><rect x="290" y="64" width="14" height="58"/></g><rect x="310" y="84" width="96" height="60" rx="6" fill="#222c44"/>',
  e: '<rect width="420" height="130" fill="#08234a"/>' + grid("#5da9ff") + line("#3be0ff", "0,100 40,70 70,88 110,40 150,66 190,30 240,56 290,20 340,52 420,18") +
    '<g fill="#7fe3ff" font-family="monospace" font-size="11" opacity=".75"><text x="300" y="30">30.68</text><text x="340" y="52">5.930</text><text x="318" y="74">38</text><text x="360" y="96">9.395</text><text x="300" y="116">5.950</text></g>',
  f: '<rect width="420" height="130" fill="#7ea4d6"/><rect x="170" y="0" width="250" height="130" fill="#1c3f78"/>' +
    [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<path d="M${190 + i * 26} 0V130" stroke="#9cc3f5" stroke-opacity=".5" stroke-width="2"/>`).join("") +
    [1, 2, 3, 4].map((i) => `<path d="M170 ${i * 28}H420" stroke="#9cc3f5" stroke-opacity=".5" stroke-width="2"/>`).join("") +
    '<rect x="30" y="22" width="150" height="76" rx="4" fill="#1a2a4a"/><text x="105" y="74" text-anchor="middle" fill="#fff" font-family="Inter,sans-serif" font-weight="300" font-size="40" letter-spacing="4">VINK</text><path d="M0 130 60 112l60 10 60-22" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/>',
};

/** The badge icon of each card. */
export const CARD_ICON: Record<string, string> = {
  doc: "M6 2h8l5 5v15H6zM14 2v5h5M9 13h7M9 17h5", bars: "M4 20h16M7 20v-7M12 20V6M17 20v-10",
  ppl: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 11a2.6 2.6 0 1 0 0-5.2M17 14.5a5 5 0 0 1 4 5.5",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4", db: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  trend: "M3 3v18h18M7 15l4-5 3 3 5-6",
};
