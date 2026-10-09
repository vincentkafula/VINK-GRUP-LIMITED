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
