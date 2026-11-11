import { useState, useEffect } from 'react';

function useWebStorage(storageName, key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window[storageName].getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window[storageName].setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.error(error);
    }
  }, [storageName, key, storedValue]);

  return [storedValue, setStoredValue];
}

/** Like useState, but remembered across page reloads and shared by all tabs. */
export function useLocalStorage(key, initialValue) {
  return useWebStorage('localStorage', key, initialValue);
}

/** Like useState, but remembered only for this browser tab. */
export function useSessionStorage(key, initialValue) {
  return useWebStorage('sessionStorage', key, initialValue);
}
