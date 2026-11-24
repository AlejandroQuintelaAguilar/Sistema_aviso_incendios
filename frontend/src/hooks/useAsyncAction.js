import { useCallback, useState } from 'react';

export function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async (fn) => {
    setLoading(true);
    setError('');
    try {
      return await fn();
    } catch (err) {
      setError(err?.message || 'Ocurrió un error inesperado');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, setError, run };
}
