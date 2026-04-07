import React from 'react';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  declare props: Readonly<AppErrorBoundaryProps>;

  state: AppErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Něco se pokazilo.',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Unhandled render error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-card-2)] p-8 shadow-2xl backdrop-blur">
          <p className="text-sm uppercase tracking-[0.24em] text-amber-300">Application error</p>
          <h1 className="mt-3 text-3xl font-semibold">Něco se pokazilo</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-2)]">
            Aplikace narazila na neočekávanou chybu. Můžeš stránku zkusit obnovit a pokračovat tam, kde jsi skončil.
          </p>
          <p className="mt-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-4 py-3 text-sm text-[var(--text-2)]">
            {this.state.message}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-6 inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-medium text-[var(--accent-contrast)] transition hover:bg-[var(--accent-hover)]"
          >
            Obnovit aplikaci
          </button>
        </div>
      </div>
    );
  }
}
