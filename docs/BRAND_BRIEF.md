# VINK brand designer brief

What the product looks like today (from the code), where it is inconsistent, and what we need a brand designer to produce.

## 1. What VINK is

A transport-native digital bank for South Africa: AFC tap-to-pay for taxis, wallet and cards, banking, loans, fleet tracking, taxi associations, investors, a public website, and a staff Management Panel with department mail. Audiences: passengers, drivers, taxi owners, associations, investors, businesses, staff.

## 2. What exists now

| Area | Today | Source |
|---|---|---|
| Logo | One raster file (`LOGO_FINAL.png`) used in about 38 places; a separate email-signature logo; no vector, no dark/mono/small versions | `src/imports/`, `public/signature/` |
| Mark | An eagle crest (referenced in the token file) | `src/styles/tokens.css` |
| Colour | Ink `#14161D`, crimson `#8B0000`, gold `#C9A84C`, warm paper `#FAF8F4`; status green/amber/red/blue | `src/styles/tokens.css` |
| Type | Plus Jakarta Sans (UI), Fraunces (headings), JetBrains Mono (numbers/codes) | `public/fonts`, `src/styles/fonts.css` |
| Icons | Lucide (generic line icons) plus 6 raster benefit icons | `src/imports/BenefitIcon*.png` |
| Imagery | A handful of PNG heroes (bus, card in phone, validator, traveller, plane, SIM) | `src/imports/Hero*.png` |
| Cards | A 3D card viewer; product names: Commuter Card, Driver Card, Visa Signature, Gold, Rewards Gold | `Card3DViewer.tsx` |
| Apps | Web, Android and iOS (Capacitor), desktop, POS terminal app, retail POS app | `android/`, `ios/`, `desktop/`, `terminal-app/`, `retail-pos-app/` |
| Email | Department signature template, same for every department | `server/src/services/mailSignature.ts` |

## 3. Problems a designer should fix

1. **Two competing colour identities.** The site tokens say crimson and gold on warm paper, but the app manifests (`manifest.json`, `manifest-admin.json`) and the install screen are dark green `#0F3D24`. The shadcn theme file (`theme.css`) is a third, near-black neutral scheme left over from a template. Pick one palette and retire the others.
2. **Hard-coded colours.** A scan finds hundreds of raw hex values in components (green `#10B981`, amber `#F59E0B`, red `#EF4444`, blue `#3B82F6`, plus extra crimsons `#9B1C1C`, `#5C0A10`, `#2E0B10`) instead of the tokens. The designer's palette must come with named roles so we can replace these.
3. **Font drift.** Inter, Plus Jakarta Sans, Fraunces and system fonts all appear. One heading face, one UI face, one mono face.
4. **Logo is a single raster file.** It cannot go on dark backgrounds, small sizes, embroidery, or print cleanly.
5. **Names are inconsistent.** "VINK", "VINK Group", "VINK Bank", "VINK Banking & Transport", "VINK Holdings" all appear. Product names are invented per page (TitanCredit, QuantumCredit, SovereignLine, NexusFinance, Super App, Ride, AFC).
6. **Generic icons and stock-feeling imagery.** Nothing yet says "taxi rank in Soweto" rather than "any fintech".

## 4. Deliverables we need

**Foundation**
- Brand strategy one-pager: positioning, promise, tone of voice (plain English plus isiZulu/Sesotho/Afrikaans considerations), what VINK is not.
- Naming architecture: when it is VINK, VINK Group (Pty) Ltd, and which product names are official (Wallet, AFC, Commuter Card, Driver Card, Business, Drive, Tokens, Finance). Fix the list; retire the rest.

**Identity**
- Logo system as SVG: primary, stacked, icon-only mark, one-colour, white-on-dark, minimum size, clear space, misuse examples. Check the eagle crest still works at 16 px and on a card.
- Colour palette with named roles (brand, brand-hover, accent, surface, text, muted, success, warning, danger, info) for light and dark, checked to WCAG AA (4.5:1). We already have AA-checked tokens, so the designer should adjust those, not start from zero.
- Typography: choose and license the faces, give a type scale (display to caption) and number style for balances and fares.
- Icon set or rules: custom icons for the main concepts (tap-to-pay, fare, wallet, rank, route, safety, token) replacing the raster benefit icons.
- Illustration and photography direction: real South African taxi-rank context, people, and how to treat the card/phone/validator hero shots.

**Product and channels**
- App icon and splash for Android, iOS, desktop and the POS terminal (current `assets/icon.png` and `splash.png`), plus a maskable PWA icon set (72 to 512 px).
- Physical and card designs: Commuter, Driver, Visa Signature, Gold; front, back and how they appear in the 3D viewer.
- Vehicle, rank and validator stickers and signage; the tap-to-pay decal passengers see.
- Social share image (1200x630, currently `og-image.png`), favicon set, and the site background.
- Email: signature, receipt/notification email header, statement and PDF letterhead.
- UI kit in Figma: buttons, inputs, cards, tables, status badges, empty states, charts, the Management Panel mail layout. Light and dark.

**Governance**
- Short brand guidelines PDF and an asset folder (SVG, PNG, fonts) so we can drop the files into `public/` and `src/imports/`.

## 5. Handover format (so we can ship it)

- Logos and icons as SVG; photos as WebP/JPG.
- Colours as a table of role, hex (light), hex (dark), and contrast ratio, in the same shape as `src/styles/tokens.css`.
- Fonts as WOFF2 with licence proof.
- A Figma file with variables for colour, type and radius.

## 6. Constraints the designer should know

- Accessibility: WCAG 2.2 AA minimum; many users are on low-end Android phones and mobile data, so images stay light.
- Light and dark themes both ship.
- Used in a taxi context: glare, small validator screens, quick glances, and low literacy in places. Icons and numbers carry meaning.
- Regulated: bank and card marks (Visa, SARB/FSCA wording) have their own usage rules.
