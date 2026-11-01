# Confirming that a real person is applying (Sumsub)

Applicants confirm who they are with [Sumsub](https://sumsub.com): they photograph their ID document and take a selfie, and Sumsub checks the document and that the face matches. The result appears on the application for the people who decide it, and, for the kinds of application that require it, **an application cannot be approved until the identity is confirmed**.

**Status: built and tested against a stand-in for Sumsub, not yet against Sumsub itself.** The code was written from Sumsub's public documentation and tested end to end with a stand-in that rejects any badly signed request. It has not been run against a real Sumsub account (the build environment could not reach Sumsub). Work through "First run in the sandbox" before switching it on for real applicants.

## What it covers

Every application that arrives at `POST /api/applications` goes into the same table and is checked the same way: **account applications** (personal, business, corporate), **credit cards**, **personal loans**, **insurance** (life, funeral, vehicle), **business and corporate loans**, **SIM**, **vehicle tracking**, and the **invest** and **rewards** service forms. **Sponsorship applications** use the same engine.

| Kind | Sumsub level used | Approval needs a confirmed identity? |
| --- | --- | --- |
| Personal tier (accounts, cards, personal loans, insurance, SIM, services) | `SUMSUB_LEVEL_PERSONAL`, else `SUMSUB_LEVEL_NAME` | Yes, by default |
| Business tier (business accounts, business loans) | `SUMSUB_LEVEL_BUSINESS`, else the default | Yes, by default |
| Corporate tier (corporate accounts and loans) | `SUMSUB_LEVEL_CORPORATE`, else the default | Yes, by default |
| Sponsorship | `SUMSUB_LEVEL_SPONSORSHIP`, else the default | No: shown to staff, who decide |

**Business verification (KYB)** is covered separately, below: for business and corporate applications it verifies the *company* as well as the person applying. **Not covered:** job applications and sponsorships' organisations. A new kind of application needs its type added to `APPLICATION_TYPE_TIERS` in `server/src/routes/applicationsRouter.ts` (that is what gives it a tier, and so a level and the approval requirement) and its confirmation screen needs `ApplicationIdentityStep`; a test fails if a screen that submits an application lacks it. 

## How it works

1. After submitting, the applicant sees **Confirm your identity** on their confirmation screen (and, later, at the top of their signed-in home while the application is undecided; and on the sponsorship tracking page). It shows nothing at all when the checks are switched off.
2. They tick a consent box naming Sumsub, then press the button. Our server creates them at Sumsub under an opaque id (`ap-<application id>` or `sp-<id>`: no name, reference or ID number) and gets a short-lived token (15 minutes by default).
3. Sumsub's widget opens on our page. **The ID document and selfie go from the applicant's device straight to Sumsub. They never touch our server or database.**
4. Sumsub reviews, then calls our webhook (`POST /api/webhooks/sumsub`). We keep only where the check stands and its outcome (table `identity_checks`).
5. Staff see the result on the application, with Sumsub's reasons and a link to the full case. **Refresh from Sumsub** fetches the latest if an event was missed.

The applicant proves the application is theirs with its **reference and the email address on it**, or by being **signed in as its owner** (some applications were sent before the customer had a login, so the email is how the two are linked).

## Verifying the business (KYB)

For a **business or corporate application** (a business account, a business or corporate loan, a business started through the application form) there are two checks, because a real person applying does not make the company they name real:

1. **The person** (as above): is the applicant who they say?
2. **The business** (KYB): is the company real and registered, and who are its directors and owners? The applicant adds the company's registration documents and the details of its directors and owners in Sumsub's own widget ("Verify your business", shown beneath "Confirm your identity"). **The documents and the directors' and owners' details go to Sumsub and never to VINK.** We keep only where the check stands and its outcome (table `business_checks`).

The business is started from whatever the application already says (its name and registration number, read from wherever the screen keeps them, and often blank: the widget asks for anything missing). Staff see a second panel, **Business verification (Sumsub KYB)**, with the same refresh, the same link to the full case and the same override as the person's check.

**When approval needs it.** With KYB switched on, a business or corporate application cannot be approved until **both** the person is confirmed **and** the business is verified; the refusal and the warning before it say which one is missing. An owner or Super Administrator can override each separately, with a reason (audited as `application.kyb_override`). Personal applications never have a business check. Nothing is blocked while KYB is off.

**Switching it on needs a company level.** Sumsub verification levels are made for either people or companies, and a person's level cannot verify a company, so there is **no default**: leave `SUMSUB_LEVEL_KYB` empty and business verification stays off (identity checks carry on unchanged).

| Variable | Value |
| --- | --- |
| `SUMSUB_LEVEL_KYB` | the exact name of a **company** level made in the Sumsub dashboard (applicant type: company) |
| `SUMSUB_KYB_REQUIRED_FOR` | optional: `business`, `corporate` (comma list) or the word `none`. Default `business,corporate`; blank or misspelt uses the default |

The webhook is the same one: events for the business arrive at `/api/webhooks/sumsub` and are matched to the right check. Events Sumsub sends about the directors and owners it adds behind a company belong to Sumsub's own records, not to a VINK application, and are acknowledged and ignored.

**Confirm in the Sumsub sandbox before relying on it** (the stand-in used for the tests follows Sumsub's public documentation and has not been run against Sumsub):

1. Creating a company applicant works as we send it: `POST /resources/applicants?levelName=<company level>` with `type: "company"` and `info.companyInfo` (`companyName`, `registrationNumber`). If Sumsub wants a different shape, only `createApplicant` in `services/sumsub/client.ts` changes.
2. The company level opens in the widget for the access token we issue, and the applicant can add documents, directors and owners.
3. Reviews of a company arrive at the webhook as `applicantReviewed` for the company applicant and are shown on the right check. A company's directors and owners may be reviewed as separate applicants; whether the company's own answer waits for them is Sumsub's behaviour.
4. A GREEN company review moves the business panel to *Verified* and allows approval; a RED review shows its reasons to staff only.
5. A level that is not a company level, set by mistake as `SUMSUB_LEVEL_KYB`, is refused by Sumsub: applicants see "We could not start the check just now" and the server log says why.

The directors' and owners' personal details are processed by Sumsub on the applicant's behalf, so your privacy notice, consent wording and data agreement with Sumsub should cover them; have your legal adviser review the company consent wording on the card.

## The approval requirement

When Sumsub is switched on and the kind is required (table above), **moving an application to "approved" is refused** until Sumsub has confirmed the applicant. The reviewer sees why on screen (and a warning appears before they try). Declining, asking for more information and moving to review are never blocked. **Nothing is ever blocked while the checks are switched off**, so a missing setting cannot lock staff out.

An **owner or Super Administrator** can allow one approval anyway: they press *Allow approval anyway* in the identity check on that application and give a reason of at least 10 characters. The reason is kept with their name and the time, shown on the application, and written to the audit log. Nobody else can.

Applications that were submitted *before* the checks were switched on cannot be approved until the applicant confirms (they can do it from their signed-in home, or you can override). Plan for that when you switch it on.

## What VINK keeps, and what that obliges you to do

**Through Sumsub:** the ID document, selfie, company documents and the details of directors and owners go to Sumsub and stay there. VINK keeps only the result of each check (tables `identity_checks` and `business_checks`).

**Through the "Start Now" application form:** that form asks for the applicant's **ID number, passport number, selfie photo, driver's licence and vehicle documents** and **VINK keeps them** in the application record (`applications.tier_data`). The consent on the identity card says exactly this ("VINK keeps the result of the check, together with the information I gave in my application"); do not change it back to say VINK keeps nothing. As things stand:

- They are stored as ordinary text. The platform's field encryption (`DATA_ENCRYPTION_KEY`, used for two-factor secrets and bank links) is **not** applied to application data.
- The staff applications screen prints every text value in the record, so reviewers see the ID number as plain text, and the selfie (stored as a long text string) is printed with it. Every reviewer role can open applications.
- There is no retention limit: nothing deletes an application's details after a period.

An ID number is personal information, and a selfie used to confirm who someone is is biometric information, which POPIA treats as special personal information with stricter conditions. Decide with your legal adviser: how long to keep them, who may see them (and whether staff should see them masked), whether to encrypt them at rest, and that your privacy notice names them and says why. **None of this has been changed:** only the consent wording was corrected to match what is stored.

## What we store

Table `identity_checks`, one row per application (`kind` is `application` or `sponsorship`): Sumsub's applicant id, our opaque external id, the level, the stage, Sumsub's answer (GREEN/RED), whether a retry is allowed, its reasons and notes (staff only), the time consent was given, the number of attempts, and any override (reason, who, when). Table `identity_events` only remembers which events were applied, so a repeated event is applied once.

What an applicant sees: the stage and what to do next. After a RETRY they also see Sumsub's `clientComment` (the text Sumsub marks as fit for the applicant). They never see the reason labels or the moderator's notes.

## Setting it up

In the Sumsub dashboard (menu names may differ slightly):

1. **Create a verification level** (or one per kind of applicant): an ID document step and a selfie/liveness step are the usual minimum. Note each exact name.
2. **Create an App Token** (Dev space > App tokens). Keep the **Secret key** it shows: it is shown once.
3. **Add a webhook** (Dev space > Webhooks):
   - URL: `https://<your backend address>/api/webhooks/sumsub`
   - Secret key: a long random value you choose (e.g. `openssl rand -hex 32`)
   - Signature algorithm: **HMAC_SHA256_HEX** (SHA1 and SHA512 are also accepted)
   - Events: `applicantCreated`, `applicantPending`, `applicantOnHold`, `applicantReviewed`, `applicantReset` (extra events are acknowledged and ignored)
4. Set these on the **backend** service (Railway) and redeploy:

| Variable | Value |
| --- | --- |
| `SUMSUB_APP_TOKEN` | the App Token |
| `SUMSUB_SECRET_KEY` | the Secret key shown with it |
| `SUMSUB_WEBHOOK_SECRET` | the webhook secret from step 3 |
| `SUMSUB_LEVEL_NAME` | the default level's exact name (default `basic-kyc-level`) |
| `SUMSUB_LEVEL_PERSONAL` / `_BUSINESS` / `_CORPORATE` / `_SPONSORSHIP` | optional: a level for that kind of applicant |
| `SUMSUB_LEVEL_KYB` | optional: a **company** level, which switches on business verification (see above) |
| `SUMSUB_KYB_REQUIRED_FOR` | optional: which business kinds must be verified before approval (see above) |
| `SUMSUB_REQUIRED_FOR` | optional: which kinds must be confirmed before approval, e.g. `personal,business,corporate,sponsorship`, or the word `none` to switch the requirement off. Default `personal,business,corporate`; a blank or misspelt value uses the default, so a slip can never silently disable it |

Leave `SUMSUB_APP_TOKEN` or `SUMSUB_SECRET_KEY` empty and the whole feature stays off: applicants see nothing, Sumsub is never called, and nothing is blocked. Without `SUMSUB_WEBHOOK_SECRET` the webhook answers 503 and trusts nothing.

**Deploy the backend first, then the website.** The website shows nothing until the server supports it, so this order is safe either way, but the backend must be live for approvals to be enforced.

## First run in the sandbox (do this before real applicants)

Sumsub gives every account a sandbox. Use a sandbox App Token first, then confirm each of these. They are the points where the stand-in could differ from the real service:

1. **Start a check** on a test application (personal and business), tick consent, press the button. You should get Sumsub's widget with no error. If the server log shows `Sumsub answered 401`, the App Token or Secret key is wrong. `Sumsub answered 400`/`404` with a detail line usually means a level name is wrong.
2. **Complete it** with Sumsub's sandbox test documents. The application should show *being checked*, then *confirmed* (or the reasons, for staff).
3. **Try to approve** a test application before and after it is confirmed. Before: refused with a reason. After: allowed.
4. **Webhook delivery.** In Sumsub's webhook log every delivery should show 200. A 401 means the secret or algorithm differs from what is set here.
5. **Refresh.** On the staff screen press *Refresh from Sumsub* and confirm it reports the same stage.
6. **Content.** Confirm the answers carry the fields we read: `reviewStatus`, `reviewResult.reviewAnswer`, `reviewRejectType`, `rejectLabels`, `moderationComment`, `clientComment`, `correlationId`, `createdAtMs`.

## Privacy and consent (needs your sign-off)

Applicants' identity documents are processed by a third party in another country. Before going live, have your legal adviser confirm: the consent wording on the card, that Sumsub is named in your privacy notice as an operator, the data-processing agreement and the region Sumsub stores data in, and how long Sumsub keeps documents (set in its dashboard). The consent time is recorded per application. Nothing here is legal advice.

## Insurance and personal loans

Both have their own application (`ProductApplicationViewer`, described by `src/app/data/productApplications.ts`), reached from the **Insure** tab and the **Loan** tab of the personal products page, from the product selector, and from the Insurance tile. Each is a quote request or an application, not cover or an offer, and says so before and after applying. They do **not** ask for an ID number, health details or bank details (the identity check takes the ID; an insurer asks health questions later).

**Before these go to the public, your legal adviser must confirm the regulatory position.** Insurance needs a licensed insurer or an authorised partner, and consumer credit needs credit-provider registration, an affordability assessment and a lawful credit check. The loan application records the applicant's consent to a credit check but **does not run one**.

## Things found while building this (not part of the identity check)

- **The product selector opened nothing.** Choosing a product and pressing "Apply Now" closed the selector and opened no application (the selector reported a product where the app expected a category). Fixed, with a test that reads the app shell.
- **Personal loans opened the business loan form.** They now open the personal loan application, and "Apply now" on a product starts it with that product chosen.
- **Confirmation screens made claims that were not true** (account "opened" and "active", card "approved and issued" with delivery in 5–7 days, a welcome bonus "credited", identity "verified via fingerprint and selfie", "a confirmation email has been sent" although the server sends none, and a reference number made up in the browser on the business loan screen). They now say the application was received. `applicationScreens.honesty.test.ts` fails if such claims come back.
- **The staff applications screen failed silently** when a status change was refused, and never loaded an application's full detail. It now shows the server's reason and loads the detail.
- **For you to check, not changed:** the loan cards in the product selector claim "Same-day Approval", interest of 12.5%–24.5%, and "R1,000 – R250,000", and the FlexiLoan card (a personal loan) lists home-loan features ("Up to 100% LTV", "20-year term"). The personal loan form accepts up to R2,000,000 over up to 84 months, which does not match those cards.

## If something goes wrong

| What you see | Likely cause |
| --- | --- |
| Applicants see "We could not start the check just now" | Sumsub unreachable or refused us; the server log line begins `[sumsub]` and says why (never prints a secret) |
| The webhook log in Sumsub shows 401 | wrong `SUMSUB_WEBHOOK_SECRET`, or the body was altered on the way |
| The webhook log shows 503 | `SUMSUB_WEBHOOK_SECRET` is not set |
| An applicant finished but staff see "in progress" | the event did not arrive: press *Refresh from Sumsub* |
| Nothing is offered to applicants | `SUMSUB_APP_TOKEN` or `SUMSUB_SECRET_KEY` is empty |
| A reviewer cannot approve an application | the identity is not confirmed yet: ask the applicant to confirm, or an owner/Super Administrator can allow it with a reason |

If your site ever gets a Content-Security-Policy, allow `https://static.sumsub.com` for scripts and frames, `https://api.sumsub.com` and `https://*.sumsub.com` for connections and frames, and camera access for the widget. There is none today.
