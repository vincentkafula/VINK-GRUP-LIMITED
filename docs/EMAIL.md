# Email: departments, sending and receiving

## The departments and their addresses

One list, in two places that a test keeps identical: `server/src/config/departments.ts` (routing) and `src/app/data/departments.ts` (the website). A second test fails if a public page shows a @vink.co.za address that is not in the list.

| Department | Address | For |
|---|---|---|
| Customer Support | support@vink.co.za | Wallet, card, account or app help |
| General Enquiries | info@vink.co.za | Anything else |
| Compliance | compliance@vink.co.za | Regulatory enquiries, reporting a concern |
| Privacy and Information Officer | privacy@vink.co.za | Access, correct or delete personal information (POPIA) |
| Careers | careers@vink.co.za | Jobs |
| Internship Programme | intern@vink.co.za | Internships and graduate placements |
| Sponsorships and Partnerships | sponsorships@vink.co.za | Proposals |
| Media Relations | media@vink.co.za | Press |

Adding a department means adding one line in both files (and creating the mailbox). Other addresses in the code (admin@, billing@, noc1@, owner@, treasury@ and the people on the management page) are internal accounts, not public departments.

## Sending (the website to a department)

The "Send us your feedback" form on the Contact page asks who the message is for and posts to `POST /api/contact`. The server:
1. checks the input (limits, a valid address, no line breaks in headers), catches simple bots with a hidden field, and limits one address to 8 messages an hour;
2. **stores the message first** (`contact_messages`), so it is never lost if email is down, and treats the same words sent again within ten minutes as one message;
3. emails the department, from "VINK <Department> <its address>", with the sender as the **Reply-To** so the department answers with one click;
4. emails the sender a receipt with a reference (`VK-XXXXXX`) and the response time;
5. if either email fails, keeps the message as "not delivered" and retries every five minutes (up to 12 times). After 15 minutes of not delivered the operations monitor sends an alert.

Staff (owner and superadmin): `GET /api/admin/contact?department=&status=`, `POST /api/admin/contact/:id/status` (open, answered, closed), `POST /api/admin/contact/retry`.

Before this change the form only kept the message in the server's memory: nothing was emailed and a restart lost it.

## Receiving (email to a department)

Email sent to a department address is received through Resend (`POST /api/inbound/webhook`), stored, and tagged with the department it was addressed to. Staff list it with `GET /api/inbound?department=support`.

## What has to be set up outside the code

- **Resend**: verify the vink.co.za domain (SPF/DKIM) so a department address can be the sender; set `RESEND_API_KEY` and `EMAIL_FROM` (for example `VINK <no-reply@vink.co.za>`). A department address is used as the sender only on that verified domain; otherwise the default sender is used.
- **Receiving**: point the domain's MX records at Resend for inbound, set `RESEND_WEBHOOK_SECRET`, and create the webhook for `email.received`.
- **Mailboxes**: the department addresses must exist somewhere a person reads them. If the people answering have their own inboxes, set `DEPT_FORWARD_<KEY>` (comma-separated, for example `DEPT_FORWARD_SUPPORT=a@vink.co.za,b@vink.co.za`) and the notification goes to them instead of the mailbox.
- **Alerts**: `ALERT_EMAIL_TO` and `ALERT_WEBHOOK_URL` (see `payments/GO_LIVE.md`).

Response times are shown as "1–2 business days" everywhere; change them in the department list once the support team has agreed what it can keep.
