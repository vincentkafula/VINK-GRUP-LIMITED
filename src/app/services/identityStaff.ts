/** The identity check by Sumsub as staff see it, for any kind of application: the stage, Sumsub's answer and reasons (the applicant sees none of these), whether it is required before approval, and any override. */
export type IdentityStage = "not_started" | "in_progress" | "pending" | "on_hold" | "approved" | "retry" | "rejected";
export interface IdentityStaff {
  enabled: boolean; status: IdentityStage; requirement: "required" | "recommended" | "off"; confirmed: boolean; reviewStatus: string | null; reviewAnswer: string | null; rejectType: string | null;
  rejectLabels: string[]; moderationComment: string | null; clientComment: string | null; consentAt: string | null; attempts: number; reviewedAt: string | null; applicantId: string | null; levelName: string | null; caseUrl: string | null;
  override: { reason: string; by: string; at: string } | null;
}
