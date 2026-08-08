import { useState, useEffect, useCallback } from "react";
import { X, Plus, Edit3, Trash2, Send, CheckCircle2, XCircle, Loader2, Newspaper, Image as ImageIcon, Calendar, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";
import { newsAdminApi, getToken, type NewsRole, type NewsAdminArticle } from "../services/apiClient";
import { RichTextEditor } from "./RichTextEditor";

interface Props { isOpen: boolean; onClose: () => void; }

const GREEN = "#128A43";
const NAVY = "#0E1420";

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  draft: { label: "Draft", bg: "#F3F4F6", color: "#6B7280" },
  pending_review: { label: "Pending Review", bg: "#FEF3C7", color: "#B45309" },
  published: { label: "Published", bg: "#DCFCE7", color: GREEN },
  rejected: { label: "Rejected", bg: "#FEE2E2", color: "#DC2626" },
};

const CATEGORIES = ["Politics", "Business", "Sport", "Lifestyle", "Opinion", "Technology", "World", "Local"];

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.draft;
  return <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: c.bg, color: c.color }}>{c.label}</span>;
}

export function NewsManagementDashboard({ isOpen, onClose }: Props) {
  const [role, setRole] = useState<NewsRole | null>(null);
  const [articles, setArticles] = useState<NewsAdminArticle[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<NewsAdminArticle | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([newsAdminApi.me(), newsAdminApi.articles(statusFilter)])
      .then(([roleRes, articlesRes]) => {
        if (roleRes.success) setRole(roleRes.data ?? null);
        else toast.error(roleRes.error ?? "Could not load your News Management access.");
        if (articlesRes.success) setArticles(articlesRes.data ?? []);
        else toast.error(articlesRes.error ?? "Could not load articles.");
      })
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  if (!isOpen) return null;

  const canCreate = role?.tier === "leadership" || role?.tier === "creator";
  const canPublish = role?.tier === "leadership";

  const handleDelete = async (article: NewsAdminArticle) => {
    if (!confirm(`Delete "${article.title}"? This can't be undone.`)) return;
    const r = await newsAdminApi.remove(article.id);
    if (r.success) { toast.success("Article deleted."); load(); }
    else toast.error(r.error ?? "Could not delete this article.");
  };

  const handleStatusChange = async (article: NewsAdminArticle, status: string) => {
    setBusy(true);
    const r = await newsAdminApi.setStatus(article.id, status);
    setBusy(false);
    if (r.success) { toast.success(status === "published" ? "Published." : status === "rejected" ? "Rejected." : "Updated."); load(); }
    else toast.error(r.error ?? "Action failed.");
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: NAVY }}>
            <Newspaper className="w-5 h-5" />
          </div>
          <div>
            <p className="font-black text-gray-900 text-sm">News Management</p>
            <p className="text-xs text-gray-500">{role?.position ?? "Newsroom"} {role?.tier && `· ${role.tier === "leadership" ? "Editorial leadership" : role.tier === "creator" ? "Content creator" : "View only"}`}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-5xl mx-auto w-full">
        {role?.tier === "viewer" && (
          <div className="mb-5 px-4 py-3 rounded-xl text-sm" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
            Your News Management role ({role.position}) has view-only access to this dashboard — you can see article status and activity, but not create or edit content.
          </div>
        )}

        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex gap-2">
            {[
              { key: undefined, label: "All" },
              { key: "pending_review", label: "Pending Review" },
              { key: "published", label: "Published" },
              { key: "draft", label: "Draft" },
              { key: "rejected", label: "Rejected" },
            ].map(f => (
              <button key={f.label} onClick={() => setStatusFilter(f.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors"
                style={statusFilter === f.key ? { background: GREEN, borderColor: GREEN, color: "#fff" } : { borderColor: "#E5E7EB", color: "#6B7280" }}>
                {f.label}
              </button>
            ))}
          </div>
          {canCreate && (
            <button onClick={() => setEditing("new")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white hover:opacity-90"
              style={{ background: GREEN }}>
              <Plus className="w-3.5 h-3.5" /> New Article
            </button>
          )}
        </div>

        {loading ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : articles.length === 0 ? (
          <p className="text-sm text-gray-400">No articles{statusFilter ? ` with status "${STATUS_CFG[statusFilter]?.label}"` : ""} yet.</p>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
            {articles.map(a => (
              <div key={a.id} className="p-5 flex items-center gap-4">
                <span className="text-2xl shrink-0">{a.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 truncate">{a.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{a.category} · {a.createdByName ?? a.author} · {new Date(a.updatedAt).toLocaleDateString()}</p>
                </div>
                <StatusBadge status={a.status} />
                <div className="flex items-center gap-1.5 shrink-0">
                  {a.status !== "published" && canCreate && (
                    <button onClick={() => setEditing(a)} title="Edit" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><Edit3 className="w-4 h-4" /></button>
                  )}
                  {a.status === "draft" && (
                    <button disabled={busy} onClick={() => handleStatusChange(a, "pending_review")} title="Submit for review" className="p-2 rounded-lg hover:bg-blue-50 text-blue-600"><Send className="w-4 h-4" /></button>
                  )}
                  {canPublish && a.status === "pending_review" && (
                    <>
                      <button disabled={busy} onClick={() => handleStatusChange(a, "published")} title="Publish" className="p-2 rounded-lg hover:bg-green-50" style={{ color: GREEN }}><CheckCircle2 className="w-4 h-4" /></button>
                      <button disabled={busy} onClick={() => handleStatusChange(a, "rejected")} title="Reject" className="p-2 rounded-lg hover:bg-red-50 text-red-600"><XCircle className="w-4 h-4" /></button>
                    </>
                  )}
                  {(canPublish || (canCreate && a.status !== "published")) && (
                    <button onClick={() => handleDelete(a)} title="Delete" className="p-2 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && role && (
        <ArticleEditor
          article={editing === "new" ? null : editing}
          canPublishDirectly={role.tier === "leadership"}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function ArticleEditor({ article, canPublishDirectly, onClose, onSaved }: {
  article: NewsAdminArticle | null; canPublishDirectly: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(article?.title ?? "");
  const [category, setCategory] = useState(article?.category ?? CATEGORIES[0]);
  const [subtitle, setSubtitle] = useState(article?.subtitle ?? "");
  const [summary, setSummary] = useState(article?.summary ?? "");
  const [body, setBody] = useState(article?.body ?? "");
  const [tags, setTags] = useState<string[]>(article?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [metaDescription, setMetaDescription] = useState(article?.metaDescription ?? "");
  const [scheduleEnabled, setScheduleEnabled] = useState(Boolean(article?.scheduledAt));
  const [scheduledAt, setScheduledAt] = useState(article?.scheduledAt ? article.scheduledAt.slice(0, 16) : "");
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // The admin image endpoint requires auth -- a plain <img src="..."> can't
  // attach an Authorization header (this is exactly the same class of bug
  // already fixed for document viewing in ManagementPanelViewer: a browser
  // loading a resource directly doesn't send custom headers the way
  // fetch() does). Fetch it properly here and hand the <img> a local blob
  // URL instead.
  useEffect(() => {
    if (!article?.hasHeroImage) return;
    let objectUrl: string | null = null;
    fetch(newsAdminApi.imageUrl(article.id), { headers: { Authorization: `Bearer ${getToken() ?? ""}` } })
      .then(res => { if (!res.ok) throw new Error(); return res.blob(); })
      .then(blob => { objectUrl = URL.createObjectURL(blob); setImagePreview(objectUrl); })
      .catch(() => { /* no existing image to preview, or it failed to load -- leave the upload placeholder showing */ });
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [article?.id, article?.hasHeroImage]);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput("");
  };

  const handleImageSelect = (file: File | null) => {
    setImageFile(file);
    if (file) setImagePreview(URL.createObjectURL(file));
  };

  const uploadPendingImage = async (articleId: string) => {
    if (!imageFile) return;
    setUploadingImage(true);
    const r = await newsAdminApi.uploadImage(articleId, imageFile);
    setUploadingImage(false);
    if (!r.success) toast.error(r.error ?? "Article saved, but the image failed to upload.");
  };

  const handleSave = async (mode: "save" | "submit" | "publish" | "schedule") => {
    if (!title.trim() || !summary.trim() || !body.trim()) { toast.error("Title, summary, and body are all required."); return; }
    if (mode === "schedule" && (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now())) {
      toast.error("Pick a real date and time in the future to schedule this article.");
      return;
    }

    setSaving(true);
    const payload = { title, category, subtitle, summary, body, tags, metaDescription: metaDescription || undefined };

    let result;
    if (article) {
      result = await newsAdminApi.update(article.id, {
        ...payload,
        ...(mode === "schedule" ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
      });
    } else {
      result = await newsAdminApi.create({
        ...payload,
        submitForReview: mode === "submit",
        ...(mode === "schedule" ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
      });
    }

    if (!result.success || !result.data) {
      setSaving(false);
      toast.error(result.error ?? "Could not save this article.");
      return;
    }

    // If this is an existing article being scheduled, the update endpoint
    // doesn't itself flip the status -- do that explicitly via the status
    // endpoint, same one the dashboard's own schedule action would use.
    if (mode === "schedule" && article) {
      const statusRes = await newsAdminApi.setStatus(article.id, "scheduled", new Date(scheduledAt).toISOString());
      if (!statusRes.success) { setSaving(false); toast.error(statusRes.error ?? "Saved, but could not schedule."); return; }
    }

    await uploadPendingImage(result.data.id);
    setSaving(false);
    toast.success(
      mode === "schedule" ? "Scheduled." : mode === "publish" ? "Published." : mode === "submit" ? "Submitted for review." : "Saved."
    );
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <p className="font-bold text-gray-900 text-sm">{article ? "Edit Article" : "New Article"}</p>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Hero image */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Hero Image</label>
            <label className="flex items-center gap-3 border border-dashed border-gray-300 rounded-xl p-3 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50 transition-colors">
              {imagePreview ? (
                <img src={imagePreview} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-6 h-6 text-gray-400" />
                </div>
              )}
              <span className="text-xs text-gray-500">{imageFile ? imageFile.name : imagePreview ? "Click to replace" : "Click to upload a hero image (JPG/PNG, max 8MB)"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={e => handleImageSelect(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Category *</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Subtitle</label>
              <input value={subtitle} onChange={e => setSubtitle(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Summary *</label>
            <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none resize-none" />
          </div>

          {/* Rich text body */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Body *</label>
            <RichTextEditor value={body} onChange={setBody} placeholder="Write the article…" />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5"><TagIcon className="w-3.5 h-3.5" /> Tags</label>
            <div className="flex flex-wrap gap-1.5 p-2 border border-gray-200 rounded-xl items-center">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                  {t}
                  <button type="button" onClick={() => setTags(prev => prev.filter(x => x !== t))} className="text-gray-400 hover:text-gray-700">×</button>
                </span>
              ))}
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
                onBlur={addTag} placeholder="Type a tag, press Enter" className="flex-1 min-w-[100px] text-sm outline-none px-1 py-0.5" />
            </div>
          </div>

          {/* SEO */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">SEO Description <span className="font-normal text-gray-400">(shown in search results and link previews)</span></label>
            <textarea value={metaDescription} onChange={e => setMetaDescription(e.target.value)} rows={2} maxLength={160}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none resize-none" />
            <p className="text-[11px] text-gray-400 mt-1 text-right">{metaDescription.length}/160</p>
          </div>

          {/* Scheduling — leadership only */}
          {canPublishDirectly && (
            <div className="rounded-xl border border-gray-200 p-3.5">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                <input type="checkbox" checked={scheduleEnabled} onChange={e => setScheduleEnabled(e.target.checked)} className="w-4 h-4" style={{ accentColor: GREEN }} />
                <Calendar className="w-3.5 h-3.5" /> Schedule for later instead of publishing now
              </label>
              {scheduleEnabled && (
                <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                  min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                  className="mt-2.5 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            {article ? (
              <>
                <button disabled={saving || uploadingImage} onClick={() => handleSave("save")} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: GREEN }}>
                  {saving || uploadingImage ? "Saving…" : "Save Changes"}
                </button>
                {canPublishDirectly && scheduleEnabled && (
                  <button disabled={saving || uploadingImage} onClick={() => handleSave("schedule")} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-gray-200 text-gray-700 disabled:opacity-50">
                    Save &amp; Schedule
                  </button>
                )}
              </>
            ) : canPublishDirectly ? (
              <>
                <button disabled={saving || uploadingImage} onClick={() => handleSave("submit")} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-gray-200 text-gray-700 disabled:opacity-50">
                  Save as Draft / Submit for Review
                </button>
                {scheduleEnabled ? (
                  <button disabled={saving || uploadingImage} onClick={() => handleSave("schedule")} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: GREEN }}>
                    {saving || uploadingImage ? "…" : "Schedule"}
                  </button>
                ) : (
                  <button disabled={saving || uploadingImage} onClick={() => handleSave("publish")} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: GREEN }}>
                    {saving || uploadingImage ? "…" : "Publish Now"}
                  </button>
                )}
              </>
            ) : (
              <button disabled={saving || uploadingImage} onClick={() => handleSave("submit")} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: GREEN }}>
                {saving || uploadingImage ? "Submitting…" : "Submit for Review"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
