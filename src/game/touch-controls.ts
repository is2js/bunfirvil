/** Captured pointer keeps a held direction active until release/cancel, even
 * outside the pad. Only the owning finger may change or release movement. */
export class TouchMovementPad {
  private pointerId: number | null = null;

  constructor(private readonly pad: HTMLElement, private readonly onMove: (x: number, y: number) => void, signal: AbortSignal) {
    const update = (event: PointerEvent): void => {
      const rect = pad.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width * 2 - 1;
      const y = (event.clientY - rect.top) / rect.height * 2 - 1;
      const distance = Math.hypot(x, y);
      const angle = Math.round(Math.atan2(y, x) / (Math.PI / 4)) * Math.PI / 4;
      const dx = distance < .25 ? 0 : Math.round(Math.cos(angle));
      const dy = distance < .25 ? 0 : Math.round(Math.sin(angle));
      const travel = Math.min(distance, 1) * 24;
      pad.style.setProperty('--stick-x', `${distance ? x / distance * travel : 0}px`);
      pad.style.setProperty('--stick-y', `${distance ? y / distance * travel : 0}px`);
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
    this.pad.style.removeProperty('--stick-x');
    this.pad.style.removeProperty('--stick-y');
    this.onMove(0, 0);
  }
}
