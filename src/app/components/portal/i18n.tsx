import { createContext, useContext, type ReactNode } from "react";

/**
 * The marshal's language. The English text of a screen is its own key: a string with no translation shows in English, so nothing is ever blank or wrong, and a language can be completed a screen at a time.
 * Afrikaans covers the marshal's screens; isiZulu and isiXhosa are a FIRST DRAFT of the most-used words only and need checking by first-language speakers before they are relied on
 * (the marshal is told this where they choose the language).
 */
export type Lang = "en" | "af" | "zu" | "xh";
export const LANGS: { code: Lang; label: string; reviewed: boolean }[] = [{ code: "en", label: "English", reviewed: true }, { code: "af", label: "Afrikaans", reviewed: true }, { code: "zu", label: "isiZulu", reviewed: false }, { code: "xh", label: "isiXhosa", reviewed: false }];
type Dict = Record<string, string>;
const AF: Dict = {
  "My earnings": "My verdienste", "Trips": "Ritte", "Commission earned": "Kommissie verdien", "Building up (not on a payslip yet)": "Besig om op te bou (nog nie op 'n betaalstrokie nie)", "Day": "Dag", "Rank": "Staanplek", "Trip fees": "Rietkoste", "Commission": "Kommissie",
  "My payslips": "My betaalstrokies", "Open": "Maak oop", "Close": "Maak toe", "Download PDF": "Laai PDF af", "Share on WhatsApp": "Deel op WhatsApp", "Email": "E-pos", "Net pay": "Netto betaling", "Query this line": "Bevraagteken hierdie lyn", "Query this trip": "Bevraagteken hierdie rit",
  "Send query": "Stuur navraag", "My queries": "My navrae", "Money check": "Geldkontrole", "My details and privacy": "My besonderhede en privaatheid", "Language": "Taal",
  "My shifts": "My skofte", "Add a shift": "Voeg 'n skof by", "Correct": "Korrigeer", "Save": "Stoor", "Started": "Begin", "Ended": "Geëindig", "Break (minutes)": "Pouse (minute)", "Reason": "Rede", "Waiting for approval": "Wag vir goedkeuring", "Approved": "Goedgekeur", "Not approved": "Nie goedgekeur nie",
  "Safety": "Veiligheid", "Report a problem at the rank": "Rapporteer 'n probleem by die staanplek", "Threat": "Dreigement", "Fight": "Geveg", "Robbery": "Roof", "Overcrowding": "Oorlading", "Injury": "Besering", "Other": "Ander", "Send report": "Stuur verslag", "My reports": "My verslae", "Note (optional)": "Nota (opsioneel)", "Photo (optional)": "Foto (opsioneel)",
  "My voice": "My stem", "Tell your association something": "Vertel jou vereniging iets", "What is it about?": "Waaroor gaan dit?", "Pay": "Betaling", "Hours": "Ure", "Queue": "Tou", "Conditions": "Toestande", "Benefits": "Voordele", "Send": "Stuur",
  "My record": "My rekord", "Work record": "Werkrekord", "Started working": "Begin werk", "Trips handled": "Ritte hanteer", "Verified": "Geverifieer", "Not yet verified": "Nog nie geverifieer nie", "Cover and benefits": "Dekking en voordele", "Registered": "Geregistreer", "Pending": "Hangende", "Not registered": "Nie geregistreer nie",
  "Proof of income": "Bewys van inkomste", "Create letter": "Skep brief", "Cash-out": "Kontant opneem", "You can draw up to": "Jy kan tot", "Draw": "Neem op", "Waiting to send": "Wag om te stuur", "Saved on your phone. It will send when you have signal.": "Op jou foon gestoor. Dit word gestuur as jy seine het.",
  "Sent.": "Gestuur.", "Yes": "Ja", "No": "Nee",
};
const ZU: Dict = { "Send": "Thumela", "Close": "Vala", "Open": "Vula", "Download PDF": "Landa i-PDF", "Yes": "Yebo", "No": "Cha", "Save": "Gcina", "Language": "Ulimi", "Email": "I-imeyili", "Share on WhatsApp": "Yabelana ku-WhatsApp", "Saved on your phone. It will send when you have signal.": "Igcinwe efonini yakho. Izothunyelwa uma uthola isignali." };
const XH: Dict = { "Send": "Thumela", "Close": "Vala", "Open": "Vula", "Download PDF": "Khuphela i-PDF", "Yes": "Ewe", "No": "Hayi", "Save": "Gcina", "Language": "Ulwimi", "Email": "I-imeyile", "Share on WhatsApp": "Yabelana nge-WhatsApp", "Saved on your phone. It will send when you have signal.": "Igcinwe kwifowuni yakho. Iza kuthunyelwa xa ufumana uphawu." };
const DICTS: Record<Lang, Dict> = { en: {}, af: AF, zu: ZU, xh: XH };
export const translate = (lang: Lang, text: string): string => DICTS[lang]?.[text] ?? text;
export const coverage = (lang: Lang): number => Object.keys(DICTS[lang] ?? {}).length;

const Ctx = createContext<Lang>("en");
export function LangProvider({ lang, children }: { lang: string | undefined; children: ReactNode }) { return <Ctx.Provider value={(["en", "af", "zu", "xh"] as string[]).includes(lang ?? "") ? (lang as Lang) : "en"}>{children}</Ctx.Provider>; }
/** The translate function for the marshal's chosen language: t("My earnings"). */
export function useT(): (text: string) => string { const lang = useContext(Ctx); return (text) => translate(lang, text); }
export const useLang = (): Lang => useContext(Ctx);
