/** Full name if the customer gave one (shared by server queries and UI). */
export function displayName(c: {
  firstName: string | null;
  lastName: string | null;
}): string | null {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || null;
}
