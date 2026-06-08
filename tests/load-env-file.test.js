import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let loadEnvFile;

function extractLoadEnvFile() {
  if (loadEnvFile) return loadEnvFile;
  const lines = readFileSync(join(__dirname, '..', 'index.js'), 'utf-8').split('\n');
  const fnSrc = lines.slice(202, 223).join('\n');
  loadEnvFile = new Function('readFileSync', fnSrc + '\nreturn loadEnvFile;')(readFileSync);
  return loadEnvFile;
}

const TEST_ENV_PATH = join(__dirname, 'test-load-env-file.env');

describe('loadEnvFile', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = {};
    Object.assign(savedEnv, process.env);
  });

  afterEach(() => {
    Object.keys(process.env).forEach(k => {
      if (!(k in savedEnv)) delete process.env[k];
    });
    Object.keys(savedEnv).forEach(k => {
      process.env[k] = savedEnv[k];
    });
    try { unlinkSync(TEST_ENV_PATH); } catch {}
  });

  test('parses basic KEY=value pairs', () => {
    const fn = extractLoadEnvFile();
    writeFileSync(TEST_ENV_PATH, 'FOO=bar\nBAZ=qux');
    fn(TEST_ENV_PATH);
    expect(process.env.FOO).toBe('bar');
    expect(process.env.BAZ).toBe('qux');
  });

  test('skips comments and empty lines', () => {
    const fn = extractLoadEnvFile();
    writeFileSync(TEST_ENV_PATH, '# this is a comment\n\nKEY=val\n# another comment');
    fn(TEST_ENV_PATH);
    expect(process.env.KEY).toBe('val');
    expect(process.env['# this is a comment']).toBeUndefined();
  });

  test('strips quotes from double and single quoted values', () => {
    const fn = extractLoadEnvFile();
    writeFileSync(TEST_ENV_PATH, 'DOUBLE="hello world"\nSINGLE=\'foo bar\'\nNORMAL=plain');
    fn(TEST_ENV_PATH);
    expect(process.env.DOUBLE).toBe('hello world');
    expect(process.env.SINGLE).toBe('foo bar');
    expect(process.env.NORMAL).toBe('plain');
  });

  test('does not override existing environment variables', () => {
    const fn = extractLoadEnvFile();
    process.env.EXISTING_KEY = 'original';
    writeFileSync(TEST_ENV_PATH, 'EXISTING_KEY=overwrite\nNEW_KEY=set');
    fn(TEST_ENV_PATH);
    expect(process.env.EXISTING_KEY).toBe('original');
    expect(process.env.NEW_KEY).toBe('set');
  });
});
