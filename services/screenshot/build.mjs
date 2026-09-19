import { build } from 'esbuild';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
await build({ absWorkingDir: root, entryPoints: ['services/screenshot/api.ts', 'services/screenshot/worker.ts', 'services/screenshot/migrate.ts'],
  bundle: true, platform: 'node', target: 'node24', format: 'cjs', packages: 'external',
  outdir: 'dist/screenshot', outExtension: { '.js': '.cjs' }, sourcemap: false });
