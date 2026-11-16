// Copyright (C) 2026 Alexandre Demartin
//
// The config the CLI reads (src/generate/cliConfig.ts): pgcastconfig.json first, then zapatosconfig.json,
// then none; with both, a note through warningListener (#368); and its arguments (#556). No database.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cliArgs, cliConfig, runCli } from '../../src/generate/cliConfig';

let dir: string;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgcast-cli-'));
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.stubEnv('PGCAST_FILMS_URL', 'postgresql://localhost/films');
  vi.stubEnv('PGCAST_UNSET', undefined);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const write = (name: string, json: string) => fs.writeFileSync(path.join(dir, name), json);

// the CLI exits on a failed query, whatever the file and the argument say (#183)
const exits = { rejectOnQueryError: false };

describe('cliConfig()', () => {
  it('takes the argument alone without a config file, and notes nothing', () => {
    expect(cliConfig(undefined, dir)).toEqual({ ...exits });
    expect(cliConfig('{"outDir": "./src"}', dir)).toEqual({ outDir: './src', ...exits });
    expect(log).not.toHaveBeenCalled();
  });

  it('reads zapatosconfig.json alone, as Zapatos 6.6.1 does', () => {
    write('zapatosconfig.json', '{"db": {"connectionString": "{{PGCAST_FILMS_URL}}"}, "outDir": "./src"}');
    expect(cliConfig(undefined, dir)).toEqual({ db: { connectionString: 'postgresql://localhost/films' }, outDir: './src', ...exits });
    expect(cliConfig('{"outDir": "./generated"}', dir))
      .toEqual({ db: { connectionString: 'postgresql://localhost/films' }, outDir: './generated', ...exits });
    expect(log).not.toHaveBeenCalled();
  });

  it('reads pgcastconfig.json alone', () => {
    write('pgcastconfig.json', '{"db": {"connectionString": "{{ PGCAST_FILMS_URL }}"}, "moduleNames": "pgcast"}');
    expect(cliConfig('{"outDir": "./src"}', dir))
      .toEqual({ db: { connectionString: 'postgresql://localhost/films' }, moduleNames: 'pgcast', outDir: './src', ...exits });
    expect(log).not.toHaveBeenCalled();
  });

  it('reads pgcastconfig.json when zapatosconfig.json is there too, and notes it once', () => {
    write('pgcastconfig.json', '{"outDir": "./src", "moduleNames": "pgcast"}');
    write('zapatosconfig.json', '{"outDir": "./legacy", "schemas": {"archive": {"include": "*", "exclude": []}}}');
    expect(cliConfig(undefined, dir)).toEqual({ outDir: './src', moduleNames: 'pgcast', ...exits });
    expect(log.mock.calls).toEqual([[
      'Note: pgcastconfig.json and zapatosconfig.json are both here, and only pgcastconfig.json is read. ' +
      'Move any option you still need from zapatosconfig.json into pgcastconfig.json, then delete zapatosconfig.json.',
    ]]);
  });

  it('keeps that note quiet with warningListener false, from the file or the argument', () => {
    write('pgcastconfig.json', '{"warningListener": false}');
    write('zapatosconfig.json', '{}');
    expect(cliConfig(undefined, dir)).toEqual({ warningListener: false, ...exits });
    write('pgcastconfig.json', '{}');
    expect(cliConfig('{"warningListener": false}', dir)).toEqual({ warningListener: false, ...exits });
    expect(log).not.toHaveBeenCalled();
  });

  it('fills in variables at any depth of either file and of the argument, never in keys', () => {
    for (const name of ['zapatosconfig.json', 'pgcastconfig.json']) {
      write(name, '{"schemas": {"{{PGCAST_FILMS_URL}}": {"include": ["{{PGCAST_FILMS_URL}}"], "exclude": []}}, "schemaJSDoc": true}');
      expect(cliConfig('{"db": {"connectionString": "a {{PGCAST_FILMS_URL}} b"}}', dir)).toEqual({
        schemas: { '{{PGCAST_FILMS_URL}}': { include: ['postgresql://localhost/films'], exclude: [] } },
        schemaJSDoc: true,
        db: { connectionString: 'a postgresql://localhost/films b' },
        ...exits,
      });
    }
  });

  it('keeps a schema named __proto__, from the file and from the argument', () => {
    const json = '{"schemas": {"__proto__": {"include": "*", "exclude": []}, "public": {"include": "*", "exclude": []}}}';
    write('pgcastconfig.json', json);
    expect(Object.keys(cliConfig(undefined, dir).schemas!)).toEqual(['__proto__', 'public']);
    expect(Object.keys(cliConfig(json, dir).schemas!)).toEqual(['__proto__', 'public']);
    // in an object of Object.prototype, as in 6.6.1: columnOptions reads inherited keys (#405)
    expect(Object.getPrototypeOf(cliConfig(json, dir).schemas)).toBe(Object.prototype);
  });

  it('names the file it read in an error, with 6.6.1\'s words for zapatosconfig.json', () => {
    write('zapatosconfig.json', '{"db": {"connectionString": "{{PGCAST_UNSET}}"}}');
    expect(() => cliConfig(undefined, dir)).toThrow(new Error(
      'If present, zapatosconfig.json must be a valid JSON file, and all referenced environment variables must exist: ' +
      'Environment variable \'PGCAST_UNSET\' is not set'));
    write('zapatosconfig.json', '');
    expect(() => cliConfig(undefined, dir))
      .toThrow(/^If present, zapatosconfig\.json must be a valid JSON file, and all referenced environment variables must exist: /);

    write('pgcastconfig.json', '{"outDir": "./src",}');
    expect(() => cliConfig(undefined, dir))
      .toThrow(/^If present, pgcastconfig\.json must be a valid JSON file, and all referenced environment variables must exist: /);
    expect(log).not.toHaveBeenCalled();
  });

  it('sets rejectOnQueryError to false over the file and the argument, so the CLI exits on a failed query', () => {
    write('pgcastconfig.json', '{"rejectOnQueryError": true}');
    expect(cliConfig(undefined, dir)).toEqual({ rejectOnQueryError: false });
    expect(cliConfig('{"rejectOnQueryError": true}', dir)).toEqual({ rejectOnQueryError: false });
  });

  it('names the argument in its error', () => {
    write('pgcastconfig.json', '{}');
    expect(() => cliConfig('--help', dir))
      .toThrow(/^If present, the argument to Zapatos must be valid JSON, and all referenced environment variables must exist: /);
    expect(() => cliConfig('{"outDir": "{{PGCAST_UNSET}}"}', dir)).toThrow(new Error(
      'If present, the argument to Zapatos must be valid JSON, and all referenced environment variables must exist: ' +
      'Environment variable \'PGCAST_UNSET\' is not set'));
  });
});

// the CLI's arguments (#556): --check anywhere, then the first other argument as the JSON, as Zapatos 6.6.1 reads
// process.argv[2]; a later one ignored, as there, a flag among them returned to be noted
describe('cliArgs()', () => {
  it('takes the JSON argument alone, or none, as Zapatos 6.6.1 does', () => {
    expect(cliArgs([])).toEqual({ check: false, argsJSON: undefined, ignoredFlags: [] });
    expect(cliArgs(['{"outDir": "./src"}'])).toEqual({ check: false, argsJSON: '{"outDir": "./src"}', ignoredFlags: [] });
    expect(cliArgs(['{"outDir": "./src"}', '{"outDir": "./lib"}']))
      .toEqual({ check: false, argsJSON: '{"outDir": "./src"}', ignoredFlags: [] });
    expect(cliArgs(['', '{}'])).toEqual({ check: false, argsJSON: '', ignoredFlags: [] });  // an empty first argument fails as JSON, as there
  });

  it('takes --check before or after the JSON argument, or alone', () => {
    expect(cliArgs(['--check'])).toEqual({ check: true, argsJSON: undefined, ignoredFlags: [] });
    expect(cliArgs(['--check', '{"outDir": "./src"}'])).toEqual({ check: true, argsJSON: '{"outDir": "./src"}', ignoredFlags: [] });
    expect(cliArgs(['{"outDir": "./src"}', '--check'])).toEqual({ check: true, argsJSON: '{"outDir": "./src"}', ignoredFlags: [] });
  });

  it('refuses any other flag in the JSON argument\'s place, where Zapatos 6.6.1 failed on it as JSON', async () => {
    const refusal = (flag: string) => new Error(`Unknown flag ${flag}: the only flag is --check, beside the JSON argument`);
    expect(() => cliArgs(['--chek'])).toThrow(refusal('--chek'));
    expect(() => cliArgs(['--chek', '{}'])).toThrow(refusal('--chek'));
    expect(() => cliArgs(['--check', '--help'])).toThrow(refusal('--help'));
    expect(() => cliArgs(['--check', '--help', '{}'])).toThrow(refusal('--help'));
    expect(() => cliArgs(['--check=true'])).toThrow(refusal('--check=true'));
    // before reading any config: an unreachable server and a broken config file are never reached
    write('pgcastconfig.json', '{,}');
    await expect(runCli(['--chek', '{"db": {"connectionString": "postgres://nobody@127.0.0.1:1/none"}}'], dir))
      .rejects.toThrow(refusal('--chek'));
  });

  it('ignores any other flag after the JSON argument, as Zapatos 6.6.1 does, and returns it to be noted', () => {
    expect(cliArgs(['{}', '--chek'])).toEqual({ check: false, argsJSON: '{}', ignoredFlags: ['--chek'] });
    expect(cliArgs(['--check', '{}', '--help', 'later', '--check=true']))
      .toEqual({ check: true, argsJSON: '{}', ignoredFlags: ['--help', '--check=true'] });
    expect(cliArgs(['{}', '--check', '--chek'])).toEqual({ check: true, argsJSON: '{}', ignoredFlags: ['--chek'] });
  });

  it('keeps a single dash for the JSON argument, which then fails as JSON, as in Zapatos 6.6.1', () => {
    expect(cliArgs(['-h'])).toEqual({ check: false, argsJSON: '-h', ignoredFlags: [] });
    expect(() => cliConfig(cliArgs(['-h']).argsJSON, dir))
      .toThrow(/^If present, the argument to Zapatos must be valid JSON, and all referenced environment variables must exist: /);
  });
});
