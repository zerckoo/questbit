import { db } from "./firebase.js";
import { periodKey, toDate } from './periods.js';

import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    deleteField
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const questsCol = collection(db, "quests");

// =========================
// Load All Quests
// =========================

async function loadQuests() {
    try {
        const snapshot = await getDocs(questsCol);
        const loaded = [];

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            loaded.push({
                id: loaded.length + 1,
                firestoreId: docSnap.id,
                title: data.title || "",
                desc: data.description || data.desc || "",
                xp: data.xp || 0,
                baseXP: data.baseXP || data.xp || 0,
                adventureRating: data.adventureRating || 'common',
                finalXP: data.finalXP || data.xp || 0,
                reward: data.Reward ?? data.reward ?? 0,
                biome: data.biome || "general",
                effort: data.effort || data.difficulty || "medium",
                difficulty: data.difficulty || data.effort || "medium",
                category: data.category || "",
                budget: data.budget || data.cost || "free",
                time: data.estimatedTime || data.time || "",
                status: data.isPublished ? "published" : "draft",
                image: data.image || "",
                verify: data.verificationType || data.verify || "manual",
                createdAt: data.createdAt || null
            });
        });

        loaded.sort((a, b) => {
            const aTime = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
            const bTime = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
            return bTime - aTime;
        });

        loaded.forEach((q, i) => q.id = i + 1);

        window.quests.length = 0;
        loaded.forEach(q => window.quests.push(q));
        window.nextId = loaded.length + 1;

        if (typeof window.renderQuests === "function") {
            window.renderQuests();
        }

    } catch (error) {
        console.error("Failed to load quests:", error);
        const container = document.getElementById("adminQuestsContainer");
        if (container) {
            container.innerHTML = '<div style="padding:20px;color:#ff6b6b;background:#1b3455;border:2px solid var(--deep-ink);text-align:center;">Failed to load quests: ' + error.message + '</div>';
        }
    }
}

// =========================
// Create Quest
// =========================

window.createQuestInDB = async function (questData) {
    try {
        const docRef = await addDoc(questsCol, {
            title: questData.title,
            description: questData.desc,
            xp: questData.finalXP || questData.xp,
            baseXP: questData.xp,
            adventureRating: questData.adventureRating || 'common',
            finalXP: questData.finalXP || questData.xp,
            Reward: questData.reward,
            biome: questData.biome,
            effort: questData.effort || questData.difficulty,
            difficulty: questData.effort || questData.difficulty,
            category: questData.category,
            budget: questData.budget,
            estimatedTime: questData.time,
            image: questData.image,
            verificationType: questData.verify,
            isPublished: questData.status === "published",
            createdAt: serverTimestamp()
        });
        console.log("Quest created:", docRef.id);
        await loadQuests();
        return true;
    } catch (error) {
        console.error("Failed to create quest:", error);
        alert("Failed to create quest: " + error.message);
        return false;
    }
};

// =========================
// Update Quest
// =========================

window.updateQuestInDB = async function (firestoreId, questData) {
    try {
        const questRef = doc(db, "quests", firestoreId);
        await updateDoc(questRef, {
            title: questData.title,
            description: questData.desc,
            xp: questData.finalXP || questData.xp,
            baseXP: questData.xp,
            adventureRating: questData.adventureRating || 'common',
            finalXP: questData.finalXP || questData.xp,
            Reward: questData.reward,
            reward: deleteField(),
            biome: questData.biome,
            effort: questData.effort || questData.difficulty,
            difficulty: questData.effort || questData.difficulty,
            category: questData.category,
            budget: questData.budget,
            estimatedTime: questData.time,
            image: questData.image,
            verificationType: questData.verify,
            isPublished: questData.status === "published"
        });
        console.log("Quest updated:", firestoreId);
        await loadQuests();
        return true;
    } catch (error) {
        console.error("Failed to update quest:", error);
        alert("Failed to update quest: " + error.message);
        return false;
    }
};

// =========================
// Delete Quest
// =========================

window.deleteQuestFromDB = async function (firestoreId) {
    try {
        const questRef = doc(db, "quests", firestoreId);
        await deleteDoc(questRef);
        console.log("Quest deleted:", firestoreId);
        await loadQuests();
        return true;
    } catch (error) {
        console.error("Failed to delete quest:", error);
        alert("Failed to delete quest: " + error.message);
        return false;
    }
};

// =========================
// Toggle Publish
// =========================

window.togglePublishInDB = async function (firestoreId, currentStatus) {
    try {
        const questRef = doc(db, "quests", firestoreId);
        await updateDoc(questRef, {
            isPublished: currentStatus !== "published"
        });
        console.log("Quest publish toggled:", firestoreId);
        await loadQuests();
        return true;
    } catch (error) {
        console.error("Failed to toggle publish:", error);
        alert("Failed to toggle publish: " + error.message);
        return false;
    }
};

// =========================
// Site Settings (Feature Toggles)
// =========================

const settingsRef = doc(db, "settings", "site");

// When AI verification is ON, instant rewards are forced off (the AI gates
// rewards first), but the instant-reward system is kept so it can be re-enabled.
function applyAiCoupling(aiEnabled) {
    const instantToggle = document.getElementById("instantRewardsToggle");
    if (!instantToggle) return;
    instantToggle.disabled = aiEnabled;
    if (aiEnabled) instantToggle.checked = false;
}

window.loadSiteSettings = async function () {
    try {
        const snap = await getDoc(settingsRef);
        const data = snap.exists() ? snap.data() : {};

        const instant = data.instantRewards === true;
        const ai = data.aiVerificationEnabled === true;
        const url = data.aiVerificationUrl || '';
        const storageEnabled = data.proofImageStorage === true;

        const instantToggle = document.getElementById("instantRewardsToggle");
        if (instantToggle) instantToggle.checked = instant;
        const aiToggle = document.getElementById("aiVerificationToggle");
        if (aiToggle) aiToggle.checked = ai;
        const urlInput = document.getElementById("aiVerificationUrl");
        if (urlInput) urlInput.value = url;
        const storageToggle = document.getElementById("proofImageStorageToggle");
        if (storageToggle) storageToggle.checked = storageEnabled;

        applyAiCoupling(ai);

        const status = document.getElementById("settingsStatus");
        if (status) {
            const parts = [];
            parts.push(ai ? "AI verification is ON — instant rewards are disabled." : "AI verification is OFF.");
            parts.push(instant ? "Instant rewards are ON." : "Instant rewards are OFF.");
            parts.push(storageEnabled ? "Proof images are stored in Firebase Storage." : "Proof images stay embedded (thumbnail-style, no storage).");
            status.textContent = parts.join("  ");
        }
    } catch (error) {
        console.error("Failed to load site settings:", error);
        const status = document.getElementById("settingsStatus");
        if (status) status.textContent = "Failed to load settings: " + error.message;
    }
};

window.saveSiteSettings = async function () {
    const instantToggle = document.getElementById("instantRewardsToggle");
    const aiToggle = document.getElementById("aiVerificationToggle");
    const urlInput = document.getElementById("aiVerificationUrl");
    const storageToggle = document.getElementById("proofImageStorageToggle");

    const ai = !!(aiToggle && aiToggle.checked);
    const instant = !ai && !!(instantToggle && instantToggle.checked);

    try {
        await setDoc(settingsRef, {
            instantRewards: instant,
            aiVerificationEnabled: ai,
            aiVerificationUrl: urlInput ? urlInput.value.trim() : '',
            proofImageStorage: !!(storageToggle && storageToggle.checked)
        }, { merge: true });
        console.log("Site settings saved.", { ai, instant, proofImageStorage: !!(storageToggle && storageToggle.checked) });
        applyAiCoupling(ai);
        const status = document.getElementById("settingsStatus");
        if (status) status.textContent = "Saved! Changes are live for all players.";
    } catch (error) {
        console.error("Failed to save site settings:", error);
        alert("Failed to save settings: " + error.message);
        await window.loadSiteSettings();
    }
};

// =========================
// Leaderboard Backfill
// =========================

const BACKFILL_PERIODS = ['daily', 'weekly', 'monthly', 'yearly'];

function backfillFieldName(period) {
    return period === 'daily' ? 'dailyXP' : period + 'XP';
}

function backfillResetFieldName(period) {
    return period === 'daily' ? 'dailyResetDate' : period + 'ResetDate';
}

// Recomputes every player's period XP totals from their completed-quest history.
// Counts a completed quest toward a period only when its completedAt falls inside
// the current period key. Safe to re-run (idempotent, only writes period fields).
window.backfillRankings = async function () {
    const btn = document.getElementById('backfillBtn');
    const status = document.getElementById('backfillStatus');
    if (!btn || !status) return;
    if (btn.disabled) return;
    btn.disabled = true;

    const periodKeys = {};
    const periodTotals = {};
    for (const p of BACKFILL_PERIODS) {
        periodKeys[p] = periodKey(new Date(), p);
        periodTotals[p] = 0;
    }

    let usersProcessed = 0;
    let usersWithHistory = 0;
    let questsCounted = 0;

    try {
        status.textContent = 'Scanning players...';
        const usersSnap = await getDocs(collection(db, 'users'));

        for (const userDoc of usersSnap.docs) {
            const userId = userDoc.id;
            status.textContent = `Processing ${userDoc.data().username || userId}...`;

            for (const p of BACKFILL_PERIODS) periodTotals[p] = 0;

            const uqSnap = await getDocs(collection(db, 'users', userId, 'userQuests'));
            uqSnap.forEach(uq => {
                const data = uq.data();
                if (data.status !== 'completed') return;
                const completed = data.completedAt ? toDate(data.completedAt) : null;
                if (!completed) return;
                const xp = data.finalXP || data.xp || 0;
                if (xp <= 0) return;
                for (const p of BACKFILL_PERIODS) {
                    if (periodKey(completed, p) === periodKeys[p]) periodTotals[p] += xp;
                }
                questsCounted++;
            });

            const hasAny = BACKFILL_PERIODS.some(p => periodTotals[p] > 0);
            if (hasAny) {
                usersWithHistory++;
                const update = {};
                for (const p of BACKFILL_PERIODS) {
                    update[backfillFieldName(p)] = periodTotals[p];
                    update[backfillResetFieldName(p)] = periodKeys[p];
                }
                await updateDoc(doc(db, 'users', userId), update);
            }
            usersProcessed++;
        }

        status.textContent = `Done! ${usersProcessed} players scanned, ${usersWithHistory} with completed quests, ${questsCounted} quests counted.`;
    } catch (error) {
        console.error('Backfill failed:', error);
        status.textContent = 'Backfill failed: ' + error.message;
    } finally {
        btn.disabled = false;
    }
};

// =========================
// Start
// =========================

loadQuests();

const backfillBtn = document.getElementById('backfillBtn');
if (backfillBtn) {
    backfillBtn.addEventListener('click', () => {
        if (confirm('Recompute weekly, monthly and yearly XP for every player from their quest history? This overwrites the current period totals.')) {
            window.backfillRankings();
        }
    });
}

const instantRewardsToggle = document.getElementById("instantRewardsToggle");
if (instantRewardsToggle) {
    instantRewardsToggle.addEventListener("change", window.saveSiteSettings);
}
const aiVerificationToggle = document.getElementById("aiVerificationToggle");
if (aiVerificationToggle) {
    aiVerificationToggle.addEventListener("change", window.saveSiteSettings);
}
const aiVerificationUrl = document.getElementById("aiVerificationUrl");
if (aiVerificationUrl) {
    aiVerificationUrl.addEventListener("change", window.saveSiteSettings);
}
const proofImageStorageToggle = document.getElementById("proofImageStorageToggle");
if (proofImageStorageToggle) {
    proofImageStorageToggle.addEventListener("change", window.saveSiteSettings);
}
loadSiteSettings();
