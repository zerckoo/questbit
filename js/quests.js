import { auth, db, storage } from './firebase.js';
import { getProgressToNextLevel, showLevelUpModal } from './xpSystem.js';
import { buildPeriodXpUpdate } from './periods.js';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc,
  deleteDoc,
  query, 
  where,
  orderBy,
  limit,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-storage.js";

// ==========================================
// SITE SETTINGS (feature toggles from admin dashboard)
// ==========================================
// instantRewards: completing a quest rewards XP/coins immediately; the proof is
// still queued for moderator review and the reward is reversed if rejected.
// aiVerificationEnabled: proofs are checked by the AI verifier first; while ON,
// instant rewards are disabled (but the system is kept, not deleted).
// proofImageStorage: when true photos upload to Firebase Storage; when false they
// stay embedded with the entry like quest thumbnails (no storage used).
let instantRewardsEnabled = false;
let aiVerificationEnabled = false;
let aiVerificationUrl = '';
let proofImageStorage = false;

async function loadSiteSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'site'));
    if (snap.exists()) {
      const data = snap.data();
      instantRewardsEnabled = data.instantRewards === true;
      aiVerificationEnabled = data.aiVerificationEnabled === true;
      aiVerificationUrl = data.aiVerificationUrl || '';
      proofImageStorage = data.proofImageStorage === true;
    }
  } catch (e) {
    console.error('Failed to load site settings:', e);
  }
}

function aiModeActive() {
  return aiVerificationEnabled && !!aiVerificationUrl;
}

function instantModeActive() {
  return instantRewardsEnabled && !aiModeActive();
}

function submitButtonLabel() {
  if (aiModeActive()) return 'SUBMIT FOR AI VERIFICATION';
  if (instantModeActive()) return 'COMPLETE QUEST';
  return 'SUBMIT FOR REVIEW';
}

// ==========================================
// GLOBAL STATE & UTILITIES
// ==========================================
let allQuests = [];
let currentSelectedQuest = null;
let userQuestIds = new Set();
let savedQuestIds = new Set();
let publicQuestsUnsubscribe = null;

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

// Firebase diagnostic function
window.checkFirebaseStatus = async function() {
  console.log("=== Firebase Connectivity Check ===");
  console.log("Auth status:", auth.currentUser ? "✓ Signed in" : "✗ Not signed in");
  console.log("Auth object:", auth ? "✓ Available" : "✗ Not available");
  console.log("Firestore object:", db ? "✓ Available" : "✗ Not available");
  console.log("Storage object:", storage ? "✓ Available" : "✗ Not available");
  
  if (auth.currentUser) {
    try {
      console.log("Attempting test read from Firestore...");
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const snap = await Promise.race([
        getDoc(userRef),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Test read timeout")), 5000))
      ]);
      console.log("✓ Firestore read successful");
      return { firebaseOnline: true, message: "Firebase is working properly" };
    } catch (error) {
      console.error("✗ Firestore read failed:", error.message);
      return { firebaseOnline: false, message: `Firebase issue: ${error.message}` };
    }
  } else {
    console.log("Cannot test - no user signed in");
    return { firebaseOnline: null, message: "Sign in to test Firebase connection" };
  }
};

function getQuestImage(quest) {
  return quest.imageUrl || quest.image || quest.imageLink || 'Icons/Tree.png';
}

// Bottom-Right Toast Notification
window.showToast = function(message) {
  const toast = document.getElementById('toastPopup');
  if (toast) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }
};

// ==========================================
// 0. LOAD USER'S QUEST IDS (to exclude from board)
// ==========================================
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

// ==========================================
// 1. FETCH & RENDER PUBLIC QUEST BOARD
// ==========================================
async function loadPublicQuests() {
  const questListContainer = document.getElementById('questList');
  if (!questListContainer) return;

  try {
    await loadUserQuestIds();

    if (publicQuestsUnsubscribe) {
      publicQuestsUnsubscribe();
      publicQuestsUnsubscribe = null;
    }

    const questsRef = collection(db, 'quests');
    publicQuestsUnsubscribe = onSnapshot(questsRef, (snapshot) => {
      if (snapshot.empty) {
        questListContainer.innerHTML = '<div class="empty-collection">No quests available at the moment.</div>';
        allQuests = [];
        return;
      }

      allQuests = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (!isQuestPublished(data)) return;
        allQuests.push({ id: docSnap.id, ...data });
      });

      applyQuestFilters();
    }, (error) => {
      console.error("Error loading quests:", error);
      questListContainer.innerHTML = '<div class="empty-collection">Error loading quests from database.</div>';
    });
  } catch (error) {
    console.error("Error loading quests:", error);
    questListContainer.innerHTML = '<div class="empty-collection">Error loading quests from database.</div>';
  }
}

// Apply Biome & Cost Filters (excluding accepted/saved/pending/completed)
window.applyQuestFilters = function() {
  const questListContainer = document.getElementById('questList');
  const questCountEl = document.getElementById('questCount');
  if (!questListContainer) return;

  const selectedBiome = localStorage.getItem('selectedBiome') || 'all';
  const selectedCost = localStorage.getItem('selectedCost') || 'all';

  const filtered = allQuests.filter(quest => {
    if (userQuestIds.has(quest.id)) return false;
    const matchBiome = (selectedBiome === 'all') || (quest.biome && quest.biome.toLowerCase() === selectedBiome.toLowerCase());
    const matchCost = (selectedCost === 'all') || ((quest.cost || quest.budget || '').toLowerCase() === selectedCost.toLowerCase());
    return matchBiome && matchCost;
  });

  if (questCountEl) {
    questCountEl.textContent = `${filtered.length} QUEST${filtered.length === 1 ? '' : 'S'}`;
  }

  if (filtered.length === 0) {
    questListContainer.innerHTML = '<div class="empty-collection">No quests match your selected filters.</div>';
    return;
  }

  let html = '';
  filtered.forEach(quest => {
    const isSaved = savedQuestIds.has(quest.id);
    const starBadge = isSaved ? '<img class="saved-star-badge" src="Icons/Star.png" alt="Saved">' : '';
    html += `
      <div class="quest-list-item" onclick="openQuestDetailModal('${quest.id}')">
        ${starBadge}
        <img class="quest-list-image" src="${getQuestImage(quest)}" alt="Quest">
        <div class="quest-list-title">${quest.title || 'Untitled Quest'}</div>
        <div class="quest-list-summary">${quest.description || 'No description.'}</div>
        <div class="quest-list-meta">${(quest.effort || quest.difficulty || 'medium').toUpperCase()} &middot; +${quest.finalXP || quest.xp || 0} XP</div>
        
        <!-- Hover Tooltip for List View -->
        <div class="quest-tooltip">
          <strong>${quest.title}</strong><br>
          ${quest.description || ''}
        </div>
      </div>
    `;
  });

  questListContainer.innerHTML = html;
};

// ==========================================
// 2. PUBLIC QUEST DETAIL MODAL & ACTIONS
// ==========================================
window.openQuestDetailModal = function(questId) {
  const quest = allQuests.find(q => q.id === questId);
  if (!quest) return;

  currentSelectedQuest = quest;

  document.getElementById('modalImage').src = getQuestImage(quest);
  document.getElementById('modalTitle').textContent = quest.title || 'Quest';
  document.getElementById('modalXP').textContent = `+${quest.finalXP || quest.xp || 0} XP`;
  document.getElementById('modalBiome').textContent = `Biome: ${quest.biome || 'General'}`;
  document.getElementById('modalCost').textContent = `Cost: ${quest.cost || quest.budget || 'Free'}`;
  const effortLabel = (quest.effort || quest.difficulty || 'medium').charAt(0).toUpperCase() + (quest.effort || quest.difficulty || 'medium').slice(1);
  const advLabel = (quest.adventureRating || 'common').charAt(0).toUpperCase() + (quest.adventureRating || 'common').slice(1);
  const modalDesc = document.getElementById('modalDesc');
  if (modalDesc) modalDesc.innerHTML = `<div style="margin-bottom:8px;"><strong>Effort:</strong> ${effortLabel} &middot; <strong>Rating:</strong> ${advLabel}</div>` + (quest.description || 'No description provided.');
  document.getElementById('modalDesc').textContent = quest.description || 'No description standard provided.';

  const modal = document.getElementById('questDetailModal');
  if (modal) modal.hidden = false;
};

// Sign In Required Modal
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

// Accept Quest Action
const acceptQuestBtn = document.getElementById('acceptQuestBtn');
if (acceptQuestBtn) {
  acceptQuestBtn.onclick = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      window.showSignInRequired('accept');
      return;
    }
    if (!currentSelectedQuest) return;

    try {
      const userQuestRef = doc(db, 'users', currentUser.uid, 'userQuests', currentSelectedQuest.id);
      await setDoc(userQuestRef, {
        ...currentSelectedQuest,
        status: 'active',
        acceptedAt: new Date()
      });

      userQuestIds.add(currentSelectedQuest.id);

      document.getElementById('questDetailModal').hidden = true;
      document.getElementById('questAcceptedModal').hidden = false;
      applyQuestFilters();
      showToast('Quest accepted!');
    } catch (error) {
      console.error("Error accepting quest:", error);
      showToast('Failed to accept quest.');
    }
  };
}

// Save Quest Action
const saveQuestBtn = document.getElementById('saveQuestBtn');
if (saveQuestBtn) {
  saveQuestBtn.onclick = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      window.showSignInRequired('save');
      return;
    }
    if (!currentSelectedQuest) return;

    try {
      const userQuestRef = doc(db, 'users', currentUser.uid, 'userQuests', currentSelectedQuest.id);
      await setDoc(userQuestRef, {
        ...currentSelectedQuest,
        status: 'saved',
        savedAt: new Date()
      }, { merge: true });

      savedQuestIds.add(currentSelectedQuest.id);

      document.getElementById('questDetailModal').hidden = true;
      applyQuestFilters();
      showToast('Quest saved to your journal!');
    } catch (error) {
      console.error("Error saving quest:", error);
      showToast('Failed to save quest.');
    }
  };
}

// Roll a Random Quest — 5 rolls / 12h system shared with the home page
const ROLL_MAX = 5;
const ROLL_WINDOW_MS = 12 * 60 * 60 * 1000;
const ROLL_RECHARGE_MS = ROLL_WINDOW_MS / ROLL_MAX;

function getRollData() {
  const raw = localStorage.getItem('sq_rolls');
  if (!raw) return { remaining: ROLL_MAX, windowStart: Date.now() };
  try {
    const data = JSON.parse(raw);
    const elapsed = Date.now() - data.windowStart;
    if (elapsed >= ROLL_WINDOW_MS) return { remaining: ROLL_MAX, windowStart: Date.now() };
    const recharged = Math.floor(elapsed / ROLL_RECHARGE_MS);
    return {
      remaining: Math.min(data.remaining + recharged, ROLL_MAX),
      windowStart: data.windowStart + recharged * ROLL_RECHARGE_MS
    };
  } catch {
    return { remaining: ROLL_MAX, windowStart: Date.now() };
  }
}

function saveRollData(data) {
  localStorage.setItem('sq_rolls', JSON.stringify(data));
}

function useOneRoll() {
  const data = getRollData();
  if (data.remaining <= 0) return false;
  data.remaining -= 1;
  if (data.remaining === 0) data.windowStart = Date.now();
  saveRollData(data);
  return true;
}

function formatRollTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  return `${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

function updateRollModalUI() {
  const data = getRollData();
  const remainingText = document.getElementById('rollRemainingText');
  const timerText = document.getElementById('rollTimerText');
  const rollButton = document.getElementById('rollModalBtn');
  const noRolls = document.getElementById('rollNoRolls');
  if (remainingText) remainingText.textContent = data.remaining;
  document.querySelectorAll('#rollPips .roll-pip').forEach((pip, index) => pip.classList.toggle('active', index < data.remaining));
  const elapsed = Date.now() - data.windowStart;
  if (data.remaining <= 0) {
    if (timerText) timerText.textContent = `Next roll in: ${formatRollTime(Math.max(0, ROLL_RECHARGE_MS - elapsed))}`;
    if (rollButton) rollButton.disabled = true;
    if (noRolls) noRolls.hidden = false;
  } else {
    if (timerText) timerText.textContent = `Resets fully in: ${formatRollTime(Math.max(0, ROLL_WINDOW_MS - elapsed))}`;
    if (rollButton) rollButton.disabled = false;
    if (noRolls) noRolls.hidden = true;
  }
}

let rollTimerInterval = null;
function openRollModal() {
  updateRollModalUI();
  document.getElementById('rollQuestModal').hidden = false;
  if (rollTimerInterval) clearInterval(rollTimerInterval);
  rollTimerInterval = setInterval(updateRollModalUI, 1000);
}

function closeRollModal() {
  document.getElementById('rollQuestModal').hidden = true;
  if (rollTimerInterval) { clearInterval(rollTimerInterval); rollTimerInterval = null; }
}

function performRoll() {
  const available = allQuests.filter(q => !userQuestIds.has(q.id) && !savedQuestIds.has(q.id));
  if (available.length === 0) {
    showToast('No quests available to roll!');
    closeRollModal();
    return;
  }
  if (!useOneRoll()) {
    showToast('No rolls remaining!');
    closeRollModal();
    return;
  }
  closeRollModal();
  const animOverlay = document.getElementById('rollAnimOverlay');
  animOverlay.hidden = false;
  const chosenQuest = available[Math.floor(Math.random() * available.length)];
  setTimeout(() => {
    animOverlay.hidden = true;
    window.openQuestDetailModal(chosenQuest.id);
  }, 2500);
}

document.getElementById('rollQuestBtn')?.addEventListener('click', openRollModal);
document.getElementById('closeRollModal')?.addEventListener('click', closeRollModal);
document.getElementById('rollQuestModal')?.addEventListener('click', event => {
  if (event.target === event.currentTarget) closeRollModal();
});
document.getElementById('rollModalBtn')?.addEventListener('click', performRoll);

// ==========================================
// 3. JOURNAL TAB SWITCHING
// ==========================================
window.switchJournalTab = async function(tab) {
  const collectionList = document.getElementById('collectionList');
  if (!collectionList) return;

  document.querySelectorAll('.collection-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  collectionList.innerHTML = '<div class="empty-collection">Loading quests...</div>';

  const currentUser = auth.currentUser;
  if (!currentUser) {
    collectionList.innerHTML = '<div class="empty-collection">Please sign in to view your quests.</div>';
    return;
  }

  try {
    let queryStatus = tab;
    if (tab === 'active') queryStatus = 'active';

    const userQuestsRef = collection(db, 'users', currentUser.uid, 'userQuests');
    const q = query(userQuestsRef, where('status', '==', queryStatus));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      collectionList.innerHTML = `<div class="empty-collection">No ${tab} quests found.</div>`;
      return;
    }

    let html = '';
    let index = 0;
    snapshot.forEach(docSnap => {
      const quest = docSnap.data();
      const questId = docSnap.id;
      index++;
      
      let badgeText = '';
      if (tab === 'pending') {
        badgeText = quest.flaggedByAI ? '[AWAITING MOD APPROVAL]' : '[UNDER REVIEW]';
      } else if (tab === 'completed') {
        badgeText = `+${quest.xp || 0} XP`;
      } else {
        const biome = quest.biome || 'General';
        const cost = quest.cost || quest.budget || 'Free';
        const xp = quest.xp || 0;
        badgeText = `${biome} · ${cost} · ${xp} XP`;
      }

      html += `
        <div class="collection-item" onclick="openMyQuestDetail('${questId}', '${tab}')">
          <span>${index}. ${quest.title || 'Quest'}</span>
          <span>${badgeText}</span>
        </div>
      `;
    });

    collectionList.innerHTML = html;
  } catch (error) {
    console.error("Error fetching journal quests:", error);
    collectionList.innerHTML = '<div class="empty-collection">Failed to load quests.</div>';
  }
};

// ==========================================
// 4. MY QUEST SUB-DETAIL MODAL
// ==========================================
window.openMyQuestDetail = async function(questId, currentTab) {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const questRef = doc(db, 'users', currentUser.uid, 'userQuests', questId);
    const snap = await getDoc(questRef);
    if (!snap.exists()) return;

    const quest = snap.data();

    document.getElementById('myModalImage').src = getQuestImage(quest);
    document.getElementById('myModalTitle').textContent = quest.title || 'Quest';
    document.getElementById('myModalXP').textContent = `+${quest.xp || 0} XP`;
    document.getElementById('myModalBiome').textContent = `Biome: ${quest.biome || 'General'}`;
    document.getElementById('myModalCost').textContent = `Cost: ${quest.cost || quest.budget || 'Free'}`;
    
    let descHtml = quest.description || 'No description available.';
    if (currentTab === 'pending' && quest.aiReason) {
      descHtml += `<br><br><strong style="color: #ff6b6b;">AI Note:</strong> ${quest.aiReason}`;
    }
    if (currentTab === 'pending' && quest.rejectionReason) {
      descHtml += `<br><br><strong style="color: #ff6b6b;">Rejection Reason:</strong> ${quest.rejectionReason}`;
    }
    document.getElementById('myModalDesc').innerHTML = descHtml;

    const actionsContainer = document.getElementById('myModalActions');
    actionsContainer.innerHTML = '';

    if (currentTab === 'active') {
      actionsContainer.innerHTML = `
        <button class="btn-red" onclick="promptCancelQuest('${questId}')" type="button">CANCEL QUEST</button>
        <button class="btn-green" onclick="openVerificationModal('${questId}')" type="button">COMPLETE QUEST</button>
      `;
    } else if (currentTab === 'saved') {
      actionsContainer.innerHTML = `
        <button class="btn-red" onclick="promptRemoveSavedQuest('${questId}')" type="button">REMOVE</button>
        <button class="btn-green" onclick="moveSavedToActive('${questId}')" type="button">ACCEPT QUEST</button>
      `;
    } else if (currentTab === 'pending') {
      actionsContainer.innerHTML = `
        <button class="btn-green" disabled type="button">AWAITING MODERATION</button>
      `;
    }

    document.getElementById('myQuestDetailModal').hidden = false;
  } catch (error) {
    console.error("Error opening quest sub-detail:", error);
  }
};

window.moveSavedToActive = async function(questId) {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const questRef = doc(db, 'users', currentUser.uid, 'userQuests', questId);
    await updateDoc(questRef, {
      status: 'active',
      acceptedAt: new Date()
    });
    savedQuestIds.delete(questId);
    userQuestIds.add(questId);
    document.getElementById('myQuestDetailModal').hidden = true;
    switchJournalTab('active');
    showToast('Quest moved to Active Quests!');
  } catch (error) {
    console.error("Error activating saved quest:", error);
  }
};

// ==========================================
// 4b. REMOVE SAVED QUEST
// ==========================================
window.promptRemoveSavedQuest = function(questId) {
  document.getElementById('myQuestDetailModal').hidden = true;
  const removeModal = document.getElementById('removeSavedConfirmModal');
  if (removeModal) {
    removeModal.hidden = false;
    document.getElementById('confirmRemoveSavedBtn').onclick = async () => {
      await removeSavedQuest(questId);
      removeModal.hidden = true;
    };
  }
};

async function removeSavedQuest(questId) {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const questRef = doc(db, 'users', currentUser.uid, 'userQuests', questId);
    await deleteDoc(questRef);

    savedQuestIds.delete(questId);

    switchJournalTab('saved');
    showToast('Quest removed from saved list.');
  } catch (error) {
    console.error("Error removing saved quest:", error);
  }
}

// ==========================================
// 4c. CANCEL QUEST WITH 100 COIN DEDUCTION
// ==========================================
window.promptCancelQuest = function(questId) {
  document.getElementById('myQuestDetailModal').hidden = true;
  const cancelModal = document.getElementById('cancelConfirmModal');
  if (cancelModal) {
    cancelModal.hidden = false;
    document.getElementById('confirmCancelBtn').onclick = async () => {
      await cancelQuest(questId);
      cancelModal.hidden = true;
    };
  }
};

async function cancelQuest(questId) {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const currentCoins = userData.coins || 0;
      const newCoins = Math.max(0, currentCoins - 100);
      await updateDoc(userRef, { coins: newCoins });
      if (window.userData) window.userData.coins = newCoins;
      if (typeof window.updateCoinDisplay === 'function') window.updateCoinDisplay(newCoins);
    }

    const questRef = doc(db, 'users', currentUser.uid, 'userQuests', questId);
    await updateDoc(questRef, {
      status: 'cancelled',
      cancelledAt: new Date()
    });

    userQuestIds.delete(questId);

    switchJournalTab('active');
    showToast('Quest cancelled. 100 coins deducted.');
  } catch (error) {
    console.error("Error cancelling quest:", error);
  }
}

// ==========================================
// 5. VERIFICATION MODAL & PROOF SUBMISSION
// ==========================================
let currentProofQuestId = null;
let currentProofFile = null;

window.openVerificationModal = function(questId) {
  currentProofQuestId = questId;
  currentProofFile = null;

  const quest = allQuests.find(q => q.id === questId);
  if (!quest) return;

  const infoEl = document.getElementById('verificationQuestInfo');
  if (infoEl) {
    infoEl.innerHTML = `<strong>${escHtml(quest.title || 'Quest')}</strong> — +${quest.xp || 0} XP`;
  }

  const rejectionEl = document.getElementById('verificationRejection');
  if (rejectionEl) rejectionEl.style.display = 'none';

  const noteInput = document.getElementById('proofNoteInput');
  if (noteInput) noteInput.value = '';

  resetVerificationForm();

  const subtitleEl = document.getElementById('verificationSubtitle');
  if (subtitleEl) {
    if (aiModeActive()) {
      subtitleEl.textContent = 'Write a note to describe how you completed this quest. An AI verifier will check your photo proof before rewards are granted.';
    } else if (instantModeActive()) {
      subtitleEl.textContent = 'Write a note to describe how you completed this quest. Your reward is granted immediately and your proof is still reviewed by a moderator.';
    } else {
      subtitleEl.textContent = 'Write a note to describe how you completed this quest. Your submission will be reviewed by a moderator.';
    }
  }

  const submitBtnLabel = document.getElementById('submitProofBtn');
  if (submitBtnLabel) submitBtnLabel.textContent = submitButtonLabel();

  document.getElementById('myQuestDetailModal').hidden = true;

  // When instant rewards are on, require the player to accept the
  // reward-reversal disclaimer before showing the proof form.
  if (instantModeActive()) {
    document.getElementById('instantRewardNoticeModal').hidden = false;
  } else {
    document.getElementById('verificationModal').hidden = false;
  }
};

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function resetVerificationForm() {
  currentProofFile = null;
  const fileInput = document.getElementById('proofImageInput');
  if (fileInput) fileInput.value = '';
  const previewWrap = document.getElementById('proofImagePreviewWrap');
  if (previewWrap) previewWrap.style.display = 'none';
  const previewImg = document.getElementById('proofImagePreview');
  if (previewImg) previewImg.removeAttribute('src');
  const statusEl = document.getElementById('proofImageStatus');
  if (statusEl) statusEl.textContent = 'Choose a photo to attach as proof.';
}

// Converts an image file into a compressed data URL (thumbnail-style), so the
// photo can live inside the Firestore doc like quest thumbnails — no Firebase
// Storage needed. Downsizes to MAX_DIM and steps quality down to fit the doc limit.
function fileToCompressedDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1280;
        const MAX_CHARS = 700000;
        let width = img.naturalWidth || 1280;
        let height = img.naturalHeight || 1280;
        if (width > MAX_DIM || height > MAX_DIM) {
          const scale = MAX_DIM / Math.max(width, height);
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.72;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > MAX_CHARS && quality > 0.3) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Could not read the selected image.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

// Wire up verification modal elements
(function() {
  const submitBtn = document.getElementById('submitProofBtn');
  const cancelBtn = document.getElementById('cancelProofBtn');
  const closeBtn = document.getElementById('closeVerificationBtn');
  const modal = document.getElementById('verificationModal');
  const imageInput = document.getElementById('proofImageInput');

  if (imageInput) {
    imageInput.onchange = event => {
      const file = event.target.files?.[0];
      const previewWrap = document.getElementById('proofImagePreviewWrap');
      const previewImg = document.getElementById('proofImagePreview');
      const statusEl = document.getElementById('proofImageStatus');

      if (!file) {
        currentProofFile = null;
        if (previewWrap) previewWrap.style.display = 'none';
        if (previewImg) previewImg.removeAttribute('src');
        if (statusEl) statusEl.textContent = 'Choose a photo to attach as proof.';
        return;
      }

      if (!file.type.startsWith('image/')) {
        showToast('Please choose an image file.');
        imageInput.value = '';
        currentProofFile = null;
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        showToast('Image must be smaller than 5MB.');
        imageInput.value = '';
        currentProofFile = null;
        return;
      }

      currentProofFile = file;
      if (previewImg) {
        previewImg.src = URL.createObjectURL(file);
        previewImg.alt = `Preview of ${file.name}`;
      }
      if (previewWrap) previewWrap.style.display = 'block';
      if (statusEl) statusEl.textContent = `Selected: ${file.name}`;
    };
  }

  // Instant-reward disclaimer popup (only shown when the admin toggle is ON)
  const noticeModal = document.getElementById('instantRewardNoticeModal');
  const acceptInstantBtn = document.getElementById('acceptInstantRewardBtn');
  const cancelInstantBtn = document.getElementById('cancelInstantRewardBtn');
  const closeInstantBtn = document.getElementById('closeInstantRewardBtn');

  if (acceptInstantBtn) {
    acceptInstantBtn.onclick = () => {
      if (noticeModal) noticeModal.hidden = true;
      document.getElementById('verificationModal').hidden = false;
    };
  }
  if (cancelInstantBtn) {
    cancelInstantBtn.onclick = () => {
      if (noticeModal) noticeModal.hidden = true;
      currentProofQuestId = null;
      document.getElementById('myQuestDetailModal').hidden = false;
    };
  }
  if (closeInstantBtn) {
    closeInstantBtn.onclick = () => {
      if (noticeModal) noticeModal.hidden = true;
      currentProofQuestId = null;
      document.getElementById('myQuestDetailModal').hidden = false;
    };
  }
  if (noticeModal) {
    noticeModal.onclick = e => {
      if (e.target === e.currentTarget) {
        noticeModal.hidden = true;
        currentProofQuestId = null;
        document.getElementById('myQuestDetailModal').hidden = false;
      }
    };
  }

  if (submitBtn) {
    submitBtn.onclick = async () => {
      const noteInput = document.getElementById('proofNoteInput');
      const note = noteInput ? noteInput.value.trim() : '';

      if (!note && !currentProofFile) {
        showToast('Please write a description or attach a photo proof.');
        return;
      }

      const aiMode = aiModeActive();
      const instantMode = instantModeActive();

      // AI verification needs a photo to score, so require one in AI mode.
      if (aiMode && !currentProofFile) {
        showToast('Please attach a photo — the AI verifier needs it to check your proof.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = aiMode ? 'VERIFYING WITH AI...' : 'SUBMITTING...';

      // Timeout covers photo handling + the verification/write steps
      let isCompleted = false;
      const TIMEOUT_MS = aiMode ? 120000 : 60000;
      const timeoutId = setTimeout(() => {
        if (!isCompleted) {
          console.error("Submission timeout - process took too long");
          showToast('Submission timed out. Please try again.');
          submitBtn.disabled = false;
          submitBtn.textContent = submitButtonLabel();
          currentProofQuestId = null;
        }
      }, TIMEOUT_MS);

      const doneWith = (verdict) => {
        isCompleted = true;
        clearTimeout(timeoutId);
        modal.hidden = true;
        resetVerificationForm();
        submitBtn.disabled = false;
        submitBtn.textContent = submitButtonLabel();
        switchJournalTab(verdict);
      };

      try {
        console.log("Starting quest proof submission...");
        let proofData = { photoUrl: '', note: note };

        if (currentProofFile) {
          if (proofImageStorage || aiMode) {
            // Stored proof: upload to Firebase Storage (AI mode always uploads so the backend can fetch it).
            const safeName = `${currentProofQuestId || 'quest'}_${Date.now()}_${currentProofFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const imageRef = storageRef(storage, `proofs/${auth.currentUser.uid}_${safeName}`);
            const uploadedFile = await uploadBytes(imageRef, currentProofFile);
            proofData.photoUrl = await getDownloadURL(uploadedFile.ref);
            console.log("Photo proof uploaded to storage:", proofData.photoUrl);
          } else {
            // Thumbnail-style proof: embed a compressed copy with the entry — no Firebase Storage.
            proofData.photoUrl = await fileToCompressedDataURL(currentProofFile);
            console.log("Photo proof embedded (thumbnail-style, no storage)");
          }
        }

        if (aiMode) {
          await window.submitProofWithAI(currentProofQuestId, proofData);
        } else {
          // Instant rewards: reward immediately, keep the proof in the mod queue
          // for moderator review (reward reversed if rejected).
          await window.submitQuestProof(currentProofQuestId, proofData, { instantReward: instantMode });
        }
        console.log("Quest proof submitted successfully");
        isCompleted = true;
        clearTimeout(timeoutId);
        modal.hidden = true;
        resetVerificationForm();
      } catch (err) {
        console.error("Submission failed:", err);
        showToast('Submission failed. Please try again.');
        isCompleted = true;
        clearTimeout(timeoutId);
        submitBtn.disabled = false;
        submitBtn.textContent = submitButtonLabel();
      }
    };
  }

  if (cancelBtn) {
    cancelBtn.onclick = () => {
      modal.hidden = true;
      currentProofQuestId = null;
      resetVerificationForm();
    };
  }

  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.hidden = true;
      currentProofQuestId = null;
      resetVerificationForm();
    };
  }

  if (modal) {
    modal.onclick = e => {
      if (e.target === e.currentTarget) {
        modal.hidden = true;
        currentProofQuestId = null;
        resetVerificationForm();
      }
    };
  }
})();

window.completeQuestMock = async function(questId) {
  const mockProof = { photoUrl: '', note: 'User submitted proof' };
  await window.submitQuestProof(questId, mockProof);
};

window.submitQuestProof = async function(questId, proofData, options) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.error("No user logged in");
    showToast('Please sign in to submit proof.');
    return;
  }

  if (!proofData || (!proofData.note && !proofData.photoUrl)) {
    console.error("Invalid proof data - no note or photo provided", proofData);
    showToast('Please provide a description or attach a photo proof.');
    return;
  }

  const instantReward = !!(options && options.instantReward);
  const note = (proofData.note || '').trim();
  const photoUrl = proofData.photoUrl || '';
  const questRef = doc(db, 'users', currentUser.uid, 'userQuests', questId);

  try {
    console.log("=== QUEST PROOF SUBMISSION START ===");
    console.log("User ID:", currentUser.uid);
    console.log("Quest ID:", questId);
    console.log("Proof note:", note.substring(0, 50) + "...");
    console.log("Instant reward:", instantReward);

    console.log("[1/3] Fetching current quest data...");
    const questSnap = await Promise.race([
      getDoc(questRef),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Fetch quest timeout")), 5000))
    ]);
    
    if (!questSnap.exists()) {
      throw new Error("Quest not found in user's collection");
    }
    const currentQuestData = questSnap.data();
    console.log("[1/3] ✓ Quest found:", currentQuestData.title);

    const now = new Date();
    console.log(`[2/3] Updating quest status to '${instantReward ? 'completed' : 'pending'}'...`);
    await Promise.race([
      updateDoc(questRef, instantReward ? {
        status: 'completed',
        completedAt: now,
        needsModReview: true,
        instantRewarded: true,
        proofSubmitted: true,
        submittedNote: note,
        proofData: {
          note: note,
          photoUrl: photoUrl
        },
        submittedAt: now
      } : {
        status: 'pending',
        needsModReview: true,
        proofSubmitted: true,
        submittedNote: note,
        proofData: {
          note: note,
          photoUrl: photoUrl
        },
        submittedAt: now
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Update quest timeout")), 5000))
    ]);
    console.log("[2/3] ✓ Quest status updated");

    console.log("[3/3] Adding to moderation queue...");
    await Promise.race([
      setDoc(doc(db, 'modQueue', `${currentUser.uid}_${questId}`), {
        userId: currentUser.uid,
        userEmail: currentUser.email || 'Anonymous',
        questId: questId,
        questTitle: currentQuestData.title || 'Unknown Quest',
        submittedNote: note,
        proofData: {
          note: note,
          photoUrl: photoUrl
        },
        status: 'pending_review',
        instantRewarded: instantReward,
        submittedAt: now
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ModQueue write timeout")), 5000))
    ]);
    console.log("[3/3] ✓ Added to moderation queue");

    console.log("Updating UI...");
    document.getElementById('myQuestDetailModal').hidden = true;
    if (instantReward) {
      await window.awardQuestRewards(currentUser.uid, questId);
      showToast('Quest completed! Rewards awarded. A moderator will review your proof.');
      switchJournalTab('completed');
    } else {
      switchJournalTab('pending');
      showToast('Submitted! Waiting for moderator approval.');
    }
    console.log("=== QUEST PROOF SUBMISSION COMPLETE ===\n");
    
  } catch (error) {
    console.error("=== QUEST PROOF SUBMISSION FAILED ===");
    console.error("Error message:", error.message);
    console.error("Error code:", error.code);
    console.error("Full error:", error);
    console.error("=== END ERROR ===\n");
    
    // Provide specific error messages
    if (error.message.includes("timeout")) {
      showToast(`Timeout at: ${error.message}`);
    } else if (error.code === 'permission-denied') {
      showToast('Permission denied by Firestore rules.');
    } else if (error.code === 'unavailable') {
      showToast('Firebase is unavailable. Check your internet.');
    } else if (error.code === 'not-found') {
      showToast('Quest not found in your collection.');
    } else {
      showToast(`Error: ${error.message}`);
    }
    throw error;
  }
};

// ==========================================
// AI VERIFICATION SUBMISSION
// ==========================================
// Sends the proof to the deployed AI verification backend. The backend verifies
// the photo with CLIP, then (via the Admin SDK) awards the reward and writes the
// verdict. If the backend is unreachable, falls back to a manual submission so
// the player's proof is still queued for a moderator.
window.submitProofWithAI = async function(questId, proofData) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("No user logged in");

  let questTitle = 'Quest';
  let questDescription = '';
  try {
    const questSnap = await getDoc(doc(db, 'quests', questId));
    if (questSnap.exists()) {
      questTitle = questSnap.data().title || 'Quest';
      questDescription = questSnap.data().description || '';
    }
  } catch (e) {
    console.warn("Could not load quest for AI verification:", e);
  }

  let idToken;
  try {
    idToken = await currentUser.getIdToken();
  } catch (e) {
    throw new Error("Could not refresh your session. Please sign in again.");
  }

  const baseUrl = aiVerificationUrl.replace(/\/+$/, '');
  let response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    try {
      response = await fetch(`${baseUrl}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          userId: currentUser.uid,
          questId,
          questTitle,
          questDescription,
          imageUrl: proofData.photoUrl || '',
          note: proofData.note || ''
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (e) {
    console.error("AI verification backend unreachable:", e);
    showToast('AI verifier unavailable. Your proof was sent to a moderator instead.');
    await window.submitQuestProof(questId, proofData, { instantReward: false });
    return 'manual';
  }

  let data = {};
  try {
    data = await response.json();
  } catch (e) {
    /* non-JSON response */
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(data.detail || 'Verification session failed. Please sign in again.');
  }
  if (!response.ok) {
    throw new Error(data.detail || `Verification error (${response.status}).`);
  }

  await refreshUserData();

  if (data.status === 'approved') {
    showToast('Quest verified by AI! Rewards awarded.');
    await loadUserQuestIds();
    switchJournalTab('completed');
    return 'approved';
  }

  if (data.status === 'rejected') {
    showToast(`Proof rejected: ${data.matchedText || 'It did not match this quest.'}`);
    await loadUserQuestIds();
    switchJournalTab('active');
    return 'rejected';
  }

  throw new Error(data.detail || 'AI verification returned an unknown response.');
};

async function refreshUserData() {
  try {
    if (!auth.currentUser) return;
    const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
    if (snap.exists()) {
      window.userData = snap.data();
      if (typeof window.updateCoinDisplay === 'function') window.updateCoinDisplay(window.userData.coins || 0);
      if (typeof window.updateNavProfile === 'function') window.updateNavProfile(window.userData);
    }
  } catch (e) {
    console.error("Failed to refresh user data:", e);
  }
}

// ==========================================
// 6. AWARD QUEST REWARDS (XP, Coins, Level)
// ==========================================

window.awardQuestRewards = async function(userId, questId) {
  try {
    const questDocRef = doc(db, 'quests', questId);
    const questSnap = await getDoc(questDocRef);
    if (!questSnap.exists()) return;

    const questData = questSnap.data();
    const xpReward = questData.finalXP || questData.xp || 0;
    const coinReward = questData.Reward ?? questData.reward ?? 0;

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    const currentXP = userData.xp || 0;
    const currentCoins = userData.coins || 0;
    const currentTotalEarned = userData.totalCoinsEarned || 0;
    const currentCompleted = userData.questsCompleted || 0;

    const newXP = currentXP + xpReward;
    const newCoins = currentCoins + coinReward;

    let newLevel, xpInLevel;
    const progress = getProgressToNextLevel(newXP);
    newLevel = progress.level;
    xpInLevel = progress.xpInLevel;

    const today = new Date().toISOString().slice(0, 10);
    let maxDaily = userData.maxDailyCompletions || 0;
    if (userData.lastCompletionDate === today) {
      maxDaily = Math.max(maxDaily, (userData.dailyCompletions || 0) + 1);
    } else {
      maxDaily = 1;
    }

    const periodUpdate = buildPeriodXpUpdate(userData, xpReward);

    await updateDoc(userRef, {
      xp: newXP,
      coins: newCoins,
      level: newLevel,
      xpInLevel: xpInLevel,
      totalCoinsEarned: currentTotalEarned + coinReward,
      questsCompleted: currentCompleted + 1,
      maxDailyCompletions: maxDaily,
      dailyCompletions: userData.lastCompletionDate === today ? (userData.dailyCompletions || 0) + 1 : 1,
      lastCompletionDate: today,
      ...periodUpdate
    });

    if (window.userData) {
      window.userData.xp = newXP;
      window.userData.coins = newCoins;
      window.userData.level = newLevel;
      window.userData.xpInLevel = xpInLevel;
      window.userData.totalCoinsEarned = currentTotalEarned + coinReward;
      window.userData.questsCompleted = currentCompleted + 1;
      window.userData.maxDailyCompletions = maxDaily;
      for (const k of Object.keys(periodUpdate)) window.userData[k] = periodUpdate[k];
    }
    const isOwnReward = auth.currentUser && auth.currentUser.uid === userId;
    if (isOwnReward) {
      if (typeof window.updateCoinDisplay === 'function') window.updateCoinDisplay(newCoins);
      if (typeof window.updateNavProfile === 'function') window.updateNavProfile(window.userData || {});
    }

    if (isOwnReward && typeof window.createNotification === 'function') {
      if (xpReward > 0) {
        window.createNotification('xp_earned', `You earned <strong>+${xpReward} XP</strong> from <strong>${escHtml(questData.title || 'a quest')}</strong>!`);
      }
      if (coinReward > 0) {
        window.createNotification('coins_earned', `You earned <strong>+${coinReward} QC</strong> from <strong>${escHtml(questData.title || 'a quest')}</strong>!`);
      }
      if (newLevel > (userData.level || 0)) {
        window.createNotification('level_up', `You leveled up! You are now <strong>Level ${newLevel}</strong>!`);
        showLevelUpModal(newLevel);
      }
    }

    if (typeof window.checkAndAwardAchievements === 'function') {
      setTimeout(() => window.checkAndAwardAchievements(), 500);
    }

    if (isOwnReward && typeof window.activateStreakToday === 'function') {
      await window.activateStreakToday();
    }

    console.log(`Rewards awarded: +${xpReward} XP, +${coinReward} Coins. New level: ${newLevel}`);
  } catch (error) {
    console.error("Error awarding quest rewards:", error);
  }
};

// ==========================================
// INITIALIZATION
// ==========================================
onAuthStateChanged(auth, async () => {
  await loadSiteSettings();
  await loadUserQuestIds();
  loadPublicQuests();
});
