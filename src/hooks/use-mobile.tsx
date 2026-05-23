import * as React from "react";

const MOBILE_BREAKPOINT = 1024;
const COMPACT_BREAKPOINT = 1024;

function useMediaBreakpoint(breakpoint: number) {
  // Initial state é síncrono baseado em window — evita o ciclo
  // undefined → false → true que remontava Dialog/Drawer em árvores
  // diferentes (causa do "modal preto" no mobile). SSR-safe via typeof check.
  const [matches, setMatches] = React.useState<boolean>(() =>
    typeof window !== "undefined" && window.innerWidth < breakpoint
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setMatches(window.innerWidth < breakpoint);
    mql.addEventListener("change", onChange);
    setMatches(window.innerWidth < breakpoint);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);

  return matches;
}

export function useIsMobile() {
  return useMediaBreakpoint(MOBILE_BREAKPOINT);
}

export function useIsCompact() {
  return useMediaBreakpoint(COMPACT_BREAKPOINT);
}
