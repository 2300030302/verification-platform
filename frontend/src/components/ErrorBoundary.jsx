import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/dashboard';
  };

  handleClearSession = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.error('Error clearing storage:', e);
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/login';
  };

  handleReloadPage = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const errorMessage =
        this.state.error?.message ||
        (typeof this.state.error === 'string' ? this.state.error : 'An unexpected render error occurred.');
      const errorStack = this.state.error?.stack;
      const componentStack = this.state.errorInfo?.componentStack;

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#f8fafc',
          color: '#1e293b',
        }}>
          <div style={{
            background: 'white',
            padding: '2.5rem',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            maxWidth: '560px',
            width: '100%',
            border: '1px solid #e2e8f0',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🛡️</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem', color: '#0f172a' }}>
              Something went wrong
            </h2>
            <p style={{ color: '#64748b', marginBottom: '1.25rem', fontSize: '0.95rem', lineHeight: '1.5' }}>
              An unexpected display issue occurred during navigation or render. You can return to the dashboard, reload, or reset your session.
            </p>

            {/* Diagnostic Message */}
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              textAlign: 'left',
              fontSize: '0.85rem',
              color: '#991b1b',
              wordBreak: 'break-word',
            }}>
              <strong>Error Details:</strong>
              <div style={{ marginTop: '0.25rem', fontFamily: 'monospace' }}>{errorMessage}</div>
            </div>

            {/* Technical Stack Details */}
            {(errorStack || componentStack) && (
              <details style={{
                textAlign: 'left',
                marginBottom: '1.5rem',
                fontSize: '0.8rem',
                color: '#64748b',
                background: '#f1f5f9',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
              }}>
                <summary style={{ cursor: 'pointer', fontWeight: 500, userSelect: 'none' }}>
                  Show Technical Details
                </summary>
                <pre style={{
                  marginTop: '0.5rem',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  fontSize: '0.75rem',
                  color: '#334155',
                  maxHeight: '160px',
                  lineHeight: '1.4',
                }}>
                  {errorStack || componentStack}
                </pre>
              </details>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={this.handleReload}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Return to Dashboard
                </button>
                <button
                  type="button"
                  onClick={this.handleReloadPage}
                  style={{
                    background: '#f8fafc',
                    color: '#334155',
                    border: '1px solid #cbd5e1',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  🔄 Reload
                </button>
              </div>

              <button
                type="button"
                onClick={this.handleClearSession}
                style={{
                  background: 'transparent',
                  color: '#dc2626',
                  border: '1px solid #fca5a5',
                  padding: '0.65rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Clear Session & Sign In Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
