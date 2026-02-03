import { useState, useEffect, useMemo, useCallback } from 'react';
import { placeOrder, type OrderSide, type OrderType } from '../api/orders';
import { fetchSummary, fetchPositions, type AccountSummary, type Position } from '../api/portfolio';
import { getToken } from '../utils/token';
import { formatCentsToDollars, parseDollarsToCents } from '../utils/currency';
import './OrderTicket.css';

interface OrderTicketProps {
  ticker: string;
  currentPrice: number | null;
  onOrderPlaced: () => void;
}

export default function OrderTicket({ ticker, currentPrice, onOrderPlaced }: OrderTicketProps) {
  const [side, setSide] = useState<OrderSide>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [qty, setQty] = useState<string>('');
  const [limitPrice, setLimitPrice] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Portfolio data
  const [accountSummary, setAccountSummary] = useState<AccountSummary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);

  // Load portfolio data
  const loadPortfolio = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setAccountSummary(null);
      setPositions([]);
      return;
    }

    setLoadingPortfolio(true);
    try {
      const [summary, positionsResp] = await Promise.all([
        fetchSummary(token),
        fetchPositions(token),
      ]);
      setAccountSummary(summary);
      setPositions(positionsResp.positions);
    } catch (err) {
      console.error('Failed to load portfolio:', err);
      // Don't show error to user, just log it
    } finally {
      setLoadingPortfolio(false);
    }
  }, []);

  useEffect(() => {
    loadPortfolio();
  }, [side, ticker, loadPortfolio]); // Reload when side or ticker changes

  // Get current position for this ticker
  const currentPosition = useMemo(() => {
    return positions.find(p => p.ticker.toUpperCase() === ticker.toUpperCase());
  }, [positions, ticker]);

  // Calculate max quantity user can trade
  const maxQuantity = useMemo(() => {
    if (!accountSummary) return 0;

    if (side === 'BUY') {
      // For BUY: max quantity based on available cash
      const availableCashCents = accountSummary.cash_available_cents;
      
      if (orderType === 'MARKET') {
        // For MARKET orders, use current price (or estimate)
        if (!currentPrice || currentPrice <= 0) return 0;
        const priceCents = Math.round(currentPrice * 100);
        // Estimate: qty * price <= available cash (leave some buffer)
        return Math.floor((availableCashCents * 0.99) / priceCents);
      } else {
        // For LIMIT orders, use limit price
        if (!limitPrice || parseFloat(limitPrice) <= 0) return 0;
        const priceCents = parseDollarsToCents(limitPrice);
        return Math.floor((availableCashCents * 0.99) / priceCents);
      }
    } else {
      // For SELL: max quantity is shares owned
      return currentPosition?.qty || 0;
    }
  }, [side, orderType, accountSummary, currentPrice, limitPrice, currentPosition]);

  // Calculate estimated cost for BUY orders
  const estimatedCost = useMemo(() => {
    if (side !== 'BUY' || !qty) return null;
    const qtyNum = parseInt(qty);
    if (isNaN(qtyNum) || qtyNum <= 0) return null;

    let priceCents = 0;
    if (orderType === 'MARKET') {
      if (!currentPrice || currentPrice <= 0) return null;
      priceCents = Math.round(currentPrice * 100);
    } else {
      if (!limitPrice || parseFloat(limitPrice) <= 0) return null;
      priceCents = parseDollarsToCents(limitPrice);
    }

    return qtyNum * priceCents;
  }, [side, orderType, qty, currentPrice, limitPrice]);

  const handlePlaceOrder = async () => {
    const token = getToken();
    if (!token) {
      setMessage({ type: 'error', text: 'Please log in to place orders' });
      return;
    }

    const qtyNum = parseInt(qty);
    if (!qty || isNaN(qtyNum) || qtyNum <= 0) {
      setMessage({ type: 'error', text: 'Please enter a valid quantity' });
      return;
    }

    if (orderType === 'LIMIT' && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      setMessage({ type: 'error', text: 'Please enter a valid limit price' });
      return;
    }

    // Validate quantity against available funds/shares
    if (side === 'BUY') {
      if (!accountSummary) {
        setMessage({ type: 'error', text: 'Unable to verify available funds' });
        return;
      }

      const priceCents = orderType === 'MARKET' 
        ? (currentPrice ? Math.round(currentPrice * 100) : 0)
        : parseDollarsToCents(limitPrice);
      
      if (priceCents <= 0) {
        setMessage({ type: 'error', text: 'Invalid price for order' });
        return;
      }

      const totalCost = qtyNum * priceCents;
      if (totalCost > accountSummary.cash_available_cents) {
        setMessage({ 
          type: 'error', 
          text: `Insufficient funds. Available: ${formatCentsToDollars(accountSummary.cash_available_cents)}, Required: ${formatCentsToDollars(totalCost)}` 
        });
        return;
      }
    } else {
      // SELL
      const availableShares = currentPosition?.qty || 0;
      if (qtyNum > availableShares) {
        setMessage({ 
          type: 'error', 
          text: `Insufficient shares. You own ${availableShares} shares, trying to sell ${qtyNum}` 
        });
        return;
      }
    }

    setLoading(true);
    setMessage(null);

    try {
      const order = await placeOrder(token, {
        ticker: ticker.toUpperCase(),
        side,
        type: orderType,
        qty: qtyNum,
        limit_price_dollars: orderType === 'LIMIT' ? parseFloat(limitPrice) : undefined,
      });

      setMessage({ type: 'success', text: `Order placed: ${order.order_id.slice(0, 8)}...` });
      setQty('');
      setLimitPrice('');
      
      // Reload portfolio data to reflect changes
      await loadPortfolio();
      
      onOrderPlaced();
      
      // Clear success message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to place order';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const isAuthenticated = !!getToken();

  return (
    <div className="order-ticket">
      <h3 className="order-ticket-title">Place Order</h3>
      
      {!isAuthenticated && (
        <div className="order-ticket-auth-warning">
          Please log in to place orders
        </div>
      )}

      <div className="order-ticket-form">
        <div className="order-ticket-row">
          <label>
            Side
            <div className="order-ticket-button-group">
              <button
                type="button"
                className={`order-ticket-btn ${side === 'BUY' ? 'active buy' : ''}`}
                onClick={() => setSide('BUY')}
                disabled={!isAuthenticated}
              >
                BUY
              </button>
              <button
                type="button"
                className={`order-ticket-btn ${side === 'SELL' ? 'active sell' : ''}`}
                onClick={() => setSide('SELL')}
                disabled={!isAuthenticated}
              >
                SELL
              </button>
            </div>
          </label>
        </div>

        <div className="order-ticket-row">
          <label>
            Order Type
            <div className="order-ticket-button-group">
              <button
                type="button"
                className={`order-ticket-btn ${orderType === 'MARKET' ? 'active' : ''}`}
                onClick={() => setOrderType('MARKET')}
                disabled={!isAuthenticated}
              >
                MARKET
              </button>
              <button
                type="button"
                className={`order-ticket-btn ${orderType === 'LIMIT' ? 'active' : ''}`}
                onClick={() => setOrderType('LIMIT')}
                disabled={!isAuthenticated}
              >
                LIMIT
              </button>
            </div>
          </label>
        </div>

        <div className="order-ticket-row">
          <label>
            Quantity
            <div className="order-ticket-quantity-info">
              {side === 'BUY' && accountSummary && (
                <span className="order-ticket-hint">
                  Available: {formatCentsToDollars(accountSummary.cash_available_cents)}
                  {maxQuantity > 0 && ` • Max: ${maxQuantity} shares`}
                </span>
              )}
              {side === 'SELL' && (
                <span className="order-ticket-hint">
                  Owned: {currentPosition?.qty || 0} shares
                  {maxQuantity > 0 && ` • Max: ${maxQuantity} shares`}
                </span>
              )}
            </div>
            <input
              type="number"
              min="1"
              max={maxQuantity > 0 ? maxQuantity : undefined}
              value={qty}
              onChange={(e) => {
                const val = e.target.value;
                // Allow empty or valid numbers
                if (val === '' || /^\d+$/.test(val)) {
                  const numVal = val === '' ? 0 : parseInt(val);
                  // Enforce max quantity if set
                  if (maxQuantity > 0 && numVal > maxQuantity) {
                    setQty(maxQuantity.toString());
                    setMessage({ 
                      type: 'error', 
                      text: `Maximum quantity is ${maxQuantity} ${side === 'BUY' ? 'shares' : 'shares you own'}` 
                    });
                    setTimeout(() => setMessage(null), 3000);
                  } else {
                    setQty(val);
                  }
                }
              }}
              placeholder="0"
              disabled={!isAuthenticated || loading || loadingPortfolio}
            />
            {estimatedCost !== null && side === 'BUY' && (
              <span className="order-ticket-estimated-cost">
                Est. Cost: {formatCentsToDollars(estimatedCost)}
              </span>
            )}
          </label>
        </div>

        {orderType === 'LIMIT' && (
          <div className="order-ticket-row">
            <label>
              Limit Price ($)
              {currentPrice && (
                <span className="order-ticket-hint">
                  Current: {formatCentsToDollars(Math.round(currentPrice * 100))}
                </span>
              )}
              <input
                type="number"
                step="0.01"
                min="0"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder="0.00"
                disabled={!isAuthenticated || loading}
              />
            </label>
          </div>
        )}

        {message && (
          <div className={`order-ticket-message order-ticket-message-${message.type}`}>
            {message.text}
          </div>
        )}

        <button
          className="order-ticket-submit"
          onClick={handlePlaceOrder}
          disabled={!isAuthenticated || loading}
        >
          {loading ? 'Placing...' : 'Place Order'}
        </button>
      </div>
    </div>
  );
}

