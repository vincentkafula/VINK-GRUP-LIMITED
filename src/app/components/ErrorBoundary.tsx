import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Optional custom fallback — defaults to full-screen error card */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Label for the section (shown in error message) */
  label?: string;
}

interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In production: send to Sentry / error tracking service
    console.error(`[ErrorBoundary${this.props.label ? ` — ${this.props.label}` : ""}]`, error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-red-50">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-lg font-black text-gray-900 mb-2">Something went wrong</h2>
        <p className="text-sm text-gray-500 mb-1 max-w-sm">
          {this.props.label && <span className="font-semibold">{this.props.label} — </span>}
          {error.message || "An unexpected error occurred."}
        </p>
        <p className="text-xs text-gray-400 mb-6 max-w-sm">
          If this keeps happening, please contact support at support@vink.com.
        </p>
        <button onClick={this.reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ background: "#5B2D8E" }}>
          <RefreshCw className="w-4 h-4" />Try again
        </button>
      </div>
    );
  }
}

/** Lightweight inline variant — shows a small error banner instead of replacing content */
export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50">
      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
      <p className="text-sm text-red-700 flex-1">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-xs font-semibold text-red-600 hover:underline flex-shrink-0">
          Retry
        </button>
      )}
    </div>
  );
}
