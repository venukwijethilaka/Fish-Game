// [ACADEMIC THEME 4: VIRTUAL IDENTITY & AUTHENTICATION MECHANISMS]
// Architecture: Adding Stateful Identity to Stateless HTTP/HTTPS (Combined Defense-in-Depth).
// - VIRTUAL IDENTITY ESTABLISHMENT: Prevents identity theft / impersonation across stateless HTTP
//   requests by unifying local credentials and federated Google OAuth/OIDC into one canonical UserRecord.
// - COMBINING MECHANISMS (No "One Size Fits All"): Combines Argon2id password hashing
//   (memoryCost: 19456 KiB, timeCost: 2, parallelism: 1) with signed HMAC-SHA256 JWTs stored inside
//   HttpOnly; SameSite=Lax; Secure cookies — avoiding unreliable IP-address checks (NAT/VPN/DHCP)
//   and XSS-vulnerable Web Storage (localStorage).
// - HYBRID SESSION REVOCATION & STATE: Each JWT carries a token version (tv) and random jti whose
//   SHA-256 hash is persisted in Neon PostgreSQL (`sessions` table), enabling instant revocation.
// - SECURITY VS. USABILITY TRADE-OFF: Balances usability with a 2-hour session cookie (no repeated
//   logins per click) while requiring 5-minute (300s) step-up reauthentication (`requireRecent`)
//   for high-risk actions (password change, account deletion).
// - ALTERNATIVE APPROACHES CONSIDERED & CRITIQUED:
//   * Plaintext / MD5 / SHA-256 Hashing:
//     Critique: Lack computational expense and salts; vulnerable to instantaneous rainbow-table reverse lookup.
//   * bcrypt:
//     Critique: Strong legacy choice, but lacks memory-hardness parameter; vulnerable to specialized FPGA hardware.
//   * Web Storage (localStorage / sessionStorage) Tokens:
//     Critique: Accessible to any third-party script or injected XSS vector; HttpOnly cookies are strictly required.
//   * Pure Stateless JWTs:
//     Critique: Impossible to revoke upon logout or credential breach until TTL expiry; hybrid JTI tracking fixes this.
//   * HTTP Basic Authentication:
//     Critique: Transmits user credentials on every request and lacks explicit server-side session termination.
import { hash, verify, Algorithm } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import { OAuth2Client } from 'google-auth-library';
import { randomUUID, createHash } from 'node:crypto';
import { AppError, ensure } from '../../errors.js';
import type { IUserRepository, UserRecord } from '../../infrastructure/repository.js';
export const tokenHash = (s: string) => createHash('sha256').update(s).digest('hex');
export class IdentityService {
  constructor(
    private repo: IUserRepository,
    private secret: Uint8Array,
    readonly googleClientId: string | null,
  ) {}
  async register(username: string, email: string, password: string) {
    const user: UserRecord = {
      id: randomUUID(),
      username,
      email,
      avatar: 'clownfish',
      hash: await this.hashPassword(password),
      google_sub: null,
      tv: 0,
    };
    await this.repo.createUser(user);
    return user;
  }
  hashPassword(password: string) {
    return hash(password, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }
  async login(email: string, password: string) {
    const u = await this.repo.byEmail(email);
    const valid = u?.hash ? await verify(u.hash, password) : false;
    ensure(u && valid, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    return u;
  }
  async google(credential: string, nonce: string) {
    ensure(
      this.googleClientId,
      503,
      'GOOGLE_NOT_CONFIGURED',
      'Google Sign-In has not been configured.',
    );
    const p = await this.googleClaims(credential);
    ensure(
      p?.sub && p.email && p.email_verified && (p as unknown as { nonce?: string }).nonce === nonce,
      401,
      'INVALID_GOOGLE',
      'Google identity could not be verified.',
    );
    const old = await this.repo.byGoogle(p.sub);
    if (old) return old;
    const existing = await this.repo.byEmail(p.email.toLowerCase());
    ensure(
      !existing,
      409,
      'ACCOUNT_CONFLICT',
      'This email already has an account. Sign in with its password; accounts are not linked automatically.',
    );
    const user: UserRecord = {
      id: randomUUID(),
      username: `Diver ${randomUUID().slice(0, 8)}`,
      email: p.email.toLowerCase(),
      avatar: 'turtle',
      hash: null,
      google_sub: p.sub,
      tv: 0,
    };
    await this.repo.createUser(user);
    return user;
  }
  private async googleClaims(credential: string) {
    try {
      const ticket = await new OAuth2Client(this.googleClientId!).verifyIdToken({
        idToken: credential,
        audience: this.googleClientId!,
      });
      return ticket.getPayload();
    } catch {
      throw new AppError(401, 'INVALID_GOOGLE', 'Google identity could not be verified.');
    }
  }
  async issue(user: UserRecord) {
    const jti = randomUUID();
    const jwt = await new SignJWT({ tv: user.tv })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setJti(jti)
      .setIssuer('reef')
      .setAudience('reef-web')
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(this.secret);
    await this.repo.addSession(tokenHash(jti), user.id, Date.now() + 7200000);
    return jwt;
  }
  async authenticate(token: string) {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: 'reef',
        audience: 'reef-web',
      });
      const user = payload.sub ? await this.repo.user(payload.sub) : undefined;
      const sessionKey = payload.jti ? tokenHash(payload.jti) : '';
      const session = await this.repo.session(sessionKey);
      ensure(
        user &&
          session &&
          session.user_id === user.id &&
          session.expires > Date.now() &&
          payload.tv === user.tv,
        401,
        'AUTH_REQUIRED',
        'Please sign in again.',
      );
      return { user, sessionKey };
    } catch {
      throw Object.assign(new Error('Please sign in again.'), {
        status: 401,
        code: 'AUTH_REQUIRED',
      });
    }
  }
  async reauthenticate(
    user: UserRecord,
    sessionKey: string,
    password?: string,
    credential?: string,
    nonce?: string,
  ) {
    let valid = false;
    if (password && user.hash) valid = await verify(user.hash, password);
    else if (credential && user.google_sub && this.googleClientId) {
      const p = await this.googleClaims(credential);
      valid = p?.sub === user.google_sub && (p as unknown as { nonce?: string })?.nonce === nonce;
    }
    ensure(valid, 401, 'REAUTH_FAILED', 'We could not confirm your identity. Please try again.');
    await this.repo.reauthenticate(sessionKey);
  }
  async requireRecent(sessionKey: string) {
    const sess = await this.repo.session(sessionKey);
    ensure(
      (sess?.reauth ?? 0) > Date.now() - 300000,
      403,
      'REAUTH_REQUIRED',
      'Please confirm your identity first.',
    );
  }
}
