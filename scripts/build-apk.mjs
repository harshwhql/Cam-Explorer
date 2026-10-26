#!/usr/bin/env node
// Build the Android APK inside Docker (no Android Studio / SDK needed on the host).
//   node scripts/build-apk.mjs [release|debug] [abis]
// Output: dist/camexplorer-<version>-<variant>.apk
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const variant = process.argv[2] ?? 'release';
const abis = process.argv[3] ?? 'armeabi-v7a,arm64-v8a,x86_64';
if (!['release', 'debug'].includes(variant)) {
  console.error('variant must be release or debug');
  process.exit(2);
}

const IMAGE = 'camx-android-builder:1';
const run = (args, opts = {}) => {
  const r = spawnSync('docker', args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const hasImage = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0;
if (!hasImage) run(['build', '-t', IMAGE, resolve(root, 'docker/android-builder')]);

mkdirSync(resolve(root, 'dist'), { recursive: true });
mkdirSync(resolve(root, '.signing'), { recursive: true });

const toDocker = (p) => p.replace(/\\/g, '/');
run(
  [
    'run', '--rm',
    // Bound CPU (nproc → ninja -j) and memory so a native build can't freeze the Docker VM.
    '--cpuset-cpus', process.env.CAMX_CPUS ?? '0-5',
    '--memory', process.env.CAMX_MEMORY ?? '6g',
    '-v', `${toDocker(root)}:/src:ro`,
    '-v', `${toDocker(resolve(root, 'dist'))}:/out`,
    '-v', `${toDocker(resolve(root, '.signing'))}:/keys`,
    '-v', 'camx-build:/build',
    '-v', 'camx-cache:/cache',
    // Always run the repo's build script so edits don't require rebuilding the image.
    '--entrypoint', 'bash',
    IMAGE, '/src/docker/android-builder/build.sh', variant, abis,
  ],
  { env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
);
