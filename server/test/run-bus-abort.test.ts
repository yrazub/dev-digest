import { describe, it, expect } from 'vitest';
import { RunBus } from '../src/platform/sse.js';

/** Cancel must reach a model call that is in flight, not only the next checkpoint. */
describe('RunBus run signal', () => {
  it('cancel() aborts the run signal with "Run cancelled"', () => {
    const bus = new RunBus();
    const signal = bus.signalFor('r1');
    expect(signal.aborted).toBe(false);
    bus.cancel('r1');
    expect(signal.aborted).toBe(true);
    expect((signal.reason as Error).message).toBe('Run cancelled');
    expect(bus.isCancelled('r1')).toBe(true);
  });

  it('a signal requested after cancel() is already aborted', () => {
    const bus = new RunBus();
    bus.cancel('r2');
    expect(bus.signalFor('r2').aborted).toBe(true);
  });

  it('runs get independent signals', () => {
    const bus = new RunBus();
    const a = bus.signalFor('a');
    const b = bus.signalFor('b');
    bus.cancel('a');
    expect(a.aborted).toBe(true);
    expect(b.aborted).toBe(false);
  });
});
