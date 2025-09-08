"""
Advanced Backtesting Engine for Strategy Validation
"""

import logging
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from enum import Enum
import json

logger = logging.getLogger(__name__)


class OrderType(Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"


class OrderSide(Enum):
    BUY = "buy"
    SELL = "sell"


@dataclass
class BacktestOrder:
    timestamp: datetime
    symbol: str
    side: OrderSide
    order_type: OrderType
    quantity: int
    price: Optional[float] = None
    stop_price: Optional[float] = None
    filled_price: Optional[float] = None
    filled_quantity: int = 0
    status: str = "pending"  # pending, filled, cancelled
    commission: float = 0.0
    slippage: float = 0.0


@dataclass
class BacktestPosition:
    symbol: str
    quantity: int
    avg_price: float
    unrealized_pnl: float
    realized_pnl: float
    market_value: float


@dataclass
class BacktestMetrics:
    total_return: float
    annualized_return: float
    volatility: float
    sharpe_ratio: float
    max_drawdown: float
    win_rate: float
    profit_factor: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    avg_win: float
    avg_loss: float
    largest_win: float
    largest_loss: float
    calmar_ratio: float
    sortino_ratio: float
    var_95: float
    cvar_95: float


@dataclass
class BacktestResult:
    start_date: datetime
    end_date: datetime
    initial_capital: float
    final_capital: float
    metrics: BacktestMetrics
    trades: List[BacktestOrder]
    equity_curve: List[Dict[str, Any]]
    positions_history: List[Dict[str, Any]]
    monthly_returns: List[Dict[str, Any]]


class BacktestEngine:
    """
    Advanced backtesting engine with realistic market simulation
    """
    
    def __init__(self, initial_capital: float = 100000, commission: float = 0.001, 
                 slippage: float = 0.0005, benchmark_symbol: str = "NIFTY 50"):
        self.initial_capital = initial_capital
        self.current_capital = initial_capital
        self.commission_rate = commission
        self.slippage_rate = slippage
        self.benchmark_symbol = benchmark_symbol
        
        # State
        self.positions: Dict[str, BacktestPosition] = {}
        self.orders: List[BacktestOrder] = []
        self.equity_curve: List[Dict[str, Any]] = []
        self.positions_history: List[Dict[str, Any]] = []
        self.benchmark_data: Optional[pd.DataFrame] = None
        
        # Performance tracking
        self.daily_returns: List[float] = []
        self.trade_returns: List[float] = []
        self.winning_trades: List[float] = []
        self.losing_trades: List[float] = []
        
    def load_historical_data(self, symbol: str, data: pd.DataFrame) -> bool:
        """Load historical data for backtesting"""
        try:
            required_columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
            if not all(col in data.columns for col in required_columns):
                logger.error(f"Missing required columns in data for {symbol}")
                return False
            
            # Ensure timestamp is datetime
            data['timestamp'] = pd.to_datetime(data['timestamp'])
            data = data.sort_values('timestamp').reset_index(drop=True)
            
            # Store data
            if not hasattr(self, 'historical_data'):
                self.historical_data = {}
            self.historical_data[symbol] = data
            
            logger.info(f"Loaded {len(data)} data points for {symbol}")
            return True
            
        except Exception as e:
            logger.exception(f"Error loading historical data for {symbol}: {e}")
            return False
    
    def load_benchmark_data(self, data: pd.DataFrame) -> bool:
        """Load benchmark data for comparison"""
        try:
            required_columns = ['timestamp', 'close']
            if not all(col in data.columns for col in required_columns):
                logger.error("Missing required columns in benchmark data")
                return False
            
            data['timestamp'] = pd.to_datetime(data['timestamp'])
            self.benchmark_data = data.sort_values('timestamp').reset_index(drop=True)
            
            logger.info(f"Loaded {len(data)} benchmark data points")
            return True
            
        except Exception as e:
            logger.exception(f"Error loading benchmark data: {e}")
            return False
    
    def place_order(self, timestamp: datetime, symbol: str, side: OrderSide, 
                   quantity: int, order_type: OrderType = OrderType.MARKET,
                   price: Optional[float] = None, stop_price: Optional[float] = None) -> str:
        """Place an order in the backtest"""
        try:
            order_id = f"{symbol}_{timestamp.strftime('%Y%m%d_%H%M%S')}_{len(self.orders)}"
            
            order = BacktestOrder(
                timestamp=timestamp,
                symbol=symbol,
                side=side,
                order_type=order_type,
                quantity=quantity,
                price=price,
                stop_price=stop_price
            )
            
            self.orders.append(order)
            logger.debug(f"Order placed: {order_id} - {side.value} {quantity} {symbol}")
            return order_id
            
        except Exception as e:
            logger.exception(f"Error placing order: {e}")
            return ""
    
    def _execute_order(self, order: BacktestOrder, current_price: float, 
                      high_price: float, low_price: float) -> bool:
        """Execute an order with realistic market simulation"""
        try:
            if order.status != "pending":
                return False
            
            # Determine execution price based on order type
            if order.order_type == OrderType.MARKET:
                if order.side == OrderSide.BUY:
                    execution_price = high_price * (1 + self.slippage_rate)
                else:
                    execution_price = low_price * (1 - self.slippage_rate)
            elif order.order_type == OrderType.LIMIT:
                if order.side == OrderSide.BUY and current_price <= order.price:
                    execution_price = min(order.price, high_price)
                elif order.side == OrderSide.SELL and current_price >= order.price:
                    execution_price = max(order.price, low_price)
                else:
                    return False  # Order not executable
            else:
                return False  # Unsupported order type
            
            # Check if we have enough capital/position
            if order.side == OrderSide.BUY:
                required_capital = execution_price * order.quantity
                if required_capital > self.current_capital:
                    logger.warning(f"Insufficient capital for order: {required_capital} > {self.current_capital}")
                    return False
            
            elif order.side == OrderSide.SELL:
                if order.symbol not in self.positions or self.positions[order.symbol].quantity < order.quantity:
                    logger.warning(f"Insufficient position for sell order: {order.quantity}")
                    return False
            
            # Execute the order
            order.filled_price = execution_price
            order.filled_quantity = order.quantity
            order.status = "filled"
            
            # Calculate commission
            order.commission = execution_price * order.quantity * self.commission_rate
            
            # Update capital and positions
            if order.side == OrderSide.BUY:
                self.current_capital -= (execution_price * order.quantity + order.commission)
                self._update_position(order.symbol, order.quantity, execution_price)
            else:
                self.current_capital += (execution_price * order.quantity - order.commission)
                self._update_position(order.symbol, -order.quantity, execution_price)
            
            logger.debug(f"Order executed: {order.symbol} {order.side.value} {order.quantity} @ {execution_price}")
            return True
            
        except Exception as e:
            logger.exception(f"Error executing order: {e}")
            return False
    
    def _update_position(self, symbol: str, quantity_change: int, price: float):
        """Update position after order execution"""
        try:
            if symbol not in self.positions:
                self.positions[symbol] = BacktestPosition(
                    symbol=symbol,
                    quantity=0,
                    avg_price=0,
                    unrealized_pnl=0,
                    realized_pnl=0,
                    market_value=0
                )
            
            position = self.positions[symbol]
            
            if quantity_change > 0:  # Buying
                if position.quantity >= 0:  # Adding to long position or starting new
                    total_cost = (position.quantity * position.avg_price) + (quantity_change * price)
                    position.quantity += quantity_change
                    position.avg_price = total_cost / position.quantity if position.quantity > 0 else 0
                else:  # Covering short position
                    if abs(position.quantity) >= quantity_change:
                        # Partial cover
                        realized_pnl = (position.avg_price - price) * quantity_change
                        position.realized_pnl += realized_pnl
                        position.quantity += quantity_change
                    else:
                        # Full cover + new long position
                        realized_pnl = (position.avg_price - price) * abs(position.quantity)
                        position.realized_pnl += realized_pnl
                        remaining_quantity = quantity_change - abs(position.quantity)
                        position.quantity = remaining_quantity
                        position.avg_price = price
            
            else:  # Selling
                quantity_change = abs(quantity_change)
                if position.quantity > 0:  # Reducing long position
                    if position.quantity >= quantity_change:
                        # Partial sell
                        realized_pnl = (price - position.avg_price) * quantity_change
                        position.realized_pnl += realized_pnl
                        position.quantity -= quantity_change
                    else:
                        # Full sell + new short position
                        realized_pnl = (price - position.avg_price) * position.quantity
                        position.realized_pnl += realized_pnl
                        remaining_quantity = quantity_change - position.quantity
                        position.quantity = -remaining_quantity
                        position.avg_price = price
                else:  # Adding to short position
                    total_cost = (abs(position.quantity) * position.avg_price) + (quantity_change * price)
                    position.quantity -= quantity_change
                    position.avg_price = total_cost / abs(position.quantity) if position.quantity != 0 else 0
            
            # Update market value and unrealized P&L
            if position.quantity != 0:
                position.market_value = position.quantity * price
                if position.quantity > 0:
                    position.unrealized_pnl = (price - position.avg_price) * position.quantity
                else:
                    position.unrealized_pnl = (position.avg_price - price) * abs(position.quantity)
            else:
                position.market_value = 0
                position.unrealized_pnl = 0
            
        except Exception as e:
            logger.exception(f"Error updating position for {symbol}: {e}")
    
    def _update_portfolio_value(self, timestamp: datetime, prices: Dict[str, float]):
        """Update portfolio value and record equity curve"""
        try:
            total_market_value = 0
            total_unrealized_pnl = 0
            total_realized_pnl = 0
            
            for symbol, position in self.positions.items():
                if symbol in prices:
                    current_price = prices[symbol]
                    position.market_value = position.quantity * current_price
                    
                    if position.quantity > 0:
                        position.unrealized_pnl = (current_price - position.avg_price) * position.quantity
                    elif position.quantity < 0:
                        position.unrealized_pnl = (position.avg_price - current_price) * abs(position.quantity)
                    
                    total_market_value += position.market_value
                    total_unrealized_pnl += position.unrealized_pnl
                    total_realized_pnl += position.realized_pnl
            
            portfolio_value = self.current_capital + total_market_value
            total_pnl = total_realized_pnl + total_unrealized_pnl
            
            # Record equity curve
            self.equity_curve.append({
                "timestamp": timestamp,
                "portfolio_value": portfolio_value,
                "cash": self.current_capital,
                "market_value": total_market_value,
                "realized_pnl": total_realized_pnl,
                "unrealized_pnl": total_unrealized_pnl,
                "total_pnl": total_pnl
            })
            
            # Record positions history
            positions_snapshot = {}
            for symbol, position in self.positions.items():
                if position.quantity != 0:
                    positions_snapshot[symbol] = {
                        "quantity": position.quantity,
                        "avg_price": position.avg_price,
                        "market_value": position.market_value,
                        "unrealized_pnl": position.unrealized_pnl,
                        "realized_pnl": position.realized_pnl
                    }
            
            self.positions_history.append({
                "timestamp": timestamp,
                "positions": positions_snapshot
            })
            
            # Calculate daily return
            if len(self.equity_curve) > 1:
                prev_value = self.equity_curve[-2]["portfolio_value"]
                daily_return = (portfolio_value - prev_value) / prev_value if prev_value > 0 else 0
                self.daily_returns.append(daily_return)
            
        except Exception as e:
            logger.exception(f"Error updating portfolio value: {e}")
    
    def run_backtest(self, strategy_func, start_date: datetime, end_date: datetime) -> BacktestResult:
        """Run the backtest with a strategy function"""
        try:
            logger.info(f"Starting backtest from {start_date} to {end_date}")
            
            # Reset state
            self.current_capital = self.initial_capital
            self.positions = {}
            self.orders = []
            self.equity_curve = []
            self.positions_history = []
            self.daily_returns = []
            self.trade_returns = []
            self.winning_trades = []
            self.losing_trades = []
            
            # Get all unique timestamps from all symbols
            all_timestamps = set()
            for symbol, data in self.historical_data.items():
                all_timestamps.update(data['timestamp'].tolist())
            
            # Filter timestamps by date range
            timestamps = sorted([ts for ts in all_timestamps if start_date <= ts <= end_date])
            
            logger.info(f"Processing {len(timestamps)} timestamps")
            
            # Process each timestamp
            for i, timestamp in enumerate(timestamps):
                # Get current prices for all symbols
                current_prices = {}
                price_data = {}
                
                for symbol, data in self.historical_data.items():
                    symbol_data = data[data['timestamp'] == timestamp]
                    if not symbol_data.empty:
                        row = symbol_data.iloc[0]
                        current_prices[symbol] = row['close']
                        price_data[symbol] = {
                            'open': row['open'],
                            'high': row['high'],
                            'low': row['low'],
                            'close': row['close'],
                            'volume': row['volume']
                        }
                
                # Execute pending orders
                for order in self.orders:
                    if (order.status == "pending" and 
                        order.symbol in price_data and
                        order.timestamp <= timestamp):
                        
                        price_info = price_data[order.symbol]
                        self._execute_order(
                            order, 
                            price_info['close'],
                            price_info['high'],
                            price_info['low']
                        )
                
                # Update portfolio value
                self._update_portfolio_value(timestamp, current_prices)
                
                # Call strategy function
                try:
                    strategy_func(timestamp, price_data, self)
                except Exception as e:
                    logger.warning(f"Strategy function error at {timestamp}: {e}")
                
                # Progress logging
                if i % 1000 == 0:
                    logger.info(f"Processed {i}/{len(timestamps)} timestamps")
            
            # Calculate final metrics
            metrics = self._calculate_metrics(start_date, end_date)
            
            # Create result
            result = BacktestResult(
                start_date=start_date,
                end_date=end_date,
                initial_capital=self.initial_capital,
                final_capital=self.equity_curve[-1]["portfolio_value"] if self.equity_curve else self.initial_capital,
                metrics=metrics,
                trades=[order for order in self.orders if order.status == "filled"],
                equity_curve=self.equity_curve,
                positions_history=self.positions_history,
                monthly_returns=self._calculate_monthly_returns()
            )
            
            logger.info(f"Backtest completed. Final capital: {result.final_capital:.2f}")
            return result
            
        except Exception as e:
            logger.exception(f"Error running backtest: {e}")
            raise
    
    def _calculate_metrics(self, start_date: datetime, end_date: datetime) -> BacktestMetrics:
        """Calculate comprehensive backtest metrics"""
        try:
            if not self.equity_curve:
                return BacktestMetrics(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
            
            # Basic returns
            initial_value = self.equity_curve[0]["portfolio_value"]
            final_value = self.equity_curve[-1]["portfolio_value"]
            total_return = (final_value - initial_value) / initial_value
            
            # Annualized return
            days = (end_date - start_date).days
            years = days / 365.25
            annualized_return = (final_value / initial_value) ** (1 / years) - 1 if years > 0 else 0
            
            # Volatility
            volatility = np.std(self.daily_returns) * np.sqrt(252) if self.daily_returns else 0
            
            # Sharpe ratio
            risk_free_rate = 0.05  # 5% risk-free rate
            excess_return = annualized_return - risk_free_rate
            sharpe_ratio = excess_return / volatility if volatility > 0 else 0
            
            # Max drawdown
            max_drawdown = self._calculate_max_drawdown()
            
            # Trade statistics
            filled_trades = [order for order in self.orders if order.status == "filled"]
            total_trades = len(filled_trades)
            
            # Calculate trade returns
            trade_returns = []
            for i in range(0, len(filled_trades), 2):
                if i + 1 < len(filled_trades):
                    buy_order = filled_trades[i]
                    sell_order = filled_trades[i + 1]
                    if buy_order.side == OrderSide.BUY and sell_order.side == OrderSide.SELL:
                        trade_return = (sell_order.filled_price - buy_order.filled_price) / buy_order.filled_price
                        trade_returns.append(trade_return)
            
            self.trade_returns = trade_returns
            self.winning_trades = [r for r in trade_returns if r > 0]
            self.losing_trades = [r for r in trade_returns if r < 0]
            
            # Win rate
            winning_trades_count = len(self.winning_trades)
            losing_trades_count = len(self.losing_trades)
            win_rate = winning_trades_count / total_trades if total_trades > 0 else 0
            
            # Profit factor
            gross_profit = sum(self.winning_trades) if self.winning_trades else 0
            gross_loss = abs(sum(self.losing_trades)) if self.losing_trades else 0
            profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')
            
            # Average win/loss
            avg_win = np.mean(self.winning_trades) if self.winning_trades else 0
            avg_loss = np.mean(self.losing_trades) if self.losing_trades else 0
            
            # Largest win/loss
            largest_win = max(self.winning_trades) if self.winning_trades else 0
            largest_loss = min(self.losing_trades) if self.losing_trades else 0
            
            # Calmar ratio
            calmar_ratio = annualized_return / max_drawdown if max_drawdown > 0 else 0
            
            # Sortino ratio
            downside_returns = [r for r in self.daily_returns if r < 0]
            downside_volatility = np.std(downside_returns) * np.sqrt(252) if downside_returns else 0
            sortino_ratio = excess_return / downside_volatility if downside_volatility > 0 else 0
            
            # Value at Risk (95%)
            var_95 = np.percentile(self.daily_returns, 5) if self.daily_returns else 0
            
            # Conditional Value at Risk (95%)
            cvar_95 = np.mean([r for r in self.daily_returns if r <= var_95]) if self.daily_returns else 0
            
            return BacktestMetrics(
                total_return=total_return,
                annualized_return=annualized_return,
                volatility=volatility,
                sharpe_ratio=sharpe_ratio,
                max_drawdown=max_drawdown,
                win_rate=win_rate,
                profit_factor=profit_factor,
                total_trades=total_trades,
                winning_trades=winning_trades_count,
                losing_trades=losing_trades_count,
                avg_win=avg_win,
                avg_loss=avg_loss,
                largest_win=largest_win,
                largest_loss=largest_loss,
                calmar_ratio=calmar_ratio,
                sortino_ratio=sortino_ratio,
                var_95=var_95,
                cvar_95=cvar_95
            )
            
        except Exception as e:
            logger.exception(f"Error calculating metrics: {e}")
            return BacktestMetrics(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    
    def _calculate_max_drawdown(self) -> float:
        """Calculate maximum drawdown"""
        if not self.equity_curve:
            return 0.0
        
        peak = self.equity_curve[0]["portfolio_value"]
        max_dd = 0.0
        
        for point in self.equity_curve:
            if point["portfolio_value"] > peak:
                peak = point["portfolio_value"]
            drawdown = (peak - point["portfolio_value"]) / peak if peak > 0 else 0
            max_dd = max(max_dd, drawdown)
        
        return max_dd
    
    def _calculate_monthly_returns(self) -> List[Dict[str, Any]]:
        """Calculate monthly returns"""
        if not self.equity_curve:
            return []
        
        monthly_data = {}
        
        for point in self.equity_curve:
            month_key = point["timestamp"].strftime("%Y-%m")
            if month_key not in monthly_data:
                monthly_data[month_key] = []
            monthly_data[month_key].append(point["portfolio_value"])
        
        monthly_returns = []
        for month, values in monthly_data.items():
            if len(values) > 1:
                monthly_return = (values[-1] - values[0]) / values[0]
                monthly_returns.append({
                    "month": month,
                    "return": monthly_return,
                    "start_value": values[0],
                    "end_value": values[-1]
                })
        
        return monthly_returns
