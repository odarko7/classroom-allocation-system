import { useEffect } from 'react';

export function useAutoRefresh(refresh: () => void, intervalMs = 20000, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(refresh, intervalMs);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, intervalMs, enabled]);
}
