import React, { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
    message: string;
    type: ToastType;
    duration?: number;
    onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({
    message,
    type,
    duration = 3000,
    onClose
}) => {
    useEffect(() => {
        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const theme = {
        success: {
            bar: 'bg-[#7ed957]',
            glow: 'shadow-[0_0_0_1px_rgba(126,217,87,0.12),0_12px_30px_rgba(126,217,87,0.10)]'
        },
        error: {
            bar: 'bg-rose-400',
            glow: 'shadow-[0_0_0_1px_rgba(244,63,94,0.14),0_12px_30px_rgba(244,63,94,0.10)]'
        },
        warning: {
            bar: 'bg-amber-300',
            glow: 'shadow-[0_0_0_1px_rgba(245,158,11,0.16),0_12px_30px_rgba(245,158,11,0.10)]'
        },
        info: {
            // Keep info in-app (not bright blue).
            bar: 'bg-white/40',
            glow: 'shadow-[0_0_0_1px_rgba(255,255,255,0.10),0_12px_30px_rgba(0,0,0,0.40)]'
        }
    }[type];

    return (
        <div className="fixed top-3 right-3 z-[100] toast-pop">
            <div
                className={`relative flex items-start gap-2.5 pl-3 pr-2.5 py-2 rounded-[12px] max-w-[360px] border border-[var(--border-strong)] bg-[var(--bg-elevated-soft)] backdrop-blur-md ${theme.glow}`}
            >
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[12px] ${theme.bar}`} />

                <div className="pt-[1px] text-[var(--text-2)]">
                    {type === 'success' && (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                            />
                        </svg>
                    )}
                    {type === 'error' && (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                clipRule="evenodd"
                            />
                        </svg>
                    )}
                    {type === 'info' && (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                                fillRule="evenodd"
                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                clipRule="evenodd"
                            />
                        </svg>
                    )}
                    {type === 'warning' && (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                                fillRule="evenodd"
                                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                clipRule="evenodd"
                            />
                        </svg>
                    )}
                </div>

                <p className="text-[10px] leading-snug text-[var(--text-2)] flex-1 pr-2">{message}</p>

                <button
                    onClick={onClose}
                    className="p-1 rounded-md text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--bg-panel-hover)] transition-colors"
                    title="Zavřít"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
};
