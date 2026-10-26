import { useRef, MouseEvent, useCallback } from 'react';

export function useDragScroll() {
  const ref = useRef<HTMLDivElement | null>(null);
  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    isDown.current = true;
    ref.current.classList.add('active');
    startX.current = e.pageX - ref.current.offsetLeft;
    scrollLeft.current = ref.current.scrollLeft;
  }, []);

  const onMouseLeave = useCallback(() => {
    isDown.current = false;
    if (ref.current) {
      ref.current.classList.remove('active');
    }
  }, []);

  const onMouseUp = useCallback(() => {
    isDown.current = false;
    if (ref.current) {
      ref.current.classList.remove('active');
    }
  }, []);

  const onMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!isDown.current || !ref.current) return;
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    const walk = (x - startX.current) * 1.5; // Scroll speed multiplier
    ref.current.scrollLeft = scrollLeft.current - walk;
  }, []);

  return {
    ref,
    props: {
      onMouseDown,
      onMouseLeave,
      onMouseUp,
      onMouseMove,
      style: { cursor: 'grab' }
    }
  };
}
