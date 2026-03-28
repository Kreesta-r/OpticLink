import { useState, useCallback, useEffect, createContext, useContext, useRef } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
    id: number;
    message: string;
    type: ToastType;
    exiting: boolean;
}

interface ToastContextValue {
    show: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

let _toastCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const dismiss = useCallback((id: number) => {
        // Start exit animation
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 250);
    }, []);

    const show = useCallback((message: string, type: ToastType = 'info') => {
        const id = ++_toastCounter;
        setToasts(prev => [...prev.slice(-4), { id, message, type, exiting: false }]);
        setTimeout(() => dismiss(id), 3500);
    }, [dismiss]);

    return (
        <ToastContext.Provider value={{ show }}>
            {children}
            <div className="toast-container" aria-live="polite">
                {toasts.map(t => (
                    <div
                        key={t.id}
                        className={`toast toast-${t.type}${t.exiting ? ' toast-exit' : ''}`}
                        onClick={() => dismiss(t.id)}
                    >
                        <span className={`toast-dot status-dot ${t.type === 'success' ? 'connected' : t.type === 'error' ? 'disconnected' : 'connecting'}`} />
                        <span className="toast-message">{t.message}</span>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}
