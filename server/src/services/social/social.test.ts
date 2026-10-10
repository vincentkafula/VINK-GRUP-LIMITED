import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../../portal/testDb.js";
import type { Db } from "../../portal/driverRoutes.js";
import { createMetaClient, metaConfigFromEnv, composeText, configured, type MetaConfig } from "./meta.js";
import { parseProducts, productPost } from "./products.js";
import { createSocialService, launchPostFor, launchDue } from "./socialService.js";
import { createSocialRouter, SOCIAL_SECTION } from "../../routes/socialRouter.js";

const ENV = { FACEBOOK_PAGE_ID: "p1", FACEBOOK_PAGE_TOKEN: "FBTOKEN", INSTAGRAM_USER_ID: "i1", THREADS_USER_ID: "t1", THREADS_ACCESS_TOKEN: "THTOKEN" } as NodeJS.ProcessEnv;
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

type Call = { url: string; body: URLSearchParams | null };
/** A pretend Meta: records every call, answers like Graph does, and can be told to refuse a network. */
function fakeMeta(opts: { fail?: Partial<Record<"facebook" | "instagram" | "threads", string>>; igStatus?: string[] } = {}) {
  const calls: Call[] = []; const igStatus = [...(opts.igStatus ?? ["FINISHED"])];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url); const body = init?.body ? new URLSearchParams(String(init.body)) : null; calls.push({ url: u, body });
    const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s });
    if (u.includes("graph.facebook.com/v21.0/p1/")) return opts.fail?.facebook ? json({ error: { message: opts.fail.facebook, code: 190 } }, 400) : json({ id: "fb_1", post_id: "p1_fb_1" });
    if (u.includes("graph.facebook.com/v21.0/i1/media_publish")) return json({ id: "ig_post" });
    if (u.includes("graph.facebook.com/v21.0/i1/media")) return opts.fail?.instagram ? json({ error: { message: opts.fail.instagram } }, 400) : json({ id: "ig_container" });
    if (u.includes("graph.facebook.com/v21.0/ig_container")) return json({ status_code: igStatus.shift() ?? "FINISHED" });
    if (u.includes("graph.threads.net/v21.0/t1/threads_publish")) return json({ id: "th_post" });
    if (u.includes("graph.threads.net/v21.0/t1/threads")) return opts.fail?.threads ? json({ error: { message: opts.fail.threads } }, 400) : json({ id: "th_container" });
    return json({ error: { message: "unexpected " + u } }, 404);
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}
const clientFor = (f: ReturnType<typeof fakeMeta>, config: MetaConfig = metaConfigFromEnv(ENV)) => createMetaClient({ config, fetchImpl: f.fetchImpl, wait: async () => {} });

describe("what goes out on each network", () => {
  it("puts the link after the text, and keeps Threads within its 500 characters, link included", () => {
    expect(composeText("facebook", { text: "Hello", link: "https://vink.co.za/blog" })).toBe("Hello\n\nhttps://vink.co.za/blog");
    const t = composeText("threads", { text: "x".repeat(900), link: "https://vink.co.za/blog" });
    expect(t.length).toBeLessThanOrEqual(500); expect(t.endsWith("https://vink.co.za/blog")).toBe(true); expect(t).toContain("…");
    expect(composeText("instagram", { text: "No link" })).toBe("No link");
  });
  it("knows which networks are set up from the environment, and never reports a token", () => {
    expect(configured(metaConfigFromEnv(ENV))).toEqual({ facebook: true, instagram: true, threads: true });          // Instagram falls back on the Page token
    expect(configured(metaConfigFromEnv({} as NodeJS.ProcessEnv))).toEqual({ facebook: false, instagram: false, threads: false });
    expect(configured(metaConfigFromEnv({ FACEBOOK_PAGE_ID: "p1" } as NodeJS.ProcessEnv)).facebook).toBe(false);
  });
});

describe("the Meta client", () => {
  it("posts text and a link to the Facebook Page, or a photo with a caption", async () => {
    const f = fakeMeta(), c = clientFor(f);
    expect(await c.facebook({ text: "Hi", link: "https://vink.co.za" })).toEqual({ ok: true, id: "p1_fb_1" });
    expect(f.calls[0].url).toContain("/p1/feed"); expect(f.calls[0].body!.get("message")).toBe("Hi"); expect(f.calls[0].body!.get("link")).toBe("https://vink.co.za"); expect(f.calls[0].body!.get("access_token")).toBe("FBTOKEN");
    await c.facebook({ text: "Look", imageUrl: "https://vink.co.za/a.png" });
    expect(f.calls[1].url).toContain("/p1/photos"); expect(f.calls[1].body!.get("url")).toBe("https://vink.co.za/a.png"); expect(f.calls[1].body!.get("caption")).toBe("Look");
  });
  it("posts to Instagram in two steps, waits until the picture is ready, and refuses a post with no picture", async () => {
    const f = fakeMeta({ igStatus: ["IN_PROGRESS", "FINISHED"] }), c = clientFor(f);
    expect(await c.instagram({ text: "No picture" })).toMatchObject({ ok: false, error: expect.stringContaining("needs a picture") });
    expect(f.calls).toHaveLength(0);
    expect(await c.instagram({ text: "Look", imageUrl: "https://vink.co.za/a.png" })).toEqual({ ok: true, id: "ig_post" });
    const kinds = f.calls.map((x) => x.url.replace(/.*v21\.0/, "").replace(/\?.*/, ""));
    expect(kinds).toEqual(["/i1/media", "/ig_container", "/ig_container", "/i1/media_publish"]);
    expect(f.calls[3].body!.get("creation_id")).toBe("ig_container");
  });
  it("stops if Instagram cannot process the picture", async () => {
    const f = fakeMeta({ igStatus: ["ERROR"] }); const r = await clientFor(f).instagram({ text: "x", imageUrl: "https://vink.co.za/a.png" });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("could not process the picture") }); expect(f.calls.some((x) => x.url.includes("media_publish"))).toBe(false);
  });
  it("posts to Threads in two steps, as text with the link attached, or with a picture", async () => {
    const f = fakeMeta(), c = clientFor(f);
    expect(await c.threads({ text: "Hello", link: "https://vink.co.za" })).toEqual({ ok: true, id: "th_post" });
    expect(f.calls[0].body!.get("media_type")).toBe("TEXT"); expect(f.calls[0].body!.get("link_attachment")).toBe("https://vink.co.za"); expect(f.calls[1].url).toContain("threads_publish");
    await c.threads({ text: "Pic", imageUrl: "https://vink.co.za/a.png" }); expect(f.calls[2].body!.get("media_type")).toBe("IMAGE");
  });
  it("reports a refusal with Meta's reason, never the token, and a network that is not set up without calling anyone", async () => {
    const f = fakeMeta({ fail: { facebook: "Error validating access token FBTOKEN" } });
    const r = await clientFor(f).facebook({ text: "Hi" });
    expect(r.ok).toBe(false); expect((r as { error: string }).error).toContain("Error validating access token"); expect(JSON.stringify(r)).not.toContain("FBTOKEN");
    const none = fakeMeta(); expect(await clientFor(none, metaConfigFromEnv({} as NodeJS.ProcessEnv)).threads({ text: "x" })).toMatchObject({ ok: false, error: expect.stringContaining("not set up") }); expect(none.calls).toHaveLength(0);
  });
  it("survives a network failure", async () => {
    const c = createMetaClient({ config: metaConfigFromEnv(ENV), fetchImpl: (async () => { throw new Error("socket hang up"); }) as unknown as typeof fetch, wait: async () => {} });
    expect(await c.facebook({ text: "Hi" })).toMatchObject({ ok: false, error: expect.stringContaining("socket hang up") });
  });
});

describe("Ballylife products", () => {
  it("reads a Shopify list, a WooCommerce list and a plain list", () => {
    const shop = parseProducts({ products: [{ id: 11, title: "Linen Shirt", handle: "linen-shirt", variants: [{ price: "349.00" }], images: [{ src: "https://cdn.shop/a.jpg" }], body_html: "<p>Soft &amp; light</p>" }] }, "https://www.ballylife.com");
    expect(shop).toEqual([{ id: "11", title: "Linen Shirt", price: "R 349.00", url: "https://www.ballylife.com/products/linen-shirt", imageUrl: "https://cdn.shop/a.jpg", description: "Soft & light" }]);
    const woo = parseProducts([{ id: 5, name: "Sneaker", permalink: "https://www.ballylife.com/p/sneaker", prices: { price: "89900", currency_minor_unit: 2, currency_code: "ZAR" }, images: [{ src: "//cdn.shop/s.jpg" }] }], "https://x");
    expect(woo[0]).toMatchObject({ id: "5", price: "R 899.00", url: "https://www.ballylife.com/p/sneaker", imageUrl: "https://cdn.shop/s.jpg" });
    expect(parseProducts([{ id: "a", title: "Cap", price: 120, link: "https://www.ballylife.com/cap", image_url: "https://cdn.shop/c.png" }], "https://x")[0]).toMatchObject({ price: "R 120.00", url: "https://www.ballylife.com/cap" });
  });
  it("ignores entries without an id or a title, and pictures that are not https", () => {
    expect(parseProducts([{ id: 1 }, { title: "x" }, { id: 2, title: "Ok", image: "http://insecure/a.jpg" }], "https://x")).toEqual([expect.objectContaining({ id: "2", imageUrl: null })]);
    expect(parseProducts("nonsense", "https://x")).toEqual([]);
  });
  it("announces a product as a Ballylife product of VINK Group", () => {
    const p = productPost({ id: "1", title: "Linen Shirt", price: "R 349.00", url: "https://www.ballylife.com/products/linen-shirt", imageUrl: null, description: "" });
    expect(p.text).toBe("New at Ballylife, a VINK Group company: Linen Shirt. R 349.00."); expect(p.link).toContain("ballylife.com");
  });
});

describe("the launch countdown", () => {
  it("counts the days, says VINK is a preview, and stops after launch", () => {
    expect(launchPostFor(12, "https://vink.co.za/")!.text).toContain("12 days to go until VINK launches in June 2027."); expect(launchPostFor(12, "https://vink.co.za")!.text).toContain("not yet in full operation");
    expect(launchPostFor(1, "https://x")!.text).toContain("1 day to go"); expect(launchPostFor(0, "https://x")!.text).toContain("launches!"); expect(launchPostFor(-1, "https://x")).toBeNull();
    expect(launchPostFor(12, "https://vink.co.za/")!.imageUrl).toBe("https://vink.co.za/og-image.png");
  });
  it("posts daily in the last 30 days, weekly up to 180 days, monthly before that", () => {
    expect([30, 29, 10, 1, 0].every(launchDue)).toBe(true); expect(launchDue(31)).toBe(false); expect(launchDue(35)).toBe(true); expect(launchDue(36)).toBe(false); expect(launchDue(181)).toBe(false); expect(launchDue(180)).toBe(true);
    expect(launchDue(182)).toBe(false); expect(launchDue(210)).toBe(true); expect(launchDue(-1)).toBe(false);
  });
});

describe("the social service", () => {
  let db: Db, clock: Date, f: ReturnType<typeof fakeMeta>, env: NodeJS.ProcessEnv;
  const mk = (over: { fail?: Parameters<typeof fakeMeta>[0] extends infer O ? O extends { fail?: infer X } ? X : never : never; env?: NodeJS.ProcessEnv } = {}) => {
    f = fakeMeta({ fail: over.fail }); env = { ...ENV, LAUNCH_DATE: "2027-06-01", ...(over.env ?? {}) };
    const config = metaConfigFromEnv(env);
    return createSocialService({ db, meta: clientFor(f, config), config, now: () => clock, env, fetchImpl: f.fetchImpl });
  };
  const staff = { userId: id(1), username: "mia" };
  beforeEach(() => { db = allPortalsDb(); clock = new Date("2026-10-10T09:00:00Z"); });

  it("posts to every chosen network at once and keeps what each answered", async () => {
    const r = await mk().create(staff, { kind: "blog", text: "Our first post", link: "https://vink.co.za/blog", imageUrl: "https://vink.co.za/og-image.png", networks: ["facebook", "instagram", "threads"] });
    expect(r.ok && r.value).toMatchObject({ status: "posted", kind: "blog", createdBy: "mia", results: { facebook: { ok: true }, instagram: { ok: true, id: "ig_post" }, threads: { ok: true } } });
  });
  it("marks a post partial when one network refuses, and retries only that network", async () => {
    const svc = mk({ fail: { threads: "Rate limit" } });
    const r = await svc.create(staff, { text: "Hello there", networks: ["facebook", "threads"] }); if (!r.ok) throw new Error(r.error);
    expect(r.value.status).toBe("partial"); expect(r.value.results.threads).toMatchObject({ ok: false, error: "Rate limit" });
    const fbCalls = f.calls.filter((c) => c.url.includes("/p1/")).length;
    const svc2 = mk(); await db.query(`UPDATE social_posts SET status = 'partial'`);          // the same database, Threads now accepting
    const again = await svc2.retry(r.value.id); expect(again.ok && again.value).toMatchObject({ status: "posted", results: { facebook: { ok: true, id: "p1_fb_1" }, threads: { ok: true } } });
    expect(f.calls.some((c) => c.url.includes("/p1/"))).toBe(false); expect(fbCalls).toBe(1);          // Facebook was not posted a second time
  });
  it("marks a post failed when every network refuses, and only a failed or partial post can be retried", async () => {
    const svc = mk({ fail: { facebook: "Token expired" } });
    const r = await svc.create(staff, { text: "Hello there", networks: ["facebook"] }); if (!r.ok) throw new Error();
    expect(r.value.status).toBe("failed"); expect(r.value.postedAt).toBeNull();
    const ok = await mk().create(staff, { text: "Another one", networks: ["facebook"] }); if (!ok.ok) throw new Error();
    expect(await svc.retry(ok.value.id)).toMatchObject({ ok: false, status: 409 }); expect(await svc.retry(id(99))).toMatchObject({ ok: false, status: 404 });
  });
  it("refuses a bad post with the reason: no text, no network, a network that is not set up, Instagram with no picture, a link that is not https", async () => {
    const svc = mk({ env: { THREADS_USER_ID: "", THREADS_ACCESS_TOKEN: "" } });
    const refused = async (a: Record<string, unknown>) => { const r = await svc.create(staff, a); if (r.ok) throw new Error("accepted"); return r.error; };
    expect(await refused({ text: "x", networks: ["facebook"] })).toContain("Write the post"); expect(await refused({ text: "x".repeat(2001), networks: ["facebook"] })).toContain("Write the post");
    expect(await refused({ text: "Hello", networks: [] })).toContain("at least one network"); expect(await refused({ text: "Hello", networks: ["tiktok"] })).toContain("at least one network");
    expect(await refused({ text: "Hello", networks: ["threads"] })).toContain("not set up"); expect(await refused({ text: "Hello", networks: ["instagram"] })).toContain("needs a picture");
    expect(await refused({ text: "Hello", networks: ["facebook"], link: "http://vink.co.za" })).toContain("https://"); expect(await refused({ text: "Hello", networks: ["facebook"], imageUrl: "javascript:alert(1)" })).toContain("https://");
    expect(await refused({ kind: "weird", text: "Hello", networks: ["facebook"] })).toContain("what kind");
    expect(await refused({ text: "Hello", networks: ["facebook"], scheduleAt: "not a date" })).toContain("not valid"); expect(await refused({ text: "Hello", networks: ["facebook"], scheduleAt: "2030-01-01T00:00:00Z" })).toContain("90 days");
    expect(f.calls).toHaveLength(0);
  });
  it("holds a scheduled post until it is due, can cancel it, and sends it once", async () => {
    const svc = mk();
    const r = await svc.create(staff, { text: "Later on", networks: ["facebook"], scheduleAt: "2026-10-10T12:00:00Z" }); if (!r.ok) throw new Error();
    expect(r.value.status).toBe("scheduled"); expect(f.calls).toHaveLength(0); expect(await svc.publishDue()).toBe(0);
    clock = new Date("2026-10-10T12:01:00Z"); expect(await svc.publishDue()).toBe(1); expect(await svc.publishDue()).toBe(0);
    expect(f.calls).toHaveLength(1); expect((await svc.get(r.value.id))!.status).toBe("posted");
    const c = await svc.create(staff, { text: "Never mind", networks: ["facebook"], scheduleAt: "2026-10-11T12:00:00Z" }); if (!c.ok) throw new Error();
    expect(await svc.cancel(c.value.id)).toMatchObject({ ok: true, value: { status: "cancelled" } }); clock = new Date("2026-10-12T00:00:00Z"); await svc.publishDue(); expect(f.calls).toHaveLength(1);
    expect(await svc.cancel(r.value.id)).toMatchObject({ ok: false, status: 409 });
  });
  it("does not send a post twice if two workers pick it up together, and does not resend one a restart interrupted", async () => {
    const svc = mk(); const r = await svc.create(staff, { text: "Hello there", networks: ["facebook"], scheduleAt: "2026-10-10T09:30:00Z" }); if (!r.ok) throw new Error();
    clock = new Date("2026-10-10T09:31:00Z"); await Promise.all([svc.publish(r.value.id), svc.publish(r.value.id)]); expect(f.calls).toHaveLength(1);
    await db.query(`UPDATE social_posts SET status = 'posting', scheduled_at = $1`, [new Date("2026-10-10T09:00:00Z")]); clock = new Date("2026-10-10T10:00:00Z"); await svc.publishDue();
    expect((await svc.get(r.value.id))!.status).toBe("failed"); expect(f.calls).toHaveLength(1);
  });

  describe("automatic posts", () => {
    const on = async (svc: ReturnType<typeof mk>, key: "launch" | "products", networks = ["facebook", "threads"]) => { const r = await svc.setAuto(staff, { [key]: { enabled: true, networks } }); if (!r.ok) throw new Error(r.error); };
    it("starts switched off, and refuses to switch on a network that is not set up, or products with no feed", async () => {
      const svc = mk(); expect((await svc.getAuto()).launch).toEqual({ enabled: false, networks: [] });
      expect(await svc.setAuto(staff, { launch: { enabled: true, networks: [] } })).toMatchObject({ ok: false, error: expect.stringContaining("at least one network") });
      expect(await mk({ env: { THREADS_USER_ID: "" } }).setAuto(staff, { launch: { enabled: true, networks: ["threads"] } })).toMatchObject({ ok: false, status: 409 });
      expect(await svc.setAuto(staff, { products: { enabled: true, networks: ["facebook"] } })).toMatchObject({ ok: false, error: expect.stringContaining("BALLYLIFE_FEED_URL") });
      expect(await svc.tick()).toEqual({ scheduled: 0, launch: 0, products: 0 }); expect(f.calls).toHaveLength(0);
    });
    it("posts the countdown once a day from 08:00 South African time, with the days left, and not before or twice", async () => {
      const svc = mk({ env: { LAUNCH_DATE: "2026-10-20" } }); await on(svc, "launch");
      clock = new Date("2026-10-10T05:30:00Z"); expect((await svc.tick()).launch).toBe(0);          // 07:30 in South Africa
      clock = new Date("2026-10-10T06:05:00Z"); expect((await svc.tick()).launch).toBe(1); expect((await svc.tick()).launch).toBe(0);
      const posts = await svc.list(); expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({ kind: "launch", auto: true, createdBy: "Automatic", status: "posted", networks: ["facebook", "threads"] }); expect(posts[0].text).toContain("10 days to go until VINK launches");
      clock = new Date("2026-10-11T07:00:00Z"); expect((await svc.tick()).launch).toBe(1); expect((await svc.list())[0].text).toContain("9 days to go");
    });
    it("skips days that are not due, and stops once VINK has launched", async () => {
      const svc = mk({ env: { LAUNCH_DATE: "2027-06-01" } }); await on(svc, "launch");
      clock = new Date("2026-10-10T08:00:00Z"); expect((await svc.tick()).launch).toBe(0);          // 234 days: not a monthly or weekly milestone
      const done = mk({ env: { LAUNCH_DATE: "2026-10-01" } }); clock = new Date("2026-10-10T08:00:00Z"); expect((await done.tick()).launch).toBe(0);
    });
    it("announces up to two new Ballylife products a day, from the feed, once each", async () => {
      const feed = { products: [1, 2, 3].map((n) => ({ id: n, title: `Product ${n}`, handle: `p${n}`, variants: [{ price: "100" }], images: [{ src: `https://cdn.shop/${n}.jpg` }] })) };
      const svc = mk({ env: { BALLYLIFE_FEED_URL: "https://www.ballylife.com/products.json" } });
      const real = f.fetchImpl; const wrapped = vi.fn(async (u: string, i?: RequestInit) => (String(u).includes("ballylife.com") ? new Response(JSON.stringify(feed)) : (real as typeof fetch)(u, i))); (svc as unknown as { _f: unknown })._f = wrapped;
      const svc2 = createSocialService({ db, meta: clientFor(f), config: metaConfigFromEnv(env), now: () => clock, env, fetchImpl: wrapped as unknown as typeof fetch }); await on(svc2, "products");
      clock = new Date("2026-10-10T07:00:00Z"); expect((await svc2.tick()).products).toBe(0);          // 09:00, before the 10:00 post time
      clock = new Date("2026-10-10T08:30:00Z"); expect((await svc2.tick()).products).toBe(2); expect((await svc2.tick()).products).toBe(0);
      const posts = (await svc2.list()).filter((p) => p.kind === "product"); expect(posts.map((p) => p.text).sort()).toEqual([expect.stringContaining("Product 1"), expect.stringContaining("Product 2")]);
      expect(posts[0].text).toContain("a VINK Group company"); expect(posts[0].link).toContain("ballylife.com/products/");
      clock = new Date("2026-10-11T08:30:00Z"); expect((await svc2.tick()).products).toBe(1); expect((await svc2.list()).filter((p) => p.kind === "product")).toHaveLength(3);
      clock = new Date("2026-10-12T08:30:00Z"); expect((await svc2.tick()).products).toBe(0);          // all announced
    });
    it("copes with the shop being down", async () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const svc = mk({ env: { BALLYLIFE_FEED_URL: "https://www.ballylife.com/products.json" } });
      const svc2 = createSocialService({ db, meta: clientFor(f), config: metaConfigFromEnv(env), now: () => clock, env, fetchImpl: (async () => new Response("down", { status: 503 })) as unknown as typeof fetch }); await on(svc2, "products");
      void svc; clock = new Date("2026-10-10T09:00:00Z"); expect((await svc2.tick()).products).toBe(0); err.mockRestore();
    });
  });
});

describe("the social routes", () => {
  let db: Db, server: Server, url: string, as: { userId: string; role: string; username: string }, f: ReturnType<typeof fakeMeta>;
  beforeEach(async () => {
    db = allPortalsDb(); as = { userId: id(1), role: "superadmin", username: "root" }; f = fakeMeta();
    const config = metaConfigFromEnv(ENV), svc = createSocialService({ db, meta: clientFor(f, config), config, env: ENV });
    for (const [n, name, role] of [[1, "root", "superadmin"], [2, "mia", "customer"], [3, "sid", "customer"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,$4)`, [id(n), name, `${name}@vink.co.za`, role]);
    await db.query(`INSERT INTO section_permissions (user_id, section) VALUES ($1,$2)`, [id(2), SOCIAL_SECTION]);
    await db.query(`CREATE TABLE IF NOT EXISTS audit_log (id UUID PRIMARY KEY, actor_id UUID, actor_name TEXT, action TEXT, target TEXT, details TEXT, created_at TIMESTAMPTZ DEFAULT now())`).catch(() => {});
    const app = express(); app.use((req, _r, next) => { req.user = as as never; next(); }); app.use("/api/admin/social", createSocialRouter({ db, svc }));
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/social`;
  });
  afterEach(async () => { await new Promise<void>((ok) => server.close(() => ok())); });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (m: string, p: string, b?: unknown) => { const r = await fetch(`${url}${p}`, { method: m, headers: { "Content-Type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) }); return { status: r.status, text: () => r.text(), json: async () => (await r.json()) as any }; };

  it("lets a Super Administrator and an approved person in, and nobody else", async () => {
    expect((await call("GET", "/status")).status).toBe(200);
    as = { userId: id(2), role: "customer", username: "mia" }; expect((await call("GET", "/status")).status).toBe(200);
    as = { userId: id(3), role: "customer", username: "sid" }; const r = await call("GET", "/status"); expect(r.status).toBe(403); expect((await r.json()).error).toContain("not approved");
    expect((await call("POST", "/posts", { text: "Hello there", networks: ["facebook"] })).status).toBe(403); expect(f.calls).toHaveLength(0);
  });
  it("posts, lists, and reports what is set up without any token", async () => {
    const r = await call("POST", "/posts", { kind: "offer", text: "A new offer", networks: ["facebook", "threads"] }); expect(r.status).toBe(201);
    expect((await r.json()).post).toMatchObject({ status: "posted", kind: "offer" });
    expect((await (await call("GET", "/posts")).json()).posts).toHaveLength(1);
    const s = await (await call("GET", "/status")).text(); expect(JSON.parse(s)).toMatchObject({ configured: { facebook: true, instagram: true, threads: true }, launchDate: "2027-06-01" }); expect(s).not.toContain("FBTOKEN");
    expect((await call("POST", "/posts", { text: "x", networks: ["facebook"] })).status).toBe(400);
  });
  it("lets only a Super Administrator change the automatic posts", async () => {
    as = { userId: id(2), role: "customer", username: "mia" }; expect((await call("PUT", "/auto", { launch: { enabled: true, networks: ["facebook"] } })).status).toBe(403);
    as = { userId: id(1), role: "superadmin", username: "root" }; const r = await call("PUT", "/auto", { launch: { enabled: true, networks: ["facebook"] } });
    expect(r.status).toBe(200); expect((await r.json()).auto.launch).toEqual({ enabled: true, networks: ["facebook"] });
  });
  it("cancels a scheduled post and says so when the post is not found", async () => {
    const r = await (await call("POST", "/posts", { text: "Tomorrow", networks: ["facebook"], scheduleAt: new Date(Date.now() + 86_400_000).toISOString() })).json();
    expect(r.post.status).toBe("scheduled"); expect((await call("POST", `/posts/${r.post.id}/cancel`)).status).toBe(200);
    expect((await call("POST", `/posts/${r.post.id}/cancel`)).status).toBe(409); expect((await call("POST", "/posts/nope/retry")).status).toBe(404);
  });
});
