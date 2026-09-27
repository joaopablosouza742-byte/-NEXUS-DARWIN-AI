/**
 * Vercel Serverless Function: /api/cron-step (e /api/health)
 * Retorna exclusivamente o estado real do Firebase (SEM NENHUMA SIMULAÇÃO OU STEP FAKE).
 */

const { FirebaseCloudSync, DEFAULT_RTDB_URL } = require('../firebase_cloud_sync.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const sync = new FirebaseCloudSync();
    const remoteState = await sync.connectAndLoadInitialState(DEFAULT_RTDB_URL);

    res.status(200).json({
      status: 'ok',
      platform: 'Vercel Serverless + Binance Real',
      realState: remoteState
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
