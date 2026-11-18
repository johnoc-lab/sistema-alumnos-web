const prefix = "u-";
const domain = "@cuentas.sistema-alumnos.invalid";
export const staffUsernameMaxLength = 254 - prefix.length - domain.length;

export const staffUsernamePattern =
  "[A-Za-z0-9]{1," + staffUsernameMaxLength + "}";
const institutionalPattern =
  "[uU]-" +
  staffUsernamePattern +
  `@[cC][uU][eE][nN][tT][aA][sS]\\.[sS][iI][sS][tT][eE][mM][aA]-[aA][lL][uU][mM][nN][oO][sS]\\.[iI][nN][vV][aA][lL][iI][dD]`;
export const staffAccessPattern =
  "(?:" + staffUsernamePattern + "|" + institutionalPattern + ")";
const usernamePattern = new RegExp("^" + staffUsernamePattern + "$");
const fullIdentifierPattern = new RegExp("^" + institutionalPattern + "$");

export function suggestStaffUsername(firstName: string, lastName: string) {
  return (firstName + lastName)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, staffUsernameMaxLength);
}

export function staffUsernameFromIdentifier(identifier: string) {
  if (!fullIdentifierPattern.test(identifier)) return null;
  return identifier.slice(prefix.length, -domain.length).toLowerCase();
}

export function resolveStaffIdentifier(input: string) {
  const value = input.trim();
  const username = usernamePattern.test(value)
    ? value.toLowerCase()
    : staffUsernameFromIdentifier(value);
  return username === null ? null : prefix + username + domain;
}
export const staffIdentifierExample =
  "u-profesor01@cuentas.sistema-alumnos.invalid";
export const staffIdentifierHelp =
  "Usa tu usuario corto (por ejemplo, profesor01) o tu identificador completo (por ejemplo, " +
  staffIdentifierExample +
  ").";
