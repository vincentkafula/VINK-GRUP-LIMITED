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

**Not covered:** job applications, and company verification. A new kind of application needs its type added to `APPLICATION_TYPE_TIERS` in `server/src/routes/applicationsRouter.ts` (that is what gives it a tier, and so a level and the approval requirement) and its confirmation screen needs `ApplicationIdentityStep`; a test fails if a screen that submits an application lacks it. For business and corporate applications this confirms **the person who is applying**, not the company: verifying a company is a separate Sumsub product ("KYB").

## How it works

1. After submitting, the applicant sees **Confirm your identity** on their confirmation screen (and, later, at the top of their signed-in home while the application is undecided; and on the sponsorship tracking page). It shows nothing at all when the checks are switched off.
2. They tick a consent box naming Sumsub, then press the button. Our server creates them at Sumsub under an opaque id (`ap-<application id>` or `sp-<id>`: no name, reference or ID number) and gets a short-lived token (15 minutes by default).
3. Sumsub's widget opens on our page. **The ID document and selfie go from the applicant's device straight to Sumsub. They never touch our server or database.**
4. Sumsub reviews, then calls our webhook (`POST /api/webhooks/sumsub`). We keep only where the check stands and its outcome (table `identity_checks`).
5. Staff see the result on the application, with Sumsub's reasons and a link to the full case. **Refresh from Sumsub** fetches the latest if an event was missed.

The applicant proves the application is theirs with its **reference and the email address on it**, or by being **signed in as its owner** (some applications were sent before the customer had a login, so the email is how the two are linked).

## The approval requirement

When Sumsub is switched on and the kind is required (table above), **moving an application to "approved" is refused** until Sumsub has confirmed the applicant. The reviewer sees why on screen (and a warning appears before they try). Declining, asking for more information and moving to review are never blocked. **Nothing is ever blocked while the checks are switched off**, so a missing setting cannot lock staff out.

An **owner or Super Administrator** can allow one approval anyway: they press *Allow approval anyway* in the identity check on that application and give a reason of at least 10 characters. The reason is kept with their name and the time, shown on the application, and written to the audit log. Nobody else can.

Applications that were submitted *before* the checks were switched on cannot be approved until the applicant confirms (they can do it from their signed-in home, or you can override). Plan for that when you switch it on.

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
