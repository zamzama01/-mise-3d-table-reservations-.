import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  googleProvider.addScope(scope);
}
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Strictly in-memory OAuth access token cache (never stored in localStorage/sessionStorage)
let isSigningIn = false;
let cachedGmailAccessToken = null;

export function getGmailAccessToken() {
  return cachedGmailAccessToken;
}

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();

function clampString(value, maxLen, fallback = '') {
  const str = String(value ?? fallback).trim();
  return str.slice(0, maxLen);
}

async function syncUserProfileToFirestore(firebaseUser) {
  const userPath = `users/${firebaseUser.uid}`;
  const userRef = doc(db, 'users', firebaseUser.uid);

  const safeName = clampString(
    firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Guest',
    120,
    'Guest',
  );
  const safeEmail = clampString(firebaseUser.email || '', 160);
  const safePhoto = clampString(firebaseUser.photoURL || '', 500);

  let existingSnap;
  try {
    existingSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  if (!existingSnap.exists()) {
    const payload = {
      uid: firebaseUser.uid,
      name: safeName,
      email: safeEmail,
      role: 'customer',
      createdAt: serverTimestamp(),
      ...(safePhoto ? { photoUrl: safePhoto } : {}),
    };
    try {
      await setDoc(userRef, payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }
  } else {
    try {
      await updateDoc(userRef, {
        name: safeName,
        ...(safePhoto ? { photoUrl: safePhoto } : {}),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    }
  }
}

export async function signInWithGooglePopup() {
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const firebaseUser = result.user;

    if (!firebaseUser || !firebaseUser.email) {
      throw new Error('Google account did not return an email address.');
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedGmailAccessToken = credential?.accessToken || null;

    await syncUserProfileToFirestore(firebaseUser);
    const idToken = await firebaseUser.getIdToken();

    return {
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
      email: firebaseUser.email,
      photoUrl: firebaseUser.photoURL || '',
      idToken,
      gmailAccessToken: cachedGmailAccessToken,
    };
  } finally {
    isSigningIn = false;
  }
}

export async function authorizeGmailAccess() {
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google did not return a Gmail permission token.');
    }
    cachedGmailAccessToken = credential.accessToken;
    return cachedGmailAccessToken;
  } finally {
    isSigningIn = false;
  }
}

export async function signOutFirebase() {
  cachedGmailAccessToken = null;
  if (auth.currentUser) {
    await signOut(auth);
  }
}

export function subscribeFirebaseAuth(callback) {
  return onAuthStateChanged(auth, (user) => {
    if (!user && !isSigningIn) {
      cachedGmailAccessToken = null;
    }
    callback(user);
  });
}

export async function saveBookingToFirestore({
  booking,
  userName,
  userEmail,
}) {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    return { saved: false, reason: 'not-firebase-session' };
  }

  const bookingId = clampString(booking.id, 128);
  const bookingPath = `bookings/${bookingId}`;
  const bookingRef = doc(db, 'bookings', bookingId);

  const payload = {
    bookingId,
    userId: currentUser.uid,
    userName: clampString(userName || currentUser.displayName || 'Guest', 120, 'Guest'),
    userEmail: clampString(userEmail || currentUser.email || '', 160),
    restaurantId: clampString(booking.restaurantId, 64),
    restaurantName: clampString(booking.restaurantName || 'Restaurant', 120, 'Restaurant'),
    tableId: clampString(booking.tableId, 64),
    tableNumber: clampString(booking.tableNumber || 'T1', 20, 'T1'),
    bookingDate: clampString(booking.bookingDate, 10),
    startTime: clampString(booking.startTime, 5),
    endTime: clampString(booking.endTime, 5),
    partySize: Math.max(1, Math.min(20, Math.trunc(Number(booking.partySize) || 2))),
    notes: clampString(booking.notes || '', 500),
    status: 'pending',
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(bookingRef, payload);
    return { saved: true, docPath: bookingPath };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, bookingPath);
  }
}

export async function cancelBookingInFirestore(bookingId) {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    return;
  }

  const cleanId = clampString(bookingId, 128);
  const bookingPath = `bookings/${cleanId}`;
  const bookingRef = doc(db, 'bookings', cleanId);

  try {
    const snap = await getDoc(bookingRef);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.userId === currentUser.uid && (data.status === 'pending' || data.status === 'confirmed')) {
      await updateDoc(bookingRef, { status: 'cancelled' });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, bookingPath);
  }
}

export async function listMyFirestoreBookings() {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    return [];
  }

  const q = query(collection(db, 'bookings'), where('userId', '==', currentUser.uid));
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'bookings');
  }
}
