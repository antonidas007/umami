import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const adapters = vi.hoisted(() => vi.fn());

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class {
    constructor(options: unknown) {
      adapters(options);
    }
  },
}));
vi.mock('@prisma/extension-read-replicas', () => ({
  readReplicas: () => () => ({}),
}));
vi.mock('@/generated/prisma/client', () => ({
  PrismaClient: class {
    $extends() {
      return this;
    }
  },
}));

beforeEach(() => {
  vi.resetModules();
  adapters.mockClear();
  Reflect.deleteProperty(globalThis, 'prisma');
  vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/umami');
  vi.stubEnv('DATABASE_REPLICA_URL', undefined);
  vi.stubEnv('DATABASE_POOL_MAX', undefined);
  vi.stubEnv('LOG_QUERY', undefined);
  vi.stubEnv('VERCEL', undefined);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'prisma');
  vi.unstubAllEnvs();
});

describe('PostgreSQL connection pools', () => {
  test('bounds Vercel pools and connection acquisition time', async () => {
    vi.stubEnv('VERCEL', '1');
    await import('./prisma');
    expect(adapters).toHaveBeenCalledExactlyOnceWith({
      connectionString: 'postgresql://test:test@localhost:5432/umami',
      max: 2,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
  });

  test('preserves the pg pool size outside Vercel', async () => {
    await import('./prisma');
    expect(adapters).toHaveBeenCalledWith(
      expect.objectContaining({ max: 10, connectionTimeoutMillis: 0 }),
    );
  });

  test('treats an empty override as unset', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('DATABASE_POOL_MAX', '');
    await import('./prisma');
    expect(adapters).toHaveBeenCalledWith(expect.objectContaining({ max: 2 }));
  });

  test('applies an explicit limit to both primary and replica pools', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('DATABASE_POOL_MAX', '1');
    vi.stubEnv('DATABASE_REPLICA_URL', 'postgresql://test:test@localhost:5432/replica');
    await import('./prisma');
    expect(adapters).toHaveBeenCalledTimes(2);
    for (const [options] of adapters.mock.calls) {
      expect(options).toMatchObject({ max: 1, connectionTimeoutMillis: 5000 });
    }
    expect(adapters).toHaveBeenLastCalledWith(
      expect.objectContaining({
        connectionString: 'postgresql://test:test@localhost:5432/replica',
      }),
    );
  });

  test.each(['0', '-1', '1.5', '101', 'NaN', 'Infinity'])(
    'rejects invalid limit %j',
    async value => {
      vi.stubEnv('DATABASE_POOL_MAX', value);
      await expect(import('./prisma')).rejects.toThrow('DATABASE_POOL_MAX must be an integer');
      expect(adapters).not.toHaveBeenCalled();
    },
  );
});
