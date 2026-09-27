/**
 * Controlador de Interface do NEXUS DARWIN CLOUD (Firebase Realtime DB + Binance + Bolsa EUA)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const formatCurrency = (val) => {
    const num = Number(val) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Fallback obrigatório para <dialog closedby="any"> conforme diretriz modern-web-guidance
  const dialogs = document.querySelectorAll('dialog');
  dialogs.forEach((dialog) => {
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );
        if (isDialogContent) return;
        dialog.close();
      });
    }
  });

  let selectedBotIdForModal = null;

  const engine = new window.DarwinSwarmEngine((state, assets) => {
    renderDashboard(state, assets);
  });

  // Escuta e conecta automaticamente ao Firebase Realtime Database:
  // https://nexus-darwin-ai-default-rtdb.firebaseio.com
  if (window.FirebaseCloudSync) {
    window.FirebaseCloudSync.onStatusChange((status) => {
      const fbBadge = document.getElementById('firebaseStatusBadge');
      if (!fbBadge) return;
      if (status.connected) {
        fbBadge.textContent = status.message || '☁️ Firebase Conectado';
        fbBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        fbBadge.style.color = 'var(--accent-emerald)';
        fbBadge.style.borderColor = 'var(--border-glow-green)';
      } else {
        fbBadge.textContent = `☁️ ${status.message}`;
      }
    });

    const remoteData = await window.FirebaseCloudSync.connectAndLoadInitialState();
    if (remoteData && remoteData.dayNumber) {
      engine.state = {
        ...engine.state,
        ...remoteData,
        hiveMind: { ...engine.state.hiveMind, ...(remoteData.hiveMind || {}) },
        activeBots: Array.isArray(remoteData.activeBots) && remoteData.activeBots.length > 0
          ? remoteData.activeBots
          : engine.state.activeBots,
        deadBots: Array.isArray(remoteData.deadBots) ? remoteData.deadBots : [],
        dailyLedger: Array.isArray(remoteData.dailyLedger) ? remoteData.dailyLedger : [],
        tradeLogs: Array.isArray(remoteData.tradeLogs) ? remoteData.tradeLogs : []
      };

      // Se o Operador Real estiver rodando no PC, desliga a simulação do navegador
      if (engine.state.apiConfig && engine.state.apiConfig.mode === 'REAL_LIVE') {
        if (engine.tickInterval) clearInterval(engine.tickInterval);
        const engineBadge = document.getElementById('engineStatusBadge');
        if (engineBadge) {
          engineBadge.textContent = '● BINANCE REAL AO VIVO (SPOT R$ 10)';
          engineBadge.style.background = 'rgba(16, 185, 129, 0.2)';
          engineBadge.style.color = 'var(--accent-emerald)';
          engineBadge.style.borderColor = 'var(--border-glow-green)';
        }
      }
      renderDashboard(engine.state, engine.assets);
    }
  }

  // Se estiver em modo REAL_LIVE, o navegador apenas ESCUTA o Firebase (não sobrescreve)
  setInterval(async () => {
    if (!window.FirebaseCloudSync) return;
    if (engine.state.apiConfig && engine.state.apiConfig.mode === 'REAL_LIVE') {
      const freshState = await window.FirebaseCloudSync.connectAndLoadInitialState();
      if (freshState && freshState.dayNumber) {
        engine.state = freshState;
        renderDashboard(engine.state, engine.assets);
      }
    } else if (engine.state.isRunning) {
      window.FirebaseCloudSync.syncEcosystemState(engine.state);
    }
  }, 2500);

  renderDashboard(engine.state, engine.assets);

  // ===========================================================================
  // EVENTOS DE CONTROLE
  // ===========================================================================
  const speedSelector = document.getElementById('speedSelector');
  speedSelector.value = String(engine.state.cycleSpeedSec || 45);
  speedSelector.addEventListener('change', (e) => {
    engine.setCycleSpeed(Number(e.target.value));
  });

  document.getElementById('btnForceEndOfDay').addEventListener('click', () => {
    engine.forceEndOfDayNow();
  });

  document.getElementById('btnInjectBot').addEventListener('click', () => {
    engine.injectManualBot(engine.state.initialSeedCapital);
  });

  document.getElementById('btnToggleEngine').addEventListener('click', () => {
    engine.toggleRunning();
  });

  const configDialog = document.getElementById('configDialog');
  document.getElementById('btnOpenConfig').addEventListener('click', () => {
    document.getElementById('inputSeedCapital').value = engine.state.initialSeedCapital;
    document.getElementById('inputTargetProfit').value = engine.state.targetProfitPerBot;
    document.getElementById('inputFirebaseConfig').value =
      window.FirebaseCloudSync ? window.FirebaseCloudSync.databaseURL : 'https://nexus-darwin-ai-default-rtdb.firebaseio.com';
    document.getElementById('inputBinanceKey').value = engine.state.apiConfig.binanceApiKey || '';
    document.getElementById('inputBinanceSecret').value = engine.state.apiConfig.binanceApiSecret || '';
    document.getElementById('inputAlpacaKey').value = engine.state.apiConfig.alpacaApiKey || '';
    document.getElementById('inputAlpacaSecret').value = engine.state.apiConfig.alpacaApiSecret || '';
    configDialog.showModal();
  });

  document.getElementById('btnCloseConfigDialog').addEventListener('click', () => {
    configDialog.close();
  });

  document.getElementById('configForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const customUrl = document.getElementById('inputFirebaseConfig').value.trim();
    if (customUrl.startsWith('https://') && window.FirebaseCloudSync) {
      await window.FirebaseCloudSync.connectAndLoadInitialState(customUrl);
    }
    engine.updateConfiguration({
      initialSeedCapital: Number(document.getElementById('inputSeedCapital').value),
      targetProfitPerBot: Number(document.getElementById('inputTargetProfit').value),
      binanceApiKey: document.getElementById('inputBinanceKey').value.trim(),
      binanceApiSecret: document.getElementById('inputBinanceSecret').value.trim(),
      alpacaApiKey: document.getElementById('inputAlpacaKey').value.trim(),
      alpacaApiSecret: document.getElementById('inputAlpacaSecret').value.trim()
    });
    configDialog.close();
  });

  document.getElementById('btnResetEcosystem').addEventListener('click', () => {
    const newSeed = Number(document.getElementById('inputSeedCapital').value) || 10.00;
    engine.resetEcosystem(newSeed);
    configDialog.close();
  });

  const botBrainDialog = document.getElementById('botBrainDialog');
  document.getElementById('btnCloseBrainDialog').addEventListener('click', () => {
    selectedBotIdForModal = null;
    botBrainDialog.close();
  });

  // ===========================================================================
  // RENDERIZAÇÃO EM TEMPO REAL
  // ===========================================================================
  function renderDashboard(state, assets) {
    const statusBadge = document.getElementById('engineStatusBadge');
    const btnToggle = document.getElementById('btnToggleEngine');
    if (state.isRunning) {
      statusBadge.textContent = '● OPERANDO AUTÔNOMO';
      statusBadge.style.color = 'var(--accent-emerald)';
      btnToggle.textContent = '⏸️ Pausar';
    } else {
      statusBadge.textContent = '⏸ PAUSADO';
      statusBadge.style.color = 'var(--accent-amber)';
      btnToggle.textContent = '▶️ Retomar';
    }

    document.getElementById('currentDayLabel').textContent = `DIA #${state.dayNumber}`;
    const pct = Math.min(100, Math.round(state.dayProgressPct));
    document.getElementById('dayProgressText').textContent = `${pct}%`;
    document.getElementById('dayProgressFill').style.width = `${pct}%`;

    const tickerStrip = document.getElementById('marketTickerStrip');
    tickerStrip.innerHTML = assets.map(asset => {
      const isCripto = asset.market === 'BINANCE_CRIPTO';
      const rsi = window.TechnicalIndicators.calcRSI(asset.history, 14).toFixed(0);
      return `
        <div class="ticker-pill">
          <span class="ticker-tag ${isCripto ? 'tag-cripto' : 'tag-bolsa'}">${isCripto ? 'BINANCE' : 'NYSE/NASDAQ'}</span>
          <strong>${asset.symbol}</strong>
          <span>US$ ${Number(asset.price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span style="color: var(--text-muted); font-size: 0.7rem;">RSI ${rsi}</span>
        </div>
      `;
    }).join('');

    document.getElementById('kpiVaultBalance').textContent = formatCurrency(state.masterVaultBalance);
    document.getElementById('kpiBinanceVault').textContent = formatCurrency(state.binanceFundingVault);
    document.getElementById('kpiAlpacaVault').textContent = formatCurrency(state.alpacaCashVault);

    const totalActiveCapital = state.activeBots.reduce((sum, b) => sum + b.currentCapital, 0);
    const totalDailyPnL = state.activeBots.reduce((sum, b) => sum + b.dailyPnL, 0);
    document.getElementById('kpiActiveCapital').textContent = formatCurrency(totalActiveCapital);
    document.getElementById('kpiBaseSeed').textContent = formatCurrency(state.initialSeedCapital);
    document.getElementById('kpiTargetProfit').textContent = `+${formatCurrency(state.targetProfitPerBot)}`;

    const kpiDailyPnLEl = document.getElementById('kpiActiveDailyPnL');
    kpiDailyPnLEl.textContent = `${totalDailyPnL >= 0 ? '+' : ''}${formatCurrency(totalDailyPnL)} hoje`;
    kpiDailyPnLEl.className = totalDailyPnL >= 0 ? 'text-emerald' : 'text-red';

    const maxGen = state.activeBots.reduce((max, b) => Math.max(max, b.generation), 1);
    document.getElementById('kpiMaxGeneration').textContent = `Geração Máx: Gen #${maxGen}`;
    document.getElementById('kpiActiveBotsCount').textContent =
      `${state.activeBots.length} ${state.activeBots.length === 1 ? 'Robô Vivo' : 'Robôs Vivos'}`;
    document.getElementById('kpiDeadBotsCount').textContent =
      `${state.deadBots.length} eliminados (Risco máx ${formatCurrency(state.initialSeedCapital)}/robô)`;

    const winRate = state.hiveMind.totalTradesExecuted > 0
      ? ((state.hiveMind.winningTrades / state.hiveMind.totalTradesExecuted) * 100).toFixed(1)
      : '86.0';
    document.getElementById('kpiWinRate').textContent = `Win Rate: ${winRate}%`;
    document.getElementById('kpiCollectiveIQ').textContent = `QI ${state.hiveMind.collectiveIQ}`;
    document.getElementById('kpiLessonsCount').textContent =
      `${state.hiveMind.totalLessonsLearned} ajustes neurais • Sincronizado no Firebase`;

    const activeBotsGrid = document.getElementById('activeBotsGrid');
    activeBotsGrid.innerHTML = state.activeBots.map(bot => {
      const isPositive = bot.dailyPnL >= 0;
      const isBinance = bot.marketType === 'BINANCE_CRIPTO';
      const progressToClonePct = Math.max(0, Math.min(100, Math.round((bot.dailyPnL / (state.targetProfitPerBot || 10)) * 100)));

      const weightEntries = [
        { label: 'RSI', val: bot.brain.weights.w_rsi },
        { label: 'EMA', val: bot.brain.weights.w_ema },
        { label: 'BOLL', val: bot.brain.weights.w_bollinger },
        { label: 'MACD', val: bot.brain.weights.w_macd },
        { label: 'FLOW', val: bot.brain.weights.w_flow },
        { label: 'ADX', val: bot.brain.weights.w_regime }
      ];

      const vaultDest = isBinance ? '🟡 Cofre Binance Funding' : '🔵 Cofre Bolsa EUA (Alpaca)';

      return `
        <div class="bot-card ${bot.dailyPnL > 0 ? 'positive-day' : (bot.dailyPnL < 0 ? 'negative-day' : '')}" data-bot-id="${bot.id}">
          <div class="bot-top-row">
            <div>
              <div class="bot-name">
                🤖 ${bot.name}
                <span class="gen-badge">Gen #${bot.generation}</span>
              </div>
              <div style="font-size: 0.71rem; color: var(--text-secondary); margin-top: 0.15rem;">
                ${bot.brain.specialtyLevel} • Destino Lucro: <strong>${vaultDest}</strong>
              </div>
            </div>
            <span class="iq-badge">QI ${bot.brain.iq}</span>
          </div>

          <div class="bot-meta-row">
            <span>Ativo: <strong>${bot.assignedAsset}</strong></span>
            <span>Clones Gerados: <strong>+${bot.childrenSpawned} robôs</strong></span>
          </div>

          <div class="bot-pnl-box">
            <div>
              <div style="font-size: 0.69rem; color: var(--text-secondary);">Banca Atual (Base ${formatCurrency(bot.initialDayCapital)})</div>
              <div style="font-size: 1.05rem; font-weight: 800;">${formatCurrency(bot.currentCapital)}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.69rem; color: var(--text-secondary);">Lucro p/ Clonar (+${formatCurrency(state.targetProfitPerBot)})</div>
              <div style="font-size: 1rem; font-weight: 800;" class="${isPositive ? 'text-emerald' : 'text-red'}">
                ${bot.dailyPnL >= 0 ? '+' : ''}${formatCurrency(bot.dailyPnL)}
              </div>
            </div>
          </div>

          <div style="margin-bottom: 0.6rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.69rem; color: var(--text-secondary); margin-bottom: 0.2rem;">
              <span>Progresso p/ Multiplicar (+1 Robô de ${formatCurrency(state.initialSeedCapital)})</span>
              <strong class="text-emerald">${progressToClonePct}%</strong>
            </div>
            <div class="day-progress-bar" style="height: 6px;">
              <div class="day-progress-fill" style="width: ${progressToClonePct}%;"></div>
            </div>
          </div>

          <div class="neural-mini-bars" title="Pesos Sinápticos Aprendidos por este Robô">
            ${weightEntries.map(w => {
              const heightPct = Math.min(100, Math.max(15, Math.round((w.val / 1.5) * 100)));
              return `
                <div class="neural-bar-col">
                  <div class="neural-bar-track">
                    <div class="neural-bar-fill" style="height: ${heightPct}%;"></div>
                  </div>
                  <span class="neural-bar-label">${w.label}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    activeBotsGrid.querySelectorAll('.bot-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedBotIdForModal = card.getAttribute('data-bot-id');
        renderBotBrainModal(state);
        botBrainDialog.showModal();
      });
    });

    if (selectedBotIdForModal && botBrainDialog.open) {
      renderBotBrainModal(state);
    }

    const ledgerBody = document.getElementById('dailyLedgerBody');
    if (state.dailyLedger.length > 0) {
      ledgerBody.innerHTML = state.dailyLedger.map(row => `
        <tr>
          <td><strong>Dia #${row.day}</strong></td>
          <td style="color: var(--text-secondary);">${row.timestamp}</td>
          <td class="text-emerald" style="font-weight: 700;">+${formatCurrency(row.profitSaved)}</td>
          <td class="text-amber" style="font-weight: 700;">${formatCurrency(row.binanceVault || 0)}</td>
          <td class="text-cyan" style="font-weight: 700;">${formatCurrency(row.alpacaVault || 0)}</td>
          <td style="font-weight: 800;">${formatCurrency(row.vaultBalanceAfter)}</td>
          <td class="text-emerald" style="font-weight: 700;">+${row.botsSpawned} robôs</td>
          <td class="${row.botsDied > 0 ? 'text-red' : 'text-secondary'}">${row.botsDied} mortos</td>
        </tr>
      `).join('');
    }

    const gw = state.hiveMind.globalBestWeights;
    const hiveWeightsList = [
      { name: 'EMA Cross 9/21 (Tendência)', val: gw.w_ema },
      { name: 'Filtro Macro ADX (Regime)', val: gw.w_regime },
      { name: 'MACD Momentum', val: gw.w_macd },
      { name: 'RSI 14 (Sobrevenda/Compra)', val: gw.w_rsi },
      { name: 'Bandas de Bollinger (Volatilidade)', val: gw.w_bollinger },
      { name: 'Order Flow (Pressão de Volume)', val: gw.w_flow }
    ];

    document.getElementById('hiveRankBadge').textContent =
      engine.getSpecialtyTitle(state.hiveMind.collectiveIQ);

    document.getElementById('hiveWeightsContainer').innerHTML = hiveWeightsList.map(item => {
      const pctBar = Math.min(100, Math.round((item.val / 1.5) * 100));
      return `
        <div>
          <div style="display: flex; justify-content: space-between; font-size: 0.74rem; margin-bottom: 0.2rem;">
            <span>${item.name}</span>
            <strong class="text-cyan">Peso: ${item.val}</strong>
          </div>
          <div class="day-progress-bar" style="height: 6px;">
            <div class="day-progress-fill" style="width: ${pctBar}%;"></div>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('hiveInsightsList').innerHTML = state.hiveMind.recentInsights.slice(0, 4).map(msg => `
      <div style="padding: 0.35rem 0.55rem; background: rgba(255,255,255,0.03); border-radius: 4px; border-left: 2px solid var(--accent-purple);">
        ${msg}
      </div>
    `).join('');

    const tradesFeed = document.getElementById('liveTradesFeed');
    if (state.tradeLogs.length === 0) {
      tradesFeed.innerHTML = `<div style="color: var(--text-muted); font-size: 0.78rem; text-align: center; padding: 1rem;">Buscando entradas na Binance e NYSE/NASDAQ...</div>`;
    } else {
      tradesFeed.innerHTML = state.tradeLogs.slice(0, 14).map(t => `
        <div class="feed-item">
          <div>
            <div style="font-weight: 700;">
              <span style="color: ${t.side === 'LONG' ? 'var(--accent-emerald)' : 'var(--accent-cyan)'};">${t.side}</span>
              ${t.symbol} • <span style="color: var(--text-secondary);">${t.botName}</span>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">
              Dia #${t.day} (${t.timestamp}) • QI ${t.botIQ}
            </div>
          </div>
          <div style="text-align: right; font-weight: 700;" class="${t.isWin ? 'text-emerald' : 'text-red'}">
            ${t.pnl >= 0 ? '+' : ''}${formatCurrency(t.pnl)}
          </div>
        </div>
      `).join('');
    }

    const deadFeed = document.getElementById('deadBotsFeed');
    if (state.deadBots.length === 0) {
      deadFeed.innerHTML = `<div style="color: var(--text-muted); font-size: 0.78rem; text-align: center; padding: 1rem;">Nenhum robô morreu. Todos buscando +R$ 10,00!</div>`;
    } else {
      deadFeed.innerHTML = state.deadBots.slice(0, 10).map(d => `
        <div class="feed-item" style="border-left: 3px solid var(--accent-red);">
          <div>
            <div style="font-weight: 700; color: var(--accent-red);">💀 ${d.name} (Gen #${d.generation})</div>
            <div style="font-size: 0.7rem; color: var(--text-secondary);">${d.causeOfDeath}</div>
          </div>
        </div>
      `).join('');
    }
  }

  function renderBotBrainModal(state) {
    const bot = state.activeBots.find(b => b.id === selectedBotIdForModal);
    const container = document.getElementById('botBrainDialogContent');
    if (!bot) {
      container.innerHTML = `<p>Este robô encerrou seu ciclo.</p>`;
      return;
    }

    const winRateBot = bot.totalTrades > 0
      ? ((bot.totalWins / bot.totalTrades) * 100).toFixed(1)
      : '100.0';

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div>
          <h3 style="font-size: 1.15rem;">🤖 ${bot.name} <span class="gen-badge">Geração #${bot.generation}</span></h3>
          <p style="font-size: 0.8rem; color: var(--text-secondary);">
            Classificação IA: <strong>${bot.brain.specialtyLevel}</strong> • Linhagem: ${bot.parentName}
          </p>
        </div>
        <span class="iq-badge" style="font-size: 0.9rem; padding: 0.3rem 0.75rem;">QI ${bot.brain.iq}</span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1rem;">
        <div style="background: rgba(255,255,255,0.03); padding: 0.75rem; border-radius: 8px;">
          <div style="font-size: 0.72rem; color: var(--text-secondary);">Banca Operacional</div>
          <div style="font-size: 1.1rem; font-weight: 800;">${formatCurrency(bot.currentCapital)}</div>
        </div>
        <div style="background: rgba(255,255,255,0.03); padding: 0.75rem; border-radius: 8px;">
          <div style="font-size: 0.72rem; color: var(--text-secondary);">Lucro Rumo a +R$ 10</div>
          <div style="font-size: 1.1rem; font-weight: 800;" class="${bot.dailyPnL >= 0 ? 'text-emerald' : 'text-red'}">
            ${bot.dailyPnL >= 0 ? '+' : ''}${formatCurrency(bot.dailyPnL)}
          </div>
        </div>
        <div style="background: rgba(255,255,255,0.03); padding: 0.75rem; border-radius: 8px;">
          <div style="font-size: 0.72rem; color: var(--text-secondary);">Taxa de Acerto IA</div>
          <div style="font-size: 1.1rem; font-weight: 800;" class="text-cyan">${winRateBot}% (${bot.totalWins}/${bot.totalTrades})</div>
        </div>
      </div>

      <div style="background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.35); padding: 0.85rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.8rem;">
        <strong>🧠 Última Adaptação de Aprendizado por Reforço:</strong><br/>
        <span style="color: var(--text-secondary);">${bot.brain.lastAdaptationNote}</span>
      </div>
    `;
  }
});
