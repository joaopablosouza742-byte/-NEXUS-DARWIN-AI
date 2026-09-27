const https = require('https');
const crypto = require('crypto');

const apiKey = 'r9h6DYtzeafyWkRn0rmtAsVj8VOhpRVywGHMteliFJrqg1ZdLpwGHZeJ78lDgJrB';

const charsToTry = ['l', 'I', '1'];
const candidates = [];

for (const c1 of charsToTry) {
  for (const c2 of charsToTry) {
    const s = 'a' + c1 + '5' + c2 + '6ZmeOGsUwDRpr7yAbN3ITtNJTSfOkHnSuX5tPyTAHU88ppT3KXVVxpQjOKfn';
    candidates.push(s);
  }
}

function getBinanceServerTime() {
  return new Promise((resolve, reject) => {
    https.get('https://api.binance.com/api/v3/time', res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d).serverTime));
    }).on('error', reject);
  });
}

function testKey(secret, time) {
  return new Promise(resolve => {
    const query = `timestamp=${time}&recvWindow=10000`;
    const signature = crypto.createHmac('sha256', secret).update(query).digest('hex');

    const req = https.request({
      hostname: 'api.binance.com',
      path: `/api/v3/account?${query}&signature=${signature}`,
      method: 'GET',
      headers: { 'X-MBX-APIKEY': apiKey }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ secret, statusCode: res.statusCode, body }));
    });
    req.on('error', () => resolve({ secret, error: true }));
    req.end();
  });
}

async function run() {
  const time = await getBinanceServerTime();
  for (const sec of candidates) {
    const r = await testKey(sec, time);
    if (r.body && !r.body.includes('-1022')) {
      console.log('CHAVE_SECRETA_CORRETA:', sec);
      const parsed = JSON.parse(r.body);
      const positive = (parsed.balances || []).filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
      console.log('SALDOS_POSITIVOS:', JSON.stringify(positive, null, 2));
      return;
    }
  }
  console.log('NENHUMA_CHAVE_ENCONTRADA');
}

run();
