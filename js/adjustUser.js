import { db, auth } from './firebase.js';
import { buildPeriodXpUpdate } from './periods.js';
import {
    doc,
    getDoc,
    updateDoc,
    collection,
    query,
    where,
    getDocs,
    limit
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}

function formatNumber(n) {
    return Number(n || 0).toLocaleString();
}

function showToast(msg, type) {
    const t = document.getElementById('toast');
    if (t) {
        t.textContent = msg;
        t.className = 'toast show' + (type === 'error' ? ' error' : '');
        setTimeout(() => t.className = 'toast', 2500);
    }
}

let adjustState = {
    mode: 'add',
    userDoc: null,
    userId: null
};

// =====================
// SEARCH
// =====================

async function searchUser() {
    const input = document.getElementById('adjustSearchInput');
    const errorEl = document.getElementById('adjustSearchError');
    const resultsEl = document.getElementById('adjustSearchResults');
    if (!input || !resultsEl) return;

    const term = input.value.trim();
    errorEl.textContent = '';
    resultsEl.innerHTML = '';

    if (term.length < 2) {
        errorEl.textContent = 'Type at least 2 characters to search.';
        return;
    }

    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', term), limit(1));
        const snap = await getDocs(q);

        if (snap.empty) {
            errorEl.textContent = 'No user found with that username.';
            return;
        }

        const userDoc = snap.docs[0];
        const data = userDoc.data();

        resultsEl.innerHTML = `
            <div class="adjust-result" data-user-id="${esc(userDoc.id)}">
                <div class="adjust-result-info">
                    <div class="adjust-result-name">${esc(data.username || 'Unknown')}</div>
                    <div class="adjust-result-detail">
                        <span>LV ${data.level || 0}</span> &middot;
                        <span>${formatNumber(data.xp || 0)} XP</span> &middot;
                        <span>${formatNumber(data.coins || 0)} QC</span>
                    </div>
                </div>
                <button class="btn-primary adjust-select-btn" type="button">SELECT</button>
            </div>
        `;
    } catch (err) {
        console.error('Search failed:', err);
        errorEl.textContent = 'Search failed. Try again.';
    }
}

// =====================
// OPEN ADJUST MODAL
// =====================

async function openAdjustModal(userId) {
    try {
        const snap = await getDoc(doc(db, 'users', userId));
        if (!snap.exists()) {
            showToast('User not found.', 'error');
            return;
        }

        const data = snap.data();
        adjustState.userId = userId;
        adjustState.userDoc = data;
        adjustState.mode = 'add';

        const modal = document.getElementById('adjustUserModal');
        document.getElementById('adjustUserName').textContent = data.username || 'Unknown';
        document.getElementById('adjustUserLevel').textContent = 'Level ' + (data.level || 0);

        const coinsInput = document.getElementById('adjustCoinsInput');
        const xpInput = document.getElementById('adjustXPInput');
        coinsInput.value = '';
        xpInput.value = '';
        document.getElementById('adjustCoinsError').textContent = '';
        document.getElementById('adjustXPError').textContent = '';

        updateModeToggle();
        modal.hidden = false;
    } catch (err) {
        console.error('Failed to load user:', err);
        showToast('Failed to load user.', 'error');
    }
}

// =====================
// MODE TOGGLE (+/-)
// =====================

function updateModeToggle() {
    const toggleBtn = document.getElementById('adjustModeToggle');
    const modeLabel = document.getElementById('adjustModeLabel');
    if (!toggleBtn || !modeLabel) return;

    if (adjustState.mode === 'add') {
        toggleBtn.textContent = '+';
        toggleBtn.className = 'adjust-mode-btn add';
        modeLabel.textContent = 'ADD';
        modeLabel.style.color = 'var(--green)';
    } else {
        toggleBtn.textContent = '-';
        toggleBtn.className = 'adjust-mode-btn subtract';
        modeLabel.textContent = 'SUBTRACT';
        modeLabel.style.color = 'var(--red)';
    }
}

// =====================
// SAVE ADJUSTMENTS
// =====================

async function saveAdjustments() {
    const userId = adjustState.userId;
    if (!userId) return;

    const coinsVal = parseInt(document.getElementById('adjustCoinsInput').value, 10);
    const xpVal = parseInt(document.getElementById('adjustXPInput').value, 10);
    const coinsError = document.getElementById('adjustCoinsError');
    const xpError = document.getElementById('adjustXPError');
    coinsError.textContent = '';
    xpError.textContent = '';

    const hasCoins = !isNaN(coinsVal) && coinsVal > 0;
    const hasXP = !isNaN(xpVal) && xpVal > 0;

    if (!hasCoins && !hasXP) {
        coinsError.textContent = 'Enter an amount for at least one field.';
        return;
    }

    try {
        const snap = await getDoc(doc(db, 'users', userId));
        if (!snap.exists()) {
            showToast('User not found.', 'error');
            return;
        }

        const data = snap.data();
        const currentCoins = data.coins || 0;
        const currentXP = data.xp || 0;
        const updateFields = {};

        if (hasCoins) {
            if (adjustState.mode === 'subtract' && coinsVal > currentCoins) {
                coinsError.textContent = `User only has ${formatNumber(currentCoins)} QC.`;
                return;
            }
            updateFields.coins = adjustState.mode === 'add' ? currentCoins + coinsVal : currentCoins - coinsVal;
        }

        if (hasXP) {
            if (adjustState.mode === 'subtract' && xpVal > currentXP) {
                xpError.textContent = `User only has ${formatNumber(currentXP)} XP.`;
                return;
            }
            updateFields.xp = adjustState.mode === 'add' ? currentXP + xpVal : currentXP - xpVal;
        }

        if (typeof window.xpSystem?.getProgressToNextLevel === 'function' && updateFields.xp !== undefined) {
            const progress = window.xpSystem.getProgressToNextLevel(updateFields.xp);
            updateFields.level = progress.level;
            updateFields.xpInLevel = progress.xpInLevel;
        }

        if (hasXP) {
            const delta = adjustState.mode === 'add' ? xpVal : -xpVal;
            Object.assign(updateFields, buildPeriodXpUpdate(data, delta));
        }

        if (hasCoins && updateFields.coins !== undefined) {
            updateFields.totalCoinsEarned = (data.totalCoinsEarned || 0) + (adjustState.mode === 'add' ? coinsVal : 0);
        }

        await updateDoc(doc(db, 'users', userId), updateFields);

        const modeLabel = adjustState.mode === 'add' ? 'Added' : 'Subtracted';
        const parts = [];
        if (hasCoins) parts.push(`${formatNumber(coinsVal)} QC`);
        if (hasXP) parts.push(`${formatNumber(xpVal)} XP`);
        showToast(`${modeLabel} ${parts.join(' and ')} ${adjustState.mode === 'add' ? 'to' : 'from'} ${(data.username || 'user')}!`);

        document.getElementById('adjustUserModal').hidden = true;
        adjustState.userId = null;
        adjustState.userDoc = null;
    } catch (err) {
        console.error('Failed to save adjustments:', err);
        showToast('Failed to save adjustments.', 'error');
    }
}

// =====================
// INIT
// =====================

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('adjustSearchBtn')?.addEventListener('click', searchUser);
    document.getElementById('adjustSearchInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchUser();
    });

    document.getElementById('adjustSearchResults')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.adjust-select-btn');
        if (!btn) return;
        const card = btn.closest('.adjust-result');
        if (card) openAdjustModal(card.dataset.userId);
    });

    document.getElementById('adjustModeToggle')?.addEventListener('click', () => {
        adjustState.mode = adjustState.mode === 'add' ? 'subtract' : 'add';
        updateModeToggle();
    });

    document.getElementById('adjustSaveBtn')?.addEventListener('click', saveAdjustments);

    document.getElementById('closeAdjustModal')?.addEventListener('click', () => {
        document.getElementById('adjustUserModal').hidden = true;
    });
    document.getElementById('cancelAdjustBtn')?.addEventListener('click', () => {
        document.getElementById('adjustUserModal').hidden = true;
    });
    document.getElementById('adjustUserModal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) e.target.hidden = true;
    });
});
