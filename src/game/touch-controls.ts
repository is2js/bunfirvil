/** Captured pointer keeps a held direction active until release/cancel, even
 * outside the pad. Only the owning finger may change or release movement. */
export class TouchMovementPad {
  private pointerId: number | null = null;

  constructor(private readonly pad: HTMLElement, private readonly onMove: (x: number, y: number) => void, signal: AbortSignal) {
    const update = (event: PointerEvent): void => {
      const rect = pad.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width * 2 - 1;
      const y = (event.clientY - rect.top) / rect.height * 2 - 1;
      const dx = Math.abs(x) < .33 ? 0 : Math.sign(x);
      const dy = Math.abs(y) < .33 ? 0 : Math.sign(y);
      pad.dataset.direction = `${dx},${dy}`;
      onMove(dx, dy);
    };
    pad.addEventListener('pointerdown', (event) => {
      if (this.pointerId !== null || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.pointerId = event.pointerId;
      pad.setPointerCapture(event.pointerId);
      update(event);
    }, { signal });
    pad.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      update(event);
    }, { signal });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      pad.addEventListener(name, (event) => {
        if (event.pointerId === this.pointerId) this.reset();
      }, { signal });
    }
    window.addEventListener('blur', () => this.reset(), { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); }, { signal });
    signal.addEventListener('abort', () => this.reset(), { once: true });
  }

  reset(): void {
    const id = this.pointerId;
    this.pointerId = null;
    if (id !== null && this.pad.hasPointerCapture(id)) this.pad.releasePointerCapture(id);
    delete this.pad.dataset.direction;
    this.onMove(0, 0);
  }
}
