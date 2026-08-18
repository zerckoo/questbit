import { db, auth } from './firebase.js';
import {
    doc,
    getDoc,
    updateDoc,
    collection,
    query,
    where,
    getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const USERNAME_CHANGE_COST = 1000;
const COOLDOWN_DAYS = 14;
const DISPLAY_NAME_COOLDOWN = 7;

function formatCoins(n) {
    return Number(n || 0).toLocaleString();
}

function formatDate(ts) {
    if (!ts) return null;
    if (ts.seconds) return new Date(ts.seconds * 1000);
    try { return new Date(ts); } catch (e) { return null; }
}

function daysSince(date) {
    if (!date) return Infinity;
    const now = new Date();
    const diff = now - date;
    return diff / (1000 * 60 * 60 * 24);
}

function daysUntil(date) {
    if (!date) return 0;
    const now = new Date();
    const target = new Date(date.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const diff = target - now;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}

function showToast(msg, type) {
    const t = document.getElementById('toast');
    if (t) {
        t.textContent = msg;
        t.className = 'toast show' + (type === 'error' ? ' error' : '');
        setTimeout(() => t.className = 'toast', 2500);
    }
}

async function loadProfile() {
    if (!auth.currentUser) return;

    try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) return;

        const data = snap.data();

        document.getElementById('currentUsername').textContent = data.username || '—';
        document.getElementById('currentDisplayName').textContent = data.displayName || '—';
        document.getElementById('currentCoins').textContent = formatCoins(data.coins || 0) + ' QC';

        const cooldownInfo = document.getElementById('cooldownInfo');
        const changeBtn = document.getElementById('changeUsernameBtn');
        const newUsernameInput = document.getElementById('newUsername');

        const lastChange = formatDate(data.lastUsernameChange);
        const daysElapsed = daysSince(lastChange);

        if (daysElapsed >= COOLDOWN_DAYS || !lastChange) {
            cooldownInfo.innerHTML = '<span class="cooldown-ready">&#10003; You can change your username now.</span>';
            changeBtn.disabled = false;
            newUsernameInput.disabled = false;
            newUsernameInput.placeholder = 'Enter new username';
        } else {
            const remaining = daysUntil(lastChange);
            cooldownInfo.innerHTML = `<span class="cooldown-waiting">&#9200; Username change available in <strong>${remaining} day${remaining !== 1 ? 's' : ''}</strong>.</span>`;
            changeBtn.disabled = true;
            newUsernameInput.disabled = true;
            newUsernameInput.placeholder = `Available in ${remaining} day${remaining !== 1 ? 's' : ''}`;
        }

        const displayNameInput = document.getElementById('newDisplayName');
        const displayNameBtn = document.getElementById('changeDisplayNameBtn');
        const displayNameCooldown = document.getElementById('displayNameCooldownInfo');
        if (displayNameInput) {
            displayNameInput.value = '';
            displayNameInput.placeholder = data.displayName || 'Enter new display name';

            const lastDNChange = formatDate(data.lastDisplayNameChange);
            const dnDaysElapsed = daysSince(lastDNChange);

            if (dnDaysElapsed >= DISPLAY_NAME_COOLDOWN || !lastDNChange) {
                if (displayNameCooldown) displayNameCooldown.innerHTML = '<span class="cooldown-ready">&#10003; You can change your display name now.</span>';
                if (displayNameBtn) displayNameBtn.disabled = false;
                displayNameInput.disabled = false;
                displayNameInput.placeholder = 'Enter new display name';
            } else {
                const dnRemaining = daysUntil.call({getTime: () => lastDNChange.getTime() + DISPLAY_NAME_COOLDOWN * 86400000}, lastDNChange);
                const target = new Date(lastDNChange.getTime() + DISPLAY_NAME_COOLDOWN * 86400000);
                const dnDaysLeft = Math.max(0, Math.ceil((target - new Date()) / 86400000));
                if (displayNameCooldown) displayNameCooldown.innerHTML = `<span class="cooldown-waiting">&#9200; Display name change available in <strong>${dnDaysLeft} day${dnDaysLeft !== 1 ? 's' : ''}</strong>.</span>`;
                if (displayNameBtn) displayNameBtn.disabled = true;
                displayNameInput.disabled = true;
                displayNameInput.placeholder = `Available in ${dnDaysLeft} day${dnDaysLeft !== 1 ? 's' : ''}`;
            }
        }
    } catch (error) {
        console.error('Failed to load profile:', error);
    }
}

document.getElementById('changeUsernameBtn').addEventListener('click', async () => {
    if (!auth.currentUser) {
        showToast('You must be signed in.', 'error');
        return;
    }

    const newUsername = document.getElementById('newUsername').value.trim();
    const errorEl = document.getElementById('usernameError');
    errorEl.textContent = '';

    if (newUsername.length < 3) {
        errorEl.textContent = 'Username must be at least 3 characters.';
        return;
    }

    if (newUsername.length > 20) {
        errorEl.textContent = 'Username must be under 20 characters.';
        return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
        errorEl.textContent = 'Only letters, numbers and _ are allowed.';
        return;
    }

    const userRef = doc(db, 'users', auth.currentUser.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;

    const userData = snap.data();
    const coins = userData.coins || 0;

    if (coins < USERNAME_CHANGE_COST) {
        errorEl.textContent = `Not enough coins. You need ${formatCoins(USERNAME_CHANGE_COST)} QC.`;
        return;
    }

    if (userData.username === newUsername) {
        errorEl.textContent = 'This is already your username.';
        return;
    }

    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('username', '==', newUsername));
    const result = await getDocs(q);

    if (!result.empty) {
        errorEl.textContent = 'Username already taken.';
        return;
    }

    try {
        const btn = document.getElementById('changeUsernameBtn');
        btn.disabled = true;
        btn.textContent = 'CHANGING...';

        await updateDoc(userRef, {
            username: newUsername,
            coins: coins - USERNAME_CHANGE_COST,
            totalCoinsEarned: userData.totalCoinsEarned || 0,
            lastUsernameChange: serverTimestamp()
        });

        document.getElementById('currentUsername').textContent = newUsername;
        document.getElementById('currentCoins').textContent = formatCoins(coins - USERNAME_CHANGE_COST) + ' QC';
        document.getElementById('newUsername').value = '';
        errorEl.textContent = '';

        if (typeof window.updateCoinDisplay === 'function') {
            window.updateCoinDisplay(coins - USERNAME_CHANGE_COST);
        }

        showToast('Username changed successfully!');
        loadProfile();
    } catch (error) {
        console.error('Failed to change username:', error);
        showToast('Failed to change username.', 'error');
    } finally {
        const btn = document.getElementById('changeUsernameBtn');
        btn.disabled = false;
        btn.textContent = 'CHANGE USERNAME';
    }
});

const changeDisplayNameBtn = document.getElementById('changeDisplayNameBtn');
if (changeDisplayNameBtn) {
    changeDisplayNameBtn.addEventListener('click', async () => {
        if (!auth.currentUser) {
            showToast('You must be signed in.', 'error');
            return;
        }

        const newDisplayName = document.getElementById('newDisplayName').value.trim();
        const errorEl = document.getElementById('displayNameError');
        errorEl.textContent = '';

        if (newDisplayName.length < 2) {
            errorEl.textContent = 'Display name must be at least 2 characters.';
            return;
        }

        if (newDisplayName.length > 30) {
            errorEl.textContent = 'Display name must be under 30 characters.';
            return;
        }

        const userRef = doc(db, 'users', auth.currentUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) return;

        const userData = snap.data();

        if (userData.displayName === newDisplayName) {
            errorEl.textContent = 'This is already your display name.';
            return;
        }

        const lastDNChange = formatDate(userData.lastDisplayNameChange);
        if (lastDNChange) {
            const target = new Date(lastDNChange.getTime() + DISPLAY_NAME_COOLDOWN * 86400000);
            if (new Date() < target) {
                const dnDaysLeft = Math.max(0, Math.ceil((target - new Date()) / 86400000));
                errorEl.textContent = `Display name change available in ${dnDaysLeft} day${dnDaysLeft !== 1 ? 's' : ''}.`;
                return;
            }
        }

        try {
            changeDisplayNameBtn.disabled = true;
            changeDisplayNameBtn.textContent = 'SAVING...';

            await updateDoc(userRef, {
                displayName: newDisplayName,
                lastDisplayNameChange: serverTimestamp()
            });

            document.getElementById('currentDisplayName').textContent = newDisplayName;
            document.getElementById('newDisplayName').value = '';
            errorEl.textContent = '';

            if (window.userData) {
                window.userData.displayName = newDisplayName;
            }
            if (typeof window.updateNavProfile === 'function' && window.userData) {
                window.updateNavProfile(window.userData);
            }

            showToast('Display name updated!');
        } catch (error) {
            console.error('Failed to update display name:', error);
            showToast('Failed to update display name.', 'error');
        } finally {
            changeDisplayNameBtn.disabled = false;
            changeDisplayNameBtn.textContent = 'SAVE DISPLAY NAME';
        }
    });
}

if (auth.currentUser) {
    loadProfile();
} else {
    auth.onAuthStateChanged(user => {
        if (user) loadProfile();
    });
}
