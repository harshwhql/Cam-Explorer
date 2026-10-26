// HTTP Digest authentication (RFC 7616 / 2617), MD5 + qop=auth — what Dahua/CP Plus use.
import { md5 } from './md5';

export interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
}

const PARAM_RE = /([a-zA-Z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,\s]+))/g;

export function parseWwwAuthenticate(header: string | null | undefined): DigestChallenge | null {
  if (!header) return null;
  const start = header.search(/digest\s/i);
  if (start === -1) return null;
  // Some devices send "Digest ..., Basic realm=..." in one header — stop at the next scheme.
  let body = header.slice(start + 'digest'.length);
  const nextScheme = body.search(/,\s*(basic|bearer|negotiate)\s/i);
  if (nextScheme !== -1) body = body.slice(0, nextScheme);

  const params: Record<string, string> = {};
  for (const m of body.matchAll(PARAM_RE)) {
    const key = m[1]!.toLowerCase();
    const value = m[2] !== undefined ? m[2].replace(/\\(.)/g, '$1') : (m[3] ?? '');
    params[key] = value;
  }
  if (params.realm === undefined || !params.nonce) return null;
  return {
    realm: params.realm,
    nonce: params.nonce,
    qop: params.qop,
    opaque: params.opaque,
    algorithm: params.algorithm,
  };
}

export function offersBasicOnly(header: string | null | undefined): boolean {
  return !!header && /basic\s/i.test(header) && !/digest\s/i.test(header);
}

export interface DigestRequest {
  username: string;
  password: string;
  method: string;
  uri: string;
  challenge: DigestChallenge;
  cnonce: string;
  nc?: number;
}

function quote(v: string): string {
  return `"${v.replace(/(["\\])/g, '\\$1')}"`;
}

export function buildDigestAuthorization(req: DigestRequest): string {
  const { username, password, method, uri, challenge, cnonce } = req;
  const algorithm = (challenge.algorithm ?? 'MD5').toUpperCase();
  if (algorithm !== 'MD5' && algorithm !== 'MD5-SESS') {
    throw new Error(`Unsupported digest algorithm ${challenge.algorithm}`);
  }
  const nc = (req.nc ?? 1).toString(16).padStart(8, '0');
  const qopList = (challenge.qop ?? '').split(',').map((s) => s.trim().toLowerCase());
  const useQop = qopList.includes('auth');

  let ha1 = md5(`${username}:${challenge.realm}:${password}`);
  if (algorithm === 'MD5-SESS') ha1 = md5(`${ha1}:${challenge.nonce}:${cnonce}`);
  const ha2 = md5(`${method.toUpperCase()}:${uri}`);
  const response = useQop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);

  const parts = [
    `username=${quote(username)}`,
    `realm=${quote(challenge.realm)}`,
    `nonce=${quote(challenge.nonce)}`,
    `uri=${quote(uri)}`,
    `algorithm=${challenge.algorithm ?? 'MD5'}`,
    `response=${quote(response)}`,
  ];
  if (useQop) parts.push('qop=auth', `nc=${nc}`, `cnonce=${quote(cnonce)}`);
  if (challenge.opaque !== undefined) parts.push(`opaque=${quote(challenge.opaque)}`);
  return `Digest ${parts.join(', ')}`;
}

export function randomCnonce(): string {
  const bytes = new Uint8Array(8);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
