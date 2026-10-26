// Minimal fake CP Plus / Dahua HTTP API with real Digest auth (TEST-ONLY credentials).
// Lets the app's "Test & detect cameras" flow be exercised end to end on a TV/phone.
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const USER = process.env.NVR_USER ?? 'admin';
const PASS = process.env.NVR_PASS ?? 'test1234';
const REALM = 'Login to FAKECPPLUS0001';
const CHANNELS = Number(process.env.NVR_CHANNELS ?? 4);
const PORT = Number(process.env.PORT ?? 8080);
const MAX_FAILS = 5;

const md5 = (s) => createHash('md5').update(s).digest('hex');
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
  const body = routes[req.url];
  console.log(`[ok] ${req.url}`);
  if (body === undefined) res.writeHead(404).end('Error\r\nBad Request!\r\n');
  else res.writeHead(200, { 'Content-Type': 'text/plain' }).end(body);
}).listen(PORT, () => console.log(`fake CP Plus HTTP API on :${PORT} (${CHANNELS} channels)`));
