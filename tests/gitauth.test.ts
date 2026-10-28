import { describe, expect, it } from 'vitest';
import { gitAuthEnv, redact } from '../server/github/gitAuth.js';

describe('git auth', () => {
  const token = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
  it('passes the token via git config env, scoped to github.com, ignoring host config', () => {
    const env = gitAuthEnv(token);
    expect(env.GIT_CONFIG_KEY_0).toBe('http.https://github.com/.extraheader');
    expect(env.GIT_CONFIG_GLOBAL).toBe('/dev/null');
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
  });
  it('redacts raw and base64 tokens from messages', () => {
    const b64 = Buffer.from(`x-access-token:${token}`).toString('base64');
    const out = redact(`fail ${token} AUTHORIZATION: basic ${b64} other ghp_zzzzzzzzzzzzzzzzzzzzzzzz`, token);
    expect(out).not.toContain(token);
    expect(out).not.toContain(b64);
    expect(out).not.toMatch(/ghp_/);
  });
});
