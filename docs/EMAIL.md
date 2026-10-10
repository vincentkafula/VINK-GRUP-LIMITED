# Email: departments, sending and receiving

## The departments and their addresses

One list, in two places that a test keeps identical: `server/src/config/departments.ts` (routing) and `src/app/data/departments.ts` (the website). A second test fails if a public page shows a @vink.co.za address that is not in the list.

| Department | Address | For |
|---|---|---|
| Customer Support | support@vink.co.za | Wallet, card, account or app help |
| Sales | sales@vink.co.za | Sales enquiries about VINK products and services |
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

## Staff: department mail in the Management Panel

**Management Panel > Department mail** is where managers read and send department email.

- **Owners and superadmins see every department**, plus any email that arrived at an address that is not a department's.
- **Each department has its own mailbox view.** A department manager sees only the department(s) they are approved for.
- **How a department manager is created:** the department's name is a section in the same approval system as the other management sections. A person either applies under **Apply for a Section** (the department names are listed there) and a Super Administrator approves, or their **job application for that department is approved** (the approval already grants the section named in the application; the department in the job application must be written exactly as the department's name, for example "Sales"). Approval gives access at once; removing the section removes it.
- **What a manager can do:** read website messages and incoming email (plain text only), reply (sent from the department's address, with the department address as the reply address, so the customer's answer comes back to the department), mark messages answered or closed, see what has been sent, and write a new email from the department. Every send records who sent it, and each person is limited to 40 emails an hour.
- API: `GET /api/mail/departments`, `GET /api/mail/messages?department=&box=inbox|sent&status=`, `GET /api/mail/messages/:kind/:id`, `POST /api/mail/messages/:kind/:id/reply`, `POST /api/mail/messages/:kind/:id/status`, `POST /api/mail/send` (kind is `web` for a website message, `email` for incoming email).
- Incoming email only appears here once inbound email is set up (see above). Until then the inbox shows website messages only.

**Careers page names:** a job application for "Legal & Compliance" or "Client Services" opens the Compliance and Customer Support mailboxes (the aliases are in `SECTION_ALIASES`, kept identical on the server and the website by a test). A job application for "Sales" opens Sales as it is.

## Attachments

- **Incoming email:** the webhook records each attachment (name, type, size) and fetches the files from Resend in the background, keeping them in the database (`mail_files`), so they stay available. If a fetch fails, the file is fetched again, with a fresh link, the first time someone opens it. A file over 50 MB is listed but not kept ("too large to keep").
- **Opening one:** the message in **Department mail** lists its attachments with a Download button. Only people who manage that department (and owners and superadmins) can download; each download is written to the audit log. A file always downloads and is never shown in the browser (attachment disposition, `nosniff`, a sandboxing CSP), so a file from outside cannot run as a page on our site. Types that run on a computer (exe, bat, js, msi, iso and so on) carry a warning and ask before downloading.
- **Sending:** in a reply or a new email, **Attach files** (or drop files) uploads each file, privately, until the email is sent. Up to 5 files, 50 MB each, 60 MB together. Up to **15 MB together** goes as ordinary attachments. **More than 15 MB** is sent as **expiring download links** (valid 7 days, at `/api/shared-files/<token>`, no sign-in, the link is the secret), because most mailboxes refuse big attachments. If the email cannot be sent, the files are kept for another try; unsent uploads are thrown away after a day. Sent files are kept with the email and can be downloaded from its reply.
- **Settings:** `PUBLIC_API_URL` (default `https://api.vink.co.za`) is where the download links point. Code: `server/src/services/mailFiles.ts`; limits are repeated in `src/app/components/portal/MailAttachments.tsx`.

### Virus checking

Every file is checked before it is kept (incoming) or accepted (a file staff upload). Code: `server/src/services/fileScan.ts`. Three layers:

1. **Built in, always on.** The EICAR test virus, a program disguised as a document or picture (the first bytes say "program", the name says "pdf"), and a double extension such as `invoice.pdf.exe`. This is a check of the file's shape, **not an antivirus**. An uploaded file that fails it is refused.
2. **ClamAV (a real antivirus), when `CLAMAV_HOST` is set** (and `CLAMAV_PORT`, default 3310). The file is streamed to a clamd service. To run one on Railway, add a service from the Docker image `clamav/clamav` (it exposes port 3310; give it about 2 GB of memory for its signature database) and set `CLAMAV_HOST` on the backend to that service's private address (`<service-name>.railway.internal`). clamd refuses files over its own limit (25 MB by default); those stay "not checked".
3. **VirusTotal, when `VIRUSTOTAL_API_KEY` is set.** Only the file's SHA-256 is looked up; the file itself is never sent. A file VirusTotal has not seen stays "not checked" (unknown is not safe). The free key allows a few lookups a minute, so with only this layer many files will show "not checked".

What people see: **Blocked: <virus>** (an infected incoming file cannot be downloaded by anyone, and an infected upload is refused), **Suspicious: <why>** (allowed, with a warning; a program dressed as a document is refused), **Checked, no virus found** (a real engine said so), or **not checked by an antivirus** (only the built-in checks ran, or the file is unknown). When an engine is switched on but cannot be reached, uploads are refused ("try again in a few minutes") rather than sent unchecked; incoming files stay "not checked" and are checked when first opened.

Without ClamAV or VirusTotal the system tells people honestly that files are not checked by an antivirus. Do not describe it as virus-protected until one is switched on.

### Showing an email as it was written

An incoming email with HTML is shown as sent, in a **sandboxed frame** (no scripts, no cookies, no access to the website), with a **Plain text** tab beside it. Layers: DOMPurify removes scripts, forms, frames, objects, SVG and event handlers; links open in a new tab without handing over the page; `url()`, `@import` and `expression()` are removed from styles; the page inside has a Content-Security-Policy that allows nothing but this email's own pictures. **Pictures from the internet are blocked** (senders use them to see that you opened the email) until the person clicks **Show pictures**. Pictures that came with the email (`cid:`) are shown. Image attachments (png, jpeg, gif, webp up to 5 MB, not SVG) have a **Preview** button.
- **Not done yet:** scanning the *contents* of zip files, and macros inside Office files (those types are only flagged as risky).

## Boxes, drafts, spam, search and undo send

**Management Panel > Department mail** works like a mailbox, per department:

- **Boxes:** Inbox, Starred, Drafts, Sent, Spam, Trash. A message with no flag is in the Inbox. Moving to Spam or Trash, and starring, are stored in `mail_flags` and shared by everyone who manages the department. A message in Spam or Trash does not count as waiting. Nothing is ever deleted: Trash is a folder you can restore from.
- **Report spam:** moves a message to Spam. Ticking **Also block this sender** adds the address to `mail_blocked_senders` for that department: the sender's other mail in the department moves to Spam, and new mail from them goes straight to Spam when it arrives (`fileNewEmail`, called by the inbound webhook). **Not spam** moves it back and lifts the block. A block applies to one department only.
- **Drafts:** whatever you type in **New email** or in a reply is saved a moment after you stop typing (`mail_drafts`), and again if you leave the page. A draft is private to its author. A reply draft (one per person per message) comes back when you open that message. Drafts are removed when the email is sent, or with **Discard draft**; an empty draft is thrown away. Files attached to a draft are kept for a week.
- **Search** (the box above the list): `from:` `to:` `subject:` `has:attachment` `is:starred` `is:open|answered|closed` `is:web|email` `after:2026-10-01` `before:` `"exact words"` `-leaveout`, or plain words. It looks through the Inbox (not Spam or Trash) unless you are standing in Spam, Trash or Sent, then it searches that box. It reads the sender, subject and the first 5,000 characters of the message. Code: `server/src/services/mailSearch.ts`. The search runs over the latest 1,200 messages of a department, not the whole history.
- **Conversations:** a message shows **Earlier in this conversation** with the earlier emails from the same sender with the same subject (ignoring Re: and Fwd:).
- **Undo send:** after **Send**, a countdown (Off / 5 / 10 / 30 seconds, default 5, chosen next to the button and remembered on that computer) lets you take it back. Leaving the page during the countdown sends the message rather than losing it.

API (all under `/api/mail`): `GET /messages?department=&box=inbox|starred|spam|trash|sent|all&status=&q=`, `POST /messages/:kind/:id/folder` {folder, blockSender}, `POST /messages/:kind/:id/star`, `GET /drafts?department=`, `POST /drafts`, `DELETE /drafts/:id`.

## Writing, labels, snooze, filters, out of office, signatures

- **Rich-text editor:** replies and new emails are written in an editor with bold, italic, underline, bullet and numbered lists, links and "clear formatting". What is typed or pasted is cleaned in the browser (DOMPurify) and again on the server (`services/mailHtml.ts`, `sanitize-html`) before it is stored or sent, so only paragraphs, bold, italic, underline, lists, links and quotes get through. The email goes out as HTML with a plain-text version.
- **Signature:** every email sent from a department ends with the VINK signature, in the design supplied (`email-signature-vink.html`): photo or initials in a gold ring, name, title and department, contact rows, logo, VINK wordmark and slogan, a burgundy and gold bar, and a confidentiality notice. The design is the same for every department; the department's name and address are filled in. Each person sets their own name, title, phone and photo (an https address) under **Settings > Signature**, with a live preview, and can turn it off. Code: `services/mailSignature.ts`. Settings (environment): `SIGNATURE_ADDRESS`, `SIGNATURE_WEBSITE`, `SIGNATURE_LOGO_URL` (default `https://www.vink.co.za/signature/vink-logo.png`, served from the website's `public/signature/`), `SIGNATURE_SLOGAN`, and the social links `SIGNATURE_LINKEDIN`, `SIGNATURE_X`, `SIGNATURE_YOUTUBE`, `SIGNATURE_FACEBOOK`, `SIGNATURE_INSTAGRAM`. A social icon is shown only for a link that is set.
- **Templates:** a department's ready-made replies (**Settings > Templates**). In a reply or new email, **Insert template** puts one in (and fills an empty subject).
- **Labels:** coloured tags per department. Put them on a message (**Labels** on the message), filter the list by a label, search with `label:name`, or let a filter add them.
- **Snooze:** hide a message until a time (in an hour, this afternoon, tomorrow morning, Monday morning, or any time up to a year ahead). It waits in **Snoozed** and returns to the Inbox as open at that time. Moving it to Spam or Trash cancels the snooze.
- **Scheduled send:** **Schedule send** (next to Send) writes an email now and sends it at a chosen time, up to 6 days ahead (files attached to it are kept until it has gone). The server sends due emails every 30 seconds (`sendDue`, safe if two run at once; a send that is stuck for 10 minutes is retried; an hourly-limit hit is retried 15 minutes later). **Scheduled** lists them; any manager of the department can cancel one. If sending fails it stays in the list with the reason.
- **Filters:** rules for a department's new email. Every filled-in condition (sender, subject, words in the message, has an attachment) must match; then it can add a label, star, mark closed, or move to Spam or Trash. Order on arrival: blocked sender, filters, the spam check, then the out-of-office reply.
- **Out of office:** a department-wide automatic reply with optional first and last day (South African dates). Each sender gets it once every 4 days; never to robots (no-reply, mailer-daemon, bounces, newsletters), automatic messages ("Automatic reply", "Undeliverable"...), VINK's own addresses, or mail that went to Spam. It is sent from the department's address with `Auto-Submitted: auto-replied`, and recorded in Sent as "Out-of-office reply".
- **Automatic spam detection:** each new email is scored (`services/mailSpam.ts`): scam, prize, phishing and pushy-marketing wording, link shorteners, links to bare internet addresses, a shouting subject, no subject, a name that shows a different email address, and **pretending to be VINK from another domain** (enough on its own). At 5 points it goes to Spam with the reasons shown on the message; **Not spam** puts it back for good. It cannot see SPF/DKIM results or mail headers (Resend's webhook does not pass them on), so it catches the common cases, not everything.
- **Desktop notifications:** **Settings > Notifications** asks the browser for permission. While the Department mail page is open the page checks for new mail every minute and shows a message when more are waiting. It does not notify when the page is closed (that needs push notifications, not built).

API additions (all under `/api/mail`): `POST /messages/:kind/:id/snooze`, `POST /messages/:kind/:id/labels`, `POST /schedule`, `GET /scheduled`, `DELETE /scheduled/:id`, `GET|PUT /signature`, `POST /signature/preview`, `GET|POST /templates`, `DELETE /templates/:id`, `GET|POST /labels`, `DELETE /labels/:id`, `GET|POST /filters`, `DELETE /filters/:id`, `GET|PUT /autoreply`; `bodyHtml` is accepted by `/send`, `/reply`, `/drafts` and `/schedule`.

**Not built yet:** forwarding a department's mail to another address automatically, mail categories (Primary, Promotions...), a contacts book, importing and exporting mail, a calendar, and mail for people on their own phone (push notifications). Mail stays in the browser panel: there is no IMAP/Outlook access.
