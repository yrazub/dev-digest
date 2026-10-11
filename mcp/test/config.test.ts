import { describe, expect, it } from 'vitest';
import { loadMcpConfig } from '../src/config.js';

describe('loadMcpConfig', () => {
  it('uses the local API and 120 seconds, as milliseconds, when nothing is set', () => {
    expect(loadMcpConfig({})).toEqual({ apiUrl: 'http://127.0.0.1:3001', waitMs: 120_000 });
  });

  it('treats an empty or blank variable as unset', () => {
    const config = loadMcpConfig({ DEVDIGEST_API_URL: '', DEVDIGEST_MCP_WAIT_SECONDS: '  ' });
    expect(config).toEqual({ apiUrl: 'http://127.0.0.1:3001', waitMs: 120_000 });
  });

  it('reads both variables and converts the wait to milliseconds', () => {
    const config = loadMcpConfig({ DEVDIGEST_API_URL: 'https://api.example.test:8443', DEVDIGEST_MCP_WAIT_SECONDS: '30' });
    expect(config).toEqual({ apiUrl: 'https://api.example.test:8443', waitMs: 30_000 });
  });

  it('removes a trailing slash from the API URL', () => {
    expect(loadMcpConfig({ DEVDIGEST_API_URL: 'http://localhost:3001/' }).apiUrl).toBe('http://localhost:3001');
  });

  it.each(['not a url', 'localhost:3001', 'ftp://example.test', 'file:///etc/passwd'])(
    'rejects the API URL %j with an error naming DEVDIGEST_API_URL',
    (value) => {
      expect(() => loadMcpConfig({ DEVDIGEST_API_URL: value })).toThrow(/DEVDIGEST_API_URL/);
    },
  );

  it.each(['0', '601', 'abc', '-5', '1.5'])(
    'rejects wait seconds %j with an error naming DEVDIGEST_MCP_WAIT_SECONDS',
    (value) => {
      expect(() => loadMcpConfig({ DEVDIGEST_MCP_WAIT_SECONDS: value })).toThrow(/DEVDIGEST_MCP_WAIT_SECONDS/);
    },
  );

  it.each([
    ['1', 1_000],
    ['600', 600_000],
  ])('accepts the bound %s seconds', (value, ms) => {
    expect(loadMcpConfig({ DEVDIGEST_MCP_WAIT_SECONDS: value }).waitMs).toBe(ms);
  });

  describe('credentials in DEVDIGEST_API_URL (F2)', () => {
    const message = (env: NodeJS.ProcessEnv): string => {
      try {
        loadMcpConfig(env);
      } catch (err) {
        return (err as Error).message;
      }
      throw new Error('loadMcpConfig did not throw');
    };

    it.each(['http://alice:hunter2@127.0.0.1:3001', 'https://alice@example.test', 'http://:hunter2@127.0.0.1:3001'])(
      'rejects %j, naming the variable and the reason, without echoing the user or the password',
      (value) => {
        const text = message({ DEVDIGEST_API_URL: value });

        expect(text).toContain('DEVDIGEST_API_URL');
        expect(text).toContain('credentials are not allowed');
        // The message says "the user and password" in general; the actual credentials must not appear.
        expect(text).not.toContain('alice');
        expect(text).not.toContain('hunter2');
        expect(text).not.toContain(value);
      },
    );

    it.each(['ftp://example.test/x', 'file:///etc/passwd', 'not a url'])(
      'does not echo the raw value %j in the error of a rejected URL',
      (value) => {
        const text = message({ DEVDIGEST_API_URL: value });

        expect(text).toContain('DEVDIGEST_API_URL is invalid');
        expect(text).not.toContain(value);
        expect(text).not.toContain('Got');
      },
    );

    it.each([
      'http://127.0.0.1:3001?token=abc',
      'http://127.0.0.1:3001/api?token=abc',
      'http://127.0.0.1:3001#frag',
      'http://127.0.0.1:3001/api?token=abc#frag',
    ])('rejects %j: a query string or fragment is not allowed, and neither the value nor the secret is echoed', (value) => {
      const text = message({ DEVDIGEST_API_URL: value });

      expect(text).toContain('DEVDIGEST_API_URL is invalid');
      expect(text).toContain('a query string or fragment is not allowed');
      expect(text).not.toContain('abc');
      expect(text).not.toContain('#frag');
      expect(text).not.toContain('token=');
      expect(text).not.toContain(value);
      expect(text).not.toContain('Got');
    });

    it('still loads a URL with a path and no query, and drops the trailing slash', () => {
      expect(loadMcpConfig({ DEVDIGEST_API_URL: 'http://127.0.0.1:3001/api/' }).apiUrl).toBe('http://127.0.0.1:3001/api');
    });

    it('says an ftp URL must use http or https', () => {
      expect(message({ DEVDIGEST_API_URL: 'ftp://x' })).toContain('must use http or https');
    });

    it('still loads a valid URL without credentials, with a port and a path', () => {
      expect(loadMcpConfig({ DEVDIGEST_API_URL: 'http://127.0.0.1:3001/api' }).apiUrl).toBe('http://127.0.0.1:3001/api');
    });

    it.each(['abc', '0', '601'])('still quotes the wait seconds value %j in its error', (value) => {
      const text = message({ DEVDIGEST_MCP_WAIT_SECONDS: value });

      expect(text).toContain('DEVDIGEST_MCP_WAIT_SECONDS is invalid');
      expect(text).toContain(`Got "${value}".`);
    });
  });
});
