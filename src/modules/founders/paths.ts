export const founderUsernamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function getFounderPath(username: string): string { return "/founder/" + encodeURIComponent(username); }
export function usernameFromName(name: string): string {
  const normalized = name.replace(/ı/g, "i").replace(/İ/g, "I").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "");
  return normalized.length >= 2 ? normalized : "member";
}

