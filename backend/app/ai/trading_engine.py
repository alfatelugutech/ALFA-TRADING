from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

from app.ai.market_analyzer import AIMarketAnalyzer, MarketCondition, StrategyRecommendation
from app.strategies.base import BaseStrategy, Signal
from app.strategies.sma_crossover import SmaCrossoverStrategy
from app.strategies.ema_crossover import EmaCrossoverStrategy
from app.strategies.rsi_strategy import RsiStrategy
from app.strategies.bollinger_bands import BollingerBandsStrategy
from app.strategies.macd_strategy import MacdStrategy
from app.strategies.support_resistance import SupportResistanceStrategy
from app.strategies.options_straddle import OptionsStraddleStrategy
from app.strategies.options_strangle import OptionsStrangleStrategy

logger = logging.getLogger(__name__)


class AITradingEngine:
    """
    AI-powered trading engine that automatically analyzes markets,
    selects the best strategies, and executes trades for maximum profit
    """
    
    def __init__(self, broker_client, instruments, symbol_to_token, token_to_symbol):
        self.analyzer = AIMarketAnalyzer()
        self.broker = broker_client
        self.instruments = instruments
        self.symbol_to_token = symbol_to_token
        self.token_to_symbol = token_to_symbol
        
        # Trading state
        self.active_strategies: Dict[str, BaseStrategy] = {}
        self.strategy_performance: Dict[str, Dict] = {}
        self.market_data: Dict[str, List[float]] = {}
        self.volume_data: Dict[str, List[float]] = {}
        self.last_analysis_time = None
        self.analysis_interval = 300  # 5 minutes
        
        # Performance tracking
        self.total_trades = 0
        self.successful_trades = 0
        self.total_profit = 0.0
        self.max_drawdown = 0.0
        
        # Risk management
        self.max_concurrent_strategies = 3
        self.max_risk_per_strategy = 0.02  # 2% risk per strategy
        self.available_capital = 100000.0
        
        # Control flag
        self.running = False
        
    async def start_ai_trading(self, live_mode: bool = False):
        """Start AI-powered trading"""
        logger.info("Starting AI Trading Engine...")
        self.running = True
        
        while self.running:
            try:
                # Analyze market conditions
                market_condition = await self._analyze_market()
                
                # Get strategy recommendations
                recommendations = self.analyzer.recommend_strategy(
                    market_condition, self.available_capital
                )
                
                # Update active strategies
                await self._update_strategies(recommendations, live_mode)
                
                # Monitor and adjust existing strategies
                await self._monitor_strategies()
                
                # Update performance metrics
                self._update_performance_metrics()
                
                # Wait before next analysis
                await asyncio.sleep(self.analysis_interval)
                
            except Exception as e:
                logger.exception("Error in AI trading loop: %s", e)
                await asyncio.sleep(60)  # Wait 1 minute on error
    
    async def _analyze_market(self) -> MarketCondition:
        """Analyze current market conditions"""
        try:
            # Collect recent price data for analysis
            price_data = {}
            volume_data = {}
            
            # Get data for all symbols in our universe
            all_symbols = (self.analyzer.equity_universe[:20] + 
                          self.analyzer.options_universe)
            
            for symbol in all_symbols:
                try:
                    # Get recent price history (last 50 candles)
                    # This would typically come from your market data feed
                    # For now, we'll simulate with current LTP
                    ltp = await self._get_current_price(symbol)
                    if ltp and ltp > 0:
                        # Simulate price history (in real implementation, get from historical data)
                        price_data[symbol] = [ltp * (1 + (i - 25) * 0.001) for i in range(50)]
                        volume_data[symbol] = [1000000 + i * 1000 for i in range(50)]
                except Exception as e:
                    logger.debug("Failed to get data for %s: %s", symbol, e)
                    continue
            
            # Analyze market conditions
            market_condition = self.analyzer.analyze_market_condition(price_data, volume_data)
            self.last_analysis_time = datetime.now()
            
            logger.info("Market Analysis - Trend: %s, Volatility: %s, Volume: %s, Momentum: %s",
                       market_condition.trend, market_condition.volatility, 
                       market_condition.volume, market_condition.momentum)
            
            return market_condition
            
        except Exception as e:
            logger.exception("Error analyzing market: %s", e)
            # Return neutral market condition on error
            return MarketCondition(
                trend="sideways", volatility="medium", volume="medium",
                momentum="neutral", rsi_level="neutral", support_resistance="neutral"
            )
    
    async def _get_current_price(self, symbol: str) -> Optional[float]:
        """Get current price for a symbol"""
        try:
            # This would integrate with your existing price feed
            # For now, return a placeholder
            return 100.0  # Placeholder
        except Exception:
            return None
    
    async def _update_strategies(self, recommendations: List[StrategyRecommendation], 
                               live_mode: bool):
        """Update active strategies based on recommendations"""
        try:
            # Remove underperforming strategies
            await self._remove_underperforming_strategies()
            
            # Add new high-confidence strategies
            for rec in recommendations[:self.max_concurrent_strategies]:
                if (rec.confidence > 0.7 and 
                    rec.strategy_name not in self.active_strategies and
                    len(self.active_strategies) < self.max_concurrent_strategies):
                    
                    await self._start_strategy(rec, live_mode)
            
            # Log current strategy status
            active_names = list(self.active_strategies.keys())
            logger.info("Active strategies: %s", active_names)
            
        except Exception as e:
            logger.exception("Error updating strategies: %s", e)
    
    async def _start_strategy(self, recommendation: StrategyRecommendation, live_mode: bool):
        """Start a new strategy based on recommendation"""
        try:
            strategy_name = recommendation.strategy_name
            symbols = recommendation.symbols
            parameters = recommendation.parameters
            
            logger.info("Starting strategy: %s with symbols: %s", strategy_name, symbols)
            
            # Create strategy instance
            strategy = self._create_strategy(strategy_name, symbols, parameters)
            
            if strategy:
                self.active_strategies[strategy_name] = strategy
                self.strategy_performance[strategy_name] = {
                    "start_time": datetime.now(),
                    "trades": 0,
                    "profit": 0.0,
                    "max_drawdown": 0.0,
                    "confidence": recommendation.confidence
                }
                
                logger.info("Successfully started strategy: %s", strategy_name)
            
        except Exception as e:
            logger.exception("Error starting strategy %s: %s", recommendation.strategy_name, e)
    
    def _create_strategy(self, strategy_name: str, symbols: List[str], 
                        parameters: Dict) -> Optional[BaseStrategy]:
        """Create a strategy instance"""
        try:
            if strategy_name == "sma":
                return SmaCrossoverStrategy(
                    symbols=symbols,
                    short_window=parameters.get("short", 20),
                    long_window=parameters.get("long", 50)
                )
            elif strategy_name == "ema":
                return EmaCrossoverStrategy(
                    symbols=symbols,
                    short_window=parameters.get("short", 12),
                    long_window=parameters.get("long", 26)
                )
            elif strategy_name == "rsi":
                return RsiStrategy(
                    symbols=symbols,
                    period=parameters.get("period", 14),
                    oversold=parameters.get("oversold", 30),
                    overbought=parameters.get("overbought", 70)
                )
            elif strategy_name == "bollinger":
                return BollingerBandsStrategy(
                    symbols=symbols,
                    period=parameters.get("period", 20),
                    std_dev=parameters.get("std_dev", 2.0)
                )
            elif strategy_name == "macd":
                return MacdStrategy(
                    symbols=symbols,
                    fast_period=parameters.get("fast_period", 12),
                    slow_period=parameters.get("slow_period", 26),
                    signal_period=parameters.get("signal_period", 9)
                )
            elif strategy_name == "support_resistance":
                return SupportResistanceStrategy(
                    symbols=symbols,
                    lookback_period=parameters.get("lookback_period", 50),
                    breakout_threshold=parameters.get("breakout_threshold", 0.01)
                )
            elif strategy_name == "options_straddle":
                return OptionsStraddleStrategy(
                    symbols=symbols,
                    underlying=parameters.get("underlying", "NIFTY"),
                    expiry=parameters.get("expiry", "next"),
                    quantity=parameters.get("quantity", 1),
                    volatility_threshold=parameters.get("volatility_threshold", 0.02)
                )
            elif strategy_name == "options_strangle":
                return OptionsStrangleStrategy(
                    symbols=symbols,
                    underlying=parameters.get("underlying", "NIFTY"),
                    expiry=parameters.get("expiry", "next"),
                    quantity=parameters.get("quantity", 1),
                    volatility_threshold=parameters.get("volatility_threshold", 0.02),
                    otm_offset=parameters.get("otm_offset", 2)
                )
            
            return None
            
        except Exception as e:
            logger.exception("Error creating strategy %s: %s", strategy_name, e)
            return None
    
    async def _remove_underperforming_strategies(self):
        """Remove strategies that are underperforming"""
        try:
            strategies_to_remove = []
            
            for strategy_name, performance in self.strategy_performance.items():
                # Remove strategies that have been running for more than 1 hour with poor performance
                runtime = datetime.now() - performance["start_time"]
                if (runtime > timedelta(hours=1) and 
                    performance["profit"] < -self.max_risk_per_strategy * self.available_capital):
                    strategies_to_remove.append(strategy_name)
            
            for strategy_name in strategies_to_remove:
                if strategy_name in self.active_strategies:
                    del self.active_strategies[strategy_name]
                    logger.info("Removed underperforming strategy: %s", strategy_name)
            
        except Exception as e:
            logger.exception("Error removing underperforming strategies: %s", e)
    
    async def _monitor_strategies(self):
        """Monitor active strategies and execute trades"""
        try:
            for strategy_name, strategy in self.active_strategies.items():
                # This would integrate with your tick processing
                # For now, we'll simulate strategy monitoring
                pass
                
        except Exception as e:
            logger.exception("Error monitoring strategies: %s", e)
    
    def _update_performance_metrics(self):
        """Update overall performance metrics"""
        try:
            total_trades = sum(perf["trades"] for perf in self.strategy_performance.values())
            total_profit = sum(perf["profit"] for perf in self.strategy_performance.values())
            
            self.total_trades = total_trades
            self.total_profit = total_profit
            
            # Calculate success rate
            if total_trades > 0:
                self.successful_trades = sum(1 for perf in self.strategy_performance.values() 
                                           if perf["profit"] > 0)
            
        except Exception as e:
            logger.exception("Error updating performance metrics: %s", e)
    
    def get_ai_status(self) -> Dict[str, Any]:
        """Get current AI trading status"""
        return {
            "active_strategies": list(self.active_strategies.keys()),
            "total_trades": self.total_trades,
            "successful_trades": self.successful_trades,
            "total_profit": self.total_profit,
            "success_rate": (self.successful_trades / max(self.total_trades, 1)) * 100,
            "available_capital": self.available_capital,
            "last_analysis": self.last_analysis_time.isoformat() if self.last_analysis_time else None,
            "strategy_performance": self.strategy_performance
        }
    
    def stop_ai_trading(self):
        """Stop AI trading"""
        logger.info("Stopping AI Trading Engine...")
        self.running = False
        self.active_strategies.clear()
        self.strategy_performance.clear()
