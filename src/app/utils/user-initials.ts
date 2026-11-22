/**
 * Initials shown in the avatar of a user without a photo.
 *
 * The topbar and the profile screen use the same rule — previously the profile showed "TK" while
 * the topbar showed an empty circle. Uppercasing follows Turkish rules
 * (ismail → İ): a name is a name, it does not depend on the UI language.
 */
export function userInitials(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback?: string | null
): string {
  const initials = firstLetter(firstName) + firstLetter(lastName);
  return initials || firstLetter(fallback) || '?';
}

/**
 * Initials from a single full-name string (the name claim in the JWT has no separate first/last name):
 * first letter of the first and last words, or of the single word if there is only one.
 */
export function initialsFromFullName(
  fullName: string | null | undefined,
  fallback?: string | null
): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return userInitials('', '', fallback);
  return userInitials(parts[0], parts.length > 1 ? parts[parts.length - 1] : '', fallback);
}

function firstLetter(value: string | null | undefined): string {
  const ch = (value ?? '').trim().charAt(0);
  return ch ? ch.toLocaleUpperCase('tr') : '';
}
