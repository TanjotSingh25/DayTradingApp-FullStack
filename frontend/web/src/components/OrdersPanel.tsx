import { useState, useEffect, useCallback } from 'react';
import { listOrders, cancelOrder, getOrderFills, type Order, type OrderStatus, type Fill } from '../api/orders';
import { getToken } from '../utils/token';
import { formatCentsToDollars } from '../utils/currency';
import './OrdersPanel.css';

interface OrdersPanelProps {
  ticker: string;
  refreshTrigger: number;
}

export default function OrdersPanel({ ticker, refreshTrigger }: OrdersPanelProps) {
  const [activeTab, setActiveTab] = useState<'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED'>('OPEN');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [fills, setFills] = useState<Record<string, Fill[]>>({});
  const [loadingFills, setLoadingFills] = useState<Record<string, boolean>>({});

  const isAuthenticated = !!getToken();

  const loadOrders = useCallback(async () => {
    if (!isAuthenticated) {
      setOrders([]);
      return;
    }

    const token = getToken();
    if (!token) return;

    setLoading(true);
    try {
      const statusMap: Record<typeof activeTab, OrderStatus> = {
        OPEN: 'OPEN',
        FILLED: 'FILLED',
        CANCELLED: 'CANCELLED',
        REJECTED: 'REJECTED',
      };

      const response = await listOrders(token, {
        ticker: ticker.toUpperCase(),
        status: statusMap[activeTab],
        limit: 100,
      });
      setOrders(response.orders);
    } catch (err) {
      console.error('Failed to load orders:', err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, activeTab, ticker]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders, refreshTrigger]);

  // Poll for order status updates when viewing OPEN tab
  // This ensures filled orders move to the FILLED tab automatically
  useEffect(() => {
    if (!isAuthenticated || activeTab !== 'OPEN') return;

    const interval = setInterval(() => {
      loadOrders();
    }, 2000); // Poll every 2 seconds when on OPEN tab

    return () => clearInterval(interval);
  }, [isAuthenticated, activeTab, loadOrders]);

  const handleCancel = async (orderId: string) => {
    const token = getToken();
    if (!token) return;

    try {
      await cancelOrder(token, orderId);
      await loadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel order');
    }
  };

  const handleToggleFills = async (orderId: string) => {
    if (expandedOrder === orderId) {
      setExpandedOrder(null);
      return;
    }

    setExpandedOrder(orderId);
    
    if (fills[orderId]) {
      return; // Already loaded
    }

    const token = getToken();
    if (!token) return;

    setLoadingFills((prev) => ({ ...prev, [orderId]: true }));
    try {
      const response = await getOrderFills(token, orderId);
      setFills((prev) => ({ ...prev, [orderId]: response.fills }));
    } catch (err) {
      console.error('Failed to load fills:', err);
    } finally {
      setLoadingFills((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="orders-panel">
        <div className="orders-panel-auth-warning">
          Please log in to view orders
        </div>
      </div>
    );
  }

  return (
    <div className="orders-panel">
      <h3 className="orders-panel-title">Orders</h3>

      <div className="orders-panel-tabs">
        <button
          className={`orders-panel-tab ${activeTab === 'OPEN' ? 'active' : ''}`}
          onClick={() => setActiveTab('OPEN')}
        >
          Open ({orders.filter((o) => o.status === 'OPEN').length})
        </button>
        <button
          className={`orders-panel-tab ${activeTab === 'FILLED' ? 'active' : ''}`}
          onClick={() => setActiveTab('FILLED')}
        >
          Filled ({orders.filter((o) => o.status === 'FILLED').length})
        </button>
        <button
          className={`orders-panel-tab ${activeTab === 'CANCELLED' ? 'active' : ''}`}
          onClick={() => setActiveTab('CANCELLED')}
        >
          Cancelled ({orders.filter((o) => o.status === 'CANCELLED').length})
        </button>
        <button
          className={`orders-panel-tab ${activeTab === 'REJECTED' ? 'active' : ''}`}
          onClick={() => setActiveTab('REJECTED')}
        >
          Rejected ({orders.filter((o) => o.status === 'REJECTED').length})
        </button>
      </div>

      {loading ? (
        <div className="orders-panel-loading">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="orders-panel-empty">No {activeTab.toLowerCase()} orders</div>
      ) : (
        <div className="orders-panel-list">
          {orders.map((order) => (
            <div key={order.order_id} className="orders-panel-item">
              <div className="orders-panel-item-header">
                <div className="orders-panel-item-main">
                  <div className={`orders-panel-item-side ${order.side.toLowerCase()}`}>
                    {order.side} {order.type}
                  </div>
                  <div className="orders-panel-item-details">
                    <span>{order.qty} shares</span>
                    {order.limit_price_cents && (
                      <span>@ {formatCentsToDollars(order.limit_price_cents)}</span>
                    )}
                    {order.status === 'FILLED' && order.avg_fill_price_cents && (
                      <span className="orders-panel-item-filled">
                        Filled @ {formatCentsToDollars(order.avg_fill_price_cents)}
                      </span>
                    )}
                  </div>
                  <div className="orders-panel-item-time">
                    {new Date(order.created_at).toLocaleString()}
                  </div>
                  {order.reject_reason && (
                    <div className="orders-panel-item-reject-reason">
                      {order.reject_reason}
                    </div>
                  )}
                </div>
                <div className="orders-panel-item-actions">
                  {order.status === 'OPEN' && (
                    <button
                      className="orders-panel-cancel-btn"
                      onClick={() => handleCancel(order.order_id)}
                    >
                      Cancel
                    </button>
                  )}
                  {order.status === 'FILLED' && (
                    <button
                      className="orders-panel-fills-btn"
                      onClick={() => handleToggleFills(order.order_id)}
                    >
                      {expandedOrder === order.order_id ? 'Hide' : 'Show'} Fills
                    </button>
                  )}
                </div>
              </div>

              {expandedOrder === order.order_id && order.status === 'FILLED' && (
                <div className="orders-panel-fills">
                  {loadingFills[order.order_id] ? (
                    <div>Loading fills...</div>
                  ) : fills[order.order_id]?.length === 0 ? (
                    <div>No fills found</div>
                  ) : (
                    fills[order.order_id]?.map((fill) => (
                      <div key={fill.fill_id} className="orders-panel-fill">
                        <div>
                          {fill.fill_qty} @ {formatCentsToDollars(fill.fill_price_cents)}
                        </div>
                        <div className="orders-panel-fill-time">
                          {new Date(fill.ts).toLocaleString()}
                        </div>
                        {fill.portfolio_error && (
                          <div className="orders-panel-fill-error">{fill.portfolio_error}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

