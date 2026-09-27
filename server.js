/**
 * NEXUS DARWIN CLOUD - Servidor 24/7 para RAILWAY (Node.js)
 * ---------------------------------------------------------
 * Quando hospedado no Railway:
 * 1. Roda o Motor Autônomo (DarwinSwarmEngine) 24 horas por dia no servidor da nuvem,
 *    mesmo com seu PC e celular desligados!
 * 2. Sincroniza continuamente (a cada 3 segundos) todo o estado, Cérebro IA,
 *    Cofre Binance Funding e Cofre Bolsa EUA com o seu Firebase Realtime Database:
 *    https://nexus-darwin-ai-default-rtdb.firebaseio.com
 * 3. Executa transferências reais para a Carteira Funding da Binance (MAIN_FUNDING)
 *    e ordens de Ações Fracionadas na Bolsa Americana (Alpaca) quando as chaves de API
 *    estão configuradas nas variáveis do Railway ou no painel.
 * 4. Serve o Painel Web em tempo real no domínio público gerado pelo Railway.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { DarwinSwarmEngine } = fs.existsSync(path.join(__dirname, 'ai_swarm_engine.js'))
  ? require('./ai_swarm_engine.js')
  : require('./engine/ai_swarm_engine.js');
const { FirebaseCloudSync, DEFAULT_RTDB_URL } = fs.existsSync(path.join(__dirname, 'firebase_cloud_sync.js'))
  ? require('./firebase_cloud_sync.js')
  : require('./engine/firebase_cloud_sync.js');
const { FNHBlockchainProtocol } = require('./crypto_asset_chain.js');

const PORT = process.env.PORT || 8080;
const FIREBASE_RTDB_URL = process.env.FIREBASE_RTDB_URL || DEFAULT_RTDB_URL;

// =============================================================================
// 1. INICIALIZAÇÃO DO MOTOR 24/7 NA NUVEM (RAILWAY WORKER) + BLOCKCHAIN FNH
// =============================================================================
const cloudSync = new FirebaseCloudSync();
cloudSync.databaseURL = FIREBASE_RTDB_URL;

const serverEngine = new DarwinSwarmEngine();
const fnhChain = new FNHBlockchainProtocol();

// Carrega chaves de API das variáveis de ambiente do Railway (se definidas)
if (process.env.BINANCE_API_KEY) {
  serverEngine.state.apiConfig.binanceApiKey = process.env.BINANCE_API_KEY;
  serverEngine.state.apiConfig.binanceApiSecret = process.env.BINANCE_API_SECRET || '';
}
if (process.env.ALPACA_API_KEY) {
  serverEngine.state.apiConfig.alpacaApiKey = process.env.ALPACA_API_KEY;
  serverEngine.state.apiConfig.alpacaApiSecret = process.env.ALPACA_API_SECRET || '';
}

(async function bootstrapCloudEngine() {
  console.log('[NEXUS RAILWAY 24/7] Conectando ao Firebase Realtime Database:', FIREBASE_RTDB_URL);
  const existingState = await cloudSync.connectAndLoadInitialState(FIREBASE_RTDB_URL);
  if (existingState && existingState.dayNumber) {
    serverEngine.state = {
      ...serverEngine.state,
      ...existingState,
      hiveMind: { ...serverEngine.state.hiveMind, ...(existingState.hiveMind || {}) },
      activeBots: Array.isArray(existingState.activeBots) && existingState.activeBots.length > 0
        ? existingState.activeBots
        : serverEngine.state.activeBots,
      deadBots: Array.isArray(existingState.deadBots) ? existingState.deadBots : [],
      dailyLedger: Array.isArray(existingState.dailyLedger) ? existingState.dailyLedger : [],
      tradeLogs: Array.isArray(existingState.tradeLogs) ? existingState.tradeLogs : []
    };
    console.log(
      `[NEXUS RAILWAY 24/7] Estado restaurado do Firebase -> Dia #${serverEngine.state.dayNumber} | Robôs Vivos: ${serverEngine.state.activeBots.length} | Cofre Total: R$ ${serverEngine.state.masterVaultBalance}`
    );
  } else {
    await cloudSync.syncEcosystemState(serverEngine.state);
    console.log('[NEXUS RAILWAY 24/7] Estado inicial criado no Firebase.');
  }

  // NOTA: O Operador Real do seu PC (real_binance_operator.js) é o único que escreve no Firebase.
  // O server.js apenas serve o painel HTTP.
})();

// =============================================================================
// 2. INTEGRAÇÃO OFICIAL BINANCE API & ALPACA US STOCKS API
// =============================================================================
function signBinanceQuery(queryString, apiSecret) {
  return crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
}

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

function executeAlpacaUSStockOrder({ apiKey, apiSecret, isPaper = true, symbol, side, notionalUsd }) {
  return new Promise((resolve, reject) => {
    const hostname = isPaper ? 'paper-api.alpaca.markets' : 'api.alpaca.markets';
    const payload = JSON.stringify({
      symbol,
      notional: String(Number(notionalUsd).toFixed(2)),
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

// =============================================================================
// 3. SERVIDOR HTTP PARA O RAILWAY (HEALTHCHECK + API + PAINEL WEB)
// =============================================================================
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

  // Healthcheck e Status do Motor 24/7 no Railway
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      dayNumber: serverEngine.state.dayNumber,
      activeBots: serverEngine.state.activeBots.length,
      masterVaultBalance: serverEngine.state.masterVaultBalance,
      firebaseConnected: cloudSync.isConnected,
      firebaseUrl: FIREBASE_RTDB_URL
    }));
  }

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

  // ===========================================================================
  // ROTAS OFICIAIS DA BLOCKCHAIN PRÓPRIA FNH (30% ABERTO / 70% COFRE 4 ANOS)
  // ===========================================================================
  if (req.method === 'GET' && req.url.startsWith('/api/token/state')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(fnhChain.getPublicState()));
  }

  if (req.method === 'POST' && req.url === '/api/token/collect-open') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const params = body ? JSON.parse(body) : {};
        const result = fnhChain.collectFromOpenPool(params);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ...result, state: fnhChain.getPublicState() }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/token/mine-vault') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const params = body ? JSON.parse(body) : {};
        const result = fnhChain.mineLockedVault(params);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ...result, state: fnhChain.getPublicState() }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/token/contract') {
    const contractPath = path.join(__dirname, 'contracts', 'FNHCryptoAsset.sol');
    const source = fs.existsSync(contractPath)
      ? fs.readFileSync(contractPath, 'utf8')
      : '// Contrato nao encontrado';
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ symbol: 'FNH', decimals: 10, soliditySource: source }));
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
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[NEXUS DARWIN CLOUD] Servidor Railway 24/7 ativo em 0.0.0.0:${PORT}`);
  });
}

module.exports = { server, transferProfitToBinanceFundingVault, executeAlpacaUSStockOrder };
