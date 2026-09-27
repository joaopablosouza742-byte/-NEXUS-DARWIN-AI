/**
 * Vercel Serverless Function: /api/alpaca-order
 * Executa ordens de Ações Fracionadas na Bolsa Americana (NYSE / NASDAQ via Alpaca Markets).
 */

const { executeAlpacaUSStockOrder } = require('../server.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    const params = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const result = await executeAlpacaUSStockOrder({
      apiKey: params.apiKey || process.env.ALPACA_API_KEY,
      apiSecret: params.apiSecret || process.env.ALPACA_API_SECRET,
      isPaper: params.isPaper !== false,
      symbol: params.symbol,
      side: params.side,
      notionalUsd: params.notionalUsd
    });
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
