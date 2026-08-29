import { useEffect, useRef, useState } from 'react';

/** Measures a source element's rendered height via ResizeObserver so a
    sibling can be pinned to match it — CSS grid/flex intrinsic sizing
    doesn't reliably follow a flexible column when an image with its own
    natural size sits in the other column (the image's intrinsic size can
    still inflate the track during layout even with min-height: 0 and
    overflow: hidden), so this measures the real box instead. */
export function useMatchHeight<T extends HTMLElement>() {
  const sourceRef = useRef<T>(null);
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const el = sourceRef.current;
    if (!el) return;
    const update = () => setHeight(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return { sourceRef, height };
}
