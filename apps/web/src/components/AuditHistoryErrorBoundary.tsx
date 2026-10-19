import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; title?: string };
type State = { error: Error | null };

export class AuditHistoryErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AuditHistory] render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
          role="alert"
        >
          <p className="font-medium">
            {this.props.title ?? "Change history"} could not be displayed
          </p>
          <p className="mt-1 text-amber-900/90">
            Something went wrong while rendering this history. Other parts of the page are
            unaffected. Try refreshing; if it persists, contact an administrator.
          </p>
          <button
            type="button"
            className="mt-3 rounded border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-amber-100"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
