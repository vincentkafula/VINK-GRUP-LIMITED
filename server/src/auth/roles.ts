/**
 * The five account types of the transport platform, kept separate from the staff roles
 * (superadmin, owner, noc_engineer, ...) and from "customer" (the VINK banking dashboard).
 *
 * NOTE: "owner" already means the PLATFORM's top authority in this system, so the vehicle owner is "vehicle_owner".
 */
export const ACCOUNT_ROLES = ["personal", "driver", "marshal", "vehicle_owner", "association", "investor"] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const isAccountRole = (r: unknown): r is AccountRole => typeof r === "string" && (ACCOUNT_ROLES as readonly string[]).includes(r);

/** Roles anyone may create for themselves at sign-up. Every other role is granted by an association or by staff (never self-service). */
export const SELF_SERVICE_ROLES = ["customer", "personal"] as const;

/** Where the front end sends each role after sign-in (a route inside the app, handled by the portal). */
export const DASHBOARD_PATH: Record<AccountRole, string> = {
  personal: "/portal/personal",
  driver: "/portal/driver",
  marshal: "/portal/marshal",
  vehicle_owner: "/portal/owner",
  association: "/portal/association",
  investor: "/portal/investor",
};
