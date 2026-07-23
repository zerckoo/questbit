import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDRvCXhZ-xuMDoIZdnS0M233k9zG6u2s2I",
  authDomain: "side-quest-website-850fd.firebaseapp.com",
  projectId: "side-quest-website-850fd",
  storageBucket: "side-quest-website-850fd.firebasestorage.app",
  messagingSenderId: "441237923178",
  appId: "1:441237923178:web:12724c0ffedbdf6aca3113",
  measurementId: "G-6DD72K3YTD"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };