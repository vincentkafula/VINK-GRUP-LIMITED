/**
 * A raw card number (PAN) is 13-19 consecutive digits. A masked_pan
 * field should never contain that -- it should look like
 * "**** **** **** 4242" or similar. This is a defensive backstop, not
 * the only control: the real control is that a route never expects or
 * documents a field for a full PAN in the first place. But if a field
 * somehow contains something PAN-shaped anyway (a misconfigured
 * caller, a bug upstream), reject the whole request outright rather
 * than storing it.
 *
 * Shared between terminalRouter.ts (taxi AFC) and retailRouter.ts
 * (retail POS) -- extracted here rather than duplicated in both, since
 * a security-critical check like this drifting out of sync between two
 * copies is a real risk worth avoiding, not just flagging in a comment.
 */
export function containsUnmaskedPan(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const digitsOnly = value.replace(/[\s-]/g, "");
  return /^\d{13,19}$/.test(digitsOnly);
}
