import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallbackTitle?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public override state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log error diagnostic for debugging
        console.error('CourseFlow Uncaught Celestial Boundary Error:', error, errorInfo);
    }

    private handleReload = () => {
        window.location.reload();
    };

    private handleResetState = () => {
        try {
            localStorage.removeItem('courseflow-local-planner');
        } catch {
            // Ignore localStorage access failures
        }
        window.location.reload();
    };

    public override render() {
        if (this.state.hasError) {
            return (
                <div className="w-screen h-screen bg-[#030508] text-slate-100 flex items-center justify-center p-6 select-none">
                    <div className="max-w-md w-full bg-[#070B12]/95 border border-rose-500/30 p-6 rounded-sm shadow-2xl space-y-4 backdrop-blur-md">
                        <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                            <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-none">
                                <AlertTriangle className="w-5 h-5 text-rose-400" />
                            </div>
                            <div>
                                <h1 className="font-serif text-sm font-bold tracking-widest text-slate-100 uppercase">
                                    {this.props.fallbackTitle ?? 'Celestial Viewport Disruption'}
                                </h1>
                                <p className="font-mono text-[10px] text-slate-400">
                                    A render exception occurred in the constellation viewport
                                </p>
                            </div>
                        </div>

                        {this.state.error && (
                            <div className="bg-[#030508] border border-white/10 p-3 rounded-none overflow-x-auto text-[11px] font-mono text-rose-300">
                                {this.state.error.message}
                            </div>
                        )}

                        <p className="text-xs text-slate-400 leading-relaxed">
                            CourseFlow recovered safely from a component crash. You can reload the canvas or clear your local session cache if the issue persists.
                        </p>

                        <div className="flex items-center gap-2 pt-2">
                            <button
                                type="button"
                                onClick={this.handleReload}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-mono uppercase tracking-wider text-slate-200 transition-all rounded-none"
                            >
                                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Reload Canvas</span>
                            </button>

                            <button
                                type="button"
                                onClick={this.handleResetState}
                                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-mono uppercase tracking-wider text-rose-300 transition-all rounded-none"
                                title="Clear locally persisted degree selections"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Reset State</span>
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
