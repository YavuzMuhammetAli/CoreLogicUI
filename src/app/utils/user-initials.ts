/**
 * Fotoğrafı olmayan kullanıcının avatarında gösterilen baş harfler.
 *
 * Topbar ve profil ekranı aynı kuralı kullanır — eskiden profil "TK" gösterirken
 * topbar boş bir daire gösteriyordu. Büyük harf Türkçe kurala göre yapılır
 * (ismail → İ): ad bir isimdir, arayüz diline bağlı değildir.
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
 * Tek parça tam addan baş harfler (JWT'deki ad claim'i ayrı ad/soyad taşımaz):
 * ilk ve son kelimenin ilk harfi, tek kelimeyse onun ilk harfi.
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
