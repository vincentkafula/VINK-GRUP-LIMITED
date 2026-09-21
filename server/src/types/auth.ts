// Staff/admin auth types. Extracted from the old types/mvno.ts (deleted
// along with everything MVNO-specific) since these two interfaces were
// never actually MVNO data — they're the auth system's own types, used
// by the banking admin panel like everything else.

export interface AdminUser {
  id: string;
  username: string;
  passwordHash: string;
  role: "superadmin" | "owner" | "noc_engineer" | "billing_admin" | "support_agent" | "readonly";
  name: string;
  email: string;
  lastLogin: string | null;
  createdAt: string;
}

export interface AuthPayload {
  userId: string;
  username: string;
  // Widened beyond AdminUser["role"] rather than a strict union, since
  // other domains (banking, etc.) use their own role strings against
  // this same auth system.
  role: string;
}
