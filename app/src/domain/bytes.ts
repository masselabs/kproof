/* eslint-disable no-bitwise -- byte encoding is bit arithmetic */
/**
 * Byte helpers that do not depend on Buffer, atob or TextDecoder, so the same
 * code runs under Hermes and under jest.
 */

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64URL_INDEX: Record<string, number> = Object.fromEntries(
  Array.from(B64URL).map((c, i) => [c, i]),
);

/** Strict base64url without padding. Null on any other character or an impossible length. */
export function decodeBase64Url(input: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(input)) return null;
  if (input.length % 4 === 1) return null;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of input) {
    buffer = (buffer << 6) | B64URL_INDEX[ch];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += B64URL[(buffer >> bits) & 0x3f];
    }
  }
  if (bits > 0) out += B64URL[(buffer << (6 - bits)) & 0x3f];
  return out;
}

export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(out);
}

/** Strict UTF-8 decode. Null on an invalid, overlong or truncated sequence. */
export function utf8Decode(bytes: Uint8Array): string | null {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    let cp: number;
    let need: number;
    let min: number;
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i += 1;
      continue;
    } else if ((b0 & 0xe0) === 0xc0) {
      cp = b0 & 0x1f;
      need = 1;
      min = 0x80;
    } else if ((b0 & 0xf0) === 0xe0) {
      cp = b0 & 0x0f;
      need = 2;
      min = 0x800;
    } else if ((b0 & 0xf8) === 0xf0) {
      cp = b0 & 0x07;
      need = 3;
      min = 0x10000;
    } else {
      return null;
    }
    for (let k = 1; k <= need; k++) {
      const b = bytes[i + k];
      if (b === undefined || (b & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (b & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    out += String.fromCodePoint(cp);
    i += need + 1;
  }
  return out;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^([0-9a-fA-F]{2})*$/.test(clean)) throw new Error('fromHex: not an even-length hex string');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
