import { createContext, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * The marshal's language. The English text of a screen is its own key: text with no translation shows in English, so nothing is ever blank or wrong, and a language can be completed a piece at a time.
 * Two things use the dictionaries: t("Some text") for a string a component chooses, and LangProvider, which translates everything under it on the page (labels, buttons, placeholders and accessible names, in
 * the menus and in the older screens too) by replacing text it has an exact translation for. Only complete, standalone texts are translated: a sentence built from pieces and numbers stays in English rather than
 * becoming broken grammar. Anything a user typed that happens to equal a key (a rank called "Queue", say) would also be translated, which is an accepted limit.
 *
 * Afrikaans is complete for the marshal screens. isiZulu and isiXhosa cover the screens too, but they are a FIRST DRAFT and must be checked by first-language speakers before they are relied on: where I was not
 * confident of a word I left it in English rather than guess, so some terms (deductions, owed, waived) are still English there. The marshal is told this where they choose the language.
 */
export type Lang = "en" | "af" | "zu" | "xh";
export const LANGS: { code: Lang; label: string; reviewed: boolean }[] = [{ code: "en", label: "English", reviewed: true }, { code: "af", label: "Afrikaans", reviewed: true }, { code: "zu", label: "isiZulu", reviewed: false }, { code: "xh", label: "isiXhosa", reviewed: false }];
type Dict = Record<string, string>;

/** [English, Afrikaans, isiZulu, isiXhosa]. An empty string means "not translated yet": it shows English. */
const ROWS: [string, string, string, string][] = [
  // the menu and the dashboard
  ["Marshal Dashboard", "Marshal-paneel", "Ibhodi lemarshal", "Ibhodi lemarshal"], ["Rank queue and departures", "Staanplektou en vertrekke", "Ulayini wasenrenki nokuhamba", "Umgca werenki nokuhamba"],
  ["Ranks & queue", "Staanplekke en tou", "Amarenki nolayini", "Iirenki nomgca"], ["Loading", "Laai", "Ukulayisha", "Ukulayisha"], ["Earnings", "Verdienste", "Imali etholiwe", "Imali efunyenweyo"], ["Payslips", "Betaalstrokies", "Ama-payslip", "Ii-payslip"],
  ["Money check", "Geldkontrole", "Ukuhlola imali", "Ukuhlola imali"], ["Shifts", "Skofte", "Amashifti", "Amashifti"], ["Safety", "Veiligheid", "Ukuphepha", "Ukhuseleko"], ["My voice", "My stem", "Izwi lami", "Ilizwi lam"],
  ["My record", "My rekord", "Irekhodi lami", "Irekhodi lam"], ["Departures", "Vertrek", "Ukuhamba", "Ukuhamba"], ["Reports", "Verslae", "Imibiko", "Iingxelo"], ["Payments & trips", "Betalings en ritte", "Izinkokhelo nohambo", "Iintlawulo nohambo"],
  ["Requests & links", "Versoeke en skakels", "Izicelo nezixhumanisi", "Izicelo neekhonkco"], ["Bank account", "Bankrekening", "I-akhawunti yasebhange", "I-akhawunti yebhanki"],
  // the queue and loading
  ["Your ranks", "Jou staanplekke", "Amarenki akho", "Iirenki zakho"], ["The queue", "Die tou", "Ulayini", "Umgca"], ["Queue", "Tou", "Ulayini", "Umgca"], ["Rank", "Staanplek", "Irenki", "Irenki"], ["Depart", "Vertrek", "Hamba", "Hamba"], ["Departure", "Vertrek", "Ukuhamba", "Ukuhamba"],
  ["Remove", "Verwyder", "Susa", "Susa"], ["Add to queue", "Voeg by tou", "Engeza kulayini", "Yongeza kumgca"], ["Start loading", "Begin laai", "Qala ukulayisha", "Qala ukulayisha"], ["Cancel", "Kanselleer", "Khansela", "Rhoxisa"],
  ["Nobody is waiting. Add a vehicle below.", "Niemand wag nie. Voeg 'n voertuig hieronder by.", "Akekho olindile. Engeza imoto ngezansi.", "Akukho ulindileyo. Yongeza imoto ngezantsi."], ["Waiting", "Wag", "Kulindile", "Kulindile"],
  ["Passengers", "Passasiers", "Abagibeli", "Abakhweli"], ["Vehicle", "Voertuig", "Imoto", "Imoto"], ["Driver", "Bestuurder", "Umshayeli", "Umqhubi"], ["Online", "Aanlyn", "Kuxhumekile", "Kuxhunyiwe"], ["Offline", "Aflyn", "Akuxhumekile", "Akuxhunyiwe"],
  ["Reason", "Rede", "Isizathu", "Isizathu"], ["No reason", "Geen rede", "", ""], ["No departures in this period.", "Geen vertrekke in hierdie tydperk nie.", "Akukho ukuhamba kuleli banga.", "Akukho kuhamba kweli xesha."],
  // earnings and payslips
  ["My earnings", "My verdienste", "Imali engiyitholile", "Imali endiyifumileyo"], ["Trips", "Ritte", "Uhambo", "Uhambo"], ["Commission", "Kommissie", "Ikhomishini", "Ikhomishini"], ["Commission earned", "Kommissie verdien", "Ikhomishini etholiwe", "Ikhomishini efunyenweyo"],
  ["Building up (not on a payslip yet)", "Besig om op te bou (nog nie op 'n betaalstrokie nie)", "", ""], ["Day", "Dag", "Usuku", "Usuku"], ["Date", "Datum", "Usuku", "Umhla"], ["From", "Van", "Kusuka", "Ukusuka"], ["To", "Tot", "Kuya", "Ukuya"],
  ["Today", "Vandag", "Namuhla", "Namhlanje"], ["This week", "Hierdie week", "Kuleli viki", "Kule veki"], ["This month", "Hierdie maand", "Kuleli nyanga", "Kule nyanga"], ["Trip fees", "Rietkoste", "Izindleko zohambo", "Iindleko zohambo"],
  ["No trips in this period.", "Geen ritte in hierdie tydperk nie.", "Akukho uhambo kuleli banga.", "Akukho hambo kweli xesha."], ["No trips on this day.", "Geen ritte op hierdie dag nie.", "Akukho uhambo kuleli langa.", "Akukho hambo kolu suku."],
  ["My payslips", "My betaalstrokies", "Ama-payslip ami", "Ii-payslip zam"], ["Payslip", "Betaalstrokie", "I-payslip", "I-payslip"], ["Net pay", "Netto betaling", "Inkokhelo oyithola ekugcineni", "Intlawulo oyifumanayo"],
  ["Total earnings", "Totale verdienste", "", ""], ["Total deductions", "Totale aftrekkings", "", ""], ["Deductions", "Aftrekkings", "", ""], ["Day by day", "Dag vir dag", "Usuku nosuku", "Usuku ngosuku"],
  ["Not on a payslip yet", "Nog nie op 'n betaalstrokie nie", "Akukabi ku-payslip", "Akukabikho ku-payslip"], ["Not paid yet.", "Nog nie betaal nie.", "Akukakhokhelwa.", "Akukahlawulwa."], ["Paid", "Betaal", "Kukhokhiwe", "Kuhlawulwe"],
  ["No payslips yet. Your association issues one for each pay period.", "Nog geen betaalstrokies nie. Jou vereniging reik een uit vir elke betaaltydperk.", "Awekho ama-payslip okwamanje. Inhlangano yakho ikhipha elilodwa ngesikhathi ngasinye senkokhelo.", "Akukho ii-payslip okwangoku. Umbutho wakho ukhupha enye ngexesha ngalinye lentlawulo."],
  ["Download PDF", "Laai PDF af", "Landa i-PDF", "Khuphela i-PDF"], ["Share on WhatsApp", "Deel op WhatsApp", "Yabelana ku-WhatsApp", "Yabelana nge-WhatsApp"], ["Email", "E-pos", "I-imeyili", "I-imeyile"], ["Open", "Maak oop", "Vula", "Vula"], ["Close", "Maak toe", "Vala", "Vala"],
  ["Query", "Navraag", "Umbuzo", "Umbuzo"], ["Query this line", "Bevraagteken hierdie lyn", "Buza ngalo mugqa", "Buza ngalo mgca"], ["Query this trip", "Bevraagteken hierdie rit", "Buza ngalolu hambo", "Buza ngolu hambo"], ["Send query", "Stuur navraag", "Thumela umbuzo", "Thumela umbuzo"],
  ["My queries", "My navrae", "Imibuzo yami", "Imibuzo yam"], ["You have not queried anything.", "Jy het nog niks bevraagteken nie.", "Awukabuzi lutho.", "Awukabuzi nto."], ["Waiting for an answer", "Wag vir 'n antwoord", "Kulindele impendulo", "Kulindele impendulo"],
  ["Being looked at", "Word ondersoek", "Kuyabukwa", "Kuyajongwa"], ["Upheld", "Gehandhaaf", "", ""], ["Not upheld", "Nie gehandhaaf nie", "", ""], ["Your association", "Jou vereniging", "Inhlangano yakho", "Umbutho wakho"],
  ["Language", "Taal", "Ulimi", "Ulwimi"], ["My details and privacy", "My besonderhede en privaatheid", "Imininingwane yami nobumfihlo", "Iinkcukacha zam nabucala"], ["Marshal number", "Marshal-nommer", "Inombolo yemarshal", "Inombolo yemarshal"],
  // shifts
  ["My shifts", "My skofte", "Amashifti ami", "Amashifti am"], ["Add a shift", "Voeg 'n skof by", "Engeza ishifti", "Yongeza ishifti"], ["Shift", "Skof", "Ishifti", "Ishifti"], ["Correct", "Korrigeer", "Lungisa", "Lungisa"], ["Save", "Stoor", "Gcina", "Gcina"],
  ["Started", "Begin", "Kuqale", "Kuqale"], ["Ended", "Geëindig", "Kuphele", "Kuphelile"], ["Break (minutes)", "Pouse (minute)", "Ikhefu (imizuzu)", "Ikhefu (imizuzu)"], ["Waiting for approval", "Wag vir goedkeuring", "Kulindele ukugunyazwa", "Kulindele ukuvunywa"],
  ["Approved", "Goedgekeur", "Kugunyaziwe", "Kuvunyiwe"], ["Not approved", "Nie goedgekeur nie", "Akugunyaziwe", "Akuvunywanga"], ["Longer than the agreed shift", "Langer as die ooreengekome skof", "Ide kunoshifti obekiwe", "Inde kunoshifti ekwanyelweyo"],
  ["No break noted", "Geen pouse aangeteken nie", "Akukho ikhefu elibhaliwe", "Akukho khefu libhaliweyo"], ["Which rank?", "Watter staanplek?", "Yiliphi irenki?", "Yeyiphi irenki?"], ["What was it?", "Wat was dit?", "", ""],
  // safety
  ["Report a problem at the rank", "Rapporteer 'n probleem by die staanplek", "Bika inkinga erenki", "Chaza ingxaki erenki"], ["What happened", "Wat het gebeur", "Kwenzeke ni", "Kwenzeke ntoni"], ["Threat", "Dreigement", "Usongo", "Isoyikiso"], ["Fight", "Geveg", "Ukulwa", "Ukulwa"],
  ["Robbery", "Roof", "Ukuphanga", "Ukuphanga"], ["Overcrowding", "Oorlading", "Ukugcwala ngokweqile", "Ukuxinana ngokugqithisileyo"], ["Injury", "Besering", "Ukulimala", "Ukonzakala"], ["Other", "Ander", "Okunye", "Okunye"],
  ["Send report", "Stuur verslag", "Thumela umbiko", "Thumela ingxelo"], ["My reports", "My verslae", "Imibiko yami", "Iingxelo zam"], ["Note (optional)", "Nota (opsioneel)", "Inothi (akuphoqelekile)", "Inqaku (akunyanzelekanga)"],
  ["Photo (optional)", "Foto (opsioneel)", "Isithombe (akuphoqelekile)", "Ifoto (akunyanzelekanga)"], ["Note", "Nota", "Inothi", "Inqaku"], ["Reported. Your association has been told.", "Gerapporteer. Jou vereniging is ingelig.", "Kubikiwe. Inhlangano yakho yazisiwe.", "Kuchaziwe. Umbutho wakho wazisiwe."],
  ["Sent", "Gestuur", "Kuthunyelwe", "Kuthunyelwe"], ["Seen by your association", "Deur jou vereniging gesien", "Kubonwe yinhlangano yakho", "Kubonwe ngumbutho wakho"], ["Closed", "Gesluit", "Kuvaliwe", "Kuvaliwe"], ["You have not reported anything.", "Jy het nog niks gerapporteer nie.", "Awukabiki lutho.", "Awukachazi nto."],
  ["I need help now", "Ek het nou hulp nodig", "Ngidinga usizo manje", "Ndidinga uncedo ngoku"], ["Emergency", "Noodgeval", "Isimo esiphuthumayo", "Imeko engxamisekileyo"], ["Sending an emergency alert", "Noodwaarskuwing word gestuur", "Kuthunyelwa isixwayiso esiphuthumayo", "Kuthunyelwa isilumkiso esingxamisekileyo"],
  ["Emergency alert sent. Your association has been told.", "Noodwaarskuwing gestuur. Jou vereniging is ingelig.", "Isixwayiso esiphuthumayo sithunyelwe. Inhlangano yakho yazisiwe.", "Isilumkiso esingxamisekileyo sithunyelwe. Umbutho wakho wazisiwe."],
  ["Emergency alert saved on your phone. It will send as soon as you have signal.", "Noodwaarskuwing op jou foon gestoor. Dit word gestuur sodra jy seine het.", "Isixwayiso esiphuthumayo sigciniwe efonini yakho. Sizothunyelwa uma uthola isignali.", "Isilumkiso esingxamisekileyo sigcinwe kwifowuni yakho. Siza kuthunyelwa xa ufumana uphawu."],
  ["Getting your location", "Besig om jou ligging te kry", "Kufunwa indawo yakho", "Kufunwa indawo oyiyo"], ["We could not find your location, so the alert will go without it.", "Ons kon nie jou ligging vind nie, so die waarskuwing gaan daarsonder.", "Asikwazanga ukuthola indawo yakho, ngakho isixwayiso sizothunyelwa singayinayo.", "Asiyifumananga indawo oyiyo, ngoko isilumkiso siza kuthunyelwa singenayo."],
  // my voice
  ["Tell your association something", "Vertel jou vereniging iets", "Tshela inhlangano yakho", "Xelela umbutho wakho"], ["What is it about?", "Waaroor gaan dit?", "Kumayelana nani?", "Ngokwantoni?"], ["Pay", "Betaling", "Inkokhelo", "Intlawulo"], ["Hours", "Ure", "Amahora", "Iiyure"],
  ["Conditions", "Toestande", "Izimo", "Iimeko"], ["Benefits", "Voordele", "Izinzuzo", "Iingenelo"], ["Send", "Stuur", "Thumela", "Thumela"], ["What I have raised", "Wat ek geopper het", "Engikuphakamisile", "Endikuphakamisileyo"], ["Resolved", "Opgelos", "Kuxazululiwe", "Kusonjululwe"],
  ["You have not raised anything.", "Jy het nog niks geopper nie.", "Awukaphakamisi lutho.", "Awukaphakamisi nto."],
  // my record, cover and the letter
  ["Work record", "Werkrekord", "Irekhodi lomsebenzi", "Irekhodi lomsebenzi"], ["Started working", "Begin werk", "Ngaqala ukusebenza", "Ndaqala ukusebenza"], ["Trips handled", "Ritte hanteer", "", ""], ["Verified", "Geverifieer", "Kuqinisekisiwe", "Kuqinisekisiwe"],
  ["Not yet verified", "Nog nie geverifieer nie", "Akukaqinisekiswa", "Akukaqinisekiswa"], ["Cover and benefits", "Dekking en voordele", "Isivikelo nezinzuzo", "Ukhuseleko neengenelo"], ["Registered", "Geregistreer", "Kubhalisiwe", "Kubhalisiwe"], ["Pending", "Hangende", "Kulindile", "Kulindile"],
  ["Not registered", "Nie geregistreer nie", "Akubhalisiwe", "Akubhalisiwanga"], ["Injury cover", "Beseringsdekking", "Isivikelo sokulimala", "Ukhuseleko lokonzakala"], ["Savings scheme", "Spaarskema", "Uhlelo lokonga", "Inkqubo yokonga"], ["Funeral cover", "Begrafnisdekking", "Isikhwama sokungcwaba", "Ingxowa yomngcwabo"],
  ["Proof of income", "Bewys van inkomste", "Ubufakazi bemali engenayo", "Ubungqina bengeniso"], ["Create letter", "Skep brief", "Dala incwadi", "Yenza ileta"], ["Letter", "Brief", "Incwadi", "Ileta"], ["Letter made.", "Brief gemaak.", "Incwadi yenziwe.", "Ileta yenziwe."],
  ["Download my work record (PDF)", "Laai my werkrekord af (PDF)", "Landa irekhodi lami lomsebenzi (PDF)", "Khuphela irekhodi lam lomsebenzi (PDF)"],
  // cash-out
  ["Cash-out", "Kontant opneem", "Ukukhipha imali", "Ukukhupha imali"], ["Draw", "Neem op", "Khipha", "Khupha"], ["Pay me automatically each evening", "Betaal my outomaties elke aand", "Ngikhokhele ngokuzenzakalelayo njalo kusihlwa", "Ndihlawule ngokuzenzekelayo rhoqo ngokuhlwa"],
  // sending, saving and waiting
  ["Waiting to send", "Wag om te stuur", "Kulindele ukuthunyelwa", "Kulindele ukuthunyelwa"], ["Sent.", "Gestuur.", "Kuthunyelwe.", "Kuthunyelwe."], ["Choose", "Kies", "Khetha", "Khetha"], ["None.", "Geen.", "Lutho.", "Akukho."],
  ["Saved on your phone. It will send when you have signal.", "Op jou foon gestoor. Dit word gestuur as jy seine het.", "Igcinwe efonini yakho. Izothunyelwa uma uthola isignali.", "Igcinwe kwifowuni yakho. Iza kuthunyelwa xa ufumana uphawu."],
  ["Saved. Your association will approve it again.", "Gestoor. Jou vereniging sal dit weer goedkeur.", "Kugciniwe. Inhlangano yakho izoqinisekisa futhi.", "Kugciniwe. Umbutho wakho uza kuvuma kwakhona."], ["Yes", "Ja", "Yebo", "Ewe"], ["No", "Nee", "Cha", "Hayi"],
  ["We could not reach the server.", "Ons kon nie die bediener bereik nie.", "Asikwazanga ukufinyelela iseva.", "Asikwazanga ukufikelela kuseva."],
];
const build = (col: 1 | 2 | 3): Dict => Object.fromEntries(ROWS.filter((r) => r[col] && r[col] !== r[0]).map((r) => [r[0], r[col]]));
const DICTS: Record<Lang, Dict> = { en: {}, af: build(1), zu: build(2), xh: build(3) };
export const translate = (lang: Lang, text: string): string => DICTS[lang]?.[text] ?? text;
export const coverage = (lang: Lang): number => Object.keys(DICTS[lang] ?? {}).length;
/** Every English text that has a translation in at least one language. */
export const translatableTexts = (): string[] => ROWS.map((r) => r[0]);

const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const SKIP = /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/;
// What each translated piece of the page said in English, and what it was changed to, so it can be translated again into another language or put back. If something else changes the text meanwhile (the
// screen updated), what is there now is the new English and is translated afresh.
const textMemo = new WeakMap<Node, { en: string; shown: string }>();
const attrMemo = new WeakMap<Element, Record<string, { en: string; shown: string }>>();
/**
 * Puts the page, under `root`, into `lang`: every text and accessible name that has an exact translation is replaced, and anything previously translated is translated afresh or, for English, restored.
 * It changes only what is displayed (text nodes and attributes), never values the user typed.
 */
export function translateTree(lang: Lang, root: Node): void {
  const d = DICTS[lang] ?? {};
  const text = (n: Node) => {
    const memo = textMemo.get(n), raw = n.nodeValue ?? "", base = memo && raw === memo.shown ? memo.en : raw, t = base.trim(), tr = t && d[t], next = tr ? base.replace(t, tr) : base;
    if (next !== raw) n.nodeValue = next;
    if (tr) textMemo.set(n, { en: base, shown: next }); else if (memo) textMemo.delete(n);
  };
  const attrs = (el: Element) => {
    const memo = attrMemo.get(el) ?? {};
    for (const a of ATTRS) {
      const raw = el.getAttribute(a); if (raw === null) continue;
      const m = memo[a], base = m && raw === m.shown ? m.en : raw, t = base.trim(), tr = t && d[t];
      if (tr) { if (tr !== raw) el.setAttribute(a, tr); memo[a] = { en: base, shown: tr }; } else { if (base !== raw) el.setAttribute(a, base); delete memo[a]; }
    }
    if (Object.keys(memo).length) attrMemo.set(el, memo); else attrMemo.delete(el);
  };
  const walk = (n: Node) => {
    if (n.nodeType === 3) { text(n); return; }
    if (n.nodeType !== 1) return;
    const el = n as Element; attrs(el);
    if (SKIP.test(el.tagName) || el.hasAttribute("data-notranslate")) return;
    el.childNodes.forEach(walk);
  };
  walk(root);
}

const Ctx = createContext<Lang>("en");
const valid = (l: string | undefined): Lang => (["en", "af", "zu", "xh"] as string[]).includes(l ?? "") ? (l as Lang) : "en";
/** Provides the language to t(), and translates everything beneath it on the page, now and as the screen changes. English renders exactly as written, with no extra work. */
export function LangProvider({ lang, children }: { lang: string | undefined; children: ReactNode }) {
  const current = valid(lang), ref = useRef<HTMLDivElement>(null), was = useRef<Lang>("en");
  useLayoutEffect(() => {
    if (!ref.current) return;
    if (current !== "en" || was.current !== "en") translateTree(current, ref.current);                  // English from the start costs nothing; going back to English restores once
    was.current = current;
  });
  useEffect(() => {
    const root = ref.current; if (!root || current === "en") return;
    const opts: MutationObserverInit = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS };
    const mo = new MutationObserver((muts) => {
      mo.disconnect();                                                                      // our own changes must not trigger us again
      for (const m of muts) { if (m.type === "childList") m.addedNodes.forEach((n) => translateTree(current, n)); else translateTree(current, m.target); }
      mo.observe(root, opts);
    });
    mo.observe(root, opts); return () => mo.disconnect();
  }, [current]);
  return <Ctx.Provider value={current}><div ref={ref} style={{ display: "contents" }} data-lang={current}>{children}</div></Ctx.Provider>;
}
/** The translate function for the marshal's chosen language: t("My earnings"). */
export function useT(): (text: string) => string { const lang = useContext(Ctx); return (text) => translate(lang, text); }
export const useLang = (): Lang => useContext(Ctx);
