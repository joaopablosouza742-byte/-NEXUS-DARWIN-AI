/**
 * NEXUS DARWIN AI - Sincronizador Automático Firebase Realtime Database
 * ---------------------------------------------------------------------
 * Conectado diretamente ao banco do projeto NEXUS-DARWIN-AI:
 * URL: https://nexus-darwin-ai-default-rtdb.firebaseio.com
 *
 * Sincroniza em tempo real:
 * - /nexus_darwin_ecosystem (Carteira Cofre Binance & Alpaca, Robôs Vivos de R$ 10,
 *   Cemitério de Robôs Mortos, Cérebro Coletivo IA e Extrato Diário)
 * - /vault_transfers (Histórico imutável de cada +R$ 10,00 salvo no Cofre)
 */

const DEFAULT_RTDB_URL = 'https://nexus-darwin-ai-default-rtdb.firebaseio.com';

class FirebaseCloudSync {
  constructor() {
    this.databaseURL = DEFAULT_RTDB_URL;
    this.isConnected = false;
    this.lastSyncTime = null;
    this.statusCallback = () => {};
    this.remoteStateCallback = () => {};
    this.isSyncing = false;
  }

  onStatusChange(cb) {
    this.statusCallback = cb;
  }

  onRemoteStateUpdate(cb) {
    this.remoteStateCallback = cb;
  }

  /**
   * Conecta automaticamente ao Realtime Database do usuário e carrega o estado salvo na nuvem
   */
  async connectAndLoadInitialState(customUrl) {
    if (customUrl && customUrl.startsWith('https://')) {
      this.databaseURL = customUrl.replace(/\/$/, '');
    }

    try {
      const response = await fetch(`${this.databaseURL}/nexus_darwin_ecosystem.json`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const remoteData = await response.json();
      this.isConnected = true;
      this.lastSyncTime = new Date().toLocaleTimeString('pt-BR');

      this.statusCallback({
        connected: true,
        projectId: 'nexus-darwin-ai-default-rtdb',
        databaseURL: this.databaseURL,
        message: `☁️ Firebase Conectado (${this.lastSyncTime})`
      });

      if (remoteData && typeof remoteData === 'object' && remoteData.dayNumber) {
        this.remoteStateCallback(remoteData);
        return remoteData;
      }
      return null;
    } catch (err) {
      console.warn('Aviso ao conectar no Realtime Database:', err.message);
      this.isConnected = false;
      this.statusCallback({
        connected: false,
        message: `Erro Firebase RTDB: Verifique as Regras no Console`
      });
      return null;
    }
  }

  /**
   * Salva o estado completo na nuvem (https://nexus-darwin-ai-default-rtdb.firebaseio.com/nexus_darwin_ecosystem.json)
   */
  async syncEcosystemState(state) {
    if (this.isSyncing || typeof fetch === 'undefined') return;
    this.isSyncing = true;

    try {
      const payload = {
        updatedAt: new Date().toISOString(),
        updatedAtBR: new Date().toLocaleString('pt-BR'),
        dayNumber: state.dayNumber,
        dayProgressPct: Math.round(state.dayProgressPct || 0),
        initialSeedCapital: state.initialSeedCapital,
        targetProfitPerBot: state.targetProfitPerBot,
        masterVaultBalance: state.masterVaultBalance,
        binanceFundingVault: state.binanceFundingVault,
        alpacaCashVault: state.alpacaCashVault,
        totalHistoricalProfitSaved: state.totalHistoricalProfitSaved,
        hiveMind: state.hiveMind,
        activeBots: state.activeBots,
        deadBots: (state.deadBots || []).slice(0, 25),
        dailyLedger: (state.dailyLedger || []).slice(0, 30),
        tradeLogs: (state.tradeLogs || []).slice(0, 30)
      };

      const res = await fetch(`${this.databaseURL}/nexus_darwin_ecosystem.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        this.isConnected = true;
        this.lastSyncTime = new Date().toLocaleTimeString('pt-BR');
        this.statusCallback({
          connected: true,
          projectId: 'nexus-darwin-ai-default-rtdb',
          databaseURL: this.databaseURL,
          message: `☁️ Firebase Sincronizado (${this.lastSyncTime})`
        });
      }
    } catch (err) {
      console.warn('Falha ao gravar no Firebase RTDB:', err.message);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Registra cada depósito de +R$ 10,00 na árvore /vault_transfers do Realtime Database
   */
  async recordVaultTransfer(transferData) {
    if (typeof fetch === 'undefined') return;
    try {
      await fetch(`${this.databaseURL}/vault_transfers.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...transferData,
          timestampISO: new Date().toISOString(),
          timestampBR: new Date().toLocaleString('pt-BR')
        })
      });
    } catch (err) {
      console.warn('Erro ao gravar vault_transfer no Firebase RTDB:', err.message);
    }
  }
}

if (typeof window !== 'undefined') {
  window.FirebaseCloudSync = new FirebaseCloudSync();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FirebaseCloudSync, DEFAULT_RTDB_URL };
}
