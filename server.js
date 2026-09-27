/**
 * NEXUS DARWIN CLOUD - Servidor Backend 24/7 (Node.js)
 * ----------------------------------------------------
 * Responsável por:
 * 1. Conectar com a API oficial da BINANCE (Spot/Margin + Transferência Automática
 *    do lucro de R$ 10,00 da carteira Spot para a Carteira Cofre "Funding Wallet"
 *    via POST /sapi/v1/asset/transfer tipo MAIN_FUNDING).
 * 2. Conectar com a API oficial da ALPACA MARKETS (Bolsa Americana NYSE/NASDAQ:
 *    NVDA, AAPL, TSLA, SPY, QQQ com suporte a Fractional Shares a partir de US$ 1).
 * 3. Servir o Painel Web na nuvem (Render, Railway, Cloud Run ou VPS 24/7).
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

/**
 * Assina parâmetros com HMAC-SHA256 exigido pela API da Binance
 */
function signBinanceQuery(queryString, apiSecret) {
  return crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
}

/**
 * Transfere o lucro conquistado pelo robô da Carteira Spot (MAIN) para a
 * Carteira Cofre Blindada (FUNDING) dentro da própria conta da Binance!
 */
function transferProfitToBinanceFundingVault({ apiKey, apiSecret, asset = 'USDT', amount }) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const query = `type=MAIN_FUNDING&asset=${encodeURIComponent(asset)}&amount=${encodeURIComponent(amount)}&timestamp=${timestamp}`;
    const signature = signBinanceQuery(query, apiSecret);
    const fullPath = `/sapi/v1/asset/transfer?${query}&signature=${signature}`;

    const req = https.request(
      {
        hostname: 'api.binance.com',
        path: fullPath,
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, data: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * Envia ordem fracionada para a Bolsa Americana via Alpaca Markets API (NYSE / NASDAQ)
 */
function executeAlpacaUSStockOrder({ apiKey, apiSecret, isPaper = true, symbol, side, notionalUsd }) {
  return new Promise((resolve, reject) => {
    const hostname = isPaper ? 'paper-api.alpaca.markets' : 'api.alpaca.markets';
    const payload = JSON.stringify({
      symbol,
      notional: String(Number(notionalUsd).toFixed(2)), // Permite operar frações de ações com R$ 10 (~US$ 2)
      side: side.toLowerCase(),
      type: 'market',
      time_in_force: 'day'
    });

    const req = https.request(
      {
        hostname,
        path: '/v2/orders',
        method: 'POST',
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, data: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Endpoint para transferir lucro para a Carteira Funding (Cofre) da Binance
  if (req.method === 'POST' && req.url === '/api/binance/vault-transfer') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const params = JSON.parse(body);
        const result = await transferProfitToBinanceFundingVault(params);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Endpoint para comprar/vender Ações Americanas Fracionadas (Alpaca Markets)
  if (req.method === 'POST' && req.url === '/api/alpaca/order') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const params = JSON.parse(body);
        const result = await executeAlpacaUSStockOrder(params);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Serve arquivos estáticos do Painel Web
  let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const fullPath = path.join(__dirname, filePath);

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Arquivo não encontrado.');
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
    res.end(content);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`NEXUS DARWIN CLOUD rodando na porta ${PORT}: http://localhost:${PORT}`);
  });
}

module.exports = { server, transferProfitToBinanceFundingVault, executeAlpacaUSStockOrder };
