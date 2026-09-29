import { useState, useEffect, useCallback } from 'react';
import { fetchClaims } from '../lib/account';

// =====================================================================================
// Every player claim, plus the signed-in account's own.
//
//   const { claims, myClaim, refresh } = usePlayerClaim(user);
//   myClaim -> { canonical_name, status: 'confirmed' | 'pending' } or null
// =====================================================================================
export function usePlayerClaim(user) {
  const [claims, setClaims] = useState([]);
  const userId = user?.id ?? null;

  const refresh = useCallback(async () => {
    setClaims(await fetchClaims());
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchClaims().then((rows) => {
      if (!cancelled) setClaims(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const myClaim = userId ? claims.find((c) => c.account_id === userId) ?? null : null;
  return { claims, myClaim, refresh };
}
