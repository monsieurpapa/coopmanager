import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc, onSnapshot, setDoc, updateDoc, serverTimestamp,
  collection, query, where, getDocs,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { UserProfile } from '../lib/permissions';

// Mirrors isBootstrapAdminEmail() in firestore.rules — the only place a
// hardcoded admin email is allowed to grant anything.
const BOOTSTRAP_ADMIN_EMAILS = ['dieudonneishara@gmail.com', 'citovictoire2@gmail.com'];

export const AuthContext = createContext<{
  user: FirebaseUser | null;
  profile: UserProfile | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}>({
  user: null,
  profile: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function useAuthProvider() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      unsubProfile?.();
      unsubProfile = undefined;

      if (!u) {
        setProfile(null);
        setIsLoading(false);
        return;
      }

      const userRef = doc(db, 'users', u.uid);
      unsubProfile = onSnapshot(userRef, async (snap) => {
        if (!snap.exists()) {
          // Rules only allow role:'user' with no cooperativeId on self-create.
          await setDoc(userRef, { email: u.email, role: 'user', createdAt: serverTimestamp() });
          return; // onSnapshot fires again once the doc exists
        }
        const data = snap.data() as UserProfile;
        setProfile(data);
        setIsLoading(false);
        void tryClaimSeat(u, data);
      });
    });

    return () => {
      unsubAuth();
      unsubProfile?.();
    };
  }, []);

  const login = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return { user, profile, isLoading, login, logout };
}

// Attempts the two server-verified role transitions defined in
// firestore.rules (bootstrap-admin claim, invite claim). Both writes are
// no-ops the rules will reject if the conditions aren't met — that's the
// expected outcome for the vast majority of logins, not an error.
async function tryClaimSeat(u: FirebaseUser, profile: UserProfile) {
  if (profile.role !== 'user' || profile.cooperativeId || !u.email) return;

  if (BOOTSTRAP_ADMIN_EMAILS.includes(u.email.toLowerCase())) {
    try {
      await updateDoc(doc(db, 'users', u.uid), { role: 'admin' });
    } catch (error) {
      console.error('Bootstrap admin claim rejected', error);
    }
    return;
  }

  const coopsRef = collection(db, 'cooperatives');
  const invitedAs = query(coopsRef, where('managerEmail', '==', u.email));
  const snapshot = await getDocs(invitedAs);
  if (snapshot.empty) return;

  try {
    await updateDoc(doc(db, 'users', u.uid), {
      role: 'coop_manager',
      cooperativeId: snapshot.docs[0].id,
    });
  } catch (error) {
    console.error('Invite claim rejected', error);
  }
}
