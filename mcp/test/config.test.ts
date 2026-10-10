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
});
