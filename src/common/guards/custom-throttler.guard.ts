import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  // Fallback untuk versi throttler yang tidak mengekspos argumen detail.
  protected throwThrottlingException(
    _context: ExecutionContext,
    _throttlerException?: unknown,
  ): never {
    // Pesan kustom saat rate limit tercapai. Coba ambil header reset dari response
    // agar bisa menampilkan sisa waktu cooldown secara akurat lintas versi.
    try {
      // @ts-ignore - method protected ada di base guard
      const { res } = this.getRequestResponse(_context) as {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res: any;
      };
      const resetHeader =
        res?.getHeader?.('X-RateLimit-Reset') ?? res?.getHeader?.('x-ratelimit-reset');

      let cooldownSeconds: number | undefined;
      if (resetHeader) {
        const now = Date.now();
        // Header bisa berupa epoch seconds, epoch millis, atau string tanggal.
        const resetMs = (() => {
          if (typeof resetHeader === 'number') return resetHeader > 1e12 ? resetHeader : resetHeader * 1000;
          const parsed = Number(resetHeader);
          if (!Number.isNaN(parsed)) return parsed > 1e12 ? parsed : parsed * 1000;
          const asDate = new Date(String(resetHeader)).getTime();
          return Number.isNaN(asDate) ? undefined : asDate;
        })();

        if (resetMs && resetMs > now) {
          cooldownSeconds = Math.ceil((resetMs - now) / 1000);
        }
      }

      if (typeof cooldownSeconds === 'number') {
        throw new ThrottlerException(
          `Terlalu banyak request. Coba lagi dalam ${cooldownSeconds} detik.`,
        );
      }
    } catch (_) {
      // Abaikan dan jatuhkan ke pesan default di bawah
    }

    throw new ThrottlerException('Terlalu banyak request. Coba lagi beberapa saat lagi.');
  }

  // Versi yang menampilkan sisa waktu cooldown (detik) jika argumen tersedia.
  // Menggunakan signature yang fleksibel agar kompatibel lintas versi.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async handleRequest(...args: any[]): Promise<boolean> {
    const context = args[0] as ExecutionContext | undefined;

    // Coba deteksi bentuk argumen berdasarkan versi:
    // Pola A (lama): (context, limit, ttl, remainingPoints, msBeforeNext)
    let remainingPoints: number | undefined = args[3];
    let msBeforeNext: number | undefined = args[4];

    // Pola B (baru): (context, limit, ttl, metricsObj)
    // di mana metricsObj: { remainingPoints: number, msBeforeNext: number, ... }
    const maybeMetrics = args[3];
    if (
      (typeof remainingPoints !== 'number' || typeof msBeforeNext !== 'number') &&
      maybeMetrics && typeof maybeMetrics === 'object'
    ) {
      remainingPoints = (maybeMetrics as any)?.remainingPoints;
      msBeforeNext = (maybeMetrics as any)?.msBeforeNext;
    }

    if (
      typeof remainingPoints === 'number' &&
      typeof msBeforeNext === 'number' &&
      remainingPoints < 0
    ) {
      const cooldown = Math.ceil(msBeforeNext / 1000);
      // Set Retry-After header untuk klien
      try {
        // @ts-ignore - method protected ada di base guard
        const { res } = this.getRequestResponse(context) as { res: any };
        res?.setHeader?.('Retry-After', String(cooldown));
      } catch (_) {}

      throw new ThrottlerException(
        `Terlalu banyak request. Coba lagi dalam ${cooldown} detik.`,
      );
    }

    // Jika argumen tidak sesuai, delegasikan ke parent. Parent akan memanggil
    // throwThrottlingException() ketika limit tercapai, yang sudah kita kustom.
    // @ts-ignore - panggil parent implementation
    return super.handleRequest?.apply(this, args) ?? true;
  }
}
