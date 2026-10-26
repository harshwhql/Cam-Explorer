#!/usr/bin/env node
// Install the latest built APK on an Android TV, tablet or phone over the network with adb.
//   node scripts/install-device.mjs <device-ip> [apk]
// First time: on the device enable Developer options → USB/ADB debugging (TV) or Wireless
// debugging (phone/tablet), then accept the "Allow debugging?" prompt on the device.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [ip, apkArg] = process.argv.slice(2);
if (!ip || !/^[0-9a-fA-F:.]+$/.test(ip)) {
  console.error('usage: node scripts/install-device.mjs <device-ip>[:port] [path/to.apk]');
  process.exit(2);
}

function latestApk() {
  const dist = join(root, 'dist');
  const apks = readdirSync(dist)
    .filter((f) => f.endsWith('-release.apk'))
    .map((f) => join(dist, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!apks[0]) throw new Error('No release APK in dist/ — run `npm run build:apk` first');
  return apks[0];
}

const adb = (...args) => {
  const r = spawnSync('adb', args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// TVs listen on 5555; phone/tablet Wireless debugging shows its own ip:port — keep it.
const hasPort = /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip) || (ip.includes(':') && !ip.includes('.'));
const target = hasPort ? ip : `${ip}:5555`;
const apk = apkArg ? resolve(apkArg) : latestApk();
console.log(`>> Connecting to ${target} (accept the prompt on the device the first time)`);
adb('connect', target);
console.log(`>> Installing ${apk}`);
adb('-s', target, 'install', '-r', apk);
console.log('>> Launching CamExplorer');
adb('-s', target, 'shell', 'am', 'start', '-n', 'com.camexplorer.app/.MainActivity');
