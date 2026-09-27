/**
 * NEXUS DARWIN AI - OPERADOR MULTI-CRIPTO AUTÔNOMO 100% REAL (BINANCE BRASIL)
 * ===========================================================================
 * Estratégia de Scalping HFT Inteligente:
 * 1. O Robô #1 opera com R$ 10,00 escaneando 4 moedas (BTC, SOL, ETH, BNB).
 * 2. Escolhe sempre a moeda que estiver no ponto mais lucrativo (RSI sobrevendido).
 * 3. Faz operações rápidas buscando de 1.0% a 1.5% de lucro (ganhando centavos no trade).
 * 4. Os centavos vão acumulando na banca (R$ 10,15 -> R$ 10,30 -> R$ 10,50...).
 * 5. Ao acumular +R$ 10,00 de lucros somados:
 *    - Transfere R$ 10,00 de Lucro Limpo pro Cofre (Carteira Funding da Binance).
 *    - Cria o Robô #2 para operarem duas moedas ao mesmo tempo!
 * 6. Sincroniza em tempo real com o Firebase e o painel web na Vercel!
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.BINANCE_API_KEY || 'r9h6DYtzeafyWkRn0rmtAsVj8VOhpRVywGHMteliFJrqg1ZdLpwGHZeJ78lDgJrB';
const API_SECRET = process.env.BINANCE_API_SECRET || 'aI5l6ZmeOGsUwDRpr7yAbN3ITtNJTSfOkHnSuX5tPyTAHU88ppT3KXVVxpQjOKfn';
const FIREBASE_URL = 'https://nexus-darwin-ai-default-rtdb.firebaseio.com';

const { FirebaseCloudSync } = fs.existsSync(path.join(__dirname, 'firebase_cloud_sync.js'))
  ? require('./firebase_cloud_sync.js')
  : require('./engine/firebase_cloud_sync.js');

const cloudSync = new FirebaseCloudSync();
cloudSync.databaseURL = FIREBASE_URL;

// =============================================================================
// CESTA DE MOEDAS MONITORADAS (MULTI-CRIPTO)
// =============================================================================
const MONITORED_ASSETS = [
  { symbol: 'BTCBRL', baseAsset: 'BTC', name: 'Bitcoin', decimals: 5, minQty: 0.00001 },
  { symbol: 'SOLBRL', baseAsset: 'SOL', name: 'Solana', decimals: 3, minQty: 0.001 },
  { symbol: 'ETHBRL', baseAsset: 'ETH', name: 'Ethereum', decimals: 4, minQty: 0.0001 },
  { symbol: 'BNBBRL', baseAsset: 'BNB', name: 'BNB', decimals: 3, minQty: 0.001 }
];

const priceHistories = {
  'BTCBRL': [],
  'SOLBRL': [],
  'ETHBRL': [],
  'BNBBRL': []
};

// =============================================================================
// 1. COMUNICAÇÃO BINANCE (ASSINADA VIA HMAC-SHA256)
// =============================================================================
function getBinanceServerTime() {
  return new Promise((resolve) => {
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

async function transferToFundingVault(amountBrl) {
  try {
    const res = await binanceSignedRequest('/sapi/v1/asset/transfer', 'POST', {
      type: 'MAIN_FUNDING',
      asset: 'BRL',
      amount: String(Number(amountBrl).toFixed(2))
    });
    console.log('[COFRE BINANCE] Lucro enviado para a Carteira Funding:', res.data);
    return res.data;
  } catch (err) {
    console.error('[COFRE BINANCE] Erro na transferência:', err.message);
    return null;
  }
}

async function getRealBalances() {
  try {
    const res = await binanceSignedRequest('/api/v3/account', 'GET');
    if (res.data && res.data.balances) {
      const result = { brlFree: 0 };
      res.data.balances.forEach((b) => {
        const free = parseFloat(b.free) || 0;
        if (b.asset === 'BRL') result.brlFree = free;
        else if (free > 0) result[b.asset] = free;
      });
      return result;
    }
    return { brlFree: 0 };
  } catch (e) {
    return { brlFree: 0 };
  }
}

function getLivePrice(symbol) {
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

async function executeRealMarketOrder(symbol, side, quoteOrderQty = null, quantity = null, decimals = 5) {
  const params = { symbol, side, type: 'MARKET' };
  if (side === 'BUY' && quoteOrderQty) {
    params.quoteOrderQty = String(Number(quoteOrderQty).toFixed(2));
  } else if (side === 'SELL' && quantity) {
    // Trunca casas decimais sem arredondar para cima (para a Binance não rejeitar por saldo insuficiente)
    const factor = Math.pow(10, decimals);
    const truncatedQty = Math.floor(quantity * factor) / factor;
    params.quantity = truncatedQty.toFixed(decimals);
  }

  console.log(`[ORDEM REAL] Enviando ${side} em ${symbol}:`, params);
  const result = await binanceSignedRequest('/api/v3/order', 'POST', params);
  console.log(`[RESPOSTA BINANCE]:`, JSON.stringify(result.data));
  return result.data;
}

// =============================================================================
// 2. INDICADORES TÉCNICOS DE SCALPING
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
// 3. ESTADO OFICIAL DO ECOSSISTEMA
// =============================================================================
const ecosystemState = {
  dayNumber: 1,
  dayProgressPct: 0,
  cycleSpeedSec: 86400,
  isRunning: true,
  initialSeedCapital: 10.00,
  targetProfitPerBot: 10.00, // Meta de +R$ 10 somados para clonar novo robô
  takeProfitMinPct: 1.0,     // Scalping: 1.0% a 1.5% de lucro por trade
  takeProfitMaxPct: 1.5,
  stopLossPctPerTrade: 0.9,  // Stop loss de 0.9%

  masterVaultBalance: 0.00,
  binanceFundingVault: 0.00,
  alpacaCashVault: 0.00,
  totalDepositedCapital: 10.00,
  totalHistoricalProfitSaved: 0.00,

  hiveMind: {
    collectiveIQ: 115,
    totalLessonsLearned: 1,
    totalTradesExecuted: 1,
    winningTrades: 1,
    globalBestWeights: { w_rsi: 0.85, w_ema: 0.90, w_bollinger: 0.75, w_macd: 0.80, w_flow: 0.70, w_regime: 0.85 },
    avoidedPatternsCount: 0,
    recentInsights: [
      'IA MULTI-CRIPTO: Monitorando BTC, SOL, ETH e BNB para scalping inteligente de 1.0% a 1.5%.'
    ]
  },

  activeBots: [
    {
      id: 'BOT-REAL-01',
      name: 'Alpha-Multi-01',
      generation: 1,
      createdAtDay: 1,
      assignedAsset: 'BTC/BRL',
      marketType: 'BINANCE_CRIPTO',
      initialDayCapital: 10.00,
      currentCapital: 10.00,
      dailyPnL: 0.00,
      accumulatedCentsProfit: 0.00, // Acumulador de centavos rumo aos +R$ 10
      dailyTargetProfit: 10.00,
      accumulatedVaultProfit: 0.00,
      openPosition: null,
      brain: {
        iq: 118,
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

// =============================================================================
// 4. MOTOR INTELIGENTE DE SELEÇÃO E SCALPING
// =============================================================================
async function startMultiAssetTrader() {
  console.log('===================================================================');
  console.log(' 🚀 NEXUS DARWIN AI - MOTOR MULTI-CRIPTO 100% REAL (SCALPING)');
  console.log('===================================================================');
  console.log('[MOEDAS ATIVAS]: Bitcoin (BTC), Solana (SOL), Ethereum (ETH), BNB');
  console.log('[META POR TRADE]: 1.0% a 1.5% (Centavos compostos rumo a +R$ 10,00)');
  console.log('[IP AUTORIZADO]: 45.226.119.62');

  // Verifica saldos reais iniciais
  const balances = await getRealBalances();
  console.log('[SALDOS REAIS ENCONTRADOS]:', balances);

  // Se já tiver Bitcoin em carteira (ordem anterior):
  if (balances.BTC && balances.BTC >= 0.00001) {
    const curBtc = (await getLivePrice('BTCBRL')) || 440782;
    const valBrl = balances.BTC * curBtc;
    ecosystemState.activeBots[0].currentCapital = Number(((balances.brlFree || 0) + valBrl).toFixed(2));
    ecosystemState.activeBots[0].openPosition = {
      symbol: 'BTCBRL',
      assetName: 'Bitcoin',
      baseAsset: 'BTC',
      side: 'LONG',
      entryPrice: 440782,
      qty: balances.BTC,
      decimals: 5,
      notionalBrl: 8.82,
      orderId: 2337522095,
      openedAt: new Date().toLocaleTimeString('pt-BR')
    };
    console.log(`[POSIÇÃO ATIVA]: ${balances.BTC} BTC monitorando saída no lucro de 1% a 1.5%!`);
  }

  await cloudSync.syncEcosystemState(ecosystemState);

  let tickCount = 0;

  // Loop de Análise Multi-Moedas a cada 2.5 segundos
  setInterval(async () => {
    try {
      tickCount++;

      // Atualiza preços de todas as 4 moedas simultaneamente
      for (const asset of MONITORED_ASSETS) {
        const p = await getLivePrice(asset.symbol);
        if (p) {
          priceHistories[asset.symbol].push(p);
          if (priceHistories[asset.symbol].length > 60) priceHistories[asset.symbol].shift();
        }
      }

      // Analisa cada robô ativo
      for (let i = 0; i < ecosystemState.activeBots.length; i++) {
        const bot = ecosystemState.activeBots[i];

        // ---------------------------------------------------------------------
        // SE NÃO TEM POSIÇÃO: ESCANEIA A MELHOR OPORTUNIDADE ENTRE AS 4 MOEDAS
        // ---------------------------------------------------------------------
        if (!bot.openPosition) {
          let bestCandidate = null;
          let lowestRsi = 999;

          for (const asset of MONITORED_ASSETS) {
            const h = priceHistories[asset.symbol];
            if (h.length >= 12) {
              const rsi = calcRSI(h, 14);
              const ema9 = calcEMA(h, 9);
              const ema21 = calcEMA(h, 21);

              // Procura moeda em ponto ideal de sobrevenda ou cruzamento altista
              if (rsi < 48 && ema9 >= ema21 * 0.9995 && rsi < lowestRsi) {
                lowestRsi = rsi;
                bestCandidate = { asset, rsi, price: h[h.length - 1] };
              }
            }
          }

          // Se achou uma oportunidade de ouro e o robô tem capital livre:
          if (bestCandidate && bot.currentCapital >= 10.00) {
            const { asset, rsi, price } = bestCandidate;
            console.log(`🎯 [OPORTUNIDADE DETECTADA EM ${asset.name}!] RSI: ${rsi.toFixed(1)} | Preço: R$ ${price}`);

            const order = await executeRealMarketOrder(asset.symbol, 'BUY', 10.00, null, asset.decimals);

            if (order && (order.orderId || order.status === 'FILLED')) {
              const executedQty = parseFloat(order.executedQty) || (10.00 / price);
              const cummulativeQuote = parseFloat(order.cummulativeQuoteQty) || 10.00;
              const avgPrice = cummulativeQuote / executedQty || price;

              bot.assignedAsset = asset.symbol.replace('BRL', '/BRL');
              bot.openPosition = {
                symbol: asset.symbol,
                assetName: asset.name,
                baseAsset: asset.baseAsset,
                decimals: asset.decimals,
                side: 'LONG',
                entryPrice: avgPrice,
                qty: executedQty,
                notionalBrl: cummulativeQuote,
                orderId: order.orderId,
                openedAt: new Date().toLocaleTimeString('pt-BR')
              };

              const buyMsg = `🟢 [COMPRA REAL BINANCE] ${bot.name} comprou R$ ${cummulativeQuote.toFixed(2)} em ${asset.name} (ID: ${order.orderId})`;
              console.log(buyMsg);
              ecosystemState.hiveMind.recentInsights.unshift(buyMsg);
              ecosystemState.tradeLogs.unshift({
                botId: bot.id,
                botName: bot.name,
                symbol: bot.assignedAsset,
                action: 'BUY',
                price: avgPrice,
                amount: cummulativeQuote,
                timestamp: new Date().toLocaleTimeString('pt-BR'),
                realOrderId: order.orderId
              });

              await cloudSync.syncEcosystemState(ecosystemState);
            }
          }
        }

        // ---------------------------------------------------------------------
        // SE TEM POSIÇÃO ABERTA: MONITORA SCALPING DE 1.0% A 1.5% OU STOP LOSS
        // ---------------------------------------------------------------------
        else if (bot.openPosition) {
          const pos = bot.openPosition;
          const currentPrice = await getLivePrice(pos.symbol);
          if (!currentPrice) continue;

          const currentValBrl = pos.qty * currentPrice;
          const pnlBrl = currentValBrl - pos.notionalBrl;
          const pnlPct = (pnlBrl / pos.notionalBrl) * 100;

          bot.dailyPnL = Number(pnlBrl.toFixed(2));
          bot.currentCapital = Number((pos.notionalBrl + pnlBrl).toFixed(2));

          if (tickCount % 4 === 0) {
            console.log(`[SCALPING ${pos.assetName}] Entrada: R$ ${pos.entryPrice.toFixed(2)} | Atual: R$ ${currentPrice.toFixed(2)} | PnL: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% (R$ ${pnlBrl.toFixed(2)})`);
          }

          // GATILHO DE SAÍDA: LUCRO ENTRE 1.0% E 1.5% (SCALP) OU PROTEÇÃO DE 0.9%
          const hitTakeProfit = pnlPct >= ecosystemState.takeProfitMinPct;
          const hitStopLoss = pnlPct <= -ecosystemState.stopLossPctPerTrade;

          if (hitTakeProfit || hitStopLoss) {
            const reason = hitTakeProfit ? 'LUCRO SCALPING (1.0% a 1.5%)' : 'STOP LOSS PROTEGIDO';
            console.log(`🏁 [ENCERRANDO OPERAÇÃO]: ${reason} | Variação: ${pnlPct.toFixed(2)}% | R$ ${pnlBrl.toFixed(2)}`);

            const sellResult = await executeRealMarketOrder(pos.symbol, 'SELL', null, pos.qty, pos.decimals);

            if (sellResult && (sellResult.orderId || sellResult.status === 'FILLED')) {
              const finalQuote = parseFloat(sellResult.cummulativeQuoteQty) || currentValBrl;
              const finalProfit = finalQuote - pos.notionalBrl;

              bot.currentCapital = Number(finalQuote.toFixed(2));
              bot.dailyPnL = Number(finalProfit.toFixed(2));
              bot.accumulatedCentsProfit = Number(((bot.accumulatedCentsProfit || 0) + finalProfit).toFixed(2));
              bot.openPosition = null;

              ecosystemState.hiveMind.totalTradesExecuted++;
              if (finalProfit > 0) {
                ecosystemState.hiveMind.winningTrades++;
                ecosystemState.hiveMind.collectiveIQ += 2;
              }

              const sellMsg = `🔴 [VENDA REAL ${pos.assetName}] ${reason}: Lucro no bolso de ${finalProfit >= 0 ? '+' : ''}R$ ${finalProfit.toFixed(2)} | Total Acumulado: R$ ${bot.accumulatedCentsProfit.toFixed(2)}`;
              console.log(sellMsg);
              ecosystemState.hiveMind.recentInsights.unshift(sellMsg);
              ecosystemState.tradeLogs.unshift({
                botId: bot.id,
                botName: bot.name,
                symbol: pos.symbol.replace('BRL', '/BRL'),
                action: 'SELL',
                price: currentPrice,
                amount: finalQuote,
                profit: finalProfit,
                timestamp: new Date().toLocaleTimeString('pt-BR'),
                realOrderId: sellResult.orderId
              });

              // ===============================================================
              // MULTIPLICAÇÃO: QUANDO OS CENTAVOS SOMADOS ATINGEM +R$ 10,00!
              // ===============================================================
              if (bot.accumulatedCentsProfit >= 10.00 || bot.currentCapital >= 20.00) {
                const profitToSave = 10.00;
                console.log(`🎉 [META DE +R$ 10,00 ACUMULADA!] Enviando R$ 10 para o Cofre Funding e gerando novo Robô!`);

                await transferToFundingVault(profitToSave);

                ecosystemState.masterVaultBalance += profitToSave;
                ecosystemState.binanceFundingVault += profitToSave;
                ecosystemState.totalHistoricalProfitSaved += profitToSave;
                bot.accumulatedVaultProfit = (bot.accumulatedVaultProfit || 0) + profitToSave;
                bot.accumulatedCentsProfit -= profitToSave;
                bot.currentCapital = 10.00;

                // GERA NOVO ROBÔ PARA OPERAR OUTRA CRIPTO DA CESTA
                const nextAsset = MONITORED_ASSETS[ecosystemState.activeBots.length % MONITORED_ASSETS.length];
                const newBotId = `BOT-REAL-0${ecosystemState.activeBots.length + 1}`;
                const newBot = {
                  id: newBotId,
                  name: `Darwin-Multi-0${ecosystemState.activeBots.length + 1}`,
                  generation: ecosystemState.activeBots.length + 1,
                  createdAtDay: 1,
                  assignedAsset: nextAsset.symbol.replace('BRL', '/BRL'),
                  marketType: 'BINANCE_CRIPTO',
                  initialDayCapital: 10.00,
                  currentCapital: 10.00,
                  dailyPnL: 0.00,
                  accumulatedCentsProfit: 0.00,
                  dailyTargetProfit: 10.00,
                  accumulatedVaultProfit: 0.00,
                  openPosition: null,
                  brain: {
                    iq: bot.brain.iq + 5,
                    confidenceThreshold: bot.brain.confidenceThreshold + 0.01,
                    weights: { ...bot.brain.weights }
                  }
                };
                ecosystemState.activeBots.push(newBot);

                const cloneLog = `🧬 [ROBÔ MULTIPLICADO!] ${newBot.name} criado com R$ 10,00 para operar ${nextAsset.name}!`;
                console.log(cloneLog);
                ecosystemState.hiveMind.recentInsights.unshift(cloneLog);
              }

              await cloudSync.syncEcosystemState(ecosystemState);
            }
          }
        }
      }

      // Sincroniza o estado atualizado no Firebase a cada 3 ticks
      if (tickCount % 3 === 0) {
        await cloudSync.syncEcosystemState(ecosystemState);
      }
    } catch (err) {
      console.error('[ERRO NO CICLO MULTI-CRIPTO]:', err.message);
    }
  }, 2500);
}

startMultiAssetTrader();
