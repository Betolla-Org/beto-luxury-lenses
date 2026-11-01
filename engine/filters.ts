const smoothingAlpha = (cutoffHz: number, dtSeconds: number) => {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSeconds);
};

/**
 * One Euro filter (Casiez et al., 2012): heavy smoothing while the signal is still
 * (kills landmark jitter) and light smoothing while it moves fast (no lag).
 *
 * - minCutoff: lower = smoother at rest.
 * - beta: higher = less lag during fast motion.
 */
export class OneEuroFilter {
  private value: number | null = null;
  private derivative = 0;
  private lastTimeMs = 0;

  constructor(
    private readonly minCutoff = 1.0,
    private readonly beta = 0.0,
    private readonly derivativeCutoff = 1.0
  ) {}

  filter(raw: number, timeMs: number): number {
    if (this.value === null) {
      this.value = raw;
      this.lastTimeMs = timeMs;
      return raw;
    }

    const dt = Math.max((timeMs - this.lastTimeMs) / 1000, 1e-3);
    this.lastTimeMs = timeMs;

    const rawDerivative = (raw - this.value) / dt;
    this.derivative += smoothingAlpha(this.derivativeCutoff, dt) * (rawDerivative - this.derivative);

    const cutoff = this.minCutoff + this.beta * Math.abs(this.derivative);
    this.value += smoothingAlpha(cutoff, dt) * (raw - this.value);
    return this.value;
  }

  reset() {
    this.value = null;
    this.derivative = 0;
  }
}
