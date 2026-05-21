import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type Bucket = {
  timestamps: number[];
};

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();
  private readonly contentBuckets = new Map<string, Bucket>();
  private lastCleanupAt = Date.now();

  assertRateLimit(scope: string, key: string, limit: number, windowMs: number) {
    if (!this.consume(scope, key, limit, windowMs)) {
      console.warn(`[rate-limit] scope=${scope} key=${key} limit=${limit}/${windowMs}ms`);
      throw new HttpException('Too many requests. Please slow down.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  assertContentBurst(scope: string, key: string, content: string, limit: number, windowMs: number) {
    const normalized = this.normalizeContent(content);
    if (!normalized) return;

    if (!this.consume(`content:${scope}`, `${key}:${normalized}`, limit, windowMs)) {
      console.warn(`[rate-limit] scope=content:${scope} key=${key} limit=${limit}/${windowMs}ms`);
      throw new HttpException('Repeated content detected. Please slow down.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  isAllowed(scope: string, key: string, limit: number, windowMs: number) {
    return this.consume(scope, key, limit, windowMs);
  }

  private consume(scope: string, key: string, limit: number, windowMs: number) {
    const now = Date.now();
    this.cleanup(now);

    const bucketKey = `${scope}:${key}`;
    const store = scope.startsWith('content:') ? this.contentBuckets : this.buckets;
    const bucket = store.get(bucketKey) ?? { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < windowMs);

    if (bucket.timestamps.length >= limit) {
      store.set(bucketKey, bucket);
      return false;
    }

    bucket.timestamps.push(now);
    store.set(bucketKey, bucket);
    return true;
  }

  private cleanup(now: number) {
    if (now - this.lastCleanupAt < 60_000) return;
    this.lastCleanupAt = now;

    for (const [key, bucket] of this.buckets) {
      if (bucket.timestamps.every((timestamp) => now - timestamp > 120_000)) this.buckets.delete(key);
    }
    for (const [key, bucket] of this.contentBuckets) {
      if (bucket.timestamps.every((timestamp) => now - timestamp > 120_000)) this.contentBuckets.delete(key);
    }
  }

  private normalizeContent(content: string) {
    return content.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 160);
  }
}
