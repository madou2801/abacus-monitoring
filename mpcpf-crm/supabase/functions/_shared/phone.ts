// phone.ts — normalisation E.164 best-effort, miroir TS de crm.normalize_phone.
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^0-9+]/g, "");
  digits = digits.replace(/(?!^)\+/g, ""); // '+' uniquement en tête
  if (digits === "") return null;
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.startsWith("33")) return "+" + digits;
  if (digits.startsWith("0") && digits.length === 10) return "+33" + digits.slice(1);
  return digits;
}
