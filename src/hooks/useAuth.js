import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

// =====================================================================================
// The signed-in account, if any. Signing in is optional: nothing about setting up,
// joining or scoring a round depends on it.
//
//   const { user, ready, sendCode, verifyCode, signOut } = useAuth();
//   user  -> the Supabase auth user, or null when signed out
//   ready -> false until the stored session has been read, so the UI doesn't flash
//            "Sign in" at someone who is already signed in
//
// One email carries both a link and a code. The code is the path that always works:
// the app is installed to the home screen, and on iOS a link from Mail opens Safari,
// which does not share storage with the installed app. Typing the code signs in the
// app the golfer is actually holding.
// =====================================================================================
export function useAuth() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });

    // Also fires when a sign-in link lands in this browser, and when the session is
    // refreshed or ended in another tab.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Returns an error message, or null on success.
  const sendCode = useCallback(async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return error ? error.message : null;
  }, []);

  // Returns an error message, or null on success. onAuthStateChange picks up the new session.
  const verifyCode = useCallback(async (email, token) => {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) return error.message;
    if (!data.session) return 'That code did not sign you in. Request a new one.';
    return null;
  }, []);

  // This device only. The default scope ends the session on every device the account
  // is signed in on, and signing out of a phone shouldn't sign out the iPad.
  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' });
    setUser(null);
  }, []);

  return { user, ready, sendCode, verifyCode, signOut };
}
