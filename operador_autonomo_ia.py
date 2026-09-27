"""
NEXUS DARWIN AI - Motor Python & Servidor Local do Operador Autônomo
--------------------------------------------------------------------
Este módulo pode:
1. Executar um teste de validação matemática do Ciclo Evolutivo Diário
   (--test-evolution): comprova a coleta de lucro para a Carteira Cofre,
   a auto-replicação de robôs positivos com herança de QI/Rede Neural, e
   a eliminação (morte) de robôs negativos sem afetar o cofre.
2. Iniciar o servidor local do Painel Web em http://localhost:8080
   e abrir automaticamente no navegador.
"""

import sys
import os
import random
import webbrowser
from http.server import SimpleHTTPRequestHandler, HTTPServer
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class NeuralBrain:
    iq: int = 105
    confidence_threshold: float = 0.58
    weights: Dict[str, float] = field(default_factory=lambda: {
        "rsi": 0.72,
        "ema": 0.85,
        "bollinger": 0.68,
        "macd": 0.79,
        "flow": 0.64,
        "regime": 0.81,
    })

    def learn_from_trade(self, is_win: bool, learning_rate: float = 0.05) -> None:
        for k in self.weights:
            delta = learning_rate if is_win else -learning_rate * 0.5
            self.weights[k] = round(max(0.2, min(1.5, self.weights[k] + delta)), 3)
        if is_win:
            self.iq += 3
        else:
            self.iq += 1
            self.confidence_threshold = round(min(0.85, self.confidence_threshold + 0.015), 3)

    def clone_with_evolution(self) -> "NeuralBrain":
        mutated_weights = {
            k: round(max(0.2, min(1.5, v + random.uniform(-0.02, 0.04))), 3)
            for k, v in self.weights.items()
        }
        return NeuralBrain(
            iq=self.iq + random.randint(5, 10),
            confidence_threshold=round(min(0.85, self.confidence_threshold + 0.01), 3),
            weights=mutated_weights,
        )


@dataclass
class TradingBot:
    bot_id: str
    generation: int
    initial_capital: float
    current_capital: float
    brain: NeuralBrain
    asset: str = "BTC/USDT"
    parent_id: Optional[str] = None

    @property
    def daily_pnl(self) -> float:
        return round(self.current_capital - self.initial_capital, 2)


class DarwinEcosystemSimulator:
    def __init__(self, initial_seed: float = 1000.0):
        self.initial_seed = initial_seed
        self.master_vault: float = 0.0
        self.active_bots: List[TradingBot] = [
            TradingBot(
                bot_id="Alpha-G1-01",
                generation=1,
                initial_capital=initial_seed,
                current_capital=initial_seed,
                brain=NeuralBrain(),
            )
        ]
        self.dead_bots: List[TradingBot] = []

    def simulate_day(self, day_num: int, force_outcomes: Optional[List[float]] = None) -> dict:
        surviving: List[TradingBot] = []
        spawned: List[TradingBot] = []
        died: List[TradingBot] = []
        profit_saved_today = 0.0

        for idx, bot in enumerate(self.active_bots):
            if force_outcomes and idx < len(force_outcomes):
                pnl = force_outcomes[idx]
                bot.current_capital = round(bot.initial_capital + pnl, 2)
                bot.brain.learn_from_trade(is_win=(pnl > 0))
            else:
                # Quanto maior o QI do robô, maior a expectativa matemática positiva
                edge = (bot.brain.iq - 95) * 0.0015
                daily_return_pct = random.uniform(-0.015, 0.045) + edge
                pnl = round(bot.initial_capital * daily_return_pct, 2)
                bot.current_capital = round(bot.initial_capital + pnl, 2)
                bot.brain.learn_from_trade(is_win=(pnl > 0))

            if bot.daily_pnl > 0:
                # 1. Salva o lucro na Carteira Cofre Blindada
                profit = bot.daily_pnl
                self.master_vault = round(self.master_vault + profit, 2)
                profit_saved_today = round(profit_saved_today + profit, 2)

                # 2. Reseta o saldo do robô para operar o próximo dia
                bot.current_capital = bot.initial_capital
                surviving.append(bot)

                # 3. Auto-Replicação: cria +1 novo robô filho mais inteligente!
                child = TradingBot(
                    bot_id=f"Clone-G{bot.generation + 1}-{len(surviving) + len(spawned):02d}",
                    generation=bot.generation + 1,
                    initial_capital=bot.initial_capital,
                    current_capital=bot.initial_capital,
                    brain=bot.brain.clone_with_evolution(),
                    parent_id=bot.bot_id,
                )
                spawned.append(child)
            else:
                # Saldo negativo: o robô morre imediatamente, mas o Cofre continua intacto!
                died.append(bot)
                self.dead_bots.append(bot)

        self.active_bots = surviving + spawned
        return {
            "day": day_num,
            "profit_saved_today": profit_saved_today,
            "master_vault_total": self.master_vault,
            "survived_count": len(surviving),
            "spawned_count": len(spawned),
            "died_count": len(died),
            "active_total": len(self.active_bots),
            "max_iq": max((b.brain.iq for b in self.active_bots), default=0),
        }


def run_verification_test() -> None:
    print("=== TESTE DE VERIFICACAO DO ECOSSISTEMA NEXUS DARWIN AI ===")
    sim = DarwinEcosystemSimulator(initial_seed=1000.0)

    # Dia 1: Robô 1 fecha positivo (+R$ 85.50) -> salva R$ 85.50 no Cofre e multiplica (1 -> 2 robôs)
    r1 = sim.simulate_day(1, force_outcomes=[85.50])
    assert r1["master_vault_total"] == 85.50, "Falha ao salvar lucro do Dia 1 no Cofre"
    assert r1["active_total"] == 2, "Falha ao replicar robô positivo no Dia 1"
    print(f"[Dia 1 OK] Cofre: R$ {r1['master_vault_total']:.2f} | Robos Vivos: {r1['active_total']} | QI Max: {r1['max_iq']}")

    # Dia 2: Ambos os 2 robôs fecham positivos (+R$ 92.00 e +R$ 110.00) -> Cofre sobe p/ R$ 287.50 e multiplica (2 -> 4 robôs)
    r2 = sim.simulate_day(2, force_outcomes=[92.00, 110.00])
    assert r2["master_vault_total"] == 287.50, "Falha ao acumular lucro do Dia 2 no Cofre"
    assert r2["active_total"] == 4, "Falha ao multiplicar 2 -> 4 robôs no Dia 2"
    print(f"[Dia 2 OK] Cofre: R$ {r2['master_vault_total']:.2f} | Robos Vivos: {r2['active_total']} | QI Max: {r2['max_iq']}")

    # Dia 3: 3 robôs fecham positivos (+R$ 60, +R$ 75, +R$ 90) e 1 fecha negativo (-R$ 30)
    # O robô negativo MORRE, os 3 positivos salvam +R$ 225 no Cofre (Total R$ 512.50) e se replicam (3 * 2 = 6 robôs vivos)
    r3 = sim.simulate_day(3, force_outcomes=[60.00, -30.00, 75.00, 90.00])
    assert r3["died_count"] == 1, "Robô com saldo negativo deveria ter morrido no Dia 3"
    assert r3["master_vault_total"] == 512.50, "Cofre deveria preservar todo lucro anterior + lucro dos robôs positivos"
    assert r3["active_total"] == 6, "3 robôs sobreviventes deveriam gerar +3 filhos = 6 robôs ativos"
    print(f"[Dia 3 OK] Cofre Blindado: R$ {r3['master_vault_total']:.2f} | Robos Vivos: {r3['active_total']} | Mortos: {r3['died_count']} | QI Max: {r3['max_iq']}")
    print("=== TODOS OS TESTES DE EVOLUCAO, COFRE E SELECAO NATURAL PASSARAM COM SUCESSO! ===")


def start_web_server(port: int = 8080) -> None:
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = HTTPServer(("127.0.0.1", port), SimpleHTTPRequestHandler)
    url = f"http://localhost:{port}/index.html"
    print(f"Painel NEXUS DARWIN AI rodando em: {url}")
    webbrowser.open(url)
    server.serve_forever()


if __name__ == "__main__":
    if "--test-evolution" in sys.argv:
        run_verification_test()
    else:
        start_web_server()
