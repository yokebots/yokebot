import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import type { ReactNode } from 'react'

interface Toast {
  id: string
  title: string
  message: string
  severity: 'critical' | 'warning' | 'info' | 'success'
  actionLabel?: string
  onAction?: () => void
  dismissLabel?: string
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType>({
  addToast: () => {},
  removeToast: () => {},
})

export function useToast() {
  return useContext(ToastContext)
}

const severityStyles: Record<string, { border: string; icon: string; iconBg: string; iconColor: string }> = {
  critical: {
    border: 'border-red-200',
    icon: 'error',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
  },
  warning: {
    border: 'border-amber-200',
    icon: 'warning',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
  info: {
    border: 'border-blue-200',
    icon: 'info',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  success: {
    border: 'border-green-200',
    icon: 'check_circle',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
  },
}

const actionStyles: Record<string, string> = {
  critical: 'bg-red-600 text-white hover:bg-red-700',
  warning: 'bg-amber-600 text-white hover:bg-amber-700',
  info: 'bg-blue-600 text-white hover:bg-blue-700',
  success: 'bg-forest-green text-white hover:bg-forest-green/90',
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const style = severityStyles[toast.severity]

  useEffect(() => {
    const timeout = setTimeout(onRemove, 8000)
    return () => clearTimeout(timeout)
  }, [onRemove])

  return (
    <div className={`w-96 rounded-xl border ${style.border} bg-white p-4 shadow-xl animate-in slide-in-from-right`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.iconBg} ${style.iconColor}`}>
          <span className="material-symbols-outlined text-[18px]">{style.icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-text-main">{toast.title}</h4>
          <p className="mt-1 text-xs text-text-muted leading-relaxed">{toast.message}</p>
          <div className="mt-3 flex items-center gap-2">
            {toast.actionLabel && (
              <button
                onClick={() => { toast.onAction?.(); onRemove() }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${actionStyles[toast.severity]}`}
              >
                {toast.actionLabel}
              </button>
            )}
            <button
              onClick={onRemove}
              className="text-xs text-text-muted hover:text-text-main"
            >
              {toast.dismissLabel ?? 'Dismiss'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    setToasts((prev) => [...prev, { ...toast, id }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {/* Toast stack */}
      <div className="fixed top-4 right-4 z-[70] flex flex-col gap-3">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
