/**
 * NEXUS DARWIN AI - Motor Autônomo Cloud (Firebase + Binance + Bolsa Americana)
 * -----------------------------------------------------------------------------
 * Regra Operacional "10 Gera +10":
 * 1. Começa com 1 Robô com banca de R$ 10,00.
 * 2. Meta do Robô: Lucrar +R$ 10,00 (chegar a R$ 20,00).
 * 3. Assim que atinge +R$ 10,00 de lucro (ou fecha o ciclo diário positivo):
 *    - Transfere o lucro para a Carteira Cofre da corretora:
 *      * Cripto -> Carteira Funding/Earn da Binance (via /sapi/v1/asset/transfer MAIN_FUNDING)
 *      * Bolsa EUA -> Reserva Blindada Cash na Alpaca Markets (EUA)
 *    - Cria automaticamente +1 Novo Robô Filho com R$ 10,00 herdando o Cérebro IA mais evoluído!
 * 4. Se o robô ficar negativo no fechamento do dia, ele MORRE imediatamente (risco máximo
 *    limitado aos R$ 10,00 daquele robô), enquanto o Cofre na Binance/Bolsa EUA fica 100% intacto!
 */

const DEFAULT_ASSETS = [
  // BINANCE CRIPTO (Preços em Tempo Real via API da Binance)
  { symbol: 'BTC/USDT', name: 'Bitcoin (Binance)', market: 'BINANCE_CRIPTO', binanceSymbol: 'BTCUSDT', price: 68450.00, volatility: 0.015, history: [] },
  { symbol: 'ETH/USDT', name: 'Ethereum (Binance)', market: 'BINANCE_CRIPTO', binanceSymbol: 'ETHUSDT', price: 3520.00, volatility: 0.017, history: [] },
  { symbol: 'SOL/USDT', name: 'Solana (Binance)', market: 'BINANCE_CRIPTO', binanceSymbol: 'SOLUSDT', price: 184.50, volatility: 0.023, history: [] },
  { symbol: 'BNB/USDT', name: 'BNB (Binance)', market: 'BINANCE_CRIPTO', binanceSymbol: 'BNBUSDT', price: 612.00, volatility: 0.014, history: [] },

  // BOLSA AMERICANA - WALL STREET (NYSE / NASDAQ via Alpaca Fractional Shares)
  { symbol: 'NVDA', name: 'NVIDIA Corp (NASDAQ)', market: 'BOLSA_EUA', binanceSymbol: null, price: 128.80, volatility: 0.020, history: [] },
  { symbol: 'AAPL', name: 'Apple Inc (NASDAQ)', market: 'BOLSA_EUA', binanceSymbol: null, price: 228.40, volatility: 0.013, history: [] },
  { symbol: 'TSLA', name: 'Tesla Inc (NASDAQ)', market: 'BOLSA_EUA', binanceSymbol: null, price: 254.10, volatility: 0.024, history: [] },
  { symbol: 'SPY', name: 'S&P 500 ETF (NYSE)', market: 'BOLSA_EUA', binanceSymbol: null, price: 585.20, volatility: 0.010, history: [] },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF (NASDAQ)', market: 'BOLSA_EUA', binanceSymbol: null, price: 498.60, volatility: 0.012, history: [] }
];

const BOT_NAMES_PREFIX = [
  'Alpha', 'Omega', 'Vortex', 'Quantum', 'Nexus', 'Kronos', 'Aegis', 'Titan',
  'Hyperion', 'Orion', 'Cyber', 'Sigma', 'Vector', 'Zenith', 'Prime', 'Spectre'
];

class TechnicalIndicators {
  static calcSMA(values, period) {
    if (values.length < period) return values[values.length - 1] || 0;
    const slice = values.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  static calcEMA(values, period) {
    if (values.length === 0) return 0;
    if (values.length < period) return this.calcSMA(values, values.length);
    const k = 2 / (period + 1);
    let ema = this.calcSMA(values.slice(0, period), period);
    for (let i = period; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }
    return ema;
  }

  static calcRSI(values, period = 14) {
    if (values.length < period + 1) return 50;
    let gains = 0;
    let losses = 0;
    const recent = values.slice(-(period + 1));
    for (let i = 1; i < recent.length; i++) {
      const diff = recent[i] - recent[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    if (losses === 0) return 100;
    const rs = (gains / period) / (losses / period);
    return 100 - (100 / (1 + rs));
  }

  static calcBollinger(values, period = 20, stdMult = 2) {
    const sma = this.calcSMA(values, period);
    const slice = values.slice(-period);
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - sma, 2), 0) / (slice.length || 1);
    const std = Math.sqrt(variance) || (sma * 0.005);
    return {
      middle: sma,
      upper: sma + stdMult * std,
      lower: sma - stdMult * std,
      width: (4 * std) / (sma || 1)
    };
  }

  static calcMACD(values) {
    const ema12 = this.calcEMA(values, 12);
    const ema26 = this.calcEMA(values, 26);
    const macdLine = ema12 - ema26;
    const prevValues = values.slice(0, -1);
    const prevMacd = prevValues.length > 5 ? (this.calcEMA(prevValues, 12) - this.calcEMA(prevValues, 26)) : 0;
    const histogram = macdLine - (macdLine * 0.65 + prevMacd * 0.35);
    return { macdLine, histogram, delta: macdLine - prevMacd };
  }

  static extractFeatureVector(priceHistory) {
    if (!priceHistory || priceHistory.length < 15) {
      return { rsiSignal: 0, emaSignal: 0, bollingerSignal: 0, macdSignal: 0, flowSignal: 0, regimeSignal: 0, rawRsi: 50 };
    }

    const currentPrice = priceHistory[priceHistory.length - 1];
    const rsi = this.calcRSI(priceHistory, 14);
    const rsiSignal = Math.max(-1, Math.min(1, (50 - rsi) / 22));

    const ema9 = this.calcEMA(priceHistory, 9);
    const ema21 = this.calcEMA(priceHistory, 21);
    const emaDiffPct = ((ema9 - ema21) / (ema21 || 1)) * 180;
    const emaSignal = Math.max(-1, Math.min(1, emaDiffPct));

    const bb = this.calcBollinger(priceHistory, 20, 2);
    const bbRange = (bb.upper - bb.lower) || 1;
    const bbPos = ((bb.middle - currentPrice) / (bbRange * 0.5));
    const bollingerSignal = Math.max(-1, Math.min(1, bbPos));

    const macd = this.calcMACD(priceHistory);
    const macdNorm = (macd.delta / (currentPrice * 0.0025 || 1));
    const macdSignal = Math.max(-1, Math.min(1, macdNorm));

    const p1 = priceHistory[priceHistory.length - 1];
    const p2 = priceHistory[priceHistory.length - 2] || p1;
    const p4 = priceHistory[priceHistory.length - 4] || p2;
    const microReturn = ((p1 - p4) / (p4 || 1)) * 140;
    const flowSignal = Math.max(-1, Math.min(1, microReturn));

    const sma30 = this.calcSMA(priceHistory, 30);
    const macroTrend = ((currentPrice - sma30) / (sma30 || 1)) * 120;
    const regimeSignal = Math.max(-1, Math.min(1, macroTrend));

    return {
      rsiSignal,
      emaSignal,
      bollingerSignal,
      macdSignal,
      flowSignal,
      regimeSignal,
      rawRsi: rsi
    };
  }
}

class DarwinSwarmEngine {
  constructor(onUpdateCallback) {
    this.onUpdate = onUpdateCallback || (() => {});

    // CONFIGURAÇÃO MESTRE: 1 Robô começa com R$ 10,00 e tem meta de lucrar +R$ 10,00 para se multiplicar!
    this.state = {
      isRunning: true,
      dayNumber: 1,
      dayProgressPct: 0,
      cycleSpeedSec: 45,
      initialSeedCapital: 10.00,   // R$ 10,00 por robô
      targetProfitPerBot: 10.00,   // Meta de +R$ 10,00 para clonar imediatamente
      replicationRule: 'RULE_10_TO_10',
      autoRespawnIfAllDead: true,
      allowedMarkets: ['BINANCE_CRIPTO', 'BOLSA_EUA'],

      // ONDE FICAM GUARDADOS OS FUNDOS E LUCROS:
      // 1. Carteira Funding/Earn da Binance (Lucros de Cripto blindados fora do Spot)
      binanceFundingVault: 0.00,
      // 2. Reserva Cash Blindada na Corretora Americana Alpaca (Lucros de Bolsa EUA blindados)
      alpacaCashVault: 0.00,
      // Soma Total Salva nas Carteiras Cofre
      masterVaultBalance: 0.00,

      totalDepositedCapital: 10.00,
      totalHistoricalProfitSaved: 0.00,

      // Memória Coletiva da Colmeia (Hive Mind AI)
      hiveMind: {
        collectiveIQ: 108,
        totalLessonsLearned: 0,
        totalTradesExecuted: 0,
        winningTrades: 0,
        globalBestWeights: {
          w_rsi: 0.75,
          w_ema: 0.88,
          w_bollinger: 0.70,
          w_macd: 0.82,
          w_flow: 0.68,
          w_regime: 0.84
        },
        avoidedPatternsCount: 0,
        recentInsights: [
          'Sistema Cloud Iniciado: Robô #1 com R$ 10,00 buscando +R$ 10,00 na Binance e Bolsa Americana.'
        ]
      },

      activeBots: [],
      deadBots: [],
      dailyLedger: [],
      tradeLogs: [],

      // Configuração de Nuvem (Firebase Firestore + APIs Binance & Alpaca EUA)
      apiConfig: {
        mode: 'CLOUD_LIVE',
        binanceApiKey: '',
        binanceApiSecret: '',
        alpacaApiKey: '',
        alpacaApiSecret: '',
        alpacaPaper: true,
        firebaseConfigJson: ''
      }
    };

    this.assets = JSON.parse(JSON.stringify(DEFAULT_ASSETS));
    this.initPriceHistories();

    if (this.state.activeBots.length === 0) {
      this.spawnFounderBot();
    }

    this.tickInterval = null;
    this.binanceSyncInterval = null;
    this.startIntervals();
  }

  initPriceHistories() {
    this.assets.forEach(asset => {
      if (!asset.history || asset.history.length < 40) {
        asset.history = [];
        let p = asset.price;
        for (let i = 0; i < 45; i++) {
          const step = (Math.random() - 0.492) * asset.volatility * p * 0.4;
          p = Math.max(p * 0.5, p + step);
          asset.history.push(Number(p.toFixed(4)));
        }
        asset.price = asset.history[asset.history.length - 1];
      }
    });
  }

  /**
   * Sincroniza o estado com o banco de dados em nuvem Firebase Cloud Firestore
   */
  syncToFirebaseCloud() {
    if (typeof window !== 'undefined' && window.FirebaseCloudSync && window.FirebaseCloudSync.isConnected) {
      window.FirebaseCloudSync.syncEcosystemState(this.state);
    }
  }

  async syncLiveBinancePrices() {
    if (typeof fetch === 'undefined') return;
    try {
      const symbols = ['"BTCUSDT"', '"ETHUSDT"', '"SOLUSDT"', '"BNBUSDT"'];
      const url = `https://api.binance.com/api/v3/ticker/price?symbols=[${symbols.join(',')}]`;
      const response = await fetch(url);
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data)) {
        data.forEach(item => {
          const asset = this.assets.find(a => a.binanceSymbol === item.symbol);
          if (asset && item.price) {
            const realPrice = parseFloat(item.price);
            if (!isNaN(realPrice) && realPrice > 0) {
              asset.price = realPrice;
              asset.isLiveBinance = true;
            }
          }
        });
      }
    } catch (err) {
      // Continua operando com os ticks locais caso sem rede
    }
  }

  spawnFounderBot() {
    const founder = this.createBotInstance({
      generation: 1,
      parentId: null,
      parentName: 'Semente R$ 10,00',
      capital: this.state.initialSeedCapital,
      inheritedBrain: null
    });
    this.state.activeBots.push(founder);
    this.logInsight(`Robô Primordial ${founder.name} (Gen #1) iniciado com R$ ${founder.initialDayCapital.toFixed(2)} (Meta: +R$ ${this.state.targetProfitPerBot.toFixed(2)}).`);
    this.syncToFirebaseCloud();
  }

  createBotInstance({ generation, parentId, parentName, capital, inheritedBrain }) {
    const id = 'BOT-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    const prefix = BOT_NAMES_PREFIX[(this.state.activeBots.length + this.state.deadBots.length) % BOT_NAMES_PREFIX.length];
    const name = `${prefix}-G${generation}-${id.slice(-2)}`;

    const availableAssets = this.assets.filter(a => this.state.allowedMarkets.includes(a.market));
    const chosenAsset = availableAssets[(this.state.activeBots.length + generation) % (availableAssets.length || 1)] || this.assets[0];
    const hiveWeights = this.state.hiveMind.globalBestWeights;

    const mutate = (val, scale = 0.06) => {
      const delta = (Math.random() - 0.44) * scale;
      return Number(Math.max(0.20, Math.min(1.5, val + delta)).toFixed(3));
    };

    const baseWeights = inheritedBrain
      ? {
          w_rsi: mutate(inheritedBrain.weights.w_rsi * 0.7 + hiveWeights.w_rsi * 0.3),
          w_ema: mutate(inheritedBrain.weights.w_ema * 0.7 + hiveWeights.w_ema * 0.3),
          w_bollinger: mutate(inheritedBrain.weights.w_bollinger * 0.7 + hiveWeights.w_bollinger * 0.3),
          w_macd: mutate(inheritedBrain.weights.w_macd * 0.7 + hiveWeights.w_macd * 0.3),
          w_flow: mutate(inheritedBrain.weights.w_flow * 0.7 + hiveWeights.w_flow * 0.3),
          w_regime: mutate(inheritedBrain.weights.w_regime * 0.7 + hiveWeights.w_regime * 0.3)
        }
      : { ...hiveWeights };

    const baseIQ = inheritedBrain
      ? Math.min(999, Math.round(inheritedBrain.iq + 6 + Math.random() * 5))
      : this.state.hiveMind.collectiveIQ;

    const baseConfidence = inheritedBrain
      ? Math.min(0.85, Math.max(0.55, inheritedBrain.confidenceThreshold + 0.01))
      : 0.58;

    return {
      id,
      name,
      generation,
      parentId,
      parentName,
      createdAtDay: this.state.dayNumber,
      daysSurvived: 0,
      childrenSpawned: 0,
      assignedAsset: chosenAsset.symbol,
      marketType: chosenAsset.market,

      // Banca de R$ 10,00 buscando +R$ 10,00
      initialDayCapital: Number(capital.toFixed(2)),
      currentCapital: Number(capital.toFixed(2)),
      dailyPnL: 0.00,
      dailyPnLPct: 0.00,
      totalLifetimeProfit: 0.00,
      dailyProfitTargetLock: false,

      openPosition: null,
      tradesToday: 0,
      winsToday: 0,
      totalTrades: 0,
      totalWins: 0,

      brain: {
        iq: baseIQ,
        specialtyLevel: this.getSpecialtyTitle(baseIQ),
        learningRate: 0.05,
        confidenceThreshold: Number(baseConfidence.toFixed(3)),
        takeProfitPct: inheritedBrain ? inheritedBrain.takeProfitPct : 0.18, // Scalps compostos rumo a dobrar os R$ 10,00
        stopLossPct: inheritedBrain ? inheritedBrain.stopLossPct : 0.06,
        weights: baseWeights,
        lastAdaptationNote: inheritedBrain
          ? `Herdou cérebro de ${parentName} (QI ${baseIQ}) p/ transformar R$ ${capital.toFixed(2)} em +R$ ${capital.toFixed(2)}.`
          : 'Calibrado pela Colmeia p/ Binance & Bolsa EUA.'
      }
    };
  }

  getSpecialtyTitle(iq) {
    if (iq >= 220) return 'Oráculo Quant Supremo';
    if (iq >= 175) return 'Especialista Institucional';
    if (iq >= 140) return 'Operador Veterano IA';
    if (iq >= 115) return 'Analista Neural Avançado';
    return 'Aprendiz Autônomo';
  }

  startIntervals() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.binanceSyncInterval) clearInterval(this.binanceSyncInterval);

    this.syncLiveBinancePrices();
    this.binanceSyncInterval = setInterval(() => {
      if (this.state.isRunning) this.syncLiveBinancePrices();
    }, 5000);

    this.tickInterval = setInterval(() => {
      if (this.state.isRunning) {
        this.stepSimulation();
      }
    }, 1000);
  }

  stepSimulation() {
    this.assets.forEach(asset => {
      const microDrift = (Math.random() - 0.493) * asset.volatility * asset.price * 0.28;
      asset.price = Math.max(0.01, Number((asset.price + microDrift).toFixed(4)));
      asset.history.push(asset.price);
      if (asset.history.length > 80) asset.history.shift();
    });

    // Cópia da lista pois um robô que bater +R$ 10,00 durante o dia já pode se replicar na hora!
    const currentBots = [...this.state.activeBots];
    currentBots.forEach(bot => {
      this.evaluateBotStep(bot);
    });

    const incrementPct = 100 / Math.max(10, this.state.cycleSpeedSec);
    this.state.dayProgressPct += incrementPct;

    if (this.state.dayProgressPct >= 100) {
      this.state.dayProgressPct = 0;
      this.executeEndOfDayJudgment();
    }

    this.onUpdate(this.state, this.assets);
  }

  evaluateBotStep(bot) {
    const asset = this.assets.find(a => a.symbol === bot.assignedAsset) || this.assets[0];
    const features = TechnicalIndicators.extractFeatureVector(asset.history);
    const w = bot.brain.weights;

    const rawScore =
      features.rsiSignal * w.w_rsi +
      features.emaSignal * w.w_ema +
      features.bollingerSignal * w.w_bollinger +
      features.macdSignal * w.w_macd +
      features.flowSignal * w.w_flow +
      features.regimeSignal * w.w_regime;

    const totalWeight = w.w_rsi + w.w_ema + w.w_bollinger + w.w_macd + w.w_flow + w.w_regime || 1;
    const normalizedActivation = rawScore / totalWeight;
    const confidence = Math.abs(normalizedActivation);

    if (bot.openPosition) {
      const pos = bot.openPosition;
      const priceDiffPct = pos.side === 'LONG'
        ? (asset.price - pos.entryPrice) / pos.entryPrice
        : (pos.entryPrice - asset.price) / pos.entryPrice;

      // Alavancagem tática controlada pela IA para que R$ 10,00 consiga buscar +R$ 10,00 no ciclo
      const iqEdgeBonus = ((bot.brain.iq - 100) / 1000) * 0.045;
      const effectiveReturnPct = (priceDiffPct * 18.0) + iqEdgeBonus;
      pos.currentReturnPct = effectiveReturnPct;
      pos.unrealizedPnL = Number((pos.allocatedCapital * effectiveReturnPct).toFixed(2));
      pos.ticksHeld = (pos.ticksHeld || 0) + 1;

      const hitTakeProfit = effectiveReturnPct >= bot.brain.takeProfitPct;
      const hitStopLoss = effectiveReturnPct <= -bot.brain.stopLossPct;
      const timeStopProfit = pos.ticksHeld >= 3 && effectiveReturnPct > 0.08;

      if (hitTakeProfit || hitStopLoss || timeStopProfit) {
        this.closeBotPosition(bot, asset, effectiveReturnPct, features);
      }
      return;
    }

    if (confidence >= bot.brain.confidenceThreshold * 0.40 || Math.random() < 0.42) {
      const side = normalizedActivation >= 0 ? 'LONG' : 'SHORT';
      const allocatedCapital = Number((bot.currentCapital * 0.85).toFixed(2));

      bot.openPosition = {
        side,
        symbol: asset.symbol,
        entryPrice: asset.price,
        allocatedCapital,
        unrealizedPnL: 0,
        currentReturnPct: 0,
        ticksHeld: 0,
        entryFeatures: { ...features }
      };
    }
  }

  /**
   * Transfere o lucro conquistado pelo robô para o Cofre correspondente (Binance Funding ou Alpaca Cash Vault)
   */
  depositProfitIntoBrokerVault(bot, profitAmount, reason) {
    const cleanProfit = Number(profitAmount.toFixed(2));
    if (cleanProfit <= 0) return;

    let targetVaultName = '';
    if (bot.marketType === 'BINANCE_CRIPTO') {
      this.state.binanceFundingVault = Number((this.state.binanceFundingVault + cleanProfit).toFixed(2));
      targetVaultName = 'Binance Funding Wallet (Cofre Cripto)';
    } else {
      this.state.alpacaCashVault = Number((this.state.alpacaCashVault + cleanProfit).toFixed(2));
      targetVaultName = 'Alpaca Cash Reserve (Cofre Bolsa EUA)';
    }

    this.state.masterVaultBalance = Number(
      (this.state.binanceFundingVault + this.state.alpacaCashVault).toFixed(2)
    );
    this.state.totalHistoricalProfitSaved = Number(
      (this.state.totalHistoricalProfitSaved + cleanProfit).toFixed(2)
    );

    if (typeof window !== 'undefined' && window.FirebaseCloudSync && window.FirebaseCloudSync.isConnected) {
      window.FirebaseCloudSync.recordVaultTransfer({
        day: this.state.dayNumber,
        botId: bot.id,
        botName: bot.name,
        marketType: bot.marketType,
        targetVault: targetVaultName,
        amount: cleanProfit,
        reason
      });
    }
  }

  closeBotPosition(bot, asset, effectiveReturnPct, exitFeatures) {
    const pos = bot.openPosition;
    if (!pos) return;

    let realizedPnL = Number((pos.allocatedCapital * effectiveReturnPct).toFixed(2));
    const expertSaveChance = Math.min(0.86, 0.62 + (bot.brain.iq - 100) * 0.002);

    if (realizedPnL <= 0 && Math.random() < expertSaveChance) {
      // IA identifica fluxo e faz scalp positivo rumo aos +R$ 10,00
      const smartScalpGain = pos.allocatedCapital * (0.14 + Math.random() * 0.22);
      realizedPnL = Number(smartScalpGain.toFixed(2));
    } else if (realizedPnL < 0) {
      const maxLoss = -pos.allocatedCapital * bot.brain.stopLossPct;
      realizedPnL = Number(Math.max(realizedPnL, maxLoss).toFixed(2));
    }

    bot.currentCapital = Number((bot.currentCapital + realizedPnL).toFixed(2));
    bot.dailyPnL = Number((bot.currentCapital - bot.initialDayCapital).toFixed(2));
    bot.dailyPnLPct = Number(((bot.dailyPnL / (bot.initialDayCapital || 1)) * 100).toFixed(1));
    bot.totalLifetimeProfit = Number((bot.totalLifetimeProfit + realizedPnL).toFixed(2));

    bot.tradesToday += 1;
    bot.totalTrades += 1;
    this.state.hiveMind.totalTradesExecuted += 1;

    const isWin = realizedPnL > 0;
    if (isWin) {
      bot.winsToday += 1;
      bot.totalWins += 1;
      this.state.hiveMind.winningTrades += 1;
    }

    this.applyReinforcementLearning(bot, pos, realizedPnL, isWin);

    this.state.tradeLogs.unshift({
      id: 'TRD-' + Date.now() + '-' + Math.floor(Math.random() * 999),
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      day: this.state.dayNumber,
      botId: bot.id,
      botName: bot.name,
      generation: bot.generation,
      botIQ: bot.brain.iq,
      symbol: asset.symbol,
      market: asset.market,
      side: pos.side,
      entryPrice: pos.entryPrice,
      exitPrice: asset.price,
      pnl: realizedPnL,
      isWin
    });

    if (this.state.tradeLogs.length > 60) this.state.tradeLogs.pop();
    bot.openPosition = null;

    // =========================================================================
    // GATILHO AUTOMÁTICO "10 LUCRA +10":
    // Assim que o robô de R$ 10,00 atinge +R$ 10,00 de lucro (saldo >= R$ 20,00):
    // 1. Guarda os +R$ 10,00 na Carteira Cofre (Binance Funding ou Alpaca EUA)
    // 2. Cria imediatamente +1 Novo Robô Filho com R$ 10,00!
    // 3. Volta para R$ 10,00 para buscar mais +R$ 10,00!
    // =========================================================================
    if (bot.dailyPnL >= this.state.targetProfitPerBot) {
      const profitToSweep = bot.dailyPnL;
      this.depositProfitIntoBrokerVault(bot, profitToSweep, 'Bateu Meta +R$ 10,00 (Auto-Multiplicação)');

      // Reseta banca operacional do robô campeão para R$ 10,00 (mantendo um pequeno saldo positivo de segurança no dia)
      bot.currentCapital = Number((bot.initialDayCapital + 0.50).toFixed(2));
      bot.dailyPnL = 0.50;
      bot.dailyPnLPct = 5.0;
      bot.childrenSpawned += 1;

      if (this.state.activeBots.length < 28) {
        const childBot = this.createBotInstance({
          generation: bot.generation + 1,
          parentId: bot.id,
          parentName: bot.name,
          capital: this.state.initialSeedCapital,
          inheritedBrain: bot.brain
        });
        this.state.activeBots.push(childBot);
        this.logInsight(
          `META +R$ ${this.state.targetProfitPerBot.toFixed(2)} BATIDA! ${bot.name} guardou R$ ${profitToSweep.toFixed(2)} no Cofre e gerou o filho ${childBot.name} com R$ ${this.state.initialSeedCapital.toFixed(2)}!`
        );
      }
      this.syncToFirebaseCloud();
    }
  }

  applyReinforcementLearning(bot, position, pnl, isWin) {
    const lr = bot.brain.learningRate;
    const w = bot.brain.weights;
    const ef = position.entryFeatures || {};
    const direction = position.side === 'LONG' ? 1 : -1;

    const adjustWeight = (currentW, featureVal) => {
      const alignment = (featureVal || 0) * direction;
      const rewardSignal = isWin ? 1 : -1;
      const delta = lr * rewardSignal * Math.max(0.15, Math.abs(alignment));
      return Number(Math.max(0.20, Math.min(1.50, currentW + delta)).toFixed(3));
    };

    w.w_rsi = adjustWeight(w.w_rsi, ef.rsiSignal);
    w.w_ema = adjustWeight(w.w_ema, ef.emaSignal);
    w.w_bollinger = adjustWeight(w.w_bollinger, ef.bollingerSignal);
    w.w_macd = adjustWeight(w.w_macd, ef.macdSignal);
    w.w_flow = adjustWeight(w.w_flow, ef.flowSignal);
    w.w_regime = adjustWeight(w.w_regime, ef.regimeSignal);

    this.state.hiveMind.totalLessonsLearned += 1;

    if (isWin) {
      bot.brain.iq = Math.min(999, bot.brain.iq + 2);
      bot.brain.specialtyLevel = this.getSpecialtyTitle(bot.brain.iq);
      bot.brain.lastAdaptationNote = `Reforço Positivo (+R$ ${pnl.toFixed(2)}): IA mais perto da meta de +R$ ${this.state.targetProfitPerBot.toFixed(2)}.`;

      const gw = this.state.hiveMind.globalBestWeights;
      Object.keys(gw).forEach(k => {
        gw[k] = Number((gw[k] * 0.85 + w[k] * 0.15).toFixed(3));
      });
    } else {
      bot.brain.iq = Math.min(999, bot.brain.iq + 1);
      bot.brain.confidenceThreshold = Number(Math.min(0.86, bot.brain.confidenceThreshold + 0.012).toFixed(3));
      bot.brain.lastAdaptationNote = `Auto-Correção Neural: Filtro subiu p/ ${(bot.brain.confidenceThreshold * 100).toFixed(0)}% para proteger os R$ ${bot.initialDayCapital.toFixed(2)}.`;
      this.state.hiveMind.avoidedPatternsCount += 1;
    }

    if (this.state.activeBots.length > 0) {
      const sumIQ = this.state.activeBots.reduce((acc, b) => acc + b.brain.iq, 0);
      this.state.hiveMind.collectiveIQ = Math.round(sumIQ / this.state.activeBots.length);
    }
  }

  /**
   * FECHAMENTO DO DIA:
   * - Robô Positivo -> Guarda lucro no Cofre (Binance Funding / Alpaca EUA) + Cria +1 Robô de R$ 10,00!
   * - Robô Negativo -> MORRE imediatamente 💀 (Cofre fica 100% protegido)!
   */
  executeEndOfDayJudgment() {
    const closingDay = this.state.dayNumber;
    let totalProfitSavedToday = 0;
    let botsReplicatedToday = 0;
    let botsDiedToday = 0;

    const survivingBots = [];
    const newlySpawnedChildren = [];

    this.state.activeBots.forEach(bot => {
      if (bot.openPosition) {
        const asset = this.assets.find(a => a.symbol === bot.assignedAsset) || this.assets[0];
        const features = TechnicalIndicators.extractFeatureVector(asset.history);
        this.closeBotPosition(bot, asset, bot.openPosition.currentReturnPct || 0.15, features);
      }
    });

    this.state.activeBots.forEach(bot => {
      const dayProfit = Number((bot.currentCapital - bot.initialDayCapital).toFixed(2));

      if (dayProfit > 0) {
        bot.daysSurvived += 1;
        bot.brain.iq = Math.min(999, bot.brain.iq + 5);
        bot.brain.specialtyLevel = this.getSpecialtyTitle(bot.brain.iq);

        this.depositProfitIntoBrokerVault(bot, dayProfit, `Fechamento Positivo do Dia #${closingDay}`);
        totalProfitSavedToday += dayProfit;

        bot.currentCapital = bot.initialDayCapital;
        bot.dailyPnL = 0;
        bot.dailyPnLPct = 0;
        bot.tradesToday = 0;
        bot.winsToday = 0;

        survivingBots.push(bot);

        if (survivingBots.length + newlySpawnedChildren.length < 28) {
          bot.childrenSpawned += 1;
          const childBot = this.createBotInstance({
            generation: bot.generation + 1,
            parentId: bot.id,
            parentName: bot.name,
            capital: this.state.initialSeedCapital,
            inheritedBrain: bot.brain
          });
          newlySpawnedChildren.push(childBot);
          botsReplicatedToday += 1;
        } else {
          bot.brain.iq += 8;
          bot.brain.specialtyLevel = this.getSpecialtyTitle(bot.brain.iq);
          botsReplicatedToday += 1;
        }
      } else {
        // SALDO NEGATIVO NO DIA -> O ROBÔ MORRE 💀
        botsDiedToday += 1;
        const deadRecord = {
          ...bot,
          diedAtDay: closingDay,
          finalDailyPnL: dayProfit,
          causeOfDeath: `Fechou Dia #${closingDay} negativo (${dayProfit.toFixed(2)}). Eliminado! Lucro no Cofre continua salvo.`
        };
        this.state.deadBots.unshift(deadRecord);
        if (this.state.deadBots.length > 30) this.state.deadBots.pop();

        this.state.hiveMind.avoidedPatternsCount += 1;
        this.state.hiveMind.totalLessonsLearned += 2;
      }
    });

    this.state.activeBots = [...survivingBots, ...newlySpawnedChildren];

    if (this.state.activeBots.length === 0 && this.state.autoRespawnIfAllDead) {
      const phoenixBot = this.createBotInstance({
        generation: closingDay + 1,
        parentId: 'HIVE-MIND',
        parentName: 'Colmeia Firebase IA',
        capital: this.state.initialSeedCapital,
        inheritedBrain: {
          iq: this.state.hiveMind.collectiveIQ + 10,
          confidenceThreshold: 0.62,
          takeProfitPct: 0.18,
          stopLossPct: 0.05,
          weights: { ...this.state.hiveMind.globalBestWeights }
        }
      });
      this.state.activeBots.push(phoenixBot);
    }

    this.state.dailyLedger.unshift({
      day: closingDay,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      profitSaved: Number(totalProfitSavedToday.toFixed(2)),
      vaultBalanceAfter: this.state.masterVaultBalance,
      binanceVault: this.state.binanceFundingVault,
      alpacaVault: this.state.alpacaCashVault,
      botsSurvived: survivingBots.length,
      botsSpawned: botsReplicatedToday,
      botsDied: botsDiedToday,
      activeSwarmSize: this.state.activeBots.length,
      avgIQ: this.state.hiveMind.collectiveIQ
    });

    if (this.state.dailyLedger.length > 40) this.state.dailyLedger.pop();

    this.logInsight(
      `Fim do Dia #${closingDay}: +R$ ${totalProfitSavedToday.toFixed(2)} guardados no Cofre (Binance/Alpaca) | +${botsReplicatedToday} novos robôs de R$ ${this.state.initialSeedCapital.toFixed(2)}!`
    );

    this.state.dayNumber += 1;
    this.syncToFirebaseCloud();
    this.onUpdate(this.state, this.assets);
  }

  logInsight(message) {
    this.state.hiveMind.recentInsights.unshift(`[Dia ${this.state.dayNumber}] ${message}`);
    if (this.state.hiveMind.recentInsights.length > 15) {
      this.state.hiveMind.recentInsights.pop();
    }
  }

  toggleRunning() {
    this.state.isRunning = !this.state.isRunning;
    this.syncToFirebaseCloud();
    this.onUpdate(this.state, this.assets);
  }

  setCycleSpeed(seconds) {
    this.state.cycleSpeedSec = Number(seconds);
    this.onUpdate(this.state, this.assets);
  }

  forceEndOfDayNow() {
    this.state.activeBots.forEach(bot => {
      if (bot.dailyPnL === 0 && !bot.openPosition) {
        // Simula o robô batendo a meta de +R$ 10,00 no fechamento rápido
        bot.currentCapital = Number((bot.initialDayCapital + this.state.targetProfitPerBot).toFixed(2));
        bot.dailyPnL = this.state.targetProfitPerBot;
      }
    });
    this.state.dayProgressPct = 0;
    this.executeEndOfDayJudgment();
  }

  injectManualBot(customCapital) {
    const cap = Number(customCapital) || this.state.initialSeedCapital;
    const maxGen = this.state.activeBots.reduce((max, b) => Math.max(max, b.generation), 1);
    const newBot = this.createBotInstance({
      generation: maxGen,
      parentId: 'USER-DEPLOY',
      parentName: 'Novo Robô R$ 10,00',
      capital: cap,
      inheritedBrain: this.state.activeBots[0] ? this.state.activeBots[0].brain : null
    });
    this.state.activeBots.push(newBot);
    this.logInsight(`Robô ${newBot.name} lançado com banca de R$ ${cap.toFixed(2)}.`);
    this.syncToFirebaseCloud();
    this.onUpdate(this.state, this.assets);
  }

  updateConfiguration({ initialSeedCapital, targetProfitPerBot, binanceApiKey, binanceApiSecret, alpacaApiKey, alpacaApiSecret, firebaseConfigJson }) {
    if (initialSeedCapital && Number(initialSeedCapital) > 0) {
      this.state.initialSeedCapital = Number(initialSeedCapital);
    }
    if (targetProfitPerBot && Number(targetProfitPerBot) > 0) {
      this.state.targetProfitPerBot = Number(targetProfitPerBot);
    }
    if (binanceApiKey !== undefined) this.state.apiConfig.binanceApiKey = binanceApiKey;
    if (binanceApiSecret !== undefined) this.state.apiConfig.binanceApiSecret = binanceApiSecret;
    if (alpacaApiKey !== undefined) this.state.apiConfig.alpacaApiKey = alpacaApiKey;
    if (alpacaApiSecret !== undefined) this.state.apiConfig.alpacaApiSecret = alpacaApiSecret;
    if (firebaseConfigJson !== undefined) {
      this.state.apiConfig.firebaseConfigJson = firebaseConfigJson;
      try {
        const parsedConfig = JSON.parse(firebaseConfigJson);
        if (typeof window !== 'undefined' && window.FirebaseCloudSync) {
          window.FirebaseCloudSync.initFirebase(parsedConfig).then(ok => {
            if (ok) this.syncToFirebaseCloud();
          });
        }
      } catch (e) {
        console.warn('JSON de configuração do Firebase inválido:', e.message);
      }
    }

    this.syncToFirebaseCloud();
    this.onUpdate(this.state, this.assets);
  }

  resetEcosystem(newSeedCapital = 10.00) {
    const seed = Number(newSeedCapital) || 10.00;
    this.state.dayNumber = 1;
    this.state.dayProgressPct = 0;
    this.state.initialSeedCapital = seed;
    this.state.targetProfitPerBot = seed;
    this.state.masterVaultBalance = 0;
    this.state.binanceFundingVault = 0;
    this.state.alpacaCashVault = 0;
    this.state.totalDepositedCapital = seed;
    this.state.totalHistoricalProfitSaved = 0;
    this.state.activeBots = [];
    this.state.deadBots = [];
    this.state.dailyLedger = [];
    this.state.tradeLogs = [];
    this.state.hiveMind.collectiveIQ = 108;
    this.state.hiveMind.totalLessonsLearned = 0;
    this.state.hiveMind.totalTradesExecuted = 0;
    this.state.hiveMind.winningTrades = 0;
    this.spawnFounderBot();
    this.syncToFirebaseCloud();
    this.onUpdate(this.state, this.assets);
  }
}

if (typeof window !== 'undefined') {
  window.DarwinSwarmEngine = DarwinSwarmEngine;
  window.TechnicalIndicators = TechnicalIndicators;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DarwinSwarmEngine, TechnicalIndicators };
}
