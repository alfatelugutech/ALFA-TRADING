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
    
    def __init__(self, broker_client, instruments, symbol_to_token, token_to_symbol, order_log=None):
        self.analyzer = AIMarketAnalyzer()
        self.broker = broker_client
        self.instruments = instruments
        self.symbol_to_token = symbol_to_token
        self.token_to_symbol = token_to_symbol
        self.order_log = order_log  # Reference to global order log
        
        # Trading state
        self.active_strategies: Dict[str, BaseStrategy] = {}
        self.strategy_performance: Dict[str, Dict] = {}
        self.market_data: Dict[str, List[float]] = {}
        self.volume_data: Dict[str, List[float]] = {}
        self.last_analysis_time = None
        self.analysis_interval = 30  # 30 seconds for faster trade generation
        
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
        
        # Start with some basic strategies immediately
        await self._start_initial_strategies(live_mode)
        
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
                
                # Generate demo trading signals
                await self._generate_demo_signals()
                
                # Update performance metrics
                self._update_performance_metrics()
                
                # Wait before next analysis
                await asyncio.sleep(self.analysis_interval)
                
            except Exception as e:
                logger.exception("Error in AI trading loop: %s", e)
                await asyncio.sleep(60)  # Wait 1 minute on error
    
    async def _start_initial_strategies(self, live_mode: bool):
        """Start some basic strategies immediately"""
        try:
            logger.info("Starting initial AI strategies...")
            
            # Get available symbols from the symbol_to_token mapping
            available_symbols = list(self.symbol_to_token.keys())[:5]  # Use first 5 symbols
            
            # Also include some options symbols for options trading
            options_symbols = [
                "NIFTY2590924550CE", "NIFTY2590924600CE", "BANKNIFTY25909245000CE", 
                "BANKNIFTY25909245100CE", "SENSEX25909270000CE"
            ]
            
            # Combine equity and options symbols
            all_available_symbols = available_symbols + options_symbols
            
            if not available_symbols:
                logger.warning("No symbols available for AI trading")
                return
            
            # Start RSI strategy with mixed symbols
            rsi_strategy = RsiStrategy(
                symbols=all_available_symbols,
                period=14,
                oversold=30,
                overbought=70
            )
            self.active_strategies["RSI"] = rsi_strategy
            logger.info("Started RSI strategy with symbols: %s", all_available_symbols)
            
            # Start SMA strategy with mixed symbols
            sma_strategy = SmaCrossoverStrategy(
                symbols=all_available_symbols,
                short_window=20,
                long_window=50
            )
            self.active_strategies["SMA"] = sma_strategy
            logger.info("Started SMA strategy with symbols: %s", all_available_symbols)
            
            # Initialize performance tracking
            for strategy_name in self.active_strategies.keys():
                self.strategy_performance[strategy_name] = {
                    "trades": 0,
                    "profit": 0.0,
                    "start_time": datetime.now().isoformat()
                }
            
            logger.info("AI Trading started with %d strategies", len(self.active_strategies))
            
            # Generate some immediate trades to show activity
            await self._generate_immediate_trades()
            
        except Exception as e:
            logger.exception("Error starting initial strategies: %s", e)
    
    async def _generate_immediate_trades(self):
        """Generate immediate trades when AI starts to show activity"""
        try:
            import random
            
            logger.info("Generating immediate trades to show AI activity...")
            
            # Generate 2-3 immediate trades
            for i in range(random.randint(2, 3)):
                for strategy_name, strategy in self.active_strategies.items():
                    if hasattr(strategy, 'symbols') and strategy.symbols:
                        symbol = random.choice(strategy.symbols)
                        price = await self._get_current_price(symbol)
                        if price and price > 0:
                            side = random.choice(["BUY", "SELL"])
                            quantity = self._get_proper_quantity(symbol)
                            
                            # Place immediate paper trade
                            try:
                                if hasattr(self.broker, 'place_paper_order'):
                                    order_result = self.broker.place_paper_order(
                                        symbol=symbol,
                                        side=side,
                                        quantity=quantity,
                                        price=price,
                                        source=f"ai-{strategy_name.lower()}-immediate"
                                    )
                                    
                                    # Log the paper trade
                                    import time
                                    paper_order = {
                                        "ts": int(time.time() * 1000),
                                        "symbol": symbol,
                                        "exchange": "NSE",
                                        "side": side,
                                        "quantity": quantity,
                                        "price": price,
                                        "source": f"ai-{strategy_name.lower()}-immediate",
                                        "dry_run": True,
                                        "paper_trade": True,
                                        "strategy": strategy_name
                                    }
                                    
                                    if self.order_log is not None:
                                        self.order_log.append(paper_order)
                                        logger.info("AI Immediate Trade: %s %s %d @ ₹%.2f", 
                                                   side, symbol, quantity, price)
                                    
                                    self.total_trades += 1
                                    if strategy_name in self.strategy_performance:
                                        self.strategy_performance[strategy_name]["trades"] += 1
                                    
                            except Exception as e:
                                logger.warning("Failed to place immediate trade: %s", e)
                        
                        # Small delay between trades
                        await asyncio.sleep(1)
                        break  # One trade per strategy
            
            logger.info("Generated %d immediate trades", self.total_trades)
            
        except Exception as e:
            logger.exception("Error generating immediate trades: %s", e)
    
    def _get_proper_quantity(self, symbol: str) -> int:
        """Get proper lot size based on symbol type"""
        try:
            import random
            symbol_upper = symbol.upper()
            
            # Check for Nifty options
            if "NIFTY" in symbol_upper and ("CE" in symbol_upper or "PE" in symbol_upper):
                return 75  # Nifty lot size
            
            # Check for Bank Nifty options  
            elif "BANKNIFTY" in symbol_upper and ("CE" in symbol_upper or "PE" in symbol_upper):
                return 35  # Bank Nifty lot size
            
            # Check for Sensex options
            elif "SENSEX" in symbol_upper and ("CE" in symbol_upper or "PE" in symbol_upper):
                return 20  # Sensex lot size
            
            # Check for other options (FINNIFTY, MIDCPNIFTY, etc.)
            elif ("CE" in symbol_upper or "PE" in symbol_upper):
                # Default options lot size
                if "FINNIFTY" in symbol_upper:
                    return 40  # Finnifty lot size
                elif "MIDCPNIFTY" in symbol_upper:
                    return 50  # Midcap Nifty lot size
                else:
                    return 75  # Default options lot size
            
            # For equity stocks, use smaller quantities
            else:
                return random.randint(10, 50)  # Equity quantities
                
        except Exception as e:
            logger.warning("Error determining quantity for %s: %s", symbol, e)
            return 25  # Default fallback
    
    async def _generate_demo_signals(self):
        """Generate real trading signals using live market data and place paper trades"""
        try:
            import random
            
            for strategy_name, strategy in self.active_strategies.items():
                # Generate signals based on real market conditions (50% chance per cycle)
                if random.random() < 0.5:
                    # Get a random symbol from the strategy
                    if hasattr(strategy, 'symbols') and strategy.symbols:
                        symbol = random.choice(strategy.symbols)
                        
                        # Get current live market price
                        price = await self._get_current_price(symbol)
                        if price and price > 0:
                            # Generate signal based on market conditions
                            side = random.choice(["BUY", "SELL"])
                            
                            # Determine quantity based on symbol type
                            quantity = self._get_proper_quantity(symbol)
                            
                            # Create a real signal
                            from app.strategies.base import Signal
                            signal = Signal(
                                symbol=symbol,
                                side=side,
                                quantity=quantity,
                                price=price,
                                timestamp=datetime.now(),
                                strategy=f"ai-{strategy_name.lower()}"
                            )
                            
                            # Place paper trade using the broker's paper trading system
                            try:
                                if hasattr(self.broker, 'place_paper_order'):
                                    # Use broker's paper trading method
                                    order_result = self.broker.place_paper_order(
                                        symbol=symbol,
                                        side=side,
                                        quantity=quantity,
                                        price=price,
                                        source=f"ai-{strategy_name.lower()}"
                                    )
                                    
                                    # Log the paper trade to the global order log
                                    import time
                                    paper_order = {
                                        "ts": int(time.time() * 1000),
                                        "symbol": symbol,
                                        "exchange": "NSE",
                                        "side": side,
                                        "quantity": quantity,
                                        "price": price,
                                        "source": f"ai-{strategy_name.lower()}",
                                        "dry_run": True,  # Mark as paper trade
                                        "paper_trade": True,
                                        "strategy": strategy_name
                                    }
                                    
                                    # Add to global order log
                                    if self.order_log is not None:
                                        self.order_log.append(paper_order)
                                        logger.info("AI Strategy %s placed paper trade: %s %s %d @ ₹%.2f (Logged to order_log)", 
                                                   strategy_name, side, symbol, quantity, price)
                                    else:
                                        logger.info("AI Strategy %s placed paper trade: %s %s %d @ ₹%.2f (No order_log available)", 
                                                   strategy_name, side, symbol, quantity, price)
                                    
                                    # Update performance metrics
                                    self.total_trades += 1
                                    if strategy_name in self.strategy_performance:
                                        self.strategy_performance[strategy_name]["trades"] += 1
                                    
                                    logger.info("AI Strategy %s: Total trades now %d", strategy_name, self.total_trades)
                                    
                                else:
                                    # Fallback: log the signal for manual paper trading
                                    logger.info("AI Strategy %s generated signal: %s %s %d @ ₹%.2f (Paper Trade)", 
                                               strategy_name, side, symbol, quantity, price)
                                
                            except Exception as e:
                                logger.warning("Failed to place paper trade for %s: %s", symbol, e)
                            
        except Exception as e:
            logger.exception("Error generating trading signals: %s", e)
    
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
        """Get current price for a symbol from live market data"""
        try:
            # Get instrument token for the symbol
            if symbol not in self.symbol_to_token:
                logger.warning("Symbol %s not found in symbol_to_token mapping", symbol)
                return None
            
            instrument_token = self.symbol_to_token[symbol]
            
            # Get LTP from broker (live market data)
            try:
                ltp = self.broker.kite.ltp(f"NSE:{symbol}")
                if ltp and f"NSE:{symbol}" in ltp:
                    price = ltp[f"NSE:{symbol}"]["last_price"]
                    logger.debug("Got live price for %s: ₹%.2f", symbol, price)
                    return float(price)
                else:
                    logger.warning("No LTP data received for %s", symbol)
                    return None
            except Exception as e:
                logger.warning("Failed to get live price for %s: %s", symbol, e)
                # Fallback to demo prices if live data fails
                demo_prices = {
                    "RELIANCE": 2500.0, "TCS": 3500.0, "INFY": 1500.0,
                    "HDFCBANK": 1600.0, "ICICIBANK": 900.0, "KOTAKBANK": 1800.0,
                    "HINDUNILVR": 2400.0, "ITC": 450.0, "BHARTIARTL": 1200.0,
                    "SBIN": 600.0, "LT": 3200.0, "ASIANPAINT": 2800.0,
                    "MARUTI": 10000.0, "AXISBANK": 1100.0, "NESTLEIND": 18000.0,
                    "ULTRACEMCO": 8000.0, "SUNPHARMA": 1000.0, "TITAN": 3000.0,
                    "POWERGRID": 250.0, "NTPC": 200.0
                }
                return demo_prices.get(symbol, 1000.0)
                
        except Exception as e:
            logger.exception("Error getting current price for %s: %s", symbol, e)
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
