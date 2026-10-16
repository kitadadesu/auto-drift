// The audio clock freezes with a suspended context. Gaps advance the journey
// once, never replay a burst of missed harmony transitions or allocate voices.
export class ActiveClock {
  resume(seconds) { this.last = seconds; }
  pause() { this.last = null; }
  advance(seconds) {
    if (this.last == null) { this.last = seconds; return 0; }
    const dt = Math.max(0, (seconds - this.last) * 1000);
    this.last = seconds;
    return dt;
  }
}
