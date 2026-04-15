import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50">
          <div className="text-center max-w-md px-6">
            <div className="text-4xl mb-4">☕</div>
            <h1 className="text-xl font-black text-stone-900 mb-2">Something went wrong</h1>
            <p className="text-stone-500 text-sm mb-6">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-stone-900 text-white text-sm font-bold rounded-xl hover:bg-stone-800 transition-colors"
            >
              Reload the page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
