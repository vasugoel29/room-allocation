import React from "react";

const ErrorFallback = () => (
  <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
    <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Something went wrong.</h1>
    <p style={{ color: '#64748b', marginBottom: '2rem' }}>Please try refreshing the page or contact support.</p>
    <button 
      onClick={() => window.location.reload()}
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
      Refresh Page
    </button>
  </div>
);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <ErrorFallback />;
    return this.props.children;
  }
}

export default ErrorBoundary;
