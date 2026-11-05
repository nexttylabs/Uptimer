import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);

test('npm tarball installs offline and runs its linked executable outside the repository', () => {
  const temp = mkdtempSync(join(tmpdir(), 'uptimer-cli-package-'));
  try {
    const userConfig = join(temp, 'npmrc');
    writeFileSync(userConfig, '');
    const env = {
      ...process.env,
      NPM_CONFIG_USERCONFIG: userConfig,
      UPTIMER_URL: '',
      UPTIMER_ADMIN_TOKEN: '',
    };
    const pack = (cwd: string) => {
      const output = execFileSync(
        'npm',
        ['pack', '--ignore-scripts', '--json', '--pack-destination', temp],
        { cwd, env, encoding: 'utf8', timeout: 20000 },
      );
      return JSON.parse(output)[0] as {
        filename: string;
        files: Array<{ path: string }>;
      };
    };
    const cli = pack(packageRoot);
    const files = cli.files.map((file) => file.path);
    assert.ok(files.includes('dist/index.js'));
    assert.ok(files.includes('README.md'));
    assert.ok(files.includes('LICENSE'));
    assert.ok(files.every((file) => !/^(src|test|node_modules)\//.test(file)));
    assert.ok(files.every((file) => !file.endsWith('.ts')));
    assert.equal(
      readFileSync(join(packageRoot, 'LICENSE'), 'utf8'),
      readFileSync(join(packageRoot, '../../LICENSE'), 'utf8'),
    );

    // Supply the existing runtime dependency as a local tarball, so no registry is needed.
    const zod = pack(dirname(require.resolve('zod/package.json')));
    const installRoot = join(temp, 'install');
    execFileSync(
      'npm',
      [
        'install',
        '--prefix',
        installRoot,
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        join(temp, cli.filename),
        join(temp, zod.filename),
      ],
      { cwd: temp, env, encoding: 'utf8', timeout: 20000 },
    );

    const bin = join(installRoot, 'node_modules/.bin/uptimer');
    const options = { cwd: temp, env, encoding: 'utf8' as const, timeout: 10000 };
    const help = spawnSync(bin, ['--help'], options);
    assert.ifError(help.error);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Uptimer Agent Configuration CLI/);
    assert.equal(help.stderr, '');

    const missingCredentials = spawnSync(bin, ['settings', 'get'], options);
    assert.ifError(missingCredentials.error);
    assert.equal(missingCredentials.status, 2);
    assert.equal(missingCredentials.stdout, '');
    assert.equal(JSON.parse(missingCredentials.stderr).error.code, 'CONFIGURATION_ERROR');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
