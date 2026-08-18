import { auth, db } from './firebase.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  orderBy,
  limit,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const signinBtn = document.getElementById("signinBtn");
const signoutBtn = document.getElementById("signoutBtn");
const qpBalance = document.getElementById("qpBalance");
const biomeTabs = document.querySelectorAll(".biome-tab");
const featuredGrid = document.getElementById("featuredGrid");
const biomeLabel = document.getElementById("biomeLabel");

let allQuests = [];
let userQuestIds = new Set();
let savedQuestIds = new Set();
let currentBiome = "forest";
let currentSelectedQuest = null;
let featuredQuestsUnsubscribe = null;

function isQuestPublished(data) {
  if (typeof data?.isPublished === 'boolean') return data.isPublished;
  if (typeof data?.isPublished === 'string') return data.isPublished.toLowerCase() === 'true';
  if (typeof data?.published === 'boolean') return data.published;
  if (typeof data?.published === 'string') return data.published.toLowerCase() === 'true';
  if (typeof data?.status === 'string') {
    return data.status.toLowerCase() === 'published';
  }
  return true;
}

function getQuestImage(quest) {
  return quest.imageUrl || quest.image || quest.imageLink || 'Icons/Tree.png';
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

window.showToast = function(message) {
  const toast = document.getElementById('toastPopup');
  if (toast) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3200);
  }
};

async function loadUserQuestIds() {
  userQuestIds = new Set();
  savedQuestIds = new Set();
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const userQuestsRef = collection(db, 'users', currentUser.uid, 'userQuests');
    const snapshot = await getDocs(userQuestsRef);
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.status === 'active' || data.status === 'pending' || data.status === 'completed') {
        userQuestIds.add(docSnap.id);
      }
      if (data.status === 'saved') {
        savedQuestIds.add(docSnap.id);
      }
    });
  } catch (error) {
    console.error("Error loading user quest IDs:", error);
  }
}

async function loadFeaturedQuests() {
  try {
    await loadUserQuestIds();

    if (featuredQuestsUnsubscribe) {
      featuredQuestsUnsubscribe();
      featuredQuestsUnsubscribe = null;
    }

    const questsRef = collection(db, 'quests');
    const q = query(questsRef, orderBy('createdAt', 'desc'), limit(24));
    featuredQuestsUnsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        featuredGrid.innerHTML = '<div class="empty-collection" style="grid-column:1/-1;padding:22px;color:#b8d0e2;background:#173452;border:2px solid var(--deep-ink);font-size:13px;text-align:center">No quests available yet.</div>';
        allQuests = [];
        return;
      }

      allQuests = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (!isQuestPublished(data)) return;
        allQuests.push({ id: docSnap.id, ...data });
      });

      renderFeaturedQuests(currentBiome);
    }, (error) => {
      console.error("Error loading featured quests:", error);
      featuredGrid.innerHTML = '<div class="empty-collection" style="grid-column:1/-1;padding:22px;color:#b8d0e2;background:#173452;border:2px solid var(--deep-ink);font-size:13px;text-align:center">Error loading quests.</div>';
    });
  } catch (error) {
    console.error("Error loading featured quests:", error);
    featuredGrid.innerHTML = '<div class="empty-collection" style="grid-column:1/-1;padding:22px;color:#b8d0e2;background:#173452;border:2px solid var(--deep-ink);font-size:13px;text-align:center">Error loading quests.</div>';
  }
}

function renderFeaturedQuests(biome) {
  currentBiome = biome;
  biomeLabel.textContent = `${biome.toUpperCase()} PICKS`;

  const filtered = allQuests.filter(quest => {
    if (userQuestIds.has(quest.id)) return false;
    return quest.biome && quest.biome.toLowerCase() === biome.toLowerCase();
  });

  if (filtered.length === 0) {
    featuredGrid.innerHTML = `<div class="empty-collection" style="grid-column:1/-1;padding:22px;color:#b8d0e2;background:#173452;border:2px solid var(--deep-ink);font-size:13px;text-align:center">No ${biome} quests found.</div>`;
    return;
  }

  featuredGrid.innerHTML = filtered.map(quest => {
    const isSaved = savedQuestIds.has(quest.id);
    const starBadge = isSaved ? '<img src="Icons/Star.png" style="position:absolute;top:8px;left:8px;width:22px;height:22px;z-index:5;pointer-events:none;image-rendering:pixelated;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6))" alt="Saved">' : '';
    const img = getQuestImage(quest);
    const reward = quest.Reward ?? quest.reward ?? 0;
    return `
      <article class="featured-card" style="position:relative">
        ${starBadge}
        <span class="featured-type">${escHtml(quest.category || quest.biome || 'QUEST')}</span>
        <h3>${escHtml(quest.title || 'Untitled Quest')}</h3>
        <img src="${escHtml(img)}" alt="${escHtml(quest.biome || 'quest')} artwork">
        <p>${escHtml(quest.description || 'No description.')}</p>
        <div class="quest-meta">${escHtml((quest.biome || 'GENERAL').toUpperCase())} &middot; ${(quest.effort || quest.difficulty || 'medium').toUpperCase()} &middot; +${quest.finalXP || quest.xp || 0} XP &middot; ${reward > 0 ? reward + ' Coins' : 'Free'}</div>
        <button class="quest-accept" type="button" onclick="event.stopPropagation();window.acceptHomeQuest('${escHtml(quest.id)}')">ACCEPT QUEST &#8250;</button>
      </article>`;
  }).join("");
}

window.toggleMenu = function() {
  sidebar.classList.toggle("active");
  overlay.classList.toggle("active");
}

overlay.onclick = () => {
  sidebar.classList.remove("active");
  overlay.classList.remove("active");
};

biomeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    biomeTabs.forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    renderFeaturedQuests(tab.dataset.biome);
  });
});

// ==========================================
// HOME PAGE QUEST DETAIL MODAL
// ==========================================
window.openHomeQuestDetail = function(questId) {
  const quest = allQuests.find(q => q.id === questId);
  if (!quest) return;
  currentSelectedQuest = quest;

  document.getElementById('homeModalImage').src = getQuestImage(quest);
  document.getElementById('homeModalTitle').textContent = quest.title || 'Quest';
  document.getElementById('homeModalXP').textContent = `+${quest.finalXP || quest.xp || 0} XP`;
  document.getElementById('homeModalBiome').textContent = `Biome: ${quest.biome || 'General'}`;
  document.getElementById('homeModalCost').textContent = `Cost: ${quest.budget || quest.cost || 'Free'}`;
  const effortLabel = (quest.effort || quest.difficulty || 'medium').charAt(0).toUpperCase() + (quest.effort || quest.difficulty || 'medium').slice(1);
  const advLabel = (quest.adventureRating || 'common').charAt(0).toUpperCase() + (quest.adventureRating || 'common').slice(1);
  document.getElementById('homeModalDesc').innerHTML = `<div style="margin-bottom:8px;"><strong>Effort:</strong> ${effortLabel} &middot; <strong>Rating:</strong> ${advLabel}</div>` + (quest.description || 'No description provided.');

  const acceptBtn = document.getElementById('homeAcceptQuestBtn');
  const saveBtn = document.getElementById('homeSaveQuestBtn');
  if (userQuestIds.has(questId)) {
    acceptBtn.disabled = true;
    acceptBtn.textContent = 'ALREADY ACCEPTED';
  } else {
    acceptBtn.disabled = false;
    acceptBtn.textContent = '✔ ACCEPT QUEST';
  }
  if (savedQuestIds.has(questId)) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'ALREADY SAVED';
  } else {
    saveBtn.disabled = false;
    saveBtn.textContent = '★ SAVE QUEST';
  }

  document.getElementById('homeQuestDetailModal').hidden = false;
};

document.getElementById('closeHomeDetailBtn')?.addEventListener('click', () => {
  document.getElementById('homeQuestDetailModal').hidden = true;
});

document.getElementById('homeQuestDetailModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.hidden = true;
});

document.getElementById('homeAcceptQuestBtn')?.addEventListener('click', async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) { window.showSignInRequired('accept'); return; }
  if (!currentSelectedQuest) return;

  try {
    const userQuestRef = doc(db, 'users', currentUser.uid, 'userQuests', currentSelectedQuest.id);
    await setDoc(userQuestRef, {
      ...currentSelectedQuest,
      status: 'active',
      acceptedAt: new Date()
    });
    userQuestIds.add(currentSelectedQuest.id);
    document.getElementById('homeQuestDetailModal').hidden = true;
    document.getElementById('homeAcceptedModal').hidden = false;
    renderFeaturedQuests(currentBiome);
    window.showToast('Quest accepted!');
  } catch (error) {
    console.error("Error accepting quest:", error);
    window.showToast('Failed to accept quest.');
  }
});

window.showSignInRequired = function(action) {
  const word = document.getElementById('signInActionWord');
  if (word) word.textContent = action || 'accept or save';
  const modal = document.getElementById('signInRequiredModal');
  if (modal) modal.hidden = false;
};

document.getElementById('closeSignInRequiredBtn')?.addEventListener('click', () => {
  document.getElementById('signInRequiredModal').hidden = true;
});
document.getElementById('signInRequiredModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.hidden = true;
});
document.getElementById('signInRequiredBtn')?.addEventListener('click', () => {
  const btn = document.getElementById('signinBtn');
  if (btn) btn.click();
});

window.acceptHomeQuest = async function(questId) {
  const currentUser = auth.currentUser;
  if (!currentUser) { window.showSignInRequired('accept'); return; }
  const quest = allQuests.find(q => q.id === questId);
  if (!quest) return;
  if (userQuestIds.has(questId)) { window.showToast('Quest already accepted!'); return; }

  try {
    const userQuestRef = doc(db, 'users', currentUser.uid, 'userQuests', questId);
    await setDoc(userQuestRef, {
      ...quest,
      status: 'active',
      acceptedAt: new Date()
    });
    userQuestIds.add(questId);
    renderFeaturedQuests(currentBiome);
    window.showToast('Quest accepted!');
  } catch (error) {
    console.error("Error accepting quest:", error);
    window.showToast('Failed to accept quest.');
  }
};

document.getElementById('homeSaveQuestBtn')?.addEventListener('click', async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) { window.showSignInRequired('save'); return; }
  if (!currentSelectedQuest) return;

  try {
    const userQuestRef = doc(db, 'users', currentUser.uid, 'userQuests', currentSelectedQuest.id);
    await setDoc(userQuestRef, {
      ...currentSelectedQuest,
      status: 'saved',
      savedAt: new Date()
    }, { merge: true });
    savedQuestIds.add(currentSelectedQuest.id);
    document.getElementById('homeQuestDetailModal').hidden = true;
    renderFeaturedQuests(currentBiome);
    window.showToast('Quest saved to your journal!');
  } catch (error) {
    console.error("Error saving quest:", error);
    window.showToast('Failed to save quest.');
  }
});

// Accepted modal close handlers
document.getElementById('closeHomeAcceptedBtn')?.addEventListener('click', () => {
  document.getElementById('homeAcceptedModal').hidden = true;
});
document.getElementById('ackHomeAcceptedBtn')?.addEventListener('click', () => {
  document.getElementById('homeAcceptedModal').hidden = true;
});

// ==========================================
// ROLL A QUEST — 5 rolls / 12h system
// ==========================================

const ROLL_MAX = 5;
const ROLL_WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours
const ROLL_RECHARGE_MS = ROLL_WINDOW_MS / ROLL_MAX; // 2h 24m per roll

function getRollData() {
  const raw = localStorage.getItem('sq_rolls');
  if (!raw) return { remaining: ROLL_MAX, windowStart: Date.now() };
  try {
    const d = JSON.parse(raw);
    const elapsed = Date.now() - d.windowStart;
    if (elapsed >= ROLL_WINDOW_MS) {
      // Window expired — full reset
      return { remaining: ROLL_MAX, windowStart: Date.now() };
    }
    // Recharge: each ROLL_RECHARGE_MS adds 1 roll back, capped at max
    const recharged = Math.floor(elapsed / ROLL_RECHARGE_MS);
    const remaining = Math.min(d.remaining + recharged, ROLL_MAX);
    // Figure out the effective window start for the remaining rolls
    const lastRechargeTime = d.windowStart + recharged * ROLL_RECHARGE_MS;
    return { remaining, windowStart: lastRechargeTime };
  } catch {
    return { remaining: ROLL_MAX, windowStart: Date.now() };
  }
}

function saveRollData(data) {
  localStorage.setItem('sq_rolls', JSON.stringify(data));
}

function useOneRoll() {
  const d = getRollData();
  if (d.remaining <= 0) return false;
  d.remaining -= 1;
  if (d.remaining === 0) {
    // Start a fresh 12h window from now
    d.windowStart = Date.now();
  }
  saveRollData(d);
  return true;
}

function getTimeUntilNextRoll() {
  const d = getRollData();
  if (d.remaining >= ROLL_MAX) return 0;
  const elapsed = Date.now() - d.windowStart;
  const nextAt = (Math.floor(elapsed / ROLL_RECHARGE_MS) + 1) * ROLL_RECHARGE_MS;
  return Math.max(0, nextAt - elapsed);
}

function formatMs(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

let rollTimerInterval = null;

function updateRollModalUI() {
  const d = getRollData();
  const remainingText = document.getElementById('rollRemainingText');
  const pips = document.querySelectorAll('#rollPips .roll-pip');
  const timerText = document.getElementById('rollTimerText');
  const rollBtn = document.getElementById('rollModalBtn');
  const noRolls = document.getElementById('rollNoRolls');

  if (remainingText) remainingText.textContent = d.remaining;

  pips.forEach((pip, i) => {
    pip.classList.toggle('active', i < d.remaining);
  });

  if (d.remaining <= 0) {
    const wait = getTimeUntilNextRoll();
    if (timerText) timerText.textContent = `Next roll in: ${formatMs(wait)}`;
    if (rollBtn) rollBtn.disabled = true;
    if (noRolls) noRolls.hidden = false;
  } else {
    if (timerText) timerText.textContent = `Resets fully in: ${formatMs(ROLL_WINDOW_MS - (Date.now() - d.windowStart))}`;
    if (rollBtn) rollBtn.disabled = false;
    if (noRolls) noRolls.hidden = true;
  }
}

function openRollModal() {
  updateRollModalUI();
  document.getElementById('rollQuestModal').hidden = false;

  // Start live countdown
  if (rollTimerInterval) clearInterval(rollTimerInterval);
  rollTimerInterval = setInterval(updateRollModalUI, 1000);
}

function closeRollModal() {
  document.getElementById('rollQuestModal').hidden = true;
  if (rollTimerInterval) { clearInterval(rollTimerInterval); rollTimerInterval = null; }
}

// Roll animation → reveal quest
function performRoll() {
  const available = allQuests.filter(q => !userQuestIds.has(q.id) && !savedQuestIds.has(q.id));
  if (available.length === 0) {
    window.showToast('No quests available to roll!');
    closeRollModal();
    return;
  }

  if (!useOneRoll()) {
    window.showToast('No rolls remaining!');
    closeRollModal();
    return;
  }

  closeRollModal();

  // Show rolling animation
  const animOverlay = document.getElementById('rollAnimOverlay');
  animOverlay.hidden = false;

  const questIdx = Math.floor(Math.random() * available.length);
  const chosenQuest = available[questIdx];

  // Animate for 2.5 seconds then reveal
  setTimeout(() => {
    animOverlay.hidden = true;
    window.openHomeQuestDetail(chosenQuest.id);
  }, 2500);
}

// Hook up the ROLL A QUEST button → opens modal
document.getElementById('rollQuestBtn')?.addEventListener('click', () => {
  openRollModal();
});

// Hook up modal buttons
document.getElementById('closeRollModal')?.addEventListener('click', closeRollModal);
document.getElementById('rollQuestModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeRollModal();
});
document.getElementById('rollModalBtn')?.addEventListener('click', performRoll);

// ==========================================
// DAILY RANKINGS - Load real users from Firestore
// ==========================================

async function loadDailyRankings() {
  const rankingList = document.getElementById("rankingList");
  if (!rankingList) return;

  try {
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);

    if (snapshot.empty) {
      rankingList.innerHTML = '<div style="padding:20px;text-align:center;color:#5a7f9a;font-size:12px">No adventurers yet.</div>';
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const users = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.username) {
        const isToday = data.dailyResetDate === today;
        users.push({
          username: data.username,
          dailyXP: isToday ? (data.dailyXP || 0) : 0,
          level: data.level || 0,
          photoURL: data.photoURL || ""
        });
      }
    });

    users.sort((a, b) => {
      if (a.dailyXP !== b.dailyXP) return b.dailyXP - a.dailyXP;
      if (a.dailyXP === 0 && b.dailyXP === 0) return (a.username || "").localeCompare(b.username || "");
      return (a.username || "").localeCompare(b.username || "");
    });

    const top10 = users.slice(0, 10);

    if (top10.length === 0) {
      rankingList.innerHTML = '<div style="padding:20px;text-align:center;color:#5a7f9a;font-size:12px">No adventurers yet.</div>';
      return;
    }

    rankingList.innerHTML = top10.map((user, i) => {
      const rank = String(i + 1).padStart(2, "0") + ".";
      const xpFormatted = Number(user.dailyXP).toLocaleString();
      return `<div class="ranking-row"><span class="ranking-rank">${rank}</span><span>${(user.username || "ANON").toUpperCase()}</span><span class="ranking-xp">${xpFormatted} XP</span></div>`;
    }).join("");

  } catch (error) {
    console.error("Error loading rankings:", error);
    rankingList.innerHTML = '<div style="padding:20px;text-align:center;color:#5a7f9a;font-size:12px">Error loading rankings.</div>';
  }
}

// ==========================================
// INIT
// ==========================================
onAuthStateChanged(auth, async () => {
  await loadFeaturedQuests();
  await loadDailyRankings();
});
