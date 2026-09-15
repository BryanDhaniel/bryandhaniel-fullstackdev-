import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Issues, rotates and revokes refresh tokens.
 *
 * Three properties this service exists to provide, none of which a plain signed
 * JWT would give us — see docs/adr/0004:
 *
 *   1. **Revocability.** Logout must actually invalidate the token server-side,
 *      not merely ask the client to forget it.
 *   2. **Rotation.** Consuming a token revokes it, so a replayed token fails.
 *   3. **Leak resistance.** Only a bcrypt hash is stored, so a database dump
 *      yields no usable session.
 *
 * Tokens are opaque random strings, not JWTs: they carry no claims, and every
 * property they need (owner, expiry, validity) lives in the database where it
 * can be changed after issuance.
 */
@Injectable()
export class RefreshTokenService {
  /** 32 bytes = 256 bits of entropy. Guessing is not a threat here. */
  private static readonly TOKEN_BYTES = 32;
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /** Creates a new refresh token for a user. Returns the raw token exactly once. */
  async issue(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(RefreshTokenService.TOKEN_BYTES).toString('base64url');
    const tokenHash = await bcrypt.hash(token, this.config.bcryptRounds);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.config.jwtRefreshExpiresInDays);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return { token, expiresAt };
  }

  /**
   * Validates a raw token and, if valid, **revokes it** and returns its owner.
   *
   * Revocation-on-consume is the rotation mechanism: the caller must issue a
   * replacement. A token presented twice therefore fails the second time.
   *
   * @throws UnauthorizedException if the token is unknown, expired or revoked.
   */
  async consume(rawToken: string): Promise<string> {
    const record = await this.findByToken(rawToken);

    if (!record) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (record.revokedAt) {
      // Presenting an already-revoked token means either a replay or a race
      // between two tabs. We revoke the whole chain: if the token was stolen,
      // this ends the attacker's session too, at the cost of the legitimate
      // user having to log in again.
      this.logger.warn(
        `Reuse of revoked refresh token for user ${record.userId}; revoking all sessions`,
      );
      await this.revokeAllForUser(record.userId);
      throw new UnauthorizedException('Refresh token has already been used');
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    return record.userId;
  }

  /** Revokes a single token. Silently ignores unknown tokens (idempotent logout). */
  async revoke(rawToken: string): Promise<void> {
    const record = await this.findByToken(rawToken);
    if (!record || record.revokedAt) return;

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
  }

  /** Ends every session for a user. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Finds a token record by comparing against stored hashes.
   *
   * bcrypt hashes are salted, so a token cannot be looked up by hashing it and
   * matching a column — the hash must be verified. That means scanning the
   * user's unexpired tokens. We cannot narrow by user (the token does not
   * identify one), so we scan unexpired, unrevoked rows.
   *
   * This is acceptable at this scale because the working set is small and
   * refresh is an infrequent operation. It would **not** scale to millions of
   * live sessions; the fix would be to store a non-secret lookup prefix
   * alongside the hash, or to use a keyed HMAC instead of bcrypt so the column
   * becomes searchable. Noted in docs/API.md as a known limitation.
   */
  private async findByToken(rawToken: string): Promise<{
    id: string;
    userId: string;
    expiresAt: Date;
    revokedAt: Date | null;
  } | null> {
    const candidates = await this.prisma.refreshToken.findMany({
      where: { expiresAt: { gt: new Date() } },
      select: { id: true, userId: true, tokenHash: true, expiresAt: true, revokedAt: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    for (const candidate of candidates) {
      if (await bcrypt.compare(rawToken, candidate.tokenHash)) {
        return {
          id: candidate.id,
          userId: candidate.userId,
          expiresAt: candidate.expiresAt,
          revokedAt: candidate.revokedAt,
        };
      }
    }

    return null;
  }

  /** Housekeeping: removes expired rows. Safe to run periodically. */
  async pruneExpired(): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return count;
  }
}
