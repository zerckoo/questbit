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

// =========================
// Role Hierarchy
// =========================

import { GameBalance } from "./gameBalance.js";
import { getProgressToNextLevel } from "./xpSystem.js";

const ROLE_HIERARCHY = GameBalance.roles;

window.ROLE_HIERARCHY = ROLE_HIERARCHY;

window.getUserRoleLevel = function(role) {
    return ROLE_HIERARCHY[role] || 0;
};

window.canModerate = function(actorRole, targetRole) {
    return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole];
};

window.getHighestRole = function(roles) {
    if (!roles || !roles.length) return 'player';
    let best = 'player';
    for (const r of roles) {
        if ((ROLE_HIERARCHY[r] || 0) > (ROLE_HIERARCHY[best] || 0)) best = r;
    }
    return best;
};

// Elements
const signinBtn = document.getElementById("signinBtn");
const signoutBtn = document.getElementById("signoutBtn");
const qpBalance = document.getElementById("qpBalance");
const profileDropdownWrap = document.getElementById("profileDropdownWrap");
const profileDropdown = document.getElementById("profileDropdown");
const leftProfileDropdown = document.getElementById("leftProfileDropdown");
const profileOverview = document.getElementById("profileOverview");
const dropdownAdmin = document.getElementById("dropdownAdmin");
const dropdownMod = document.getElementById("dropdownModerator");
const dropdownOwner = document.getElementById("dropdownOwner");
const dropdownLogout = document.getElementById("dropdownLogout");

// Expose role globally
window.userRole = "player";
window.userRoles = ["player"];
window.userData = null;

function formatCoins(n) {
    return Number(n || 0).toLocaleString();
}

window.updateCoinDisplay = function(coins) {
    if (qpBalance) {
        qpBalance.textContent = "\u25CF " + formatCoins(coins) + " QC";
    }
};

window.updateNavProfile = function(data) {
    const avatar = document.getElementById("navAvatar");
    const username = document.getElementById("navUsername");
    const title = document.getElementById("navTitle");
    const xpFill = document.getElementById("navXpFill");
    const levelBadge = document.getElementById("navLevel");
    const coinsEl = document.getElementById("navCoins");

    if (avatar) {
        if (data.photoURL) {
            avatar.style.backgroundImage = `url(${data.photoURL})`;
            avatar.style.background = `url(${data.photoURL}) center/cover, linear-gradient(135deg, #d87850 0 38%, #f3ba63 38% 62%, #3d9a83 62%)`;
        } else {
            avatar.style.backgroundImage = '';
            avatar.style.background = 'linear-gradient(135deg, #d87850 0 38%, #f3ba63 38% 62%, #3d9a83 62%)';
        }
    }

    if (username) {
        username.textContent = data.username || data.displayName || "GUEST";
    }

    if (title) {
        title.textContent = data.title || "Adventurer";
    }

    const xp = data.xp || 0;
    const progress = getProgressToNextLevel(xp);
    const level = progress.level;
    const xpPercent = progress.percent;

    if (xpFill) xpFill.style.width = xpPercent + "%";
    if (levelBadge) levelBadge.textContent = "LV " + level;
    if (coinsEl) coinsEl.textContent = "\u25CF " + formatCoins(data.coins || 0) + " QC";

    const streakBadge = document.getElementById("navStreak");
    const streakCount = document.getElementById("navStreakCount");
    const streakDays = data.streakDays || 0;
    if (streakBadge) {
        streakBadge.hidden = false;
        streakCount.textContent = streakDays;
        const isActive = data.streakActiveToday === true || data.streakActiveToday === undefined;
        streakBadge.classList.toggle("inactive", !isActive);
    }
};

// =========================
// Dropdown Toggle
// =========================

function closeBothDropdowns() {
    if (profileDropdown) profileDropdown.classList.remove("open");
    if (leftProfileDropdown) leftProfileDropdown.classList.remove("open");
}

if (signoutBtn) {
    signoutBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const willOpen = !profileDropdown.classList.contains("open");
        closeBothDropdowns();
        if (willOpen) profileDropdown.classList.add("open");
    });
}

if (profileOverview) {
    profileOverview.addEventListener("click", (e) => {
        if (e.target.closest('.dropdown-item')) {
            closeBothDropdowns();
            return;
        }
        if (e.target.closest('.left-dropdown')) return;
        e.stopPropagation();
        const willOpen = !leftProfileDropdown.classList.contains("open");
        closeBothDropdowns();
        if (willOpen) leftProfileDropdown.classList.add("open");
    });
}

// Close dropdown on outside click
document.addEventListener("click", (e) => {
    const rightOpen = profileDropdown && profileDropdown.classList.contains("open");
    const leftOpen = leftProfileDropdown && leftProfileDropdown.classList.contains("open");
    if (rightOpen || leftOpen) {
        const inRight = profileDropdown && profileDropdown.contains(e.target);
        const inLeft = leftProfileDropdown && leftProfileDropdown.contains(e.target);
        const onRightBtn = e.target === signoutBtn || (profileDropdownWrap && profileDropdownWrap.contains(e.target));
        const onLeftBtn = profileOverview && profileOverview.contains(e.target);
        if (!inRight && !inLeft && !onRightBtn && !onLeftBtn) {
            closeBothDropdowns();
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
            closeBothDropdowns();
        } catch (error) {
            console.error(error);
        }
    });
}

// Settings link
const dropdownSettings = document.getElementById("dropdownSettings");
if (dropdownSettings) {
    dropdownSettings.addEventListener("click", (e) => {
        e.preventDefault();
        closeBothDropdowns();
        window.location.href = "settings.html";
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
        closeBothDropdowns();
        window.userRole = "player";
        window.userRoles = ["player"];
        window.userData = null;
        window.updateCoinDisplay(0);
        window.updateNavProfile({ username: "GUEST", title: "Adventurer", xp: 0, level: 0, xpInLevel: 0 });
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
            roles: ["player"],
            title: "Adventurer",
            coins: 0,
            totalCoinsEarned: 0,
            xp: 0,
            level: 0,
            xpInLevel: 0,
            questsCompleted: 0,
            maxDailyCompletions: 0,
            streakDays: 0,
            streakActiveToday: false,
            lastStreakDate: "",
            lastActive: null,
            dailyXP: 0,
            dailyResetDate: "",
            weeklyXP: 0,
            weeklyResetDate: "",
            monthlyXP: 0,
            monthlyResetDate: "",
            yearlyXP: 0,
            yearlyResetDate: "",
            createdAt: serverTimestamp()
        });
        window.userRole = "player";
        window.userData = { coins: 0, totalCoinsEarned: 0, xp: 0, level: 0, xpInLevel: 0, questsCompleted: 0, streakDays: 0, title: "Adventurer", photoURL: user.photoURL, displayName: user.displayName, dailyXP: 0, dailyResetDate: "", weeklyXP: 0, weeklyResetDate: "", monthlyXP: 0, monthlyResetDate: "", yearlyXP: 0, yearlyResetDate: "" };
        window.updateCoinDisplay(0);
        window.updateNavProfile(window.userData);
        updateAdminLink();
        showUsernameModal();
        console.log("Auth state changed", user);
        return;
    }

    const data = snapshot.data();
    window.userData = data;
    window.userRoles = data.roles || [data.role || "player"];
    window.userRole = data.role || window.getHighestRole(window.userRoles);
    window.updateCoinDisplay(data.coins || 0);
    window.updateNavProfile(data);
    updateAdminLink();

    if (data.username === null) {
        showUsernameModal();
    }

});

// =========================
// Admin Link Visibility
// =========================

function updateAdminLink() {
    const roleLevel = ROLE_HIERARCHY[window.userRole] || 0;
    const dropdownAdmin = document.getElementById("dropdownAdmin");
    const dropdownMod = document.getElementById("dropdownModerator");
    const dropdownOwner = document.getElementById("dropdownOwner");
    if (dropdownAdmin) {
        dropdownAdmin.style.display = roleLevel >= ROLE_HIERARCHY.admin ? "" : "none";
    }
    if (dropdownMod) {
        dropdownMod.style.display = roleLevel >= ROLE_HIERARCHY.moderator ? "" : "none";
    }
    if (dropdownOwner) {
        dropdownOwner.style.display = roleLevel >= ROLE_HIERARCHY.owner ? "" : "none";
    }
    if (typeof window.onAuthReady === "function") {
        window.onAuthReady(window.userRole);
    }
    if (typeof window.onRoleReady === "function") {
        window.onRoleReady(window.userRole);
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

export { auth, db };

// =========================
// Keyboard Navigation
// =========================

document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    const routes = { h: "main.html", q: "quests.html", w: "world.html", r: "rankings.html", s: "store.html" };
    if (routes[key]) {
        e.preventDefault();
        window.location.href = routes[key];
    }
});
