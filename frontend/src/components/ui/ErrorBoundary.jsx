import React from "react";

const ErrorFallback = ({ error, onReset }) => (
  <div className="min-h-screen w-full flex flex-col items-center justify-center bg-surface-lowest text-text-primary p-8 text-center font-body">
    <div className="max-w-md w-full bg-surface-low border border-border/10 rounded-[2.5rem] p-8 sm:p-10 shadow-ambient space-y-6">
      <h1 className="text-2xl sm:text-3xl font-display font-black text-text-primary leading-tight">
        Something went wrong.
      </h1>
      <div className="space-y-2">
        <p className="text-xs font-black text-red-500 capitalize tracking-widest">
          Error Details
        </p>
        <p className="text-sm font-medium text-text-secondary bg-tonal-secondary/5 rounded-2xl p-4 border border-border/10 font-mono break-words">
          {error?.message || 'Unknown error'}
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 pt-2">
        <button 
          type="button"
          onClick={onReset}
          className="flex-1 px-6 py-4 bg-primary text-white rounded-2xl font-extrabold text-[10px] capitalize tracking-widest shadow-ambient hover:opacity-90 active:scale-95 transition-all"
        >
          Try Again
        </button>
        <button 
          type="button"
          onClick={() => window.location.reload()}
          className="flex-1 px-6 py-4 bg-tonal-secondary/10 hover:bg-tonal-secondary/20 text-text-primary rounded-2xl font-extrabold text-[10px] capitalize tracking-widest active:scale-95 transition-all"
        >
          Refresh Page
        </button>
      </div>
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
