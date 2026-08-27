export interface MetricSnapshot {
  fps: number;
  p95: number;
}

export class FrameMetrics {
  private lastTime = 0;
  private readonly samples: number[] = [];

  push(time: number): void {
    if (this.lastTime > 0) {
      const elapsed = time - this.lastTime;
      if (elapsed > 0 && elapsed < 1_000) this.samples.push(elapsed);
      if (this.samples.length > 180) this.samples.splice(0, this.samples.length - 180);
    }
    this.lastTime = time;
  }

  snapshot(): MetricSnapshot {
    if (this.samples.length === 0) return { fps: 0, p95: 0 };
    const total = this.samples.reduce((sum, sample) => sum + sample, 0);
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
    return {
      fps: Math.round(1_000 / (total / this.samples.length)),
      p95: Number(sorted[p95Index].toFixed(1)),
    };
  }
}
