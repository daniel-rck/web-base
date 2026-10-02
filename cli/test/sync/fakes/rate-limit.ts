/**
 * A stand-in for Cloudflare's Rate Limiting binding (`RateLimit.limit`). It
 * records every key it is asked about and answers with `allow`.
 */
export class FakeRateLimit {
  readonly keys: string[] = [];
  allow = true;

  async limit(options: { key: string }): Promise<{ success: boolean }> {
    this.keys.push(options.key);
    return { success: this.allow };
  }
}
