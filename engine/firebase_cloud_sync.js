/**
 * NEXUS DARWIN AI - Sincronizador Cloud Firestore (Firebase Modular SDK v10)
 * --------------------------------------------------------------------------
 * Substitui o armazenamento local pelo banco de dados em nuvem Cloud Firestore.
 * Nota de Arquitetura: Utilizamos `onSnapshot` (real-time listener) especificamente
 * porque o painel de trading exige atualização ao vivo segundo a segundo entre o
 * motor 24/7 na nuvem e qualquer dispositivo (celular/PC) conectado.
 */

class FirebaseCloudSync {
  constructor() {
    this.isConnected = false;
    this.app = null;
    this.db = null;
    this.auth = null;
    this.uid = null;
    this.unsubscribeSnapshot = null;
    this.statusCallback = () => {};
    this.remoteStateCallback = () => {};
  }

  onStatusChange(cb) {
    this.statusCallback = cb;
  }

  onRemoteStateUpdate(cb) {
    this.remoteStateCallback = cb;
  }

  /**
   * Inicializa o Firebase dinamicamente usando o firebaseConfig fornecido pelo usuário
   * no painel ou nas variáveis de configuração do projeto.
   */
  async initFirebase(firebaseConfig) {
    if (!firebaseConfig || !firebaseConfig.apiKey || !firebaseConfig.projectId) {
      this.isConnected = false;
      this.statusCallback({
        connected: false,
        message: 'Aguardando credenciais do projeto Firebase (Clique em "🔥 Conectar Firebase & APIs")'
      });
      return false;
    }

    try {
      const { initializeApp, getApps, getApp } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js');
      const { getAuth, signInAnonymously, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js');
      const { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');

      this.sdk = { doc, setDoc, onSnapshot, collection, addDoc, serverTimestamp };
      this.app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      this.auth = getAuth(this.app);
      this.db = getFirestore(this.app);

      // Autentica anonimamente para respeitar as regras de segurança (request.auth.uid == userId)
      const cred = await signInAnonymously(this.auth);
      this.uid = cred.user.uid;
      this.isConnected = true;

      this.statusCallback({
        connected: true,
        projectId: firebaseConfig.projectId,
        uid: this.uid,
        message: `Conectado ao Firebase Firestore (${firebaseConfig.projectId})`
      });

      this.startRealtimeListener();
      return true;
    } catch (err) {
      console.error('Erro ao conectar no Firebase Firestore:', err);
      this.isConnected = false;
      this.statusCallback({
        connected: false,
        message: `Erro Firebase: ${err.message || 'Verifique seu firebaseConfig e ative Auth Anônimo + Firestore'}`
      });
      return false;
    }
  }

  startRealtimeListener() {
    if (!this.isConnected || !this.db || !this.uid) return;
    const { doc, onSnapshot } = this.sdk;
    const ecoRef = doc(this.db, 'ecosystems', this.uid);

    if (this.unsubscribeSnapshot) this.unsubscribeSnapshot();

    this.unsubscribeSnapshot = onSnapshot(ecoRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        this.remoteStateCallback(data);
      }
    });
  }

  /**
   * Salva o estado completo do enxame de robôs e das carteiras cofre (Binance + Alpaca) no Firestore
   */
  async syncEcosystemState(state) {
    if (!this.isConnected || !this.db || !this.uid) return;
    try {
      const { doc, setDoc, serverTimestamp } = this.sdk;
      const ecoRef = doc(this.db, 'ecosystems', this.uid);

      await setDoc(ecoRef, {
        dayNumber: state.dayNumber,
        initialSeedCapital: state.initialSeedCapital,
        targetProfitPerBot: state.targetProfitPerBot,
        masterVaultBalance: state.masterVaultBalance,
        binanceFundingVault: state.binanceFundingVault,
        alpacaCashVault: state.alpacaCashVault,
        hiveMind: state.hiveMind,
        activeBots: state.activeBots,
        deadBots: state.deadBots.slice(0, 20),
        dailyLedger: state.dailyLedger.slice(0, 30),
        tradeLogs: state.tradeLogs.slice(0, 30),
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.warn('Falha ao sincronizar documento com Firestore:', err.message);
    }
  }

  /**
   * Registra uma transferência imutável de lucro para a Carteira Cofre (Binance Funding / Alpaca Vault)
   */
  async recordVaultTransfer(transferData) {
    if (!this.isConnected || !this.db || !this.uid) return;
    try {
      const { collection, addDoc, serverTimestamp } = this.sdk;
      const colRef = collection(this.db, 'ecosystems', this.uid, 'vault_transfers');
      await addDoc(colRef, {
        ...transferData,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.warn('Erro ao gravar vault_transfer no Firestore:', err.message);
    }
  }
}

window.FirebaseCloudSync = new FirebaseCloudSync();
