import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDMlD2_4UOVv9QVx-chCT8mBrRFtWDSj94",
    authDomain: "recapitulando-906c3.firebaseapp.com",
    projectId: "recapitulando-906c3",
    storageBucket: "recapitulando-906c3.firebasestorage.app",
    messagingSenderId: "66512172863",
    appId: "1:66512172863:web:a6bcb5297aaae97e0c458a",
    measurementId: "G-21608Q8Q2L"
};

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const auth = getAuth(app);
