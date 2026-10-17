import { API_BASE } from "../../services/config";
import { authFetch } from "../../services/apiClient";
import { adminClient } from "./adminApi";
import type { StatusId, CriterionId, AwardStage, ReportStatus } from "../../data/sponsorship";

/** The staff side of sponsorships (/api/admin/sponsorship): typed answers, and downloads that carry the signed-in session. */
export const call = adminClient("/api/admin/sponsorship");

export interface Row {
  ref: string; status: StatusId; statusLabel: string; applicantName: string; organisation: string; orgType: string; email: string; category: string; projectTitle: string;
  country: string; province: string | null; currency: string; amountRequested: number; amountZar: number | null; assignedTo: string | null; assignedName: string | null;
  replied: boolean; delivered: boolean; createdAt: string; updatedAt: string;
}
export interface Weights { weights: Record<CriterionId, number>; approvalLimitZar: number | null }
export interface Me { userId: string; name: string; role: string; isSuper: boolean; isFinance: boolean; sectionName: string; settings: Weights }
export interface Doc { id: string; kind: string; filename: string; mime: string; sizeBytes: number; sha256: string; scanStatus: string; scanDetail: string | null; sourceId: string | null }
export interface Hist { fromStatus: string | null; toStatus: string; reason: string; applicantMessage: string | null; changedBy: string | null; at: string }
export interface Reviewer { reviewerId: string; reviewerName: string; scores: Record<string, number>; comment: string | null; total: number | null; updatedAt: string }
export interface Milestone { id: string; title: string; dueDate: string | null; status: "pending" | "done"; doneAt: string | null; note: string | null }
export interface Payment { id: string; kind: string; kindLabel: string; amount: number; paidOn: string; reference: string | null; note: string | null; recordedBy: string; createdAt: string }
export interface Award {
  id: string; amount: number; currency: string; amountZar: number | null; conditions: string | null; stage: AwardStage; stageLabel: string; agreementSentAt: string | null; agreementSignedAt: string | null;
  signedOn: string | null; agreementNote: string | null; milestones: Milestone[]; payments: Payment[]; disbursed: number; remaining: number;
}
export interface Report {
  id: string; beneficiaries: number; summary: string; outcomes: string; benefitsDelivered: Record<string, string>; spent: number; expenditureNotes: string | null; challenges: string | null;
  status: ReportStatus; statusLabel: string; reviewNote: string | null; reviewedBy: string | null; reviewedAt: string | null; createdAt: string;
}
export interface Detail extends Row {
  id: string; details: Record<string, unknown> & { expenditure?: { description: string; amount: number }[]; benefits?: string[] }; screening: { level: "info" | "review"; note: string }[]; fxRate: number | null; consentAt: string;
  statusMessage: string | null; documents: Doc[]; history: Hist[]; nextStatuses: StatusId[]; review: { weights: Record<CriterionId, number>; reviewers: Reviewer[]; average: number | null };
  award: Award | null; replies: { id: string; message: string; at: string }[]; reports: Report[]; mayApprove: boolean;
}
export interface Summary {
  total: number; byStatus: { id: string; label: string; count: number }[]; byCategory: Group[]; byLocation: Group[]; byMonth: Group[];
  totals: { requestedZar: number; awardedZar: number; disbursedZar: number; notConverted: number }; scores: { reviewed: number; average: number | null };
}
export interface Group { id: string; label: string; count: number; requestedZar: number; awardedZar: number }
export interface BudgetLine { ref: string; organisation: string; project: string; category: string; stage: string; stageLabel: string; currency: string; awarded: number; awardedZar: number | null; paid: number; paidZar: number | null; remaining: number; milestonesDone: number; milestonesTotal: number; overdue: number }
export interface Budget { totals: { requestedZar: number; approvedZar: number; committedZar: number; paidZar: number; awards: number; notConverted: number }; awards: BudgetLine[] }

/** Fetches a file with the signed-in session and either saves it or opens it in a new tab (a PDF). Returns an error message, or nothing when it worked. */
export async function fetchFile(path: string, how: { save: string } | { open: true }): Promise<{ error: string } | void> {
  try {
    const res = await authFetch(`${API_BASE}/api/admin/sponsorship${path}`, { method: "GET" });
    if (!res.ok) { const b = await res.json().catch(() => ({})); return { error: (b as { error?: string }).error ?? `Request failed (${res.status})` }; }
    const url = URL.createObjectURL(await res.blob());
    if ("open" in how) window.open(url, "_blank", "noopener");
    else { const a = document.createElement("a"); a.href = url; a.download = how.save; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000); }
  } catch { return { error: "We could not reach the server. Please try again." }; }
}

/** Reads an answer the server puts under "data". */
export async function getData<T>(path: string): Promise<{ data: T } | { error: string }> {
  const r = await call<{ data: T }>(path);
  return "error" in r ? r : { data: r.data.data };
}
/** Sends a change and reads the answer under "data" (or {} when there is none). */
export async function send<T = unknown>(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<{ data: T } | { error: string }> {
  const r = await call<{ data?: T }>(path, { method, body });
  return "error" in r ? r : { data: r.data.data as T };
}
