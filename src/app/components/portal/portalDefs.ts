/** The transport account types. The URL segment, the API prefix and the role name differ only for the vehicle owner. */
export const PORTALS = {
  personal:    { role: "personal",      segment: "personal",    title: "My Account",         subtitle: "Trips, payments and support",       color: "#8B0000" },
  driver:      { role: "driver",        segment: "driver",      title: "Driver's Dashboard", subtitle: "Trips, earnings and vehicle",       color: "#F59E0B" },
  marshal:     { role: "marshal",       segment: "marshal",     title: "Marshal Dashboard",  subtitle: "Rank queue and departures",         color: "#3B82F6" },
  owner:       { role: "vehicle_owner", segment: "owner",       title: "Owner Dashboard",    subtitle: "Vehicles, drivers and earnings",    color: "#B04040" },
  association: { role: "association",   segment: "association", title: "Association",        subtitle: "Members, ranks, routes and levies", color: "#EF4444" },
  investor:    { role: "investor",      segment: "investor",    title: "Investor Dashboard", subtitle: "Terminals and per-fare income",     color: "#14B8A6" },
} as const;
export type PortalKey = keyof typeof PORTALS;

/** Where a signed-in role belongs (null for roles that have no portal, e.g. staff and banking customers). */
export function portalPathForRole(role: string | undefined): string | null {
  const p = Object.values(PORTALS).find((x) => x.role === role);
  return p ? `/portal/${p.segment}` : null;
}
