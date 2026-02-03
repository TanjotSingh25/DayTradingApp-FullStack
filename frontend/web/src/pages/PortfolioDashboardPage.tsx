import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchSummary,
  deposit,
  withdraw,
  fetchPositions,
  fetchLedger,
  type AccountSummary,
  type Position,
  type LedgerEntry,
  type LedgerType,
} from '../api/portfolio';
import { requireToken } from '../utils/token';
import { formatCentsToDollars, parseDollarsToCents } from '../utils/currency';
import './PortfolioDashboardPage.css';

export default function PortfolioDashboardPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Account state
  const [summary, setSummary] = useState<AccountSummary | null>(null);

  // Positions state
  const [positions, setPositions] = useState<Position[]>([]);

  // Ledger state
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerCursor, setLedgerCursor] = useState<string | null>(null);
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<LedgerType | 'ALL'>('ALL');
  const [ledgerFromDate, setLedgerFromDate] = useState<string>('');
  const [ledgerToDate, setLedgerToDate] = useState<string>('');

  // Deposit/Withdraw state
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNote, setDepositNote] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load all data
  const loadData = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      setError(null);
      const token = requireToken();

      // Load in parallel
      const [summaryData, positionsData, ledgerData] = await Promise.all([
        fetchSummary(token),
        fetchPositions(token),
        fetchLedger(token, { limit: 50 }),
      ]);

      setSummary(summaryData);
      setPositions(positionsData.positions);
      setLedgerEntries(ledgerData.entries || []);
      setLedgerCursor(ledgerData.next_cursor || null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load portfolio data';
      setError(errorMessage);
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, navigate]);

  // Load ledger with filters
  const loadLedger = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const token = requireToken();
      const params: {
        limit?: number;
        type?: LedgerType;
        from?: string;
        to?: string;
      } = { limit: 50 };

      if (ledgerTypeFilter !== 'ALL') {
        params.type = ledgerTypeFilter;
      }
      if (ledgerFromDate) {
        params.from = ledgerFromDate;
      }
      if (ledgerToDate) {
        params.to = ledgerToDate;
      }

      const ledgerData = await fetchLedger(token, params);
      setLedgerEntries(ledgerData.entries || []);
      setLedgerCursor(ledgerData.next_cursor || null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load ledger';
      setError(errorMessage);
    }
  }, [isAuthenticated, ledgerTypeFilter, ledgerFromDate, ledgerToDate]);

  // Load more ledger entries
  const loadMoreLedger = useCallback(async () => {
    if (!isAuthenticated || !ledgerCursor) return;

    try {
      const token = requireToken();
      const params: {
        limit?: number;
        cursor?: string;
        type?: LedgerType;
        from?: string;
        to?: string;
      } = { limit: 50, cursor: ledgerCursor };

      if (ledgerTypeFilter !== 'ALL') {
        params.type = ledgerTypeFilter;
      }
      if (ledgerFromDate) {
        params.from = ledgerFromDate;
      }
      if (ledgerToDate) {
        params.to = ledgerToDate;
      }

      const ledgerData = await fetchLedger(token, params);
      setLedgerEntries((prev) => [...prev, ...(ledgerData.entries || [])]);
      setLedgerCursor(ledgerData.next_cursor || null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load more ledger entries';
      setError(errorMessage);
    }
  }, [isAuthenticated, ledgerCursor, ledgerTypeFilter, ledgerFromDate, ledgerToDate]);

  // Handle deposit
  const handleDeposit = async () => {
    if (!depositAmount) {
      setActionMessage({ type: 'error', text: 'Please enter an amount' });
      return;
    }

    try {
      setActionLoading(true);
      setActionMessage(null);
      const token = requireToken();
      const amountCents = parseDollarsToCents(depositAmount);

      const result = await deposit(token, {
        amount_cents: amountCents,
        note: depositNote || undefined,
      });

      setSummary(result.summary);
      setDepositAmount('');
      setDepositNote('');
      setActionMessage({ type: 'success', text: `Deposited ${formatCentsToDollars(amountCents)} successfully` });

      // Reload ledger and positions
      await Promise.all([loadLedger(), fetchPositions(token).then((data) => setPositions(data.positions))]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to deposit funds';
      setActionMessage({ type: 'error', text: errorMessage });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle withdraw
  const handleWithdraw = async () => {
    if (!withdrawAmount) {
      setActionMessage({ type: 'error', text: 'Please enter an amount' });
      return;
    }

    try {
      setActionLoading(true);
      setActionMessage(null);
      const token = requireToken();
      const amountCents = parseDollarsToCents(withdrawAmount);

      const result = await withdraw(token, {
        amount_cents: amountCents,
        note: withdrawNote || undefined,
      });

      setSummary(result.summary);
      setWithdrawAmount('');
      setWithdrawNote('');
      setActionMessage({ type: 'success', text: `Withdrew ${formatCentsToDollars(amountCents)} successfully` });

      // Reload ledger and positions
      await Promise.all([loadLedger(), fetchPositions(token).then((data) => setPositions(data.positions))]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to withdraw funds';
      if (errorMessage.includes('INSUFFICIENT_FUNDS') || errorMessage.includes('409')) {
        setActionMessage({ type: 'error', text: 'Insufficient funds' });
      } else {
        setActionMessage({ type: 'error', text: errorMessage });
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Effects
  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  // Redirect if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="portfolio-dashboard">
        <div className="portfolio-error">
          <p>Please log in to view your portfolio.</p>
          <button onClick={() => navigate('/login')}>Go to Login</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="portfolio-dashboard">
        <div className="portfolio-loading">Loading portfolio data...</div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="portfolio-dashboard">
        <div className="portfolio-error">
          <p>Error: {error}</p>
          <button onClick={loadData}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="portfolio-dashboard">
      <div className="portfolio-header">
        <button onClick={() => navigate('/')} className="portfolio-back-button">
          ← Home
        </button>
        <h1>Portfolio Dashboard</h1>
        <div className="portfolio-user-info">
          <span>Welcome, {user?.name || user?.username}!</span>
        </div>
      </div>

      {actionMessage && (
        <div className={`portfolio-message portfolio-message-${actionMessage.type}`}>
          {actionMessage.text}
          <button onClick={() => setActionMessage(null)} className="portfolio-message-close">×</button>
        </div>
      )}

      <div className="portfolio-content">
        {/* Account Summary */}
        <div className="portfolio-section portfolio-summary">
          <h2>Account Summary</h2>
          {summary ? (
            <div className="summary-grid">
              <div className="summary-item">
                <label>Available Cash</label>
                <div className="summary-value">{formatCentsToDollars(summary.cash_available_cents)}</div>
              </div>
              <div className="summary-item">
                <label>Reserved Cash</label>
                <div className="summary-value">{formatCentsToDollars(summary.cash_reserved_cents)}</div>
              </div>
              <div className="summary-item summary-item-total">
                <label>Total Cash</label>
                <div className="summary-value">{formatCentsToDollars(summary.cash_total_cents)}</div>
              </div>
            </div>
          ) : (
            <div className="portfolio-error">Unable to load account summary</div>
          )}
        </div>

        {/* Deposit / Withdraw */}
        <div className="portfolio-section portfolio-funding">
          <h2>Funding</h2>
          <div className="funding-actions">
            <div className="funding-action">
              <h3>Deposit</h3>
              <div className="funding-input-group">
                <label>
                  Amount ($)
                  <input
                    type="text"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={actionLoading}
                  />
                </label>
                <label>
                  Note (optional)
                  <input
                    type="text"
                    value={depositNote}
                    onChange={(e) => setDepositNote(e.target.value)}
                    placeholder="e.g., initial funding"
                    disabled={actionLoading}
                  />
                </label>
                <button onClick={handleDeposit} disabled={actionLoading || !depositAmount}>
                  {actionLoading ? 'Processing...' : 'Deposit'}
                </button>
              </div>
            </div>

            <div className="funding-action">
              <h3>Withdraw</h3>
              <div className="funding-input-group">
                <label>
                  Amount ($)
                  <input
                    type="text"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={actionLoading}
                  />
                </label>
                <label>
                  Note (optional)
                  <input
                    type="text"
                    value={withdrawNote}
                    onChange={(e) => setWithdrawNote(e.target.value)}
                    placeholder="e.g., cash out"
                    disabled={actionLoading}
                  />
                </label>
                <button onClick={handleWithdraw} disabled={actionLoading || !withdrawAmount}>
                  {actionLoading ? 'Processing...' : 'Withdraw'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Positions */}
        <div className="portfolio-section portfolio-positions">
          <h2>Positions</h2>
          {positions.length === 0 ? (
            <div className="portfolio-empty">No positions yet</div>
          ) : (
            <div className="positions-table-container">
              <table className="positions-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Quantity</th>
                    <th>Avg Cost</th>
                    <th>Realized P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => (
                    <tr key={pos.ticker}>
                      <td className="position-ticker">{pos.ticker}</td>
                      <td>{pos.qty}</td>
                      <td>{formatCentsToDollars(pos.avg_cost_cents)}</td>
                      <td className={pos.realized_pnl_cents >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                        {formatCentsToDollars(pos.realized_pnl_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Ledger */}
        <div className="portfolio-section portfolio-ledger">
          <h2>Transaction History</h2>
          <div className="ledger-filters">
            <div className="ledger-filter-group">
              <label>
                Type
                <select
                  value={ledgerTypeFilter}
                  onChange={(e) => setLedgerTypeFilter(e.target.value as LedgerType | 'ALL')}
                >
                  <option value="ALL">All</option>
                  <option value="DEPOSIT">Deposit</option>
                  <option value="WITHDRAWAL">Withdrawal</option>
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                  <option value="FEE">Fee</option>
                  <option value="ADJUSTMENT">Adjustment</option>
                  <option value="RESERVE">Reserve</option>
                  <option value="RELEASE">Release</option>
                </select>
              </label>
              <label>
                From Date
                <input
                  type="date"
                  value={ledgerFromDate}
                  onChange={(e) => setLedgerFromDate(e.target.value)}
                />
              </label>
              <label>
                To Date
                <input
                  type="date"
                  value={ledgerToDate}
                  onChange={(e) => setLedgerToDate(e.target.value)}
                />
              </label>
              <button onClick={loadLedger} className="ledger-refresh-button">
                Apply Filters
              </button>
            </div>
          </div>

          {ledgerEntries.length === 0 ? (
            <div className="portfolio-empty">No transactions found</div>
          ) : (
            <>
              <div className="ledger-table-container">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Type</th>
                      <th>Ticker</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Amount</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map((entry) => {
                      // Format datetime properly
                      const date = new Date(entry.ts);
                      const formattedDate = date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true,
                      });
                      
                      return (
                      <tr key={entry.id}>
                        <td>{formattedDate}</td>
                        <td>
                          <span className={`ledger-type ledger-type-${entry.type.toLowerCase()}`}>
                            {entry.type}
                          </span>
                        </td>
                        <td>{entry.ticker || '-'}</td>
                        <td>{entry.qty ?? '-'}</td>
                        <td>{entry.price_cents ? formatCentsToDollars(entry.price_cents) : '-'}</td>
                        <td className={entry.amount_cents >= 0 ? 'amount-positive' : 'amount-negative'}>
                          {formatCentsToDollars(entry.amount_cents)}
                        </td>
                        <td className="ledger-note">{entry.note || entry.external_ref || '-'}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {ledgerCursor && (
                <div className="ledger-load-more">
                  <button onClick={loadMoreLedger}>Load More</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

