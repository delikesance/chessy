import { store, type Toast } from "../store";

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <span>{t.text}</span>
          <button type="button" className="toast-x" aria-label="Fermer la notification" onClick={() => store.dismissToast(t.id)}>
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
