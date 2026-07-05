import { useEffect, useRef, useState } from "react";

interface Props {
  children: React.ReactNode;
  /** Pixel margin before the section enters viewport — triggers early load */
  rootMargin?: string;
  /** Minimum placeholder height so layout doesn't jump */
  minHeight?: number;
}

/**
 * Defers rendering of below-fold sections until they are about to enter the
 * viewport. Prevents the initial JS paint from doing work for content the
 * user hasn't scrolled to yet.
 */
export function LazySection({ children, rootMargin = "300px", minHeight = 200 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      // Fallback for environments without IntersectionObserver
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref}>
      {visible ? children : <div style={{ minHeight }} aria-hidden="true" />}
    </div>
  );
}
