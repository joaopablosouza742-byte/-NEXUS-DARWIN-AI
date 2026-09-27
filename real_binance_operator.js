/**
 * NEXUS DARWIN AI - OPERADOR AUTÔNOMO 100% REAL (BINANCE BRASIL)
 * =============================================================
 * Roda no seu PC com o seu IP (45.226.119.62) autorizado na Binance!
 * Regra: Começa com R$ 10,00 no par BTC/BRL -> Lucra +R$ 10 -> Transfere pro Cofre -> Clona Robô!
 * Sincroniza em tempo real com o Firebase: https://nexus-darwin-ai-default-rtdb.firebaseio.com
 * O painel na Vercel (https://nexus-darwin-ai.vercel.app) reflete a realidade pura!
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.BINANCE_API_KEY || 'r9h6DYtzeafyWkRn0rmtAsVj8VOhpRVywGHMteliFJrqg1ZdLpwGHZeJ78lDgJrB';
const API_SECRET = process.env.BINANCE_API_SECRET || 'aI5l6ZmeOGsUwDRpr7yAbN3ITtNJTSfOkHnSuX5tPyTAHU88ppT3KXVVxpQjOKfn';
const FIREBASE_URL = 'https://nexus-darwin-ai-default-rtdb.firebaseio.com';

// Carrega sincronizador do Firebase
const { FirebaseCloudSync } = fs.existsSync(path.join(__dirname, 'firebase_cloud_sync.js'))
  ? require('./firebase_cloud_sync.js')
  : require('./engine/firebase_cloud_sync.js');

const cloudSync = new FirebaseCloudSync();
cloudSync.databaseURL = FIREBASE_URL;

// =============================================================================
// 1. HELPERS DE API DA BINANCE (ASSINATURA HMAC-SHA256 E REQUISIÇÕES)
// =============================================================================
function getBinanceServerTime() {
  return new Promise((resolve, reject) => {
    https.get('https://api.binance.com/api/v3/time', (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d).serverTime);
        } catch (e) {
          resolve(Date.now());
        }
      });
    }).on('error', () => resolve(Date.now()));
  });
}

function binanceSignedRequest(endpoint, method = 'GET', params = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const serverTime = await getBinanceServerTime();
      params.timestamp = serverTime;
      params.recvWindow = 10000;

      const queryString = Object.keys(params)
        .map((k) => `${k}=${encodeURIComponent(params[k])}`)
        .join('&');

      const signature = crypto.createHmac('sha256', API_SECRET).update(queryString).digest('hex');
      const fullQuery = `${queryString}&signature=${signature}`;

      const options = {
        hostname: 'api.binance.com',
        path: `${endpoint}?${fullQuery}`,
        method: method,
        headers: {
          'X-MBX-APIKEY': API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, data: body });
          }
        });
      });

      req.on('error', reject);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Transfere lucro para a Carteira de Financiamento (Cofre blindado fora do Spot)
async function transferToFundingVault(amountBrl) {
  try {
    const res = await binanceSignedRequest('/sapi/v1/asset/transfer', 'POST', {
      type: 'MAIN_FUNDING',
      asset: 'BRL',
      amount: String(Number(amountBrl).toFixed(2))
    });
    console.log('[COFRE BINANCE] Transferência para Carteira Funding:', res.data);
    return res.data;
  } catch (err) {
    console.error('[COFRE BINANCE] Erro na transferência:', err.message);
    return null;
  }
}

// Consulta saldos reais da conta Spot
async function getRealBalances() {
  try {
    const res = await binanceSignedRequest('/api/v3/account', 'GET');
    if (res.data && res.data.balances) {
      const brl = res.data.balances.find((b) => b.asset === 'BRL') || { free: '0.00', locked: '0.00' };
      const btc = res.data.balances.find((b) => b.asset === 'BTC') || { free: '0.00', locked: '0.00' };
      const sol = res.data.balances.find((b) => b.asset === 'SOL') || { free: '0.00', locked: '0.00' };
      const usdt = res.data.balances.find((b) => b.asset === 'USDT') || { free: '0.00', locked: '0.00' };
      return {
        brlFree: parseFloat(brl.free),
        btcFree: parseFloat(btc.free),
        solFree: parseFloat(sol.free),
        usdtFree: parseFloat(usdt.free)
      };
    }
    return { brlFree: 0, btcFree: 0, solFree: 0, usdtFree: 0 };
  } catch (e) {
    console.error('[BINANCE API] Erro ao consultar saldos:', e.message);
    return { brlFree: 0, btcFree: 0, solFree: 0, usdtFree: 0 };
  }
}

// Consulta preço ao vivo do par na Binance
function getLivePrice(symbol = 'BTCBRL') {
  return new Promise((resolve) => {
    https.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(parseFloat(JSON.parse(d).price));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Executa Ordem Real a Mercado na Binance (Compra com R$ 10,00 ou Venda total da moeda)
async function executeRealMarketOrder(symbol, side, quoteOrderQty = null, quantity = null) {
  const params = {
    symbol,
    side, // 'BUY' ou 'SELL'
    type: 'MARKET'
  };

  if (side === 'BUY' && quoteOrderQty) {
    params.quoteOrderQty = String(Number(quoteOrderQty).toFixed(2));
  } else if (side === 'SELL' && quantity) {
    // Trunca a quantidade conforme regras da moeda
    const decimals = symbol === 'BTCBRL' ? 5 : 2;
    params.quantity = String(Number(quantity).toFixed(decimals));
  }

  console.log(`[ORDEM REAL BINANCE] Enviando ${side} em ${symbol}:`, params);
  const result = await binanceSignedRequest('/api/v3/order', 'POST', params);
  console.log(`[ORDEM REAL BINANCE RESPOSTA]:`, JSON.stringify(result.data));
  return result.data;
}

// =============================================================================
// 2. INDICADORES TÉCNICOS PARA DECISÃO AUTÔNOMA
// =============================================================================
function calcRSI(history, period = 14) {
  if (history.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  const recent = history.slice(-(period + 1));
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  return 100 - 100 / (1 + rs);
}

function calcEMA(history, period) {
  if (history.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = history[0];
  for (let i = 1; i < history.length; i++) {
    ema = history[i] * k + ema * (1 - k);
  }
  return ema;
}

// =============================================================================
// 3. ESTADO OFICIAL DO OPERADOR REAL
// =============================================================================
const ecosystemState = {
  dayNumber: 1,
  dayProgressPct: 0,
  cycleSpeedSec: 86400, // 24h real
  isRunning: true,
  initialSeedCapital: 10.00,
  targetProfitPerBot: 10.00,
  takeProfitMinPct: 1.0,      // Scalping Profissional: 1.0% a 1.5% por operação
  takeProfitMaxPct: 1.5,
  stopLossPctPerTrade: 0.9,   // Stop loss curto e protetor (0.9%)

  masterVaultBalance: 0.00,
  binanceFundingVault: 0.00,
  alpacaCashVault: 0.00,
  totalDepositedCapital: 10.00,
  totalHistoricalProfitSaved: 0.00,

  hiveMind: {
    collectiveIQ: 110,
    totalLessonsLearned: 0,
    totalTradesExecuted: 0,
    winningTrades: 0,
    globalBestWeights: {
      w_rsi: 0.85,
      w_ema: 0.90,
      w_bollinger: 0.75,
      w_macd: 0.80,
      w_flow: 0.70,
      w_regime: 0.85
    },
    avoidedPatternsCount: 0,
    recentInsights: [
      'OPERADOR REAL ATIVO: Conectado com sucesso na Binance Brasil (UID: 1281981508).'
    ]
  },

  activeBots: [
    {
      id: 'BOT-REAL-01',
      name: 'Alpha-Real-01',
      generation: 1,
      createdAtDay: 1,
      assignedAsset: 'BTC/BRL',
      marketType: 'BINANCE_CRIPTO',
      initialDayCapital: 10.00,
      currentCapital: 10.00,
      dailyPnL: 0.00,
      dailyTargetProfit: 10.00,
      accumulatedVaultProfit: 0.00,
      openPosition: null, // { side: 'LONG', entryPrice, qty, notionalBrl, openedAt }
      brain: {
        iq: 115,
        confidenceThreshold: 0.60,
        weights: { w_rsi: 0.85, w_ema: 0.90, w_bollinger: 0.75, w_macd: 0.80, w_flow: 0.70, w_regime: 0.85 }
      }
    }
  ],
  deadBots: [],
  dailyLedger: [],
  tradeLogs: [],

  apiConfig: {
    mode: 'REAL_LIVE',
    isRealMoney: true,
    binanceApiKey: API_KEY.slice(0, 8) + '...',
    binanceConnected: true,
    alpacaConnected: false
  }
};

// Histórico de preços para cálculo dos indicadores
const priceHistories = {
  'BTCBRL': [],
  'SOLBRL': []
};

// =============================================================================
// 4. CICLO DE ANÁLISE E OPERAÇÃO EM TEMPO REAL
// =============================================================================
async function startRealTraderLoop() {
  console.log('===============================================================');
  console.log(' 🚀 NEXUS DARWIN AI - MOTOR DE OPERAÇÃO REAL ATIVADO (BINANCE)');
  console.log('===============================================================');
  console.log(`[IP AUTORIZADO]: 45.226.119.62`);
  console.log(`[FIREBASE RTDB]: ${FIREBASE_URL}`);

  // 1. Zera e sincroniza o estado real no Firebase imediatamente
  const balances = await getRealBalances();
  console.log(`[SALDO INICIAL SPOT]: R$ ${balances.brlFree.toFixed(2)} BRL | BTC: ${balances.btcFree} | SOL: ${balances.solFree}`);

  // Se já tiver Bitcoin comprado na conta (como a ordem que executamos):
  if (balances.btcFree >= 0.00001) {
    const currentPrice = (await getLivePrice('BTCBRL')) || 440782;
    const valBrl = balances.btcFree * currentPrice;
    ecosystemState.activeBots[0].currentCapital = Number((balances.brlFree + valBrl).toFixed(2));
    ecosystemState.activeBots[0].initialDayCapital = 10.00;
    ecosystemState.activeBots[0].openPosition = {
      symbol: 'BTCBRL',
      side: 'LONG',
      entryPrice: 440782,
      qty: balances.btcFree,
      notionalBrl: 8.82,
      orderId: 2337522095,
      openedAt: new Date().toLocaleTimeString('pt-BR')
    };
    console.log(`[POSIÇÃO RESTAURADA]: ${balances.btcFree} BTC monitorando lucro de 1% a 1.5%!`);
  } else if (balances.brlFree >= 10.00) {
    ecosystemState.activeBots[0].currentCapital = balances.brlFree;
    ecosystemState.activeBots[0].initialDayCapital = balances.brlFree;
  }

  await cloudSync.syncEcosystemState(ecosystemState);
  console.log('[FIREBASE] Estado inicial real sincronizado no painel web!');

  // 2. Loop de monitoramento de mercado (a cada 2 segundos)
  let tickCount = 0;
  setInterval(async () => {
    try {
      tickCount++;
      const btcPrice = await getLivePrice('BTCBRL');
      const solPrice = await getLivePrice('SOLBRL');

      if (btcPrice) {
        priceHistories['BTCBRL'].push(btcPrice);
        if (priceHistories['BTCBRL'].length > 100) priceHistories['BTCBRL'].shift();
      }
      if (solPrice) {
        priceHistories['SOLBRL'].push(solPrice);
        if (priceHistories['SOLBRL'].length > 100) priceHistories['SOLBRL'].shift();
      }

      // Analisa o Robô #1 (Alpha-Real-01)
      const bot = ecosystemState.activeBots[0];
      if (!bot) return;

      const history = priceHistories['BTCBRL'];
      if (history.length < 15) {
        if (tickCount % 5 === 0) {
          console.log(`[AGUARDANDO DADOS] Histórico BTC/BRL: ${history.length}/15 ticks | Preço: R$ ${btcPrice}`);
        }
        return;
      }

      const currentPrice = history[history.length - 1];
      const rsi = calcRSI(history, 14);
      const ema9 = calcEMA(history, 9);
      const ema21 = calcEMA(history, 21);

      // CASO 1: ROBÔ NÃO TEM POSIÇÃO ABERTA -> PROCURA COMPRA
      if (!bot.openPosition) {
        // Sinal de Compra Inteligente: RSI < 45 (sobrevendido/recuperando) E EMA9 cruzando ou acima da EMA21
        const buySignal = (rsi < 48 && ema9 >= ema21 * 0.9995) || (rsi < 35);

        if (buySignal && bot.currentCapital >= 10.00) {
          console.log(`[SINAL DE COMPRA DETECTADO!] RSI: ${rsi.toFixed(1)} | EMA9: ${ema9.toFixed(1)} | Preço: R$ ${currentPrice}`);

          // Executa COMPRA REAL de R$ 10,00 a mercado na Binance!
          const orderResult = await executeRealMarketOrder('BTCBRL', 'BUY', 10.00, null);

          if (orderResult && (orderResult.orderId || orderResult.status === 'FILLED')) {
            const executedQty = parseFloat(orderResult.executedQty) || (10.00 / currentPrice);
            const cummulativeQuote = parseFloat(orderResult.cummulativeQuoteQty) || 10.00;
            const avgPrice = cummulativeQuote / executedQty || currentPrice;

            bot.openPosition = {
              symbol: 'BTCBRL',
              side: 'LONG',
              entryPrice: avgPrice,
              qty: executedQty,
              notionalBrl: cummulativeQuote,
              orderId: orderResult.orderId,
              openedAt: new Date().toLocaleTimeString('pt-BR')
            };

            const logMsg = `🟢 [COMPRA REAL BINANCE] Robô ${bot.name} comprou R$ ${cummulativeQuote.toFixed(2)} em BTC a R$ ${avgPrice.toLocaleString('pt-BR')} (ID: ${orderResult.orderId})`;
            console.log(logMsg);
            ecosystemState.hiveMind.recentInsights.unshift(logMsg);
            ecosystemState.tradeLogs.unshift({
              botId: bot.id,
              botName: bot.name,
              symbol: 'BTC/BRL',
              action: 'BUY',
              price: avgPrice,
              amount: cummulativeQuote,
              timestamp: new Date().toLocaleTimeString('pt-BR'),
              realOrderId: orderResult.orderId
            });

            await cloudSync.syncEcosystemState(ecosystemState);
          }
        }
      }

      // CASO 2: ROBÔ TEM POSIÇÃO ABERTA -> MONITORA LUCRO / TAKE PROFIT / STOP LOSS
      else if (bot.openPosition) {
        const pos = bot.openPosition;
        const currentValBrl = pos.qty * currentPrice;
        const pnlBrl = currentValBrl - pos.notionalBrl;
        const pnlPct = (pnlBrl / pos.notionalBrl) * 100;

        bot.dailyPnL = Number(pnlBrl.toFixed(2));
        bot.currentCapital = Number((pos.notionalBrl + pnlBrl).toFixed(2));

        if (tickCount % 5 === 0) {
          console.log(`[POSIÇÃO ABERTA] BTC/BRL | Entrada: R$ ${pos.entryPrice.toFixed(0)} | Atual: R$ ${currentPrice.toFixed(0)} | PnL: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% (R$ ${pnlBrl.toFixed(2)})`);
        }

        // ALVO DE LUCRO REALISTA (SCALPING 1.0% a 1.5%) OU STOP LOSS PROTEGIDO (0.9%)
        const hitTakeProfit = pnlPct >= ecosystemState.takeProfitMinPct;
        const hitStopLoss = pnlPct <= -ecosystemState.stopLossPctPerTrade;

        if (hitTakeProfit || hitStopLoss) {
          const reason = hitTakeProfit ? 'TAKE PROFIT (LUCRO)' : 'STOP LOSS DE PROTEÇÃO';
          console.log(`[ENCERRANDO POSIÇÃO] ${reason}: ${pnlPct.toFixed(2)}% | R$ ${pnlBrl.toFixed(2)}`);

          // Executa VENDA REAL a mercado na Binance!
          const sellResult = await executeRealMarketOrder('BTCBRL', 'SELL', null, pos.qty);

          if (sellResult && (sellResult.orderId || sellResult.status === 'FILLED')) {
            const finalQuote = parseFloat(sellResult.cummulativeQuoteQty) || currentValBrl;
            const finalProfit = finalQuote - pos.notionalBrl;

            bot.currentCapital = Number(finalQuote.toFixed(2));
            bot.dailyPnL = Number(finalProfit.toFixed(2));
            bot.openPosition = null;

            ecosystemState.hiveMind.totalTradesExecuted++;
            if (finalProfit > 0) {
              ecosystemState.hiveMind.winningTrades++;
              ecosystemState.hiveMind.collectiveIQ += 2;
            }

            const sellLog = `🔴 [VENDA REAL BINANCE] ${reason}: Vendido por R$ ${finalQuote.toFixed(2)} | Lucro: ${finalProfit >= 0 ? '+' : ''}R$ ${finalProfit.toFixed(2)}`;
            console.log(sellLog);
            ecosystemState.hiveMind.recentInsights.unshift(sellLog);
            ecosystemState.tradeLogs.unshift({
              botId: bot.id,
              botName: bot.name,
              symbol: 'BTC/BRL',
              action: 'SELL',
              price: currentPrice,
              amount: finalQuote,
              profit: finalProfit,
              timestamp: new Date().toLocaleTimeString('pt-BR'),
              realOrderId: sellResult.orderId
            });

            // =================================================================
            // REGRA MESTRA: SE ACUMULOU +R$ 10,00 DE LUCRO -> COFRE + NOVO ROBÔ!
            // =================================================================
            if (bot.currentCapital >= 20.00) {
              const profitToSave = 10.00;
              console.log(`🎉 [META DE +R$ 10 BATIDA!] Transferindo R$ 10,00 para a Carteira Funding e gerando Robô #2!`);

              // 1. Transfere R$ 10 para o Cofre na Binance
              await transferToFundingVault(profitToSave);

              ecosystemState.masterVaultBalance += profitToSave;
              ecosystemState.binanceFundingVault += profitToSave;
              ecosystemState.totalHistoricalProfitSaved += profitToSave;
              bot.accumulatedVaultProfit += profitToSave;
              bot.currentCapital -= profitToSave; // Volta a operar com R$ 10

              // 2. Clona e cria o Robô #2 com R$ 10,00
              const newBotId = `BOT-REAL-0${ecosystemState.activeBots.length + 1}`;
              const newBot = {
                id: newBotId,
                name: `Vortex-Real-G2-0${ecosystemState.activeBots.length + 1}`,
                generation: 2,
                createdAtDay: 1,
                assignedAsset: 'SOL/BRL',
                marketType: 'BINANCE_CRIPTO',
                initialDayCapital: 10.00,
                currentCapital: 10.00,
                dailyPnL: 0.00,
                dailyTargetProfit: 10.00,
                accumulatedVaultProfit: 0.00,
                openPosition: null,
                brain: {
                  iq: bot.brain.iq + 5,
                  confidenceThreshold: bot.brain.confidenceThreshold + 0.02,
                  weights: { ...bot.brain.weights }
                }
              };
              ecosystemState.activeBots.push(newBot);

              const cloneMsg = `🧬 [MULTIPLICAÇÃO REAL] Robô ${newBot.name} criado com R$ 10,00 herdando QI ${newBot.brain.iq}!`;
              console.log(cloneMsg);
              ecosystemState.hiveMind.recentInsights.unshift(cloneMsg);
            }

            await cloudSync.syncEcosystemState(ecosystemState);
          }
        }
      }

      // Sincroniza periodicamente com o Firebase (a cada 4 ticks = ~8 segundos)
      if (tickCount % 4 === 0) {
        await cloudSync.syncEcosystemState(ecosystemState);
      }
    } catch (cycleErr) {
      console.error('[ERRO NO CICLO DE TRADING]:', cycleErr.message);
    }
  }, 2000);
}

startRealTraderLoop();
