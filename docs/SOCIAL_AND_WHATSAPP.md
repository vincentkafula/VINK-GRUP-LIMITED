# Social media posting and WhatsApp

Two features in the Management Panel, built on Meta's official APIs. Neither does anything until the keys below are added to the **backend** service on Railway (Variables). Nothing is posted or sent without them.

## 1. Posting to Facebook, Instagram and Threads

**Where:** Management Panel, sidebar, **Social media** (Super Administrators, and anyone approved for the section "Social Media Management").

| What | How |
|---|---|
| A post by hand (general, blog, offer, job opening) | Write it, tick the networks, post now or pick a time. |
| Retry | A network that refused can be retried on its own; a network that already took the post is skipped. |
| Launch countdown (automatic) | Posts the days left before launch at 08:00 South African time: every day in the last 30 days, weekly up to 180 days, monthly before that. Says that VINK is a preview. |
| New Ballylife products (automatic) | Up to two new products a day from 10:00, announced as products of a VINK Group company. |

The automatic posts are **off** until a Super Administrator switches them on in the panel and ticks the networks.

The blog, the offers and the job openings on the website are written by hand in the site today, so announcing one is the "New blog post / New offer / Job opening" form: write the post, add the page's link, post.

### Keys (Railway, backend, Variables)

| Variable | What it is |
|---|---|
| `FACEBOOK_PAGE_ID` | The id of the VINK Facebook Page |
| `FACEBOOK_PAGE_TOKEN` | A long-lived Page access token (permissions `pages_manage_posts`, `pages_read_engagement`) |
| `INSTAGRAM_USER_ID` | The id of the Instagram Business account linked to the Page |
| `INSTAGRAM_ACCESS_TOKEN` | Optional. If empty, the Page token is used. Permission `instagram_content_publish` |
| `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN` | The Threads user id and token (permissions `threads_basic`, `threads_content_publish`) |
| `LAUNCH_DATE` | `YYYY-MM-DD`. Default `2027-06-01`. **Please confirm the real launch date.** |
| `PUBLIC_SITE_URL` | Default `https://vink.co.za`. Used for the countdown link and picture (`/og-image.png`) |
| `BALLYLIFE_FEED_URL` | The address of the Ballylife product list: Shopify `https://…/products.json`, WooCommerce `https://…/wp-json/wc/store/v1/products`, or a JSON list of `{ id, title, price, url, image }` |
| `BALLYLIFE_SITE_URL` | Default `https://www.ballylife.com` |

Instagram cannot post without a picture, and its links are not clickable. Pictures must be public `https` JPEG or PNG addresses.

## 2. WhatsApp

**Where:** Management Panel, sidebar, **WhatsApp** (anyone who can use Department mail, for the departments they manage).

How a customer chats: they message VINK's WhatsApp number (or tap the **Chat on WhatsApp** button that appears on every page, or scan the **QR code** on the Contact page). They get a menu of the public departments; the number they send chooses the department. From then the chat is in that department's list in the panel. Staff answer there; the customer gets it on WhatsApp.

- Outside Monday to Friday 08:00 to 17:00 (South African time) the customer gets one "we are away" message a day.
- WhatsApp lets VINK write freely only for 24 hours after the customer's last message. After that a reply must start from an approved message template (`WHATSAPP_REOPEN_TEMPLATE`); without one the panel explains why it cannot send.
- `MENU` restarts the menu. `START` and `STOP` turn payment and card alerts on and off.
- Alerts (receipts, card alerts) go out as approved templates, only to customers who sent `START`. The server function `notify` and the Super Administrator route `POST /api/admin/whatsapp/notify` send them. **Nothing in the payment flow calls it yet**: each alert needs its own template approved by Meta first.

### Keys (Railway, backend, Variables)

| Variable | What it is |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | The id of VINK's WhatsApp number (WhatsApp Manager > API setup) |
| `WHATSAPP_TOKEN` | A permanent system-user token with `whatsapp_business_messaging` |
| `META_APP_SECRET` | The Meta app's secret: every webhook call is signed with it and refused if the signature is wrong |
| `WHATSAPP_VERIFY_TOKEN` | Any secret text you choose; typed into Meta when the webhook is added |
| `WHATSAPP_NUMBER` | The number as the public dials it, digits only with country code (`27821234567`). Turns on the button and the QR code |
| `WHATSAPP_REOPEN_TEMPLATE` (+ `WHATSAPP_REOPEN_LANGUAGE`, default `en`) | Optional. An approved template (one `{{1}}` body variable, the customer's name) used to start a chat again after 24 hours |

### Webhook (Meta App Dashboard > WhatsApp > Configuration)

- Callback URL: `https://api.vink.co.za/api/webhooks/whatsapp`
- Verify token: the same text as `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the **messages** field.

### The QR code

`https://api.vink.co.za/api/whatsapp/qr.png` is the QR code as a picture, for posters, taxi windows and stickers. It opens a chat with "Hi VINK" ready to send.

## Privacy and safety

- Tokens are only sent to Meta and never appear in an error message, a log or the panel (the panel shows only "connected" or "not set up").
- Chats are visible only to people who manage that department. Phone numbers are shown to them, and to nobody else.
- Every post, retry, cancel, transfer, reply and alert is recorded in the audit log.
- Meta's own rules apply: WhatsApp business messaging needs the customer to have opted in for alerts, and Instagram and Facebook have posting limits.
