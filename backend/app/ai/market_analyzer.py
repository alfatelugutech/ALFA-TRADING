from __future__ import annotations

import math
import statistics
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

from app.strategies.base import Signal


@dataclass
class MarketCondition:
    trend: str  # "bullish", "bearish", "sideways"
    volatility: str  # "low", "medium", "high"
    volume: str  # "low", "medium", "high"
    momentum: str  # "strong", "weak", "neutral"
    rsi_level: str  # "oversold", "overbought", "neutral"
    support_resistance: str  # "near_support", "near_resistance", "breakout", "breakdown"


@dataclass
class StrategyRecommendation:
    strategy_name: str
    confidence: float  # 0-1
    expected_profit: float
    risk_level: str  # "low", "medium", "high"
    market_condition: MarketCondition
    symbols: List[str]
    parameters: Dict


class AIMarketAnalyzer:
    """
    AI-powered market analyzer that evaluates market conditions
    and recommends the best trading strategies for maximum profit
    """
    
    def __init__(self):
        # Expanded trading universe with more companies
        self.equity_universe = [
            # Large Cap
            "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "KOTAKBANK", "HINDUNILVR",
            "ITC", "BHARTIARTL", "SBIN", "LT", "ASIANPAINT", "MARUTI", "AXISBANK",
            "NESTLEIND", "ULTRACEMCO", "SUNPHARMA", "TITAN", "POWERGRID", "NTPC",
            "ONGC", "COALINDIA", "TECHM", "WIPRO", "HCLTECH", "BAJFINANCE", "BAJAJFINSV",
            "DRREDDY", "CIPLA", "DIVISLAB", "EICHERMOT", "HEROMOTOCO", "BAJAJ-AUTO",
            "M&M", "TATAMOTORS", "TATASTEEL", "JSWSTEEL", "ADANIPORTS", "GRASIM",
            "SHREECEM", "DABUR", "GODREJCP", "BRITANNIA", "DMART", "TATACONSUM",
            "PIDILITIND", "BANDHANBNK", "INDUSINDBK", "FEDERALBNK", "IDFCFIRSTB",
            
            # Mid Cap
            "MINDTREE", "LALPATHLAB", "PAGEIND", "BOSCHLTD", "ABBOTINDIA", "BERGEPAINT",
            "COLPAL", "GODREJIND", "HAVELLS", "VOLTAS", "WHIRLPOOL", "CROMPTON",
            "AMBUJACEM", "RAMCOCEM", "JKCEMENT", "ORIENTCEM", "HEIDELBERG",
            "BATAINDIA", "RELAXO", "CROMPTON", "VGUARD", "POLYCAB", "FINPIPE",
            "ASTRAL", "KANSAINER", "PIDILITIND", "DIXON", "RATNAMANI", "TANLA",
            "MPHASIS", "LTI", "MINDTREE", "COFORGE", "PERSISTENT", "CYIENT",
            
            # Small Cap
            "IRCTC", "RAILTEL", "CONCOR", "RVNL", "TITAGARH", "TEXRAIL",
            "BEML", "BHEL", "SJVN", "NHPC", "TATAPOWER", "ADANIGREEN",
            "ADANITRANS", "ADANIPOWER", "TATACOMM", "RCOM", "IDEA", "VODAFONE",
        ]
        
        self.options_universe = ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY"]
        self.futures_universe = ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY"]
        
        # Strategy performance weights (learned from historical data)
        self.strategy_weights = {
            "sma": {"trend": 0.8, "volatility": 0.3, "volume": 0.5},
            "ema": {"trend": 0.9, "volatility": 0.4, "volume": 0.6},
            "rsi": {"trend": 0.2, "volatility": 0.8, "volume": 0.4},
            "bollinger": {"trend": 0.3, "volatility": 0.9, "volume": 0.5},
            "macd": {"trend": 0.9, "volatility": 0.5, "volume": 0.7},
            "support_resistance": {"trend": 0.6, "volatility": 0.7, "volume": 0.8},
            "options_straddle": {"trend": 0.1, "volatility": 0.95, "volume": 0.3},
            "options_strangle": {"trend": 0.1, "volatility": 0.9, "volume": 0.3},
        }
    
    def analyze_market_condition(self, price_data: Dict[str, List[float]], 
                               volume_data: Dict[str, List[float]] = None) -> MarketCondition:
        """Analyze current market conditions"""
        
        # Calculate overall market trend
        trend = self._calculate_trend(price_data)
        
        # Calculate volatility
        volatility = self._calculate_volatility(price_data)
        
        # Calculate volume analysis
        volume = self._calculate_volume_analysis(volume_data) if volume_data else "medium"
        
        # Calculate momentum
        momentum = self._calculate_momentum(price_data)
        
        # Calculate RSI level
        rsi_level = self._calculate_rsi_level(price_data)
        
        # Calculate support/resistance levels
        support_resistance = self._calculate_support_resistance(price_data)
        
        return MarketCondition(
            trend=trend,
            volatility=volatility,
            volume=volume,
            momentum=momentum,
            rsi_level=rsi_level,
            support_resistance=support_resistance
        )
    
    def _calculate_trend(self, price_data: Dict[str, List[float]]) -> str:
        """Calculate overall market trend"""
        if not price_data:
            return "sideways"
        
        all_returns = []
        for symbol, prices in price_data.items():
            if len(prices) >= 2:
                returns = [(prices[i] - prices[i-1]) / prices[i-1] for i in range(1, len(prices))]
                all_returns.extend(returns)
        
        if not all_returns:
            return "sideways"
        
        avg_return = statistics.mean(all_returns)
        if avg_return > 0.001:  # 0.1% threshold
            return "bullish"
        elif avg_return < -0.001:
            return "bearish"
        else:
            return "sideways"
    
    def _calculate_volatility(self, price_data: Dict[str, List[float]]) -> str:
        """Calculate market volatility"""
        if not price_data:
            return "medium"
        
        all_volatilities = []
        for symbol, prices in price_data.items():
            if len(prices) >= 20:
                returns = [(prices[i] - prices[i-1]) / prices[i-1] for i in range(1, len(prices))]
                if returns:
                    volatility = statistics.stdev(returns) * math.sqrt(252)  # Annualized
                    all_volatilities.append(volatility)
        
        if not all_volatilities:
            return "medium"
        
        avg_volatility = statistics.mean(all_volatilities)
        if avg_volatility > 0.25:  # 25% annualized volatility
            return "high"
        elif avg_volatility < 0.15:  # 15% annualized volatility
            return "low"
        else:
            return "medium"
    
    def _calculate_volume_analysis(self, volume_data: Dict[str, List[float]]) -> str:
        """Calculate volume analysis"""
        if not volume_data:
            return "medium"
        
        all_volumes = []
        for symbol, volumes in volume_data.items():
            if volumes:
                all_volumes.extend(volumes)
        
        if not all_volumes:
            return "medium"
        
        avg_volume = statistics.mean(all_volumes)
        # This would need historical volume data for proper analysis
        return "medium"  # Placeholder
    
    def _calculate_momentum(self, price_data: Dict[str, List[float]]) -> str:
        """Calculate market momentum"""
        if not price_data:
            return "neutral"
        
        momentum_scores = []
        for symbol, prices in price_data.items():
            if len(prices) >= 10:
                # Calculate rate of change over last 10 periods
                roc = (prices[-1] - prices[-10]) / prices[-10]
                momentum_scores.append(roc)
        
        if not momentum_scores:
            return "neutral"
        
        avg_momentum = statistics.mean(momentum_scores)
        if avg_momentum > 0.02:  # 2% momentum
            return "strong"
        elif avg_momentum < -0.02:
            return "weak"
        else:
            return "neutral"
    
    def _calculate_rsi_level(self, price_data: Dict[str, List[float]]) -> str:
        """Calculate overall RSI level"""
        if not price_data:
            return "neutral"
        
        rsi_values = []
        for symbol, prices in price_data.items():
            if len(prices) >= 14:
                rsi = self._calculate_rsi(prices[-14:])
                rsi_values.append(rsi)
        
        if not rsi_values:
            return "neutral"
        
        avg_rsi = statistics.mean(rsi_values)
        if avg_rsi < 30:
            return "oversold"
        elif avg_rsi > 70:
            return "overbought"
        else:
            return "neutral"
    
    def _calculate_rsi(self, prices: List[float]) -> float:
        """Calculate RSI for a price series"""
        if len(prices) < 2:
            return 50.0
        
        gains = []
        losses = []
        
        for i in range(1, len(prices)):
            change = prices[i] - prices[i-1]
            if change > 0:
                gains.append(change)
                losses.append(0)
            else:
                gains.append(0)
                losses.append(abs(change))
        
        if not gains or not losses:
            return 50.0
        
        avg_gain = statistics.mean(gains)
        avg_loss = statistics.mean(losses)
        
        if avg_loss == 0:
            return 100.0
        
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        return rsi
    
    def _calculate_support_resistance(self, price_data: Dict[str, List[float]]) -> str:
        """Calculate support/resistance analysis"""
        # Simplified implementation
        return "neutral"  # Placeholder for complex support/resistance analysis
    
    def recommend_strategy(self, market_condition: MarketCondition, 
                          available_capital: float = 100000) -> List[StrategyRecommendation]:
        """Recommend best strategies based on market conditions"""
        
        recommendations = []
        
        # Score each strategy based on market conditions
        for strategy_name, weights in self.strategy_weights.items():
            score = 0.0
            
            # Trend scoring
            if market_condition.trend == "bullish" and weights["trend"] > 0.7:
                score += weights["trend"] * 0.3
            elif market_condition.trend == "bearish" and weights["trend"] > 0.7:
                score += weights["trend"] * 0.2
            elif market_condition.trend == "sideways" and weights["trend"] < 0.5:
                score += (1 - weights["trend"]) * 0.3
            
            # Volatility scoring
            if market_condition.volatility == "high" and weights["volatility"] > 0.7:
                score += weights["volatility"] * 0.4
            elif market_condition.volatility == "low" and weights["volatility"] < 0.5:
                score += (1 - weights["volatility"]) * 0.3
            
            # Volume scoring
            if market_condition.volume == "high" and weights["volume"] > 0.6:
                score += weights["volume"] * 0.2
            elif market_condition.volume == "low" and weights["volume"] < 0.4:
                score += (1 - weights["volume"]) * 0.1
            
            # RSI scoring
            if market_condition.rsi_level == "oversold" and strategy_name in ["rsi", "bollinger"]:
                score += 0.2
            elif market_condition.rsi_level == "overbought" and strategy_name in ["rsi", "bollinger"]:
                score += 0.2
            
            # Support/Resistance scoring
            if market_condition.support_resistance in ["breakout", "breakdown"] and strategy_name == "support_resistance":
                score += 0.3
            
            # Calculate expected profit and risk
            expected_profit = self._calculate_expected_profit(strategy_name, market_condition, available_capital)
            risk_level = self._calculate_risk_level(strategy_name, market_condition)
            
            # Select appropriate symbols
            symbols = self._select_symbols(strategy_name, market_condition)
            
            # Generate strategy parameters
            parameters = self._generate_parameters(strategy_name, market_condition)
            
            recommendations.append(StrategyRecommendation(
                strategy_name=strategy_name,
                confidence=min(score, 1.0),
                expected_profit=expected_profit,
                risk_level=risk_level,
                market_condition=market_condition,
                symbols=symbols,
                parameters=parameters
            ))
        
        # Sort by confidence and expected profit
        recommendations.sort(key=lambda x: (x.confidence * 0.7 + x.expected_profit * 0.3), reverse=True)
        
        return recommendations[:5]  # Return top 5 recommendations
    
    def _calculate_expected_profit(self, strategy_name: str, market_condition: MarketCondition, 
                                 available_capital: float) -> float:
        """Calculate expected profit for a strategy"""
        base_profit_rates = {
            "sma": 0.05, "ema": 0.06, "rsi": 0.08, "bollinger": 0.07,
            "macd": 0.06, "support_resistance": 0.09, "options_straddle": 0.15,
            "options_strangle": 0.12
        }
        
        base_rate = base_profit_rates.get(strategy_name, 0.05)
        
        # Adjust based on market conditions
        multiplier = 1.0
        if market_condition.volatility == "high" and strategy_name.startswith("options"):
            multiplier *= 1.5
        elif market_condition.volatility == "low" and strategy_name.startswith("options"):
            multiplier *= 0.5
        
        if market_condition.trend in ["bullish", "bearish"] and strategy_name in ["sma", "ema", "macd"]:
            multiplier *= 1.3
        
        return available_capital * base_rate * multiplier
    
    def _calculate_risk_level(self, strategy_name: str, market_condition: MarketCondition) -> str:
        """Calculate risk level for a strategy"""
        if strategy_name.startswith("options"):
            return "high"
        elif strategy_name in ["support_resistance", "bollinger"]:
            return "medium"
        else:
            return "low"
    
    def _select_symbols(self, strategy_name: str, market_condition: MarketCondition) -> List[str]:
        """Select appropriate symbols for the strategy"""
        if strategy_name.startswith("options"):
            return self.options_universe[:2]  # Top 2 options
        elif strategy_name in ["sma", "ema", "macd"]:
            # Select trending stocks
            return self.equity_universe[:10]  # Top 10 stocks
        else:
            # Select volatile stocks for mean reversion strategies
            return self.equity_universe[10:20]  # Mid-cap stocks
    
    def _generate_parameters(self, strategy_name: str, market_condition: MarketCondition) -> Dict:
        """Generate optimal parameters for the strategy"""
        base_params = {
            "sma": {"short": 20, "long": 50},
            "ema": {"short": 12, "long": 26},
            "rsi": {"period": 14, "oversold": 30, "overbought": 70},
            "bollinger": {"period": 20, "std_dev": 2.0},
            "macd": {"fast_period": 12, "slow_period": 26, "signal_period": 9},
            "support_resistance": {"lookback_period": 50, "breakout_threshold": 0.01},
            "options_straddle": {"quantity": 1, "volatility_threshold": 0.02},
            "options_strangle": {"quantity": 1, "volatility_threshold": 0.02, "otm_offset": 2}
        }
        
        params = base_params.get(strategy_name, {})
        
        # Adjust parameters based on market conditions
        if market_condition.volatility == "high":
            if strategy_name == "rsi":
                params["oversold"] = 25
                params["overbought"] = 75
            elif strategy_name == "bollinger":
                params["std_dev"] = 2.5
        elif market_condition.volatility == "low":
            if strategy_name == "rsi":
                params["oversold"] = 35
                params["overbought"] = 65
        
        return params
