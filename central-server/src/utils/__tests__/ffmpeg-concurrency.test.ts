import { ConcurrencyLimiter } from '../ffmpeg-concurrency';

describe('ConcurrencyLimiter', () => {
  it('ne dépasse jamais la limite de slots concurrents', async () => {
    const limiter = new ConcurrencyLimiter(2);
    let running = 0;
    let maxObserved = 0;

    const makeTask = () => limiter.run(async () => {
      running++;
      maxObserved = Math.max(maxObserved, running);
      await new Promise((r) => setTimeout(r, 10));
      running--;
    });

    await Promise.all(Array.from({ length: 10 }, makeTask));

    expect(maxObserved).toBe(2);
    expect(limiter.activeCount).toBe(0);
    expect(limiter.queuedCount).toBe(0);
  });

  it('libère le slot même si la tâche throw', async () => {
    const limiter = new ConcurrencyLimiter(1);

    await expect(limiter.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');

    // Le slot doit être libéré → la tâche suivante s'exécute.
    const result = await limiter.run(async () => 'ok');
    expect(result).toBe('ok');
    expect(limiter.activeCount).toBe(0);
  });

  it('traite la file en FIFO', async () => {
    const limiter = new ConcurrencyLimiter(1);
    const order: number[] = [];

    const tasks = [1, 2, 3].map((n) => limiter.run(async () => {
      order.push(n);
      await new Promise((r) => setTimeout(r, 5));
    }));

    await Promise.all(tasks);
    expect(order).toEqual([1, 2, 3]);
  });

  it('force un minimum de 1 slot même si on passe 0 ou négatif', () => {
    expect(new ConcurrencyLimiter(0).limit).toBe(1);
    expect(new ConcurrencyLimiter(-5).limit).toBe(1);
  });
});
