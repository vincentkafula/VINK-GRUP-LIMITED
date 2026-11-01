/**
 * What Sumsub's states mean to us. Sumsub says where a check is with `reviewStatus` (init, pending, prechecked, queued, onHold, completed) and, once it is
 * completed, how it went with `reviewResult.reviewAnswer` (GREEN or RED) and, for RED, `reviewRejectType` (RETRY: they may fix it and send again; FINAL: no).
 */
export type IdentityStatus = "not_started" | "in_progress" | "pending" | "on_hold" | "approved" | "retry" | "rejected";
export const IDENTITY_STATUSES: IdentityStatus[] = ["not_started", "in_progress", "pending", "on_hold", "approved", "retry", "rejected"];

export interface SumsubReviewResult { reviewAnswer?: string; reviewRejectType?: string; rejectLabels?: string[]; moderationComment?: string; clientComment?: string }

/** The status for a Sumsub state, or null when the state is not one we know (the caller then leaves the status as it is). */
export function identityStatusFor(reviewStatus: unknown, result?: SumsubReviewResult | null): IdentityStatus | null {
  switch (typeof reviewStatus === "string" ? reviewStatus : "") {
    case "init": return "in_progress";
    case "pending": case "prechecked": case "queued": return "pending";
    case "onHold": return "on_hold";
    case "completed": {
      const answer = String(result?.reviewAnswer ?? "").toUpperCase();
      if (answer === "GREEN") return "approved";
      if (answer === "RED") return String(result?.reviewRejectType ?? "").toUpperCase() === "RETRY" ? "retry" : "rejected";   // RED without a clear RETRY is treated as final: never invite a retry that was not offered
      return null;
    }
    default: return null;
  }
}

/** Sumsub's event types and the review status each one stands for, for events that do not carry a reviewStatus. */
export const EVENT_REVIEW_STATUS: Record<string, string> = { applicantCreated: "init", applicantReset: "init", applicantPending: "pending", applicantPrechecked: "prechecked", applicantOnHold: "onHold", applicantReviewed: "completed" };
