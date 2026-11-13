// Copyright (C) 2026 Alexandre Demartin
// A playground's code in its URL (decision 005): `#code/` and the code, deflated and base64url-encoded, as the
// TypeScript Playground's `#code/`. The browser compresses it (`CompressionStream`), and a fragment never reaches the
// server. Imported by Playground.vue, so on /playground only.

/** The most code a link holds, in bytes of UTF-8; a link that inflates past it is not read. */
export const limit = 100_000;

const prefix = '#code/';

/** The fragment that holds `code`, `#code/…`; `undefined` past `limit`. */
export async function fragmentOf(code: string) {
  const bytes = new TextEncoder().encode(code);
  if (bytes.length > limit) return undefined;
  const deflated = new Uint8Array(await new Response(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  let binary = '';
  for (const byte of deflated) binary += String.fromCharCode(byte);
  return prefix + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The code of a fragment: `undefined` if it is not `#code/…`, `null` if its code cannot be read (not base64url, not
 * deflated, not UTF-8, or past `limit` once inflated, read no further).
 */
export async function codeOf(fragment: string) {
  if (!fragment.startsWith(prefix)) return undefined;
  try {
    // atob() takes base64 without its padding
    const
      deflated = Uint8Array.from(atob(fragment.slice(prefix.length).replace(/-/g, '+').replace(/_/g, '/')),
        char => char.charCodeAt(0)),
      reader = new Blob([deflated]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),
      decoder = new TextDecoder('utf-8', { fatal: true });
    let code = '', size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return code + decoder.decode();
      size += value.length;
      if (size > limit) {
        reader.cancel().catch(() => {});
        return null;
      }
      code += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  }
}
