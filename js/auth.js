import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp,
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";

import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

const provider = new GoogleAuthProvider();

// Elements
const signinBtn = document.getElementById("signinBtn");
const signoutBtn = document.getElementById("signoutBtn");
const qpBalance = document.getElementById("qpBalance");
const profileDropdownWrap = document.getElementById("profileDropdownWrap");
const profileDropdown = document.getElementById("profileDropdown");
const dropdownAdmin = document.getElementById("dropdownAdmin");
const dropdownLogout = document.getElementById("dropdownLogout");

// Expose role globally
window.userRole = "player";

// =========================
// Dropdown Toggle
// =========================

if (signoutBtn) {
    signoutBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (profileDropdown) {
            profileDropdown.classList.toggle("open");
        }
    });
}

// Close dropdown on outside click
document.addEventListener("click", (e) => {
    if (profileDropdown && profileDropdown.classList.contains("open")) {
        if (!profileDropdown.contains(e.target) && e.target !== signoutBtn) {
            profileDropdown.classList.remove("open");
        }
    }
});

// =========================
// Dropdown Actions
// =========================

if (dropdownLogout) {
    dropdownLogout.addEventListener("click", async () => {
        try {
            await signOut(auth);
            if (profileDropdown) profileDropdown.classList.remove("open");
        } catch (error) {
            console.error(error);
        }
    });
}

// Settings is a dummy button — just close dropdown
const dropdownSettings = document.getElementById("dropdownSettings");
if (dropdownSettings) {
    dropdownSettings.addEventListener("click", (e) => {
        e.preventDefault();
        if (profileDropdown) profileDropdown.classList.remove("open");
    });
}

// =========================
// Google Sign In
// =========================

signinBtn.addEventListener("click", async () => {

    try {

        const result = await signInWithPopup(auth, provider);

        console.log(result.user);

    } catch (error) {

        console.error(error);
        alert(error.message);

    }

});

// =========================
// Auth State Changed
// =========================

onAuthStateChanged(auth, async (user) => {

    if (!user) {
        signinBtn.hidden = false;
        if (profileDropdownWrap) profileDropdownWrap.hidden = true;
        qpBalance.hidden = true;
        if (profileDropdown) profileDropdown.classList.remove("open");
        window.userRole = "player";
        updateAdminLink();
        return;
    }

    signinBtn.hidden = true;
    if (profileDropdownWrap) profileDropdownWrap.hidden = false;
    qpBalance.hidden = false;

    if (signoutBtn) {
        signoutBtn.textContent = "";
        signoutBtn.style.backgroundImage = `url(${user.photoURL})`;
        signoutBtn.style.backgroundSize = "cover";
        signoutBtn.style.backgroundPosition = "center";
        signoutBtn.title = user.displayName;
    }

    const userRef = doc(db, "users", user.uid);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
        await setDoc(userRef, {
            username: null,
            displayName: user.displayName,
            photoURL: user.photoURL,
            role: "player",
            createdAt: serverTimestamp()
        });
        window.userRole = "player";
        updateAdminLink();
        showUsernameModal();
        console.log("Auth state changed", user);
        return;
    }

    const data = snapshot.data();
    window.userRole = data.role || "player";
    updateAdminLink();

    if (data.username === null) {
        showUsernameModal();
    }

});

// =========================
// Admin Link Visibility
// =========================

function updateAdminLink() {
    if (dropdownAdmin) {
        dropdownAdmin.style.display = window.userRole === "admin" ? "" : "none";
    }
    if (typeof window.onAuthReady === "function") {
        window.onAuthReady(window.userRole);
    }
}

// =========================
// Username Modal
// =========================

const usernameModal = document.getElementById("usernameModal");
const usernameInput = document.getElementById("usernameInput");
const saveUsernameBtn = document.getElementById("saveUsernameBtn");
const usernameError = document.getElementById("usernameError");

function showUsernameModal() {
    if (!usernameModal) return;
    usernameModal.classList.remove("hidden");
}

function hideUsernameModal() {
    if (!usernameModal) return;
    usernameModal.classList.add("hidden");
}

if (saveUsernameBtn) {
    saveUsernameBtn.addEventListener("click", async () => {
        const username = usernameInput.value.trim();

        if (username.length < 3) {
            usernameError.textContent = "Username must be at least 3 characters.";
            return;
        }

        if (username.length > 20) {
            usernameError.textContent = "Username must be under 20 characters.";
            return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            usernameError.textContent = "Only letters, numbers and _ are allowed.";
            return;
        }

        const usersRef = collection(db, "users");
        const q = query(usersRef, where("username", "==", username));
        const result = await getDocs(q);

        if (!result.empty) {
            usernameError.textContent = "Username already taken.";
            return;
        }

        if (!auth.currentUser) {
            usernameError.textContent = "You must be signed in to save a username.";
            return;
        }

        await updateDoc(
            doc(db, "users", auth.currentUser.uid),
            {
                username: username
            }
        );

        usernameError.textContent = "";
        hideUsernameModal();
        console.log("Username saved!");
    });
}

// =========================
// Admin Role Helpers
// =========================

// Promote any user to admin by their username
// Usage from console: promoteToAdmin("their_username")
window.promoteToAdmin = async function (username) {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("username", "==", username));
    const result = await getDocs(q);
    if (result.empty) {
        console.error("No user found with username:", username);
        return false;
    }
    const userDoc = result.docs[0];
    await updateDoc(userDoc.ref, { role: "admin" });
    console.log("User", username, "promoted to admin!");
    // If promoting yourself, update live
    if (auth.currentUser && userDoc.id === auth.currentUser.uid) {
        window.userRole = "admin";
        updateAdminLink();
    }
    return true;
};

// Promote the currently signed-in user to admin
// Usage from console: promoteSelfToAdmin()
window.promoteSelfToAdmin = async function () {
    if (!auth.currentUser) {
        console.error("You must be signed in.");
        return false;
    }
    const userRef = doc(db, "users", auth.currentUser.uid);
    await updateDoc(userRef, { role: "admin" });
    window.userRole = "admin";
    updateAdminLink();
    console.log("You have been promoted to admin!");
    return true;
};

export { auth, db };
