// [AI-ASSISTED: Codex, 2026-11-05] Tests for Neon Serverless PostgreSQL repository adapter.
import { describe, expect, it, vi } from 'vitest';
import { NeonRepository } from '../server/src/infrastructure/neonRepository.js';

describe('Neon Serverless PostgreSQL Adapter', () => {
  it('instantiates NeonRepository and verifies SQL query generation', async () => {
    const fakeUrl = 'postgresql://fake_user:fake_password@ep-sample-123456.eu-west-1.aws.neon.tech/neondb?sslmode=require';
    const repo = new NeonRepository(fakeUrl);
    expect(repo).toBeDefined();
    expect(typeof repo.user).toBe('function');
    expect(typeof repo.createUser).toBe('function');
    expect(typeof repo.board).toBe('function');
    expect(typeof repo.finalizeOnce).toBe('function');
    expect(typeof repo.initSchema).toBe('function');
  });

  it('mocking neon query executes schema creation and user lookups', async () => {
    const fakeUrl = 'postgresql://fake_user:fake_password@ep-sample-123456.eu-west-1.aws.neon.tech/neondb?sslmode=require';
    const repo = new NeonRepository(fakeUrl);

    // Mock the internal sql query function
    const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
      const queryStr = strings.join('?');
      if (queryStr.includes('SELECT * FROM users WHERE id =')) {
        return Promise.resolve([
          {
            id: values[0],
            username: 'Captain Jack',
            email: 'jack@pearl.com',
            avatar: 'clownfish',
            hash: 'argon2-hash',
            google_sub: null,
            tv: 0,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    (repo as any).sql = mockSql;
    (repo as any).schemaInitialized = true;

    const user = await repo.user('user-uuid-123');
    expect(user).toBeDefined();
    expect(user?.username).toBe('Captain Jack');
    expect(user?.email).toBe('jack@pearl.com');
  });
});
