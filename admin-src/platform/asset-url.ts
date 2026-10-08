// Resolve legacy site assets at the render boundary without changing saved content.
export function rootAssetUrl(value: string): string {
  if (!value.startsWith("./assets/")) return value;
  const path = value.split(/[?#]/, 1)[0].slice(2);
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.includes("\\") || decoded.split("/").some(part => part === ".." || part === ".") || /[\u0000-\u001f]/.test(decoded)) return value;
    return value.slice(1);
  } catch { return value; }
}
