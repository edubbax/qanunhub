// Supabase Auth access tokens. Projects on asymmetric signing keys are verified against the project's JWKS;
// projects still on the legacy shared JWT secret (and the tests) use HS256 with SUPABASE_JWT_SECRET.
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from 'jose';

export interface AuthClaims {
  sub: string;
  email: string;
}

export type TokenVerifier = (token: string | undefined) => Promise<AuthClaims | null>;

export function createTokenVerifier(opts: { supabaseUrl: string; jwtSecret: string }): TokenVerifier {
  const base = opts.supabaseUrl.replace(/\/+$/, '');
  const issuer = base ? `${base}/auth/v1` : undefined;
  const secret = opts.jwtSecret ? new TextEncoder().encode(opts.jwtSecret) : null;
  const jwks = base ? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { cacheMaxAge: 10 * 60_000 }) : null;

  return async (token) => {
    if (!token || token.length > 8192) return null;
    try {
      const { alg } = decodeProtectedHeader(token);
      const checks = { audience: 'authenticated', issuer, clockTolerance: 30 };
      let payload: JWTPayload;
      if (alg === 'HS256') {
        if (!secret) return null;
        ({ payload } = await jwtVerify(token, secret, { ...checks, algorithms: ['HS256'] }));
      } else {
        if (!jwks) return null;
        ({ payload } = await jwtVerify(token, jwks, { ...checks, algorithms: ['ES256', 'RS256'] }));
      }
      // Only real signed-in users: no anonymous sign-ins, no service tokens.
      if (payload.role !== 'authenticated' || payload.is_anonymous === true) return null;
      if (typeof payload.sub !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.sub)) return null;
      return { sub: payload.sub.toLowerCase(), email: typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '' };
    } catch {
      return null;
    }
  };
}
