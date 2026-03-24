import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
          <h2 className="text-xl font-semibold text-text-primary">Something went wrong</h2>
          <p className="text-sm text-text-secondary max-w-md">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <Button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}>
            Reload
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
