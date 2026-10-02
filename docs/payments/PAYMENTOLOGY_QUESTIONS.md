# Questions for Paymentology (draft email)

**Subject:** Manshya: onboarding, sandbox access and API documentation

Hello,

We are building Manshya, a customer banking and payments app, and plan to use Paymentology as our card issuer-processor with
BIN sponsorship. To integrate, please send the items below (or tell us where to find them).

**1. Access**
- Sandbox credentials and the API reference for our programme (OpenAPI/Postman if possible).
- Which environments exist (sandbox, UAT, production) and how credentials, IP allow-lists and certificates are managed in each.

**2. Real-time authorisation (most important)**
- The exact request and response format for the authorisation call to our server.
- How the request is signed or authenticated, and how we verify it.
- The deadline we must answer within, and what happens on a timeout (stand-in rules).
- Whether requests are retried, and the unique id we should use to make decisions idempotent.
- The decline reason codes we can return, and how partial approvals, reversals and refunds are signalled.
- Whether we decide against our own ledger (we hold balances) or Paymentology holds the balance.

**3. Card lifecycle**
- APIs to create virtual and physical cards, activate, freeze/unfreeze, block, replace and set limits and channel controls (tap, online, abroad, ATM).
- How card numbers and PINs are handled so that card data never touches our servers (tokens, secure display, PCI scope for us).

**4. Money**
- Funding model: who holds customer funds, how cards are loaded and how balances are reported.
- Settlement and reconciliation files: format, schedule and delivery.
- Fees, interchange and FX handling.

**5. Events and reporting**
- Webhooks for card, transaction and clearing events, with signing scheme and retry policy.
- Transaction history API.

**6. Wallets, security and disputes**
- Apple Pay / Google Pay provisioning: handled by you or by us?
- 3-D Secure and fraud monitoring included, and how we configure them.
- Chargeback and dispute process and API.

**7. Programme and compliance**
- BIN sponsorship terms in writing: whose BIN, who is the issuer of record, who carries scheme liability.
- Which licences or partner bank are required in our markets (South Africa, and Zambia if relevant) and which of these you provide.
- KYC/AML responsibilities (yours versus ours), and onboarding timeline for production approval.
- Certification or test scripts we must pass before go-live.

Kind regards,
Vincent Kafula
