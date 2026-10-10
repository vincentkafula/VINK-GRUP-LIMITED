/**
 * Posting to Facebook, Instagram and Threads through Meta's Graph API.
 *
 *   Facebook   FACEBOOK_PAGE_ID + FACEBOOK_PAGE_TOKEN          a Page post (text and link, or a photo with a caption)
 *   Instagram  INSTAGRAM_USER_ID (+ INSTAGRAM_ACCESS_TOKEN, or the Page token)   a photo post. Instagram cannot post without a picture and does not make links clickable.
 *   Threads    THREADS_USER_ID + THREADS_ACCESS_TOKEN          a text post, with a picture if there is one
 *
 * Every call returns { ok, id } or { ok: false, error }: a network that is not set up, or that refuses, never stops the others. Tokens are only ever sent to Meta
 * and never appear in an error message.
 */
export type Network = "facebook" | "instagram" | "threads";
export const NETWORKS: readonly Network[] = ["facebook", "instagram", "threads"];
export type NetResult = { ok: true; id: string } | { ok: false; error: string };
export interface PostContent { text: string; link?: string | null; imageUrl?: string | null }

export interface MetaConfig {
  graphVersion: string;
  threadsVersion: string;
  facebook: { pageId: string; token: string } | null;
  instagram: { userId: string; token: string } | null;
  threads: { userId: string; token: string } | null;
}

export function metaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MetaConfig {
  const v = (k: string) => env[k]?.trim() || "";
  const pageToken = v("FACEBOOK_PAGE_TOKEN");
  return {
    graphVersion: v("META_GRAPH_VERSION") || "v21.0",
    threadsVersion: v("THREADS_API_VERSION") || "v1.0",
    facebook: v("FACEBOOK_PAGE_ID") && pageToken ? { pageId: v("FACEBOOK_PAGE_ID"), token: pageToken } : null,
    instagram: v("INSTAGRAM_USER_ID") && (v("INSTAGRAM_ACCESS_TOKEN") || pageToken) ? { userId: v("INSTAGRAM_USER_ID"), token: v("INSTAGRAM_ACCESS_TOKEN") || pageToken } : null,
    threads: v("THREADS_USER_ID") && v("THREADS_ACCESS_TOKEN") ? { userId: v("THREADS_USER_ID"), token: v("THREADS_ACCESS_TOKEN") } : null,
  };
}

/** Which networks are set up, for the panel (never the tokens). */
export const configured = (c: MetaConfig): Record<Network, boolean> => ({ facebook: !!c.facebook, instagram: !!c.instagram, threads: !!c.threads });

export const LIMITS = { facebook: 5000, instagram: 2200, threads: 500 } as const;
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`);

/** The words that go out on a network: the text, then the link on its own line. Threads allows 500 characters, so the text is shortened to leave room for the link. */
export function composeText(network: Network, p: PostContent): string {
  const link = p.link ? p.link.trim() : "";
  const room = LIMITS[network] - (link ? link.length + 2 : 0);
  const body = clip(p.text.trim(), Math.max(20, room));
  return link ? `${body}\n\n${link}` : body;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createMetaClient(deps: { config: MetaConfig; fetchImpl?: typeof fetch; wait?: (ms: number) => Promise<void> }) {
  const { config } = deps, doFetch = deps.fetchImpl ?? fetch, wait = deps.wait ?? sleep;
  // Threads has its own address and version (v1.0); Facebook and Instagram use the Graph version.
  const g = (host: string, path: string) => `https://${host}/${host === "graph.threads.net" ? (config.threadsVersion) : config.graphVersion}${path}`;

  async function call(url: string, params: Record<string, string>, token: string, method: "POST" | "GET" = "POST"): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string }> {
    try {
      const body = new URLSearchParams({ ...params, access_token: token });
      const res = method === "POST" ? await doFetch(url, { method, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }) : await doFetch(`${url}?${body.toString()}`);
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || json.error) {
        const e = (json.error ?? {}) as { message?: unknown; code?: unknown };
        const msg = typeof e.message === "string" ? e.message : `The request failed (${res.status})`;
        return { ok: false, error: `${msg}${e.code ? ` (code ${String(e.code)})` : ""}`.replace(token, "[token]").slice(0, 300) };
      }
      return { ok: true, body: json };
    } catch (e) { return { ok: false, error: `Could not reach Meta: ${e instanceof Error ? e.message : "network error"}`.replace(token, "[token]").slice(0, 300) }; }
  }

  async function facebook(p: PostContent): Promise<NetResult> {
    const c = config.facebook; if (!c) return { ok: false, error: "Facebook is not set up (FACEBOOK_PAGE_ID and FACEBOOK_PAGE_TOKEN)" };
    const r = p.imageUrl ? await call(g("graph.facebook.com", `/${c.pageId}/photos`), { url: p.imageUrl, caption: composeText("facebook", p) }, c.token)
      : await call(g("graph.facebook.com", `/${c.pageId}/feed`), { message: composeText("facebook", { text: p.text }), ...(p.link ? { link: p.link } : {}) }, c.token);
    if (!r.ok) return r;
    const id = String(r.body.post_id ?? r.body.id ?? ""); return id ? { ok: true, id } : { ok: false, error: "Facebook did not return a post id" };
  }

  async function instagram(p: PostContent): Promise<NetResult> {
    const c = config.instagram; if (!c) return { ok: false, error: "Instagram is not set up (INSTAGRAM_USER_ID and a token)" };
    if (!p.imageUrl) return { ok: false, error: "Instagram needs a picture: add an image to the post" };
    const made = await call(g("graph.facebook.com", `/${c.userId}/media`), { image_url: p.imageUrl, caption: composeText("instagram", p) }, c.token);
    if (!made.ok) return made;
    const creation = String(made.body.id ?? ""); if (!creation) return { ok: false, error: "Instagram did not accept the picture" };
    for (let i = 0; i < 6; i++) {                                   // the picture is processed first; publish once it is ready
      const s = await call(g("graph.facebook.com", `/${creation}`), { fields: "status_code" }, c.token, "GET");
      const code = s.ok ? String(s.body.status_code ?? "") : "";
      if (code === "FINISHED" || (s.ok && !code)) break;
      if (code === "ERROR" || code === "EXPIRED") return { ok: false, error: "Instagram could not process the picture (use a JPEG or PNG under 8 MB at a public https address)" };
      await wait(1500);
    }
    const pub = await call(g("graph.facebook.com", `/${c.userId}/media_publish`), { creation_id: creation }, c.token);
    if (!pub.ok) return pub;
    const id = String(pub.body.id ?? ""); return id ? { ok: true, id } : { ok: false, error: "Instagram did not return a post id" };
  }

  async function threads(p: PostContent): Promise<NetResult> {
    const c = config.threads; if (!c) return { ok: false, error: "Threads is not set up (THREADS_USER_ID and THREADS_ACCESS_TOKEN)" };
    const params: Record<string, string> = p.imageUrl ? { media_type: "IMAGE", image_url: p.imageUrl, text: composeText("threads", p) } : { media_type: "TEXT", text: composeText("threads", { text: p.text }), ...(p.link ? { link_attachment: p.link } : {}) };
    const made = await call(g("graph.threads.net", `/${c.userId}/threads`), params, c.token);
    if (!made.ok) return made;
    const creation = String(made.body.id ?? ""); if (!creation) return { ok: false, error: "Threads did not accept the post" };
    await wait(p.imageUrl ? 2000 : 0);
    const pub = await call(g("graph.threads.net", `/${c.userId}/threads_publish`), { creation_id: creation }, c.token);
    if (!pub.ok) return pub;
    const id = String(pub.body.id ?? ""); return id ? { ok: true, id } : { ok: false, error: "Threads did not return a post id" };
  }

  return { facebook, instagram, threads, post: (n: Network, p: PostContent) => (n === "facebook" ? facebook(p) : n === "instagram" ? instagram(p) : threads(p)) };
}
export type MetaClient = ReturnType<typeof createMetaClient>;
