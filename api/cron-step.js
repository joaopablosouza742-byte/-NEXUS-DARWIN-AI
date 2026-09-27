/**
 * Vercel Serverless Function: /api/cron-step (e /api/health)
 * Executa um passo autônomo da IA e sincroniza com o Firebase Realtime Database:
 * https://nexus-darwin-ai-default-rtdb.firebaseio.com
 */

const { DarwinSwarmEngine } = require('../ai_swarm_engine.js');
const { FirebaseCloudSync, DEFAULT_RTDB_URL } = require('../firebase_cloud_sync.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const sync = new FirebaseCloudSync();
    const remoteState = await sync.connectAndLoadInitialState(DEFAULT_RTDB_URL);

    const engine = new DarwinSwarmEngine();
    clearInterval(engine.tickInterval);
    clearInterval(engine.binanceSyncInterval);

    if (remoteState && remoteState.dayNumber) {
      engine.state = {
        ...engine.state,
        ...remoteState,
        hiveMind: { ...engine.state.hiveMind, ...(remoteState.hiveMind || {}) },
        activeBots: Array.isArray(remoteState.activeBots) && remoteState.activeBots.length > 0
          ? remoteState.activeBots
          : engine.state.activeBots,
        deadBots: Array.isArray(remoteState.deadBots) ? remoteState.deadBots : [],
        dailyLedger: Array.isArray(remoteState.dailyLedger) ? remoteState.dailyLedger : [],
        tradeLogs: Array.isArray(remoteState.tradeLogs) ? remoteState.tradeLogs : []
      };
    }

    await engine.syncLiveBinancePrices();
    engine.stepSimulation();
    await sync.syncEcosystemState(engine.state);

    res.status(200).json({
      status: 'ok',
      platform: 'Vercel Serverless + Firebase Realtime DB',
      dayNumber: engine.state.dayNumber,
      activeBots: engine.state.activeBots.length,
      masterVaultBalance: engine.state.masterVaultBalance,
      binanceFundingVault: engine.state.binanceFundingVault,
      alpacaCashVault: engine.state.alpacaCashVault,
      collectiveIQ: engine.state.hiveMind.collectiveIQ
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
