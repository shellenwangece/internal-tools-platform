import os from 'node:os';

/**
 * Env for git that authenticates to github.com without putting the token on the command line
 * (so it never appears in error messages or process lists) and ignores host-level git config.
 */
export function gitAuthEnv(token: string, base: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: os.tmpdir(),
    ...base,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
  };
}

/** Strips anything token-like from an error before it is logged or shown. */
export function redact(message: string, token: string): string {
  let out = message;
  if (token) out = out.split(token).join('***').split(Buffer.from(`x-access-token:${token}`).toString('base64')).join('***');
  return out.replace(/basic [A-Za-z0-9+/=]{20,}/g, 'basic ***').replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, '***');
}
