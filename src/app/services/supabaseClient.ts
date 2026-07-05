// ─── VMS Production Supabase Client ──────────────────────────────────────────
// Centralised Supabase access. Import from here — never instantiate elsewhere.

import { createClient, SupabaseClient, Session, User } from "@supabase/supabase-js";

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  ?? "https://placeholder.supabase.co";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "placeholder-anon-key";

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    autoRefreshToken:  true,
    persistSession:    true,
    detectSessionInUrl: true,
    storageKey: "vms-auth-session",
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// ─── Auth Helpers ────────────────────────────────────────────────────────────

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(email: string, password: string, meta?: Record<string, string>) {
  return supabase.auth.signUp({ email, password, options: { data: meta } });
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function sendPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  });
}

export async function updatePassword(newPassword: string) {
  return supabase.auth.updateUser({ password: newPassword });
}

export async function sendOtp(phone: string) {
  return supabase.auth.signInWithOtp({ phone });
}

export async function verifyOtp(phone: string, token: string) {
  return supabase.auth.verifyOtp({ phone, token, type: "sms" });
}

// ─── Profile Helpers ─────────────────────────────────────────────────────────

export async function getProfile(userId: string) {
  return supabase.from("profiles").select("*").eq("id", userId).single();
}

export async function updateProfile(userId: string, updates: Record<string, unknown>) {
  return supabase.from("profiles").update(updates).eq("id", userId);
}

// ─── Bank Account Helpers ─────────────────────────────────────────────────────

export async function getBankAccounts(profileId: string) {
  return supabase.from("bank_accounts").select("*").eq("profile_id", profileId).order("is_primary", { ascending: false });
}

export async function getTransactions(accountId: string, limit = 50) {
  return supabase
    .from("transactions")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit);
}

// ─── Notification Helpers ─────────────────────────────────────────────────────

export async function getNotifications(profileId: string, unreadOnly = false) {
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("profile_id", profileId)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(50);
  if (unreadOnly) query = query.eq("is_read", false);
  return query;
}

export async function markNotificationRead(id: string) {
  return supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
}

export async function markAllNotificationsRead(profileId: string) {
  return supabase.from("notifications").update({ is_read: true }).eq("profile_id", profileId).eq("is_read", false);
}

// ─── Loan Application Helpers ─────────────────────────────────────────────────

export async function submitLoanApplication(data: Record<string, unknown>) {
  return supabase.from("loan_applications").insert(data).select().single();
}

export async function getLoanApplications(profileId: string) {
  return supabase.from("loan_applications").select("*").eq("profile_id", profileId).order("created_at", { ascending: false });
}

// ─── Club Booking Helpers ─────────────────────────────────────────────────────

export async function getClubRoutes() {
  return supabase.from("club_routes").select("*").order("departure_date", { ascending: true });
}

export async function createClubBooking(data: Record<string, unknown>) {
  return supabase.from("club_bookings").insert(data).select().single();
}

export async function getBookingsByEmail(email: string) {
  return supabase.from("club_bookings").select("*, club_routes(*)").eq("passenger_email", email).order("created_at", { ascending: false });
}

// ─── Support Ticket Helpers ────────────────────────────────────────────────────

export async function createSupportTicket(data: Record<string, unknown>) {
  return supabase.from("support_tickets").insert(data).select().single();
}

export async function getSupportTickets(profileId: string) {
  return supabase.from("support_tickets").select("*").eq("profile_id", profileId).order("created_at", { ascending: false });
}

export async function addSupportMessage(ticketId: string, message: string, senderName: string) {
  return supabase.from("support_messages").insert({
    ticket_id: ticketId,
    sender_type: "customer",
    sender_name: senderName,
    message,
  });
}

// ─── VinkPoints Helpers ───────────────────────────────────────────────────────

export async function getVinkPoints(profileId: string) {
  return supabase.from("vinkpoints").select("*").eq("profile_id", profileId).single();
}

// ─── KYC Helpers ─────────────────────────────────────────────────────────────

export async function getKycRecord(profileId: string) {
  return supabase.from("kyc_records").select("*").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(1).single();
}

export async function submitKycRecord(data: Record<string, unknown>) {
  return supabase.from("kyc_records").insert(data).select().single();
}

// ─── FX Rates ─────────────────────────────────────────────────────────────────

export async function getFxRates() {
  return supabase.from("fx_rates").select("*");
}

// ─── Realtime Subscriptions ───────────────────────────────────────────────────

export function subscribeToNotifications(profileId: string, onNew: (n: Record<string, unknown>) => void) {
  return supabase
    .channel(`notifications:${profileId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "notifications",
      filter: `profile_id=eq.${profileId}`,
    }, payload => onNew(payload.new as Record<string, unknown>))
    .subscribe();
}

export function subscribeToTransactions(accountId: string, onNew: (t: Record<string, unknown>) => void) {
  return supabase
    .channel(`transactions:${accountId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "transactions",
      filter: `account_id=eq.${accountId}`,
    }, payload => onNew(payload.new as Record<string, unknown>))
    .subscribe();
}

export function subscribeToClubRoutes(onChange: (r: Record<string, unknown>) => void) {
  return supabase
    .channel("club_routes")
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "club_routes",
    }, payload => onChange(payload.new as Record<string, unknown>))
    .subscribe();
}
