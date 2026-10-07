import { useEffect, useState } from "react";

/** Nombre qui monte de 0 à `to` (désactivé si l'utilisateur réduit les animations). */
export function CountUp({ to, format = String, delay = 700, ms = 1300, className }: { to: number; format?: (n: number) => string; delay?: number; ms?: number; className?: string }) {
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [v, setV] = useState(reduced ? to : 0);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / ms));
      setV(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, ms, reduced]);
  return <span className={className}>{format(v)}</span>;
}
