import { useState, useEffect } from 'react';

export function useSearchDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState('');

  useEffect(() => {
    if (typeof value === 'string' && value.length < 2) {
      setDebouncedValue('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
