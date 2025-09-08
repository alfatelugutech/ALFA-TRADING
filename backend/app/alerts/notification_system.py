"""
Advanced Alerts and Notifications System
"""

import logging
import smtplib
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, asdict
from enum import Enum
import asyncio
import websockets
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)


class AlertType(Enum):
    PRICE_ABOVE = "price_above"
    PRICE_BELOW = "price_below"
    VOLUME_SPIKE = "volume_spike"
    RSI_OVERSOLD = "rsi_oversold"
    RSI_OVERBOUGHT = "rsi_overbought"
    MOVING_AVERAGE_CROSS = "ma_cross"
    BOLLINGER_BREAKOUT = "bollinger_breakout"
    MACD_SIGNAL = "macd_signal"
    PORTFOLIO_LOSS = "portfolio_loss"
    PORTFOLIO_GAIN = "portfolio_gain"
    RISK_LIMIT_BREACH = "risk_limit_breach"
    NEWS_ALERT = "news_alert"
    EARNINGS_ALERT = "earnings_alert"


class NotificationChannel(Enum):
    EMAIL = "email"
    SMS = "sms"
    PUSH = "push"
    WEBHOOK = "webhook"
    WEBSOCKET = "websocket"
    DASHBOARD = "dashboard"


class AlertPriority(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class Alert:
    id: str
    symbol: str
    alert_type: AlertType
    condition: Dict[str, Any]
    priority: AlertPriority
    channels: List[NotificationChannel]
    enabled: bool = True
    created_at: datetime = None
    last_triggered: Optional[datetime] = None
    trigger_count: int = 0
    cooldown_minutes: int = 15  # Prevent spam
    user_id: Optional[str] = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now()


@dataclass
class AlertTrigger:
    alert_id: str
    symbol: str
    message: str
    data: Dict[str, Any]
    timestamp: datetime
    priority: AlertPriority


class NotificationService:
    """Service for sending notifications through various channels"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.email_config = config.get("email", {})
        self.sms_config = config.get("sms", {})
        self.webhook_config = config.get("webhook", {})
        self.websocket_clients: List[websockets.WebSocketServerProtocol] = []
    
    async def send_email(self, to: str, subject: str, body: str, html_body: Optional[str] = None):
        """Send email notification"""
        try:
            if not self.email_config.get("enabled", False):
                return False
            
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = self.email_config.get("from_email")
            msg["To"] = to
            
            # Add text part
            text_part = MIMEText(body, "plain")
            msg.attach(text_part)
            
            # Add HTML part if provided
            if html_body:
                html_part = MIMEText(html_body, "html")
                msg.attach(html_part)
            
            # Send email
            with smtplib.SMTP(self.email_config.get("smtp_host"), self.email_config.get("smtp_port")) as server:
                server.starttls()
                server.login(self.email_config.get("username"), self.email_config.get("password"))
                server.send_message(msg)
            
            logger.info(f"Email sent to {to}: {subject}")
            return True
            
        except Exception as e:
            logger.exception(f"Failed to send email to {to}: {e}")
            return False
    
    async def send_sms(self, to: str, message: str):
        """Send SMS notification"""
        try:
            if not self.sms_config.get("enabled", False):
                return False
            
            # Implement SMS sending logic (Twilio, AWS SNS, etc.)
            # This is a placeholder implementation
            logger.info(f"SMS sent to {to}: {message}")
            return True
            
        except Exception as e:
            logger.exception(f"Failed to send SMS to {to}: {e}")
            return False
    
    async def send_webhook(self, url: str, data: Dict[str, Any]):
        """Send webhook notification"""
        try:
            if not self.webhook_config.get("enabled", False):
                return False
            
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=data) as response:
                    if response.status == 200:
                        logger.info(f"Webhook sent to {url}")
                        return True
                    else:
                        logger.warning(f"Webhook failed: {response.status}")
                        return False
            
        except Exception as e:
            logger.exception(f"Failed to send webhook to {url}: {e}")
            return False
    
    async def send_websocket(self, data: Dict[str, Any]):
        """Send notification to all connected WebSocket clients"""
        try:
            if not self.websocket_clients:
                return False
            
            message = json.dumps(data)
            disconnected = []
            
            for client in self.websocket_clients:
                try:
                    await client.send(message)
                except websockets.exceptions.ConnectionClosed:
                    disconnected.append(client)
            
            # Remove disconnected clients
            for client in disconnected:
                self.websocket_clients.remove(client)
            
            logger.info(f"WebSocket notification sent to {len(self.websocket_clients)} clients")
            return True
            
        except Exception as e:
            logger.exception(f"Failed to send WebSocket notification: {e}")
            return False
    
    def add_websocket_client(self, client: websockets.WebSocketServerProtocol):
        """Add a new WebSocket client"""
        self.websocket_clients.append(client)
        logger.info(f"WebSocket client added. Total clients: {len(self.websocket_clients)}")
    
    def remove_websocket_client(self, client: websockets.WebSocketServerProtocol):
        """Remove a WebSocket client"""
        if client in self.websocket_clients:
            self.websocket_clients.remove(client)
            logger.info(f"WebSocket client removed. Total clients: {len(self.websocket_clients)}")


class AdvancedAlertManager:
    """Advanced alert management system with multiple notification channels"""
    
    def __init__(self, notification_service: NotificationService):
        self.notification_service = notification_service
        self.alerts: Dict[str, Alert] = {}
        self.trigger_history: List[AlertTrigger] = []
        self.price_data: Dict[str, List[Dict]] = {}
        self.portfolio_data: Dict[str, Any] = {}
        self.running = False
        
    def add_alert(self, alert: Alert) -> bool:
        """Add a new alert"""
        try:
            self.alerts[alert.id] = alert
            logger.info(f"Alert added: {alert.id} for {alert.symbol}")
            return True
        except Exception as e:
            logger.exception(f"Failed to add alert {alert.id}: {e}")
            return False
    
    def remove_alert(self, alert_id: str) -> bool:
        """Remove an alert"""
        try:
            if alert_id in self.alerts:
                del self.alerts[alert_id]
                logger.info(f"Alert removed: {alert_id}")
                return True
            return False
        except Exception as e:
            logger.exception(f"Failed to remove alert {alert_id}: {e}")
            return False
    
    def update_alert(self, alert_id: str, updates: Dict[str, Any]) -> bool:
        """Update an existing alert"""
        try:
            if alert_id in self.alerts:
                alert = self.alerts[alert_id]
                for key, value in updates.items():
                    if hasattr(alert, key):
                        setattr(alert, key, value)
                logger.info(f"Alert updated: {alert_id}")
                return True
            return False
        except Exception as e:
            logger.exception(f"Failed to update alert {alert_id}: {e}")
            return False
    
    def update_price_data(self, symbol: str, data: Dict[str, Any]):
        """Update price data for a symbol"""
        if symbol not in self.price_data:
            self.price_data[symbol] = []
        
        self.price_data[symbol].append({
            **data,
            "timestamp": datetime.now().isoformat()
        })
        
        # Keep only last 1000 data points
        if len(self.price_data[symbol]) > 1000:
            self.price_data[symbol] = self.price_data[symbol][-1000:]
    
    def update_portfolio_data(self, data: Dict[str, Any]):
        """Update portfolio data"""
        self.portfolio_data = data
    
    async def check_alerts(self):
        """Check all alerts and trigger notifications"""
        try:
            current_time = datetime.now()
            
            for alert_id, alert in self.alerts.items():
                if not alert.enabled:
                    continue
                
                # Check cooldown
                if (alert.last_triggered and 
                    (current_time - alert.last_triggered).total_seconds() < (alert.cooldown_minutes * 60)):
                    continue
                
                # Check if alert should trigger
                should_trigger, message, data = await self._evaluate_alert(alert)
                
                if should_trigger:
                    await self._trigger_alert(alert, message, data)
                    
        except Exception as e:
            logger.exception(f"Error checking alerts: {e}")
    
    async def _evaluate_alert(self, alert: Alert) -> tuple[bool, str, Dict[str, Any]]:
        """Evaluate if an alert should trigger"""
        try:
            symbol = alert.symbol
            alert_type = alert.alert_type
            condition = alert.condition
            
            if symbol not in self.price_data or not self.price_data[symbol]:
                return False, "", {}
            
            latest_data = self.price_data[symbol][-1]
            
            # Price-based alerts
            if alert_type == AlertType.PRICE_ABOVE:
                target_price = condition.get("price", 0)
                current_price = latest_data.get("close", 0)
                if current_price >= target_price:
                    return True, f"{symbol} price {current_price} is above {target_price}", {
                        "current_price": current_price,
                        "target_price": target_price
                    }
            
            elif alert_type == AlertType.PRICE_BELOW:
                target_price = condition.get("price", 0)
                current_price = latest_data.get("close", 0)
                if current_price <= target_price:
                    return True, f"{symbol} price {current_price} is below {target_price}", {
                        "current_price": current_price,
                        "target_price": target_price
                    }
            
            # Volume-based alerts
            elif alert_type == AlertType.VOLUME_SPIKE:
                volume_threshold = condition.get("volume_multiplier", 2.0)
                current_volume = latest_data.get("volume", 0)
                
                if len(self.price_data[symbol]) >= 20:
                    avg_volume = sum(d.get("volume", 0) for d in self.price_data[symbol][-20:]) / 20
                    if current_volume >= (avg_volume * volume_threshold):
                        return True, f"{symbol} volume spike: {current_volume} vs avg {avg_volume:.0f}", {
                            "current_volume": current_volume,
                            "average_volume": avg_volume,
                            "multiplier": volume_threshold
                        }
            
            # Technical indicator alerts
            elif alert_type == AlertType.RSI_OVERSOLD:
                rsi_threshold = condition.get("rsi_threshold", 30)
                rsi_value = latest_data.get("rsi", 50)
                if rsi_value <= rsi_threshold:
                    return True, f"{symbol} RSI oversold: {rsi_value:.1f}", {
                        "rsi_value": rsi_value,
                        "threshold": rsi_threshold
                    }
            
            elif alert_type == AlertType.RSI_OVERBOUGHT:
                rsi_threshold = condition.get("rsi_threshold", 70)
                rsi_value = latest_data.get("rsi", 50)
                if rsi_value >= rsi_threshold:
                    return True, f"{symbol} RSI overbought: {rsi_value:.1f}", {
                        "rsi_value": rsi_value,
                        "threshold": rsi_threshold
                    }
            
            # Portfolio-based alerts
            elif alert_type == AlertType.PORTFOLIO_LOSS:
                loss_threshold = condition.get("loss_percentage", 5.0)
                portfolio_value = self.portfolio_data.get("portfolio_value", 0)
                initial_capital = self.portfolio_data.get("initial_capital", 100000)
                
                if portfolio_value > 0:
                    loss_pct = ((initial_capital - portfolio_value) / initial_capital) * 100
                    if loss_pct >= loss_threshold:
                        return True, f"Portfolio loss: {loss_pct:.1f}%", {
                            "loss_percentage": loss_pct,
                            "portfolio_value": portfolio_value,
                            "initial_capital": initial_capital
                        }
            
            elif alert_type == AlertType.PORTFOLIO_GAIN:
                gain_threshold = condition.get("gain_percentage", 10.0)
                portfolio_value = self.portfolio_data.get("portfolio_value", 0)
                initial_capital = self.portfolio_data.get("initial_capital", 100000)
                
                if portfolio_value > 0:
                    gain_pct = ((portfolio_value - initial_capital) / initial_capital) * 100
                    if gain_pct >= gain_threshold:
                        return True, f"Portfolio gain: {gain_pct:.1f}%", {
                            "gain_percentage": gain_pct,
                            "portfolio_value": portfolio_value,
                            "initial_capital": initial_capital
                        }
            
            # Risk-based alerts
            elif alert_type == AlertType.RISK_LIMIT_BREACH:
                risk_metric = condition.get("risk_metric", "leverage")
                threshold = condition.get("threshold", 2.0)
                current_value = self.portfolio_data.get(risk_metric, 0)
                
                if current_value >= threshold:
                    return True, f"Risk limit breached: {risk_metric} = {current_value:.2f}", {
                        "risk_metric": risk_metric,
                        "current_value": current_value,
                        "threshold": threshold
                    }
            
            return False, "", {}
            
        except Exception as e:
            logger.exception(f"Error evaluating alert {alert.id}: {e}")
            return False, "", {}
    
    async def _trigger_alert(self, alert: Alert, message: str, data: Dict[str, Any]):
        """Trigger an alert and send notifications"""
        try:
            # Create trigger record
            trigger = AlertTrigger(
                alert_id=alert.id,
                symbol=alert.symbol,
                message=message,
                data=data,
                timestamp=datetime.now(),
                priority=alert.priority
            )
            
            self.trigger_history.append(trigger)
            
            # Update alert
            alert.last_triggered = datetime.now()
            alert.trigger_count += 1
            
            # Send notifications through configured channels
            notification_data = {
                "alert_id": alert.id,
                "symbol": alert.symbol,
                "message": message,
                "priority": alert.priority.value,
                "timestamp": trigger.timestamp.isoformat(),
                "data": data
            }
            
            # Send to all configured channels
            for channel in alert.channels:
                if channel == NotificationChannel.EMAIL:
                    await self._send_email_notification(alert, message, data)
                elif channel == NotificationChannel.SMS:
                    await self._send_sms_notification(alert, message)
                elif channel == NotificationChannel.WEBHOOK:
                    await self._send_webhook_notification(alert, notification_data)
                elif channel == NotificationChannel.WEBSOCKET:
                    await self.notification_service.send_websocket(notification_data)
            
            logger.info(f"Alert triggered: {alert.id} - {message}")
            
        except Exception as e:
            logger.exception(f"Error triggering alert {alert.id}: {e}")
    
    async def _send_email_notification(self, alert: Alert, message: str, data: Dict[str, Any]):
        """Send email notification for alert"""
        try:
            subject = f"🚨 Trading Alert: {alert.symbol} - {alert.priority.value.upper()}"
            
            body = f"""
Trading Alert Triggered

Symbol: {alert.symbol}
Alert Type: {alert.alert_type.value}
Priority: {alert.priority.value.upper()}
Message: {message}
Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

Additional Data:
{json.dumps(data, indent=2)}

---
This is an automated alert from your trading system.
"""
            
            html_body = f"""
<html>
<body>
    <h2>🚨 Trading Alert: {alert.symbol}</h2>
    <p><strong>Priority:</strong> {alert.priority.value.upper()}</p>
    <p><strong>Message:</strong> {message}</p>
    <p><strong>Time:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
    
    <h3>Additional Data:</h3>
    <pre>{json.dumps(data, indent=2)}</pre>
    
    <hr>
    <p><em>This is an automated alert from your trading system.</em></p>
</body>
</html>
"""
            
            # Get user email from alert or use default
            user_email = alert.user_id or "user@example.com"  # Replace with actual user email lookup
            
            await self.notification_service.send_email(
                to=user_email,
                subject=subject,
                body=body,
                html_body=html_body
            )
            
        except Exception as e:
            logger.exception(f"Failed to send email notification for alert {alert.id}: {e}")
    
    async def _send_sms_notification(self, alert: Alert, message: str):
        """Send SMS notification for alert"""
        try:
            sms_message = f"ALERT {alert.symbol}: {message}"
            user_phone = "+1234567890"  # Replace with actual user phone lookup
            
            await self.notification_service.send_sms(
                to=user_phone,
                message=sms_message
            )
            
        except Exception as e:
            logger.exception(f"Failed to send SMS notification for alert {alert.id}: {e}")
    
    async def _send_webhook_notification(self, alert: Alert, data: Dict[str, Any]):
        """Send webhook notification for alert"""
        try:
            webhook_url = "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"  # Replace with actual webhook
            
            await self.notification_service.send_webhook(
                url=webhook_url,
                data=data
            )
            
        except Exception as e:
            logger.exception(f"Failed to send webhook notification for alert {alert.id}: {e}")
    
    def get_alerts(self, user_id: Optional[str] = None) -> List[Alert]:
        """Get all alerts, optionally filtered by user"""
        if user_id:
            return [alert for alert in self.alerts.values() if alert.user_id == user_id]
        return list(self.alerts.values())
    
    def get_trigger_history(self, limit: int = 100) -> List[AlertTrigger]:
        """Get recent alert trigger history"""
        return self.trigger_history[-limit:]
    
    async def start_monitoring(self):
        """Start the alert monitoring loop"""
        self.running = True
        logger.info("Alert monitoring started")
        
        while self.running:
            try:
                await self.check_alerts()
                await asyncio.sleep(10)  # Check every 10 seconds
            except Exception as e:
                logger.exception(f"Error in alert monitoring loop: {e}")
                await asyncio.sleep(30)  # Wait longer on error
    
    def stop_monitoring(self):
        """Stop the alert monitoring loop"""
        self.running = False
        logger.info("Alert monitoring stopped")
