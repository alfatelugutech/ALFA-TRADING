"""
Advanced Portfolio Management and Risk Control System
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class RiskLevel(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class Position:
    symbol: str
    quantity: int
    avg_price: float
    current_price: float
    unrealized_pnl: float
    realized_pnl: float
    market_value: float
    exchange: str
    instrument_type: str


@dataclass
class RiskMetrics:
    total_exposure: float
    portfolio_value: float
    leverage_ratio: float
    var_95: float  # Value at Risk 95%
    max_drawdown: float
    sharpe_ratio: float
    beta: float
    concentration_risk: float


@dataclass
class RiskLimits:
    max_position_size_pct: float = 0.1  # 10% max per position
    max_sector_exposure_pct: float = 0.3  # 30% max per sector
    max_daily_loss_pct: float = 0.05  # 5% max daily loss
    max_leverage: float = 2.0  # 2x max leverage
    max_var_pct: float = 0.02  # 2% max VaR
    max_correlation: float = 0.7  # Max correlation between positions


class AdvancedPortfolioManager:
    """
    Advanced portfolio management with sophisticated risk controls
    """
    
    def __init__(self, initial_capital: float = 100000):
        self.initial_capital = initial_capital
        self.current_capital = initial_capital
        self.positions: Dict[str, Position] = {}
        self.risk_limits = RiskLimits()
        self.daily_pnl_history: List[float] = []
        self.portfolio_history: List[Dict] = []
        
    def add_position(self, symbol: str, quantity: int, price: float, 
                    exchange: str = "NSE", instrument_type: str = "EQ") -> bool:
        """Add or update a position with risk checks"""
        try:
            # Calculate position value
            position_value = abs(quantity * price)
            
            # Risk check: Position size limit
            if position_value > (self.current_capital * self.risk_limits.max_position_size_pct):
                logger.warning(f"Position size limit exceeded for {symbol}: {position_value} > {self.current_capital * self.risk_limits.max_position_size_pct}")
                return False
            
            # Risk check: Portfolio exposure limit
            total_exposure = self.get_total_exposure() + position_value
            if total_exposure > (self.current_capital * self.risk_limits.max_leverage):
                logger.warning(f"Portfolio exposure limit exceeded: {total_exposure} > {self.current_capital * self.risk_limits.max_leverage}")
                return False
            
            # Update or create position
            if symbol in self.positions:
                # Update existing position (FIFO)
                existing = self.positions[symbol]
                total_quantity = existing.quantity + quantity
                total_cost = (existing.quantity * existing.avg_price) + (quantity * price)
                new_avg_price = total_cost / total_quantity if total_quantity != 0 else 0
                
                self.positions[symbol] = Position(
                    symbol=symbol,
                    quantity=total_quantity,
                    avg_price=new_avg_price,
                    current_price=price,
                    unrealized_pnl=0,  # Will be calculated
                    realized_pnl=existing.realized_pnl,
                    market_value=total_quantity * price,
                    exchange=exchange,
                    instrument_type=instrument_type
                )
            else:
                # Create new position
                self.positions[symbol] = Position(
                    symbol=symbol,
                    quantity=quantity,
                    avg_price=price,
                    current_price=price,
                    unrealized_pnl=0,
                    realized_pnl=0,
                    market_value=quantity * price,
                    exchange=exchange,
                    instrument_type=instrument_type
                )
            
            logger.info(f"Position added/updated: {symbol} qty={quantity} price={price}")
            return True
            
        except Exception as e:
            logger.exception(f"Error adding position {symbol}: {e}")
            return False
    
    def remove_position(self, symbol: str, quantity: int, price: float) -> Tuple[bool, float]:
        """Remove or reduce a position, return (success, realized_pnl)"""
        try:
            if symbol not in self.positions:
                return False, 0.0
            
            position = self.positions[symbol]
            
            if quantity >= position.quantity:
                # Close entire position
                realized_pnl = (price - position.avg_price) * position.quantity
                del self.positions[symbol]
                logger.info(f"Position closed: {symbol} realized_pnl={realized_pnl}")
                return True, realized_pnl
            else:
                # Reduce position
                realized_pnl = (price - position.avg_price) * quantity
                new_quantity = position.quantity - quantity
                
                self.positions[symbol] = Position(
                    symbol=symbol,
                    quantity=new_quantity,
                    avg_price=position.avg_price,  # Keep original avg price
                    current_price=price,
                    unrealized_pnl=0,
                    realized_pnl=position.realized_pnl + realized_pnl,
                    market_value=new_quantity * price,
                    exchange=position.exchange,
                    instrument_type=position.instrument_type
                )
                logger.info(f"Position reduced: {symbol} qty={quantity} realized_pnl={realized_pnl}")
                return True, realized_pnl
                
        except Exception as e:
            logger.exception(f"Error removing position {symbol}: {e}")
            return False, 0.0
    
    def update_prices(self, price_data: Dict[str, float]):
        """Update current prices for all positions"""
        for symbol, position in self.positions.items():
            if symbol in price_data:
                position.current_price = price_data[symbol]
                position.unrealized_pnl = (position.current_price - position.avg_price) * position.quantity
                position.market_value = position.quantity * position.current_price
    
    def get_total_exposure(self) -> float:
        """Calculate total portfolio exposure"""
        return sum(abs(pos.market_value) for pos in self.positions.values())
    
    def get_portfolio_value(self) -> float:
        """Calculate total portfolio value"""
        return self.current_capital + sum(pos.unrealized_pnl + pos.realized_pnl for pos in self.positions.values())
    
    def get_risk_metrics(self) -> RiskMetrics:
        """Calculate comprehensive risk metrics"""
        try:
            total_exposure = self.get_total_exposure()
            portfolio_value = self.get_portfolio_value()
            
            # Leverage ratio
            leverage_ratio = total_exposure / portfolio_value if portfolio_value > 0 else 0
            
            # Value at Risk (simplified calculation)
            if len(self.daily_pnl_history) >= 20:
                sorted_returns = sorted(self.daily_pnl_history[-20:])
                var_95 = sorted_returns[int(0.05 * len(sorted_returns))] if sorted_returns else 0
            else:
                var_95 = 0
            
            # Max drawdown
            max_drawdown = self.calculate_max_drawdown()
            
            # Sharpe ratio (simplified)
            if len(self.daily_pnl_history) >= 20:
                avg_return = sum(self.daily_pnl_history[-20:]) / len(self.daily_pnl_history[-20:])
                std_return = (sum((r - avg_return) ** 2 for r in self.daily_pnl_history[-20:]) / len(self.daily_pnl_history[-20:])) ** 0.5
                sharpe_ratio = avg_return / std_return if std_return > 0 else 0
            else:
                sharpe_ratio = 0
            
            # Concentration risk (max position as % of portfolio)
            if portfolio_value > 0:
                max_position_value = max((abs(pos.market_value) for pos in self.positions.values()), default=0)
                concentration_risk = max_position_value / portfolio_value
            else:
                concentration_risk = 0
            
            return RiskMetrics(
                total_exposure=total_exposure,
                portfolio_value=portfolio_value,
                leverage_ratio=leverage_ratio,
                var_95=var_95,
                max_drawdown=max_drawdown,
                sharpe_ratio=sharpe_ratio,
                beta=1.0,  # Simplified
                concentration_risk=concentration_risk
            )
            
        except Exception as e:
            logger.exception(f"Error calculating risk metrics: {e}")
            return RiskMetrics(0, 0, 0, 0, 0, 0, 0, 0)
    
    def calculate_max_drawdown(self) -> float:
        """Calculate maximum drawdown from peak"""
        if not self.portfolio_history:
            return 0.0
        
        peak = self.portfolio_history[0]["value"]
        max_dd = 0.0
        
        for record in self.portfolio_history:
            if record["value"] > peak:
                peak = record["value"]
            drawdown = (peak - record["value"]) / peak if peak > 0 else 0
            max_dd = max(max_dd, drawdown)
        
        return max_dd
    
    def check_risk_limits(self) -> List[str]:
        """Check all risk limits and return violations"""
        violations = []
        metrics = self.get_risk_metrics()
        
        # Position size limits
        for symbol, position in self.positions.items():
            position_pct = abs(position.market_value) / metrics.portfolio_value if metrics.portfolio_value > 0 else 0
            if position_pct > self.risk_limits.max_position_size_pct:
                violations.append(f"Position size limit exceeded for {symbol}: {position_pct:.2%}")
        
        # Leverage limit
        if metrics.leverage_ratio > self.risk_limits.max_leverage:
            violations.append(f"Leverage limit exceeded: {metrics.leverage_ratio:.2f}x")
        
        # Daily loss limit
        if self.daily_pnl_history:
            daily_pnl = self.daily_pnl_history[-1] if self.daily_pnl_history else 0
            daily_loss_pct = abs(daily_pnl) / self.current_capital if daily_pnl < 0 else 0
            if daily_loss_pct > self.risk_limits.max_daily_loss_pct:
                violations.append(f"Daily loss limit exceeded: {daily_loss_pct:.2%}")
        
        # VaR limit
        if abs(metrics.var_95) > (self.current_capital * self.risk_limits.max_var_pct):
            violations.append(f"VaR limit exceeded: {metrics.var_95:.2f}")
        
        # Concentration risk
        if metrics.concentration_risk > self.risk_limits.max_position_size_pct:
            violations.append(f"Concentration risk exceeded: {metrics.concentration_risk:.2%}")
        
        return violations
    
    def get_position_sizing_recommendation(self, symbol: str, price: float, 
                                         risk_per_trade: float = 0.02) -> int:
        """Calculate recommended position size based on risk management"""
        try:
            # Kelly Criterion simplified
            portfolio_value = self.get_portfolio_value()
            risk_amount = portfolio_value * risk_per_trade
            
            # Calculate stop loss distance (simplified)
            stop_loss_pct = 0.05  # 5% stop loss
            stop_loss_distance = price * stop_loss_pct
            
            # Position size = Risk amount / Stop loss distance
            position_size = int(risk_amount / stop_loss_distance) if stop_loss_distance > 0 else 0
            
            # Apply position size limits
            max_position_value = portfolio_value * self.risk_limits.max_position_size_pct
            max_position_size = int(max_position_value / price) if price > 0 else 0
            
            recommended_size = min(position_size, max_position_size)
            
            logger.info(f"Position sizing for {symbol}: recommended={recommended_size}, risk_amount={risk_amount}")
            return max(0, recommended_size)
            
        except Exception as e:
            logger.exception(f"Error calculating position size for {symbol}: {e}")
            return 0
    
    def record_daily_pnl(self, pnl: float):
        """Record daily P&L for risk calculations"""
        self.daily_pnl_history.append(pnl)
        # Keep only last 252 days (1 year)
        if len(self.daily_pnl_history) > 252:
            self.daily_pnl_history = self.daily_pnl_history[-252:]
    
    def record_portfolio_snapshot(self):
        """Record portfolio snapshot for historical analysis"""
        snapshot = {
            "timestamp": datetime.now().isoformat(),
            "value": self.get_portfolio_value(),
            "positions": len(self.positions),
            "exposure": self.get_total_exposure()
        }
        self.portfolio_history.append(snapshot)
        # Keep only last 1000 snapshots
        if len(self.portfolio_history) > 1000:
            self.portfolio_history = self.portfolio_history[-1000:]
    
    def get_portfolio_summary(self) -> Dict:
        """Get comprehensive portfolio summary"""
        metrics = self.get_risk_metrics()
        violations = self.check_risk_limits()
        
        return {
            "portfolio_value": metrics.portfolio_value,
            "total_exposure": metrics.total_exposure,
            "leverage_ratio": metrics.leverage_ratio,
            "positions_count": len(self.positions),
            "risk_metrics": {
                "var_95": metrics.var_95,
                "max_drawdown": metrics.max_drawdown,
                "sharpe_ratio": metrics.sharpe_ratio,
                "concentration_risk": metrics.concentration_risk
            },
            "risk_violations": violations,
            "risk_level": self.get_risk_level(),
            "positions": [
                {
                    "symbol": pos.symbol,
                    "quantity": pos.quantity,
                    "avg_price": pos.avg_price,
                    "current_price": pos.current_price,
                    "unrealized_pnl": pos.unrealized_pnl,
                    "market_value": pos.market_value,
                    "exchange": pos.exchange
                }
                for pos in self.positions.values()
            ]
        }
    
    def get_risk_level(self) -> RiskLevel:
        """Determine overall portfolio risk level"""
        violations = self.check_risk_limits()
        metrics = self.get_risk_metrics()
        
        if len(violations) >= 3 or metrics.leverage_ratio > 3.0:
            return RiskLevel.CRITICAL
        elif len(violations) >= 2 or metrics.leverage_ratio > 2.0:
            return RiskLevel.HIGH
        elif len(violations) >= 1 or metrics.leverage_ratio > 1.5:
            return RiskLevel.MEDIUM
        else:
            return RiskLevel.LOW
