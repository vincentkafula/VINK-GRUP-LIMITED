/** One password rule, used for registration, change and reset. Returns an error message, or null when acceptable. */
const COMMON = new Set(["password", "password1", "12345678", "123456789", "1234567890", "qwerty123", "iloveyou", "admin123", "welcome1", "letmein123"]);

export function passwordProblem(password: unknown, context: { username?: string; email?: string } = {}): string | null {
  if (typeof password !== "string") return "password is required";
  const p = password.trim();
  if (p.length < 8) return "password must be at least 8 characters";
  if (p.length > 128) return "password must be at most 128 characters";
  const lower = p.toLowerCase();
  if (COMMON.has(lower)) return "that password is too common";
  if (context.username && lower === context.username.toLowerCase()) return "password must not be your username";
  if (context.email && lower === context.email.toLowerCase()) return "password must not be your email address";
  return null;
}
