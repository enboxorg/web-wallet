import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';

/**
 * Scroll handling for a shell that scrolls inside an element instead of the
 * window, where the browser neither resets nor restores the position.
 *
 * A page you navigate to starts at the top; going back or forward returns to
 * where that page was left. Only the path counts, so a query or hash change
 * on the same page leaves the position alone.
 */
export function useScrollMemory(ref: React.RefObject<HTMLElement>): void {
  const { key, pathname } = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  const current = useRef({ key, pathname });

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const remember = () => {
      positions.current.set(current.current.key, element.scrollTop);
    };
    element.addEventListener('scroll', remember, { passive: true });
    return () => element.removeEventListener('scroll', remember);
  }, [ref]);

  useLayoutEffect(() => {
    const previous = current.current;
    current.current = { key, pathname };
    if (previous.pathname === pathname) return;

    const element = ref.current;
    if (!element) return;

    const saved = navigationType === 'POP' ? positions.current.get(key) : undefined;
    element.scrollTop = saved ?? 0;
  }, [key, pathname, navigationType, ref]);
}
