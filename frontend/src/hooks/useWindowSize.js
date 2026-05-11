import { useState, useEffect } from 'react';

/**
 * Hook to track window size and provide breakpoint booleans.
 * This ensures layout-critical decisions (like sidebar visibility) 
 * are reactive to window resizing, not just initial render.
 */
export function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    window.addEventListener('resize', handleResize);
    handleResize(); // Call on mount
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowSize.width < 640;
  const isTablet = windowSize.width >= 640 && windowSize.width < 1024;
  const isDesktop = windowSize.width >= 1024;

  return { ...windowSize, isMobile, isTablet, isDesktop };
}
