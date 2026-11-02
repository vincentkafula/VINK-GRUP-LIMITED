# VINK Banking, VINK Pay and VINK Tap: separate dashboards

VINK has three products. Each has **its own dashboard**; a person chooses which to use or set up. They used to be tabs in one "business dashboard", which gave a personal account Pay and Tap tabs and business pages it could not use, and told nobody what each product was for.

| Product | For | Address | What it is |
| --- | --- | --- | --- |
| **VINK Banking** | everyone with a bank account, personal or business | `/dashboard/banking` | accounts, statements, payments at home and abroad, cards, bills, debit orders, rewards, insurance, vehicle licence |
| **VINK Pay** | anyone who wants to take online payments on their website | `/dashboard/pay` | transactions, subscriptions, payment requests, payouts, fees and reports, payment buttons, integration |
| **VINK Tap** | drivers and the businesses that run card machines | `/dashboard/tap` | card machines, in-person transactions, prepaid sales |

After signing in, a business (customer) account lands on **"What would you like to do?"** (`/dashboard`): the three products as separate choices, each saying who it is for, whether it is already set up on this account (a bank account, verification, a card machine), and one action. Someone with no bank account is sent to the account application. A personal account reaches the same dashboards from **My Account**. Inside a dashboard, the badge in the header (the product's name) takes you back to choose another.

## Personal and business accounts

A personal account can use **all three** products. Some **services** are for business accounts only, and are neither shown to a personal account nor allowed by the server:

| Business-only | Where |
| --- | --- |
| business credit lines and loans, business funding | Banking |
| business contents insurance | Banking (funeral and life cover are available to everyone) |
| business information, beneficial owners, user management | Account (every product) |
| a shop's categories, products and staff | Tap |

Banking and rewards (the reward card) are open to personal accounts.

An account is **personal** when its login role is `personal`; any other customer login is a **business**, as on the server. API keys and callers that do not say are treated as businesses, so nothing that worked before stops working.

## Where the rules live

- **One list for the screens:** `src/app/components/manshya/products.ts` (the products, who they are for, `BUSINESS_ONLY_PAGES`). The menus (`nav.ts`, `menuFor`), the chooser (`ProductChooser.tsx`) and the page guard in `ManshyaDashboard.tsx` read it.
- **One list for the server:** `server/src/manshya/core/routes.js`, `BUSINESS_ONLY` (`/credit`, `/account/ubos`, `/account/users`, `/pos/categories`, `/pos/products`, `/pos/staff`) and the business insurance rule in `insurance.js`. A test fails if the two lists drift apart.
- **To make a service business-only:** add its page id to `BUSINESS_ONLY_PAGES` and its API path to `BUSINESS_ONLY`, then update the table above. A test checks each pairing.
- **To add a page to a product:** register it in `pages/`, add it to that product's menu in `nav.ts`. A test fails if a menu entry has no page behind it (the one marked coming soon, "Business funding", is the only exception).

## Not decided yet

- **Drivers.** The banking server only accepts `customer` and `personal` logins, so a `driver` login cannot open VINK Tap. Letting drivers in needs a rule for what a driver may see and do (for example only the card machine pages), which has not been set. Until then a driver uses Tap through a personal account.
- **Applying for Pay and Tap.** They have no separate application: a merchant record appears on first visit, and Tap is set up by adding a card machine inside its dashboard. The chooser shows what is still to do, but there is nothing to "apply" for except a bank account.
