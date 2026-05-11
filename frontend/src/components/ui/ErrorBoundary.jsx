import React from "react";

const ErrorFallback = ({ error, onReset }) => (
  <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
    <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Something went wrong.</h1>
    <p style={{ color: '#ef4444', marginBottom: '0.5rem', fontWeight: 'bold' }}>Error Details:</p>
    <p style={{ color: '#64748b', marginBottom: '2rem', fontStyle: 'italic' }}>{error?.message || 'Unknown error'}</p>
    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
      <button 
        type="button"
        onClick={onReset}
        style={{
          backgroundColor: '#6366f1',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '12px',
          border: 'none',
          fontWeight: 'bold',
          cursor: 'pointer'
        }}
      >
        Try Again
      </button>
      <button 
        type="button"
        onClick={() => window.location.reload()}
        style={{
          backgroundColor: '#f1f5f9',
          color: '#475569',
          padding: '12px 24px',
          borderRadius: '12px',
          border: 'none',
          fontWeight: 'bold',
          cursor: 'pointer'
        }}
      >
        Refresh Page
      </button>
    </div>
  </div>
);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, resetKey: 0 };
    this.resetErrorBoundary = this.resetErrorBoundary.bind(this);
  }

  static getDerivedStateFromError(error) { 
    return { hasError: true, error }; 
  }

  componentDidCatch(error, errorInfo) {
    const isDev = import.meta.env.DEV;
    
    // Structured log for monitoring
    const logData = {
      message: "ErrorBoundary caught an error during render",
      component: "ErrorBoundary",
      recovery: "getDerivedStateFromError",
      fallback: "ErrorFallback",
      error: error.toString(),
      // Only include heavy stack traces in development
      ...(isDev && { componentStack: errorInfo.componentStack })
    };

    console.error("Runtime Error Captured:", logData);
  }

  resetErrorBoundary() {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState(prev => ({ 
      hasError: false, 
      error: null, 
      resetKey: prev.resetKey + 1 
    }));
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback 
          error={this.state.error} 
          onReset={this.resetErrorBoundary} 
        />
      );
    }
    return (
      <React.Fragment key={this.state.resetKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

export default ErrorBoundary;
