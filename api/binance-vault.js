/**
 * Vercel Serverless Function: /api/binance-vault
 * Transfere o lucro (+R$ 10,00) da Carteira Spot (MAIN) para a Carteira Cofre (FUNDING) na Binance.
 */

const { transferProfitToBinanceFundingVault } = require('../server.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    const params = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const result = await transferProfitToBinanceFundingVault({
      apiKey: params.apiKey || process.env.BINANCE_API_KEY,
      apiSecret: params.apiSecret || process.env.BINANCE_API_SECRET,
      asset: params.asset || 'USDT',
      amount: params.amount
    });
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
