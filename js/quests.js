import { auth, db } from './firebase.js';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where 
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

// ==========================================
// GLOBAL STATE & UTILITIES
// ==========================================
let allQuests = [];
let currentSelectedQuest = null;

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
// 1. FETCH & RENDER PUBLIC QUEST BOARD
// ==========================================
async function loadPublicQuests() {
  const questListContainer = document.getElementById('questList');
  if (!questListContainer) return;

  try {
    const questsRef = collection(db, 'quests');
    const snapshot = await getDocs(questsRef);

    if (snapshot.empty) {
      questListContainer.innerHTML = '<div class="empty-collection">No quests available at the moment.</div>';
      return;
    }

    allQuests = [];
    snapshot.forEach(docSnap => {
      allQuests.push({ id: docSnap.id, ...docSnap.data() });
    });

    applyQuestFilters();
  } catch (error) {
    console.error("Error loading quests:", error);
    questListContainer.innerHTML = '<div class="empty-collection">Error loading quests from database.</div>';
  }
}

// Apply Biome & Cost Filters
window.applyQuestFilters = function() {
  const questListContainer = document.getElementById('questList');
  const questCountEl = document.getElementById('questCount');
  if (!questListContainer) return;

  const selectedBiome = localStorage.getItem('selectedBiome') || 'all';
  const selectedCost = localStorage.getItem('selectedCost') || 'all';

  const filtered = allQuests.filter(quest => {
    const matchBiome = (selectedBiome === 'all') || (quest.biome && quest.biome.toLowerCase() === selectedBiome.toLowerCase());
    const matchCost = (selectedCost === 'all') || (quest.cost && quest.cost.toLowerCase() === selectedCost.toLowerCase());
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
    html += `
      <div class="quest-list-item" onclick="openQuestDetailModal('${quest.id}')">
        <img class="quest-list-image" src="${getQuestImage(quest)}" alt="Quest">
        <div class="quest-list-title">${quest.title || 'Untitled Quest'}</div>
        <div class="quest-list-summary">${quest.description || 'No description.'}</div>
        <div class="quest-list-meta">+${quest.xp || 0} XP</div>
        
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
  document.getElementById('modalXP').textContent = `+${quest.xp || 0} XP`;
  document.getElementById('modalBiome').textContent = `Biome: ${quest.biome || 'General'}`;
  document.getElementById('modalCost').textContent = `Cost: ${quest.cost || 'Free'}`;
  document.getElementById('modalDesc').textContent = quest.description || 'No description standard provided.';

  const modal = document.getElementById('questDetailModal');
  if (modal) modal.hidden = false;
};

// Accept Quest Action
const acceptQuestBtn = document.getElementById('acceptQuestBtn');
if (acceptQuestBtn) {
  acceptQuestBtn.onclick = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showToast('Please sign in to accept quests!');
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

      document.getElementById('questDetailModal').hidden = true;
      document.getElementById('questAcceptedModal').hidden = false;
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
      showToast('Please sign in to save quests!');
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

      document.getElementById('questDetailModal').hidden = true;
      showToast('Quest saved to your journal!');
    } catch (error) {
      console.error("Error saving quest:", error);
      showToast('Failed to save quest.');
    }
  };
}

// Roll a Random Quest
const rollQuestBtn = document.getElementById('rollQuestBtn');
if (rollQuestBtn) {
  rollQuestBtn.onclick = () => {
    if (allQuests.length === 0) {
      showToast('No quests available to roll!');
      return;
    }
    const randomIndex = Math.floor(Math.random() * allQuests.length);
    openQuestDetailModal(allQuests[randomIndex].id);
  };
}

// ==========================================
// 3. JOURNAL TAB SWITCHING (No Rejected Tab)
// ==========================================
window.switchJournalTab = async function(tab) {
  const collectionList = document.getElementById('collectionList');
  if (!collectionList) return;

  // Highlight Active Tab UI
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
    // Tab to status mapper: active | saved | pending | completed
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
    snapshot.forEach(docSnap => {
      const quest = docSnap.data();
      const questId = docSnap.id;
      
      let badgeText = '';
      if (tab === 'pending') {
        badgeText = quest.flaggedByAI ? '[AWAITING MOD APPROVAL]' : '[UNDER REVIEW]';
      } else if (tab === 'completed') {
        badgeText = `+${quest.xp || 0} XP`;
      } else {
        badgeText = `${quest.biome || 'General'}`;
      }

      html += `
        <div class="collection-item" onclick="openMyQuestDetail('${questId}', '${tab}')">
          <span>${quest.title || 'Quest'}</span>
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
    document.getElementById('myModalCost').textContent = `Cost: ${quest.cost || 'Free'}`;
    
    let descHtml = quest.description || 'No description available.';
    if (currentTab === 'pending' && quest.aiReason) {
      descHtml += `<br><br><strong style="color: #ff6b6b;">AI Note:</strong> ${quest.aiReason}`;
    }
    document.getElementById('myModalDesc').innerHTML = descHtml;

    const actionsContainer = document.getElementById('myModalActions');
    actionsContainer.innerHTML = '';

    if (currentTab === 'active') {
      actionsContainer.innerHTML = `
        <button class="btn-red" onclick="promptCancelQuest('${questId}')" type="button">CANCEL QUEST</button>
        <button class="btn-green" onclick="completeQuestMock('${questId}')" type="button">COMPLETE QUEST</button>
      `;
    } else if (currentTab === 'saved') {
      actionsContainer.innerHTML = `
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
    document.getElementById('myQuestDetailModal').hidden = true;
    switchJournalTab('active');
    showToast('Quest moved to Active Quests!');
  } catch (error) {
    console.error("Error activating saved quest:", error);
  }
};

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
    const questRef = doc(db, 'users', currentUser.uid, 'userQuests', questId);
    await updateDoc(questRef, {
      status: 'cancelled',
      cancelledAt: new Date()
    });
    switchJournalTab('active');
    showToast('Quest cancelled.');
  } catch (error) {
    console.error("Error cancelling quest:", error);
  }
}

// ==========================================
// 5. AI SUBMISSION & MODERATION ROUTING
// ==========================================
window.completeQuestMock = async function(questId) {
  // Demonstration proof submission (Pass mock parameter or wire up AI response)
  const mockProof = { photoUrl: 'https://via.placeholder.com/150', note: 'User submitted proof' };
  await window.submitQuestProof(questId, mockProof);
};

window.submitQuestProof = async function(questId, proofData) {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const questRef = doc(db, 'users', currentUser.uid, 'userQuests', questId);

  try {
    // Simulated AI verification result (Replace with your AI call)
    // Example: { passed: false, reason: "Photo appears too blurry to verify target." }
    const aiResult = { passed: false, reason: "Flagged by AI for verification accuracy." }; 

    if (aiResult.passed) {
      // AI Approved -> Mark Completed directly
      await updateDoc(questRef, {
        status: 'completed',
        completedAt: new Date(),
        aiVerification: { passed: true, reason: aiResult.reason }
      });
      document.getElementById('myQuestDetailModal').hidden = true;
      switchJournalTab('completed');
      showToast('Quest Completed! XP Awarded!');
    } else {
      // AI Flagged / Failed -> Send to Pending for Admin/Mod Review
      await updateDoc(questRef, {
        status: 'pending', // Keeps it strictly under the Pending tab
        needsModReview: true,
        flaggedByAI: true,
        aiReason: aiResult.reason || 'Flagged by AI verification',
        submittedAt: new Date()
      });

      // Send Ticket to Global Moderator Queue
      await setDoc(doc(db, 'modQueue', `${currentUser.uid}_${questId}`), {
        userId: currentUser.uid,
        userEmail: currentUser.email || 'Anonymous',
        questId: questId,
        proofData: proofData,
        aiReason: aiResult.reason,
        status: 'pending_review',
        submittedAt: new Date()
      });

      document.getElementById('myQuestDetailModal').hidden = true;
      switchJournalTab('pending');
      showToast('Submitted! Waiting for moderator approval.');
    }
  } catch (error) {
    console.error("Error submitting quest proof:", error);
    showToast('Failed to submit proof. Please try again.');
  }
};

// ==========================================
// INITIALIZATION
// ==========================================
onAuthStateChanged(auth, () => {
  loadPublicQuests();
});