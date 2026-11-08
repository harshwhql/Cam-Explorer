// Minimal fake CP Plus / Dahua HTTP API with real Digest auth (TEST-ONLY credentials).
// Lets the app's "Test & detect cameras" flow be exercised end to end on a TV/phone.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const USER = process.env.NVR_USER ?? 'admin';
const PASS = process.env.NVR_PASS ?? 'test1234';
const REALM = 'Login to FAKECPPLUS0001';
const CHANNELS = Number(process.env.NVR_CHANNELS ?? 4);
const PORT = Number(process.env.PORT ?? 8080);
const MAX_FAILS = 5;
const FAKE_JPEG = readFileSync(new URL('./snapshot.jpg', import.meta.url));

const md5 = (s) => createHash('md5').update(s).digest('hex');

// ---- fake recordings ----
let searchSeq = 1000;
const searches = new Map();
const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const parseTime = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s ?? '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0;
};
function fakeRecordings(from, to) {
  const items = [];
  const HOUR = 3_600_000;
  for (let t = Math.floor(from / HOUR) * HOUR; t < to; t += HOUR) {
    items.push({ start: Math.max(t, from), end: Math.min(t + HOUR, to), event: false });
    for (const off of [0, 30 * 60_000]) {
      const s = t + off;
      if (s >= from && s + 10 * 60_000 <= to) items.push({ start: s, end: s + 10 * 60_000, event: true });
    }
  }
  return items.sort((a, b) => a.start - b.start);
}
const nonces = new Set();
let failures = 0;
let lockedUntil = 0;

const titles = ['Main Gate', 'Parking', 'Back Yard', 'Lobby', 'Garage', 'Terrace', 'Store', 'Office'];
const routes = {
  '/cgi-bin/magicBox.cgi?action=getDeviceType': 'type=CP-UVR-0401E1-IC (fake)\r\n',
  '/cgi-bin/magicBox.cgi?action=getProductDefinition&name=MaxRemoteInputChannels': 'table.MaxRemoteInputChannels=0\r\n',
  '/cgi-bin/devVideoInput.cgi?action=getCollect': `result=${CHANNELS}\r\n`,
  '/cgi-bin/eventManager.cgi?action=getEventIndexes&code=VideoLoss': 'channels[0]=3\r\n',
  '/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle': Array.from(
    { length: CHANNELS },
    (_, i) => `table.ChannelTitle[${i}].Name=${titles[i % titles.length]}`,
  ).join('\r\n'),
};

function parseAuth(h) {
  const p = {};
  for (const m of h.slice(7).matchAll(/(\w+)=(?:"((?:[^"\\]|\\.)*)"|([^,\s]+))/g)) p[m[1]] = m[2] ?? m[3] ?? '';
  return p;
}

function valid(req) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Digest ')) return null;
  const p = parseAuth(h);
  if (!nonces.has(p.nonce) || p.uri !== req.url) return false;
  const ha1 = md5(`${USER}:${REALM}:${PASS}`);
  const ha2 = md5(`GET:${p.uri}`);
  const expected = p.qop
    ? md5(`${ha1}:${p.nonce}:${p.nc}:${p.cnonce}:${p.qop}:${ha2}`)
    : md5(`${ha1}:${p.nonce}:${ha2}`);
  return p.username === USER && p.response === expected;
}

createServer((req, res) => {
  const now = Date.now();
  if (now < lockedUntil) {
    res.writeHead(401, { 'WWW-Authenticate': 'Digest realm="locked", nonce="x"' }).end('Locked');
    console.log(`[locked] ${req.url}`);
    return;
  }
  const ok = valid(req);
  if (ok !== true) {
    if (ok === false) {
      failures += 1;
      console.log(`[auth-fail ${failures}/${MAX_FAILS}] ${req.url}`);
      if (failures >= MAX_FAILS) {
        lockedUntil = now + 30 * 60_000; // like real firmware: lock for 30 minutes
        failures = 0;
        console.log('[LOCKED] too many failed logins');
      }
    }
    const nonce = randomBytes(8).toString('hex');
    nonces.add(nonce);
    res.writeHead(401, { 'WWW-Authenticate': `Digest realm="${REALM}", qop="auth", nonce="${nonce}", opaque="fake"` }).end();
    return;
  }
  failures = 0;
  // Simulated motion: channel 2 moves for 10 s out of every 30 s. Like real firmware, a
  // getEventIndexes query with nothing active answers 400 "Error".
  if (req.url?.startsWith('/cgi-bin/eventManager.cgi?action=getEventIndexes&code=')) {
    const code = req.url.split('code=')[1];
    const moving = code === 'VideoMotion' && Math.floor(Date.now() / 1000) % 30 < 10;
    if (moving) res.writeHead(200, { 'Content-Type': 'text/plain' }).end('channels[0]=1\r\n');
    else if (code !== 'VideoLoss') res.writeHead(400).end('Error\r\nBad Request!\r\n');
    if (moving || code !== 'VideoLoss') return;
  }
  // Recording search: continuous footage from midnight in 1 h files, plus a 10 min motion
  // clip every 30 min — enough to exercise the playback timeline.
  if (req.url?.startsWith('/cgi-bin/mediaFileFind.cgi?')) {
    const u = new URL(req.url, 'http://x');
    const action = u.searchParams.get('action');
    if (action === 'factory.create') return void res.writeHead(200).end(`result=${++searchSeq}\r\n`);
    if (action === 'findFile') {
      const from = parseTime(u.searchParams.get('condition.StartTime'));
      const to = parseTime(u.searchParams.get('condition.EndTime')); // container runs in UTC: don't clamp to "now"
      searches.set(u.searchParams.get('object'), { items: fakeRecordings(from, to), pos: 0 });
      return void res.writeHead(200).end('OK\r\n');
    }
    if (action === 'findNextFile') {
      const s = searches.get(u.searchParams.get('object'));
      const count = Number(u.searchParams.get('count') ?? 100);
      const page = s ? s.items.slice(s.pos, s.pos + count) : [];
      if (s) s.pos += page.length;
      const body = [`found=${page.length}`];
      page.forEach((it, i) => {
        body.push(`items[${i}].Channel=0`, `items[${i}].StartTime=${fmtTime(it.start)}`, `items[${i}].EndTime=${fmtTime(it.end)}`);
        body.push(`items[${i}].Flags[0]=${it.event ? 'Event' : 'Timing'}`);
        if (it.event) body.push(`items[${i}].Events[0]=VideoMotion`);
      });
      return void res.writeHead(200).end(body.join('\r\n') + '\r\n');
    }
    if (action === 'destroy') searches.delete(u.searchParams.get('object'));
    return void res.writeHead(200).end('OK\r\n');
  }
  if (req.url?.startsWith('/cgi-bin/ptz.cgi?')) {
    const ch = new URL(req.url, 'http://x').searchParams.get('channel');
    if (ch !== '1') return void res.writeHead(400).end('Error\r\nBad Request!\r\n');
    if (req.url.includes('action=getCurrentProtocolCaps')) {
      return void res.writeHead(200).end('caps.Pan=true\r\ncaps.Tile=true\r\ncaps.Zoom=true\r\ncaps.Preset=true\r\n');
    }
    console.log(`[ptz] ${req.url}`);
    return void res.writeHead(200).end('OK\r\n');
  }
  if (req.url?.startsWith('/cgi-bin/snapshot.cgi?channel=')) {
    res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(FAKE_JPEG);
    return;
  }
  const body = routes[req.url];
  console.log(`[ok] ${req.url}`);
  if (body === undefined) res.writeHead(404).end('Error\r\nBad Request!\r\n');
  else res.writeHead(200, { 'Content-Type': 'text/plain' }).end(body);
}).listen(PORT, () => console.log(`fake CP Plus HTTP API on :${PORT} (${CHANNELS} channels)`));
