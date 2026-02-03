"""Portfolio Service internal API client."""
import logging
from typing import Optional
import httpx
from app.config import settings

logger = logging.getLogger("order.portfolio_client")


class PortfolioClientError(Exception):
    """Raised when portfolio service call fails."""
    pass


class InsufficientFundsError(PortfolioClientError):
    """Raised when portfolio service returns insufficient funds."""
    pass


class InsufficientSharesError(PortfolioClientError):
    """Raised when portfolio service returns insufficient shares."""
    pass


def apply_execution(
    execution_id: str,
    order_id: str,
    user_id: str,
    ticker: str,
    side: str,
    fill_qty: int,
    fill_price_cents: int,
    fee_cents: int,
    ts: str,
) -> dict:
    """
    Call Portfolio Service internal apply-execution endpoint.
    
    Args:
        execution_id: Unique execution ID (idempotency key)
        order_id: Order ID
        user_id: User ID
        ticker: Ticker symbol
        side: "BUY" or "SELL"
        fill_qty: Quantity filled
        fill_price_cents: Fill price in cents
        fee_cents: Fee in cents
        ts: ISO timestamp string
        
    Returns:
        Response dict from portfolio service
        
    Raises:
        InsufficientFundsError: If portfolio returns insufficient funds
        InsufficientSharesError: If portfolio returns insufficient shares
        PortfolioClientError: For other errors
    """
    url = f"{settings.PORTFOLIO_INTERNAL_BASE.rstrip('/')}/internal/apply-execution"
    
    payload = {
        "execution_id": execution_id,
        "order_id": order_id,
        "user_id": user_id,
        "ticker": ticker,
        "side": side,
        "fill_qty": fill_qty,
        "fill_price_cents": fill_price_cents,
        "fee_cents": fee_cents,
        "ts": ts,
    }
    
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                url,
                json=payload,
                headers={"X-Internal-Api-Key": settings.PORTFOLIO_INTERNAL_KEY},
            )
        
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 409:
            # Conflict - check for insufficient funds/shares
            try:
                error_detail = response.json().get("detail", {})
                error_code = error_detail.get("error", "")
                if "INSUFFICIENT_FUNDS" in error_code:
                    raise InsufficientFundsError("Insufficient funds")
                elif "INSUFFICIENT_SHARES" in error_code:
                    raise InsufficientSharesError("Insufficient shares")
            except (ValueError, AttributeError):
                pass
            raise PortfolioClientError(f"Portfolio service conflict: {response.text}")
        else:
            raise PortfolioClientError(f"Portfolio service error: {response.status_code} {response.text}")
    except (InsufficientFundsError, InsufficientSharesError):
        raise
    except httpx.RequestError as e:
        raise PortfolioClientError(f"Portfolio service request failed: {str(e)}")
    except Exception as e:
        raise PortfolioClientError(f"Unexpected error calling portfolio service: {str(e)}")

