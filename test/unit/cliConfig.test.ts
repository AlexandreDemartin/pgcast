// Copyright (C) 2026 Alexandre Demartin
//
// The config the CLI reads (src/generate/cliConfig.ts): pgcastconfig.json first, then zapatosconfig.json,
// then none; with both, a note through warningListener (#368). No database.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cliConfig } from '../../src/generate/cliConfig';

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

describe('cliConfig()', () => {
  it('takes the argument alone without a config file, and notes nothing', () => {
    expect(cliConfig(undefined, dir)).toEqual({});
    expect(cliConfig('{"outDir": "./src"}', dir)).toEqual({ outDir: './src' });
    expect(log).not.toHaveBeenCalled();
  });

  it('reads zapatosconfig.json alone, as Zapatos 6.6.1 does', () => {
    write('zapatosconfig.json', '{"db": {"connectionString": "{{PGCAST_FILMS_URL}}"}, "outDir": "./src"}');
    expect(cliConfig(undefined, dir)).toEqual({ db: { connectionString: 'postgresql://localhost/films' }, outDir: './src' });
    expect(cliConfig('{"outDir": "./generated"}', dir))
      .toEqual({ db: { connectionString: 'postgresql://localhost/films' }, outDir: './generated' });
    expect(log).not.toHaveBeenCalled();
  });

  it('reads pgcastconfig.json alone', () => {
    write('pgcastconfig.json', '{"db": {"connectionString": "{{ PGCAST_FILMS_URL }}"}, "moduleNames": "pgcast"}');
    expect(cliConfig('{"outDir": "./src"}', dir))
      .toEqual({ db: { connectionString: 'postgresql://localhost/films' }, moduleNames: 'pgcast', outDir: './src' });
    expect(log).not.toHaveBeenCalled();
  });

  it('reads pgcastconfig.json when zapatosconfig.json is there too, and notes it once', () => {
    write('pgcastconfig.json', '{"outDir": "./src", "moduleNames": "pgcast"}');
    write('zapatosconfig.json', '{"outDir": "./legacy", "schemas": {"archive": {"include": "*", "exclude": []}}}');
    expect(cliConfig(undefined, dir)).toEqual({ outDir: './src', moduleNames: 'pgcast' });
    expect(log.mock.calls).toEqual([[
      'Note: pgcastconfig.json and zapatosconfig.json are both here, and only pgcastconfig.json is read. ' +
      'Move any option you still need from zapatosconfig.json into pgcastconfig.json, then delete zapatosconfig.json.',
    ]]);
  });

  it('keeps that note quiet with warningListener false, from the file or the argument', () => {
    write('pgcastconfig.json', '{"warningListener": false}');
    write('zapatosconfig.json', '{}');
    expect(cliConfig(undefined, dir)).toEqual({ warningListener: false });
    write('pgcastconfig.json', '{}');
    expect(cliConfig('{"warningListener": false}', dir)).toEqual({ warningListener: false });
    expect(log).not.toHaveBeenCalled();
  });

  it('fills in variables at any depth of either file and of the argument, never in keys', () => {
    for (const name of ['zapatosconfig.json', 'pgcastconfig.json']) {
      write(name, '{"schemas": {"{{PGCAST_FILMS_URL}}": {"include": ["{{PGCAST_FILMS_URL}}"], "exclude": []}}, "schemaJSDoc": true}');
      expect(cliConfig('{"db": {"connectionString": "a {{PGCAST_FILMS_URL}} b"}}', dir)).toEqual({
        schemas: { '{{PGCAST_FILMS_URL}}': { include: ['postgresql://localhost/films'], exclude: [] } },
        schemaJSDoc: true,
        db: { connectionString: 'a postgresql://localhost/films b' },
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

  it('names the argument in its error', () => {
    write('pgcastconfig.json', '{}');
    expect(() => cliConfig('--help', dir))
      .toThrow(/^If present, the argument to Zapatos must be valid JSON, and all referenced environment variables must exist: /);
    expect(() => cliConfig('{"outDir": "{{PGCAST_UNSET}}"}', dir)).toThrow(new Error(
      'If present, the argument to Zapatos must be valid JSON, and all referenced environment variables must exist: ' +
      'Environment variable \'PGCAST_UNSET\' is not set'));
  });
});
