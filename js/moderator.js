import { db, auth, storage } from './firebase.js';
import { ref as storageRef, deleteObject } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-storage.js";
import { getProgressToNextLevel, showLevelUpModal } from './xpSystem.js';
import { buildPeriodXpUpdate, reversePeriodXpUpdate } from './periods.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  setDoc,
  addDoc,
  query,
  orderBy,
  where,
  limit,
  increment
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// ==========================================
// STATE
// ==========================================
let allQueueEntries = [];
let allUsers = [];
let activityLog = [];
const userCache = {};
const questCache = {};

// ==========================================
// CACHE HELPERS
// ==========================================
// Deletes the proof image from Firebase Storage after a verdict. Skips inline
// data-URL thumbnails (AI-rejected proofs) and empty photoUrls. Best-effort.
async function deleteProofImage(entry) {
  const photoUrl = entry?.proofData?.photoUrl;
  if (!photoUrl || photoUrl.startsWith('data:')) return;
  try {
    await deleteObject(storageRef(storage, photoUrl));
    console.log("Deleted proof image:", photoUrl);
  } catch (e) {
    console.warn("Could not delete proof image (may already be gone):", photoUrl, e);
  }
}

async function getUsername(userId) {
  if (userCache[userId]) return userCache[userId];
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      const data = snap.data();
      userCache[userId] = data.username || data.displayName || userId;
      return userCache[userId];
    }
  } catch (e) {}
  userCache[userId] = userId;
  return userId;
}

async function getUserDoc(userId) {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) return { id: userId, ...snap.data() };
  } catch (e) {}
  return null;
}

async function getQuestTitle(questId) {
  if (questCache[questId]) return questCache[questId];
  try {
    const snap = await getDoc(doc(db, 'quests', questId));
    if (snap.exists()) {
      questCache[questId] = snap.data().title || questId;
      return questCache[questId];
    }
  } catch (e) {}
  questCache[questId] = questId;
  return questId;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function formatDate(ts) {
  if (!ts) return 'Unknown';
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleDateString();
  try { return new Date(ts).toLocaleDateString(); } catch (e) { return 'Unknown'; }
}

function formatDateTime(ts) {
  if (!ts) return 'Unknown';
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
  try { return new Date(ts).toLocaleString(); } catch (e) { return 'Unknown'; }
}

// ==========================================
// LOAD MOD QUEUE
// ==========================================
async function loadModQueue() {
  try {
    const modQueueRef = collection(db, 'modQueue');
    const q = query(modQueueRef, orderBy('submittedAt', 'desc'));
    const snapshot = await getDocs(q);

    allQueueEntries = [];
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const username = await getUsername(data.userId);
      const questTitle = await getQuestTitle(data.questId);
      let reviewerName = '';
      if (data.reviewedBy) {
        reviewerName = await getUsername(data.reviewedBy);
      }
      allQueueEntries.push({
        id: docSnap.id,
        userId: data.userId || '',
        username: username,
        userEmail: data.userEmail || 'Anonymous',
        questId: data.questId || '',
        questTitle: questTitle,
        proofData: data.proofData || {},
        aiReason: data.aiReason || '',
        instantRewarded: data.instantRewarded === true,
        status: data.status || 'pending_review',
        submittedAt: data.submittedAt || null,
        reviewedBy: data.reviewedBy || null,
        reviewerName: reviewerName,
        reviewedAt: data.reviewedAt || null,
        rejectReason: data.rejectReason || '',
        modNotes: data.modNotes || []
      });
    }

    renderModQueue();
    updateStats();
  } catch (error) {
    console.error("Failed to load mod queue:", error);
  }
}

// ==========================================
// RENDER QUEUE
// ==========================================
window.renderModQueue = function() {
  const search = (document.getElementById('searchBar')?.value || '').toLowerCase();
  const filterStatus = document.getElementById('filterStatus')?.value || 'all';
  const filterAI = document.getElementById('filterAI')?.value || 'all';
  const sortOrder = document.getElementById('filterSort')?.value || 'newest';

  let filtered = allQueueEntries.filter(entry => {
    if (search) {
      const matchesUser = entry.username.toLowerCase().includes(search);
      const matchesQuest = entry.questTitle.toLowerCase().includes(search);
      if (!matchesUser && !matchesQuest) return false;
    }
    if (filterStatus !== 'all' && entry.status !== filterStatus) return false;
    if (filterAI === 'flagged' && !entry.aiReason) return false;
    if (filterAI === 'clean' && entry.aiReason) return false;
    return true;
  });

  // Stat card filter
  if (window.activeStatusFilter && window.activeStatusFilter !== 'all') {
    if (window.activeStatusFilter === 'pending') filtered = filtered.filter(e => e.status === 'pending_review');
    else if (window.activeStatusFilter === 'approved') filtered = filtered.filter(e => e.status === 'approved');
    else if (window.activeStatusFilter === 'rejected') filtered = filtered.filter(e => e.status === 'rejected');
  }

  // Sort
  filtered.sort((a, b) => {
    const aTime = a.submittedAt?.seconds || 0;
    const bTime = b.submittedAt?.seconds || 0;
    return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
  });

  const tbody = document.getElementById('queueTableBody');
  const empty = document.getElementById('queueEmptyState') || document.getElementById('emptyState');
  if (!filtered.length) { tbody.innerHTML = ''; if (empty) empty.hidden = false; return; }
  if (empty) empty.hidden = true;

  tbody.innerHTML = filtered.map((entry, i) => {
    const aiFlag = entry.aiReason
      ? '<span style="color:var(--red);font-weight:700;">FLAGGED</span>'
      : '<span style="color:var(--green);">CLEAN</span>';
    const statusBadge = entry.status === 'pending_review'
      ? '<span class="badge badge-pending">pending</span>'
      : entry.status === 'approved'
        ? '<span class="badge badge-approved">approved</span>'
        : '<span class="badge badge-rejected">rejected</span>';
    const rewardBadge = entry.instantRewarded
      ? ' <span class="badge badge-gold" title="Reward already granted instantly — reversed if rejected">instant reward</span>'
      : '';
    const actions = entry.status === 'pending_review'
      ? `<button class="btn-success" onclick="window.openReview('${entry.id}')">Review</button>`
      : `<button class="btn-secondary" onclick="window.openReview('${entry.id}')">View</button>`;

    return `<tr>
      <td class="num-cell">${i + 1}</td>
      <td class="user-cell">${esc(entry.username)}</td>
      <td class="quest-cell">${esc(entry.questTitle)}</td>
      <td>${formatDate(entry.submittedAt)}</td>
      <td>${aiFlag}</td>
      <td>${entry.reviewerName ? esc(entry.reviewerName) : '<span style="color:#5a8aaa;">—</span>'}</td>
      <td class="status-cell">${statusBadge}${rewardBadge}</td>
      <td class="action-buttons">${actions}</td>
    </tr>`;
  }).join('');
};

// ==========================================
// UPDATE STATS
// ==========================================
function updateStats() {
  const pending = allQueueEntries.filter(e => e.status === 'pending_review').length;
  const approved = allQueueEntries.filter(e => e.status === 'approved').length;
  const rejected = allQueueEntries.filter(e => e.status === 'rejected').length;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statApproved').textContent = approved;
  document.getElementById('statRejected').textContent = rejected;
  const queueTotal = document.getElementById('statQueueTotal');
  if (queueTotal) queueTotal.textContent = allQueueEntries.length;
}

// ==========================================
// REVIEW DETAIL MODAL
// ==========================================
window.openReview = async function(entryId) {
  const entry = allQueueEntries.find(e => e.id === entryId);
  if (!entry) return;

  const userRole = window.userRole || 'player';
  if (typeof window.canModerate === 'function' && !window.canModerate(userRole, 'player')) {
    showToast('You do not have permission to review submissions.', 'error');
    return;
  }

  window.currentReviewEntry = entry;

  document.getElementById('reviewUserInfo').innerHTML = `
    <strong>Username:</strong> ${esc(entry.username)}<br>
    <strong>User ID:</strong> ${esc(entry.userId)}<br>
    <strong>Email:</strong> ${esc(entry.userEmail)}
  `;

  let questDesc = '';
  let questData = {};
  try {
    const questDocSnap = await getDoc(doc(db, 'quests', entry.questId));
    if (questDocSnap.exists()) {
      questData = questDocSnap.data();
      questDesc = questData.description || '';
    }
  } catch (e) {}

  const effort = questData.effort || questData.difficulty || 'medium';
  const advRating = questData.adventureRating || 'common';
  const baseXP = questData.baseXP || questData.xp || 0;
  const finalXP = questData.finalXP || questData.xp || 0;
  const effortLabel = effort.charAt(0).toUpperCase() + effort.slice(1);
  const advLabel = advRating.charAt(0).toUpperCase() + advRating.slice(1);

  let questInfoHtml = `
    <strong>Quest:</strong> ${esc(entry.questTitle)}<br>
    <strong>Quest ID:</strong> ${esc(entry.questId)}<br>
    <strong>Effort:</strong> ${effortLabel} &middot; <strong>Rating:</strong> ${advLabel}<br>
    <strong>Base XP:</strong> ${baseXP} &middot; <strong>Final XP:</strong> ${finalXP}
  `;
  if (questDesc) {
    questInfoHtml += `<br><strong>Description:</strong> ${esc(questDesc)}`;
  }
  if (entry.instantRewarded) {
    questInfoHtml += `<br><span style="color:#ffd24d;font-weight:700;">&#9888; Reward already granted instantly — rejecting will reverse it and notify the player.</span>`;
  }
  document.getElementById('reviewQuestInfo').innerHTML = questInfoHtml;

  // Proof
  const proofArea = document.getElementById('reviewProofArea');
  let proofHtml = '';
  if (entry.proofData?.photoUrl) {
    proofHtml += `<img class="proof-image" src="${esc(entry.proofData.photoUrl)}" alt="Proof" onerror="this.style.display='none'">`;
  }
  if (entry.proofData?.note) {
    proofHtml += `<div class="review-field" style="margin-top:10px;"><strong>User's Description:</strong> ${esc(entry.proofData.note)}</div>`;
  }
  if (!proofHtml) proofHtml = '<div class="review-field">No proof submitted.</div>';
  proofArea.innerHTML = proofHtml;

  // AI
  document.getElementById('reviewAIAnalysis').innerHTML = entry.aiReason
    ? `<span style="color:var(--red);">${esc(entry.aiReason)}</span>`
    : '<span style="color:var(--green);">No AI flags - submission appears clean.</span>';

  // Mod Notes
  const noteList = document.getElementById('modNoteList');
  if (entry.modNotes && entry.modNotes.length) {
    noteList.innerHTML = entry.modNotes.map(n => `
      <div class="note-item">
        ${esc(n.text)}
        <div class="note-meta">${esc(n.moderator || 'Unknown')} · ${formatDateTime(n.timestamp)}</div>
      </div>
    `).join('');
  } else {
    noteList.innerHTML = '<div style="color:#5a8aaa;font-size:12px;padding:8px;">No notes yet.</div>';
  }

  // Reset
  document.getElementById('rejectReasonSection').style.display = 'none';
  document.getElementById('rejectReasonInput').value = '';
  document.getElementById('modNoteInput').value = '';

  const actionsSection = document.getElementById('reviewActions');
  const approveBtn = document.getElementById('approveBtn');
  const rejectBtn = document.getElementById('rejectBtn');
  const resubBtn = document.getElementById('requestResubBtn');
  const isOwnSubmission = auth.currentUser && auth.currentUser.uid === entry.userId;

  if (entry.status === 'pending_review') {
    actionsSection.style.display = '';
    if (isOwnSubmission) {
      if (approveBtn) { approveBtn.disabled = true; approveBtn.style.opacity = '0.35'; approveBtn.style.cursor = 'not-allowed'; approveBtn.title = 'Cannot approve your own submission'; }
      if (rejectBtn) { rejectBtn.disabled = true; rejectBtn.style.opacity = '0.35'; rejectBtn.style.cursor = 'not-allowed'; rejectBtn.title = 'Cannot act on your own submission'; }
      if (resubBtn) { resubBtn.disabled = true; resubBtn.style.opacity = '0.35'; resubBtn.style.cursor = 'not-allowed'; resubBtn.title = 'Cannot act on your own submission'; }
    } else {
      if (approveBtn) { approveBtn.disabled = false; approveBtn.style.opacity = ''; approveBtn.style.cursor = ''; approveBtn.title = ''; }
      if (rejectBtn) { rejectBtn.disabled = false; rejectBtn.style.opacity = ''; rejectBtn.style.cursor = ''; rejectBtn.title = ''; }
      if (resubBtn) { resubBtn.disabled = false; resubBtn.style.opacity = ''; resubBtn.style.cursor = ''; resubBtn.title = ''; }
    }
  } else {
    actionsSection.style.display = 'none';
  }

  document.getElementById('reviewModal').hidden = false;
};

// ==========================================
// MOD NOTES
// ==========================================
window.addModNote = async function(entryId, noteText) {
  const entry = allQueueEntries.find(e => e.id === entryId);
  if (!entry) return;

  const modName = auth.currentUser ? (await getUsername(auth.currentUser.uid)) : 'Unknown';
  const newNote = {
    text: noteText,
    moderator: modName,
    timestamp: new Date()
  };

  try {
    const entryRef = doc(db, 'modQueue', entryId);
    const existingNotes = entry.modNotes || [];
    await updateDoc(entryRef, { modNotes: [...existingNotes, newNote] });
    entry.modNotes = [...existingNotes, newNote];

    const noteList = document.getElementById('modNoteList');
    noteList.innerHTML = entry.modNotes.map(n => `
      <div class="note-item">
        ${esc(n.text)}
        <div class="note-meta">${esc(n.moderator || 'Unknown')} · ${formatDateTime(n.timestamp)}</div>
      </div>
    `).join('');

    showToast('Note added.');
  } catch (error) {
    console.error("Failed to add note:", error);
    showToast('Failed to add note.', 'error');
  }
};

// ==========================================
// APPROVE / REJECT / REQUEST RESUBMISSION
// ==========================================
window.approveSubmission = async function(entryId) {
  const userRole = window.userRole || 'player';
  if (typeof window.canModerate === 'function' && !window.canModerate(userRole, 'player')) {
    showToast('Permission denied.', 'error'); return;
  }

  try {
    const entry = allQueueEntries.find(e => e.id === entryId);
    if (!entry) return;

    if (auth.currentUser && auth.currentUser.uid === entry.userId) {
      showToast('You cannot approve your own submission.', 'error'); return;
    }

    const modName = auth.currentUser ? await getUsername(auth.currentUser.uid) : 'Unknown';

    await updateDoc(doc(db, 'modQueue', entryId), {
      status: 'approved',
      reviewedBy: auth.currentUser?.uid || null,
      reviewerName: modName,
      reviewedAt: new Date()
    });

    if (entry.instantRewarded) {
      // Reward was already granted on submission — just finalize the review.
      await updateDoc(doc(db, 'users', entry.userId, 'userQuests', entry.questId), {
        status: 'completed',
        completedAt: new Date(),
        reviewedBy: auth.currentUser?.uid || null,
        needsModReview: false,
        instantRewarded: true
      });
    } else {
      await updateDoc(doc(db, 'users', entry.userId, 'userQuests', entry.questId), {
        status: 'completed',
        completedAt: new Date(),
        reviewedBy: auth.currentUser?.uid || null
      });
      await awardQuestRewards(entry.userId, entry.questId);
    }
    await deleteProofImage(entry);

    if (typeof window.createNotification === 'function') {
      const notifRef = collection(db, 'users', entry.userId, 'notifications');
      await addDoc(notifRef, {
        type: 'quest_approved',
        message: `Your quest <strong>${entry.questTitle || 'Quest'}</strong> was approved by a moderator!`,
        read: false,
        createdAt: new Date()
      });
    }

    await logActivity('approve', modName, entry.username, `Approved quest: ${entry.questTitle}`);
    showToast('Submission approved!');
    await loadModQueue();
  } catch (error) {
    console.error("Failed to approve:", error);
    showToast('Failed to approve.', 'error');
  }
};

window.rejectSubmission = async function(entryId, reason) {
  const userRole = window.userRole || 'player';
  if (typeof window.canModerate === 'function' && !window.canModerate(userRole, 'player')) {
    showToast('Permission denied.', 'error'); return;
  }

  try {
    const entry = allQueueEntries.find(e => e.id === entryId);
    if (!entry) return;

    if (auth.currentUser && auth.currentUser.uid === entry.userId) {
      showToast('You cannot act on your own submission.', 'error'); return;
    }

    const modName = auth.currentUser ? await getUsername(auth.currentUser.uid) : 'Unknown';

    await updateDoc(doc(db, 'modQueue', entryId), {
      status: 'rejected',
      rejectReason: reason,
      reviewedBy: auth.currentUser?.uid || null,
      reviewerName: modName,
      reviewedAt: new Date()
    });

    if (entry.instantRewarded) {
      // Reverse the reward that was granted instantly on submission.
      await reverseQuestRewards(entry.userId, entry.questId);
    }

    await updateDoc(doc(db, 'users', entry.userId, 'userQuests', entry.questId), {
      status: 'active',
      rejectedAt: new Date(),
      rejectionReason: reason,
      needsModReview: false,
      flaggedByAI: false,
      instantRewarded: false
    });

    if (typeof window.createNotification === 'function') {
      const notifRef = collection(db, 'users', entry.userId, 'notifications');
      await addDoc(notifRef, {
        type: 'quest_rejected',
        message: entry.instantRewarded
          ? `Your proof for <strong>${entry.questTitle || 'Quest'}</strong> was rejected. Your reward has been <strong>reversed</strong>. Reason: ${esc(reason)}`
          : `Your proof for <strong>${entry.questTitle || 'Quest'}</strong> was rejected. Reason: ${esc(reason)}`,
        read: false,
        createdAt: new Date()
      });
    }

    await logActivity('reject', modName, entry.username, `Rejected quest: ${entry.questTitle} — ${reason}`);
    await deleteProofImage(entry);
    showToast(entry.instantRewarded ? 'Submission rejected. Reward reversed.' : 'Submission rejected.');
    await loadModQueue();
  } catch (error) {
    console.error("Failed to reject:", error);
    showToast('Failed to reject.', 'error');
  }
};

window.requestResubmission = async function(entryId, reason) {
  const userRole = window.userRole || 'player';
  if (typeof window.canModerate === 'function' && !window.canModerate(userRole, 'player')) {
    showToast('Permission denied.', 'error'); return;
  }

  try {
    const entry = allQueueEntries.find(e => e.id === entryId);
    if (!entry) return;

    if (auth.currentUser && auth.currentUser.uid === entry.userId) {
      showToast('You cannot act on your own submission.', 'error'); return;
    }

    const modName = auth.currentUser ? await getUsername(auth.currentUser.uid) : 'Unknown';

    await updateDoc(doc(db, 'modQueue', entryId), {
      status: 'rejected',
      rejectReason: '[RESUBMISSION REQUESTED] ' + reason,
      reviewedBy: auth.currentUser?.uid || null,
      reviewerName: modName,
      reviewedAt: new Date()
    });

    if (entry.instantRewarded) {
      // Quest is returning to active, so the instantly-granted reward is reversed.
      await reverseQuestRewards(entry.userId, entry.questId);
    }

    await updateDoc(doc(db, 'users', entry.userId, 'userQuests', entry.questId), {
      status: 'active',
      rejectedAt: new Date(),
      rejectionReason: reason,
      needsModReview: false,
      flaggedByAI: false,
      instantRewarded: false,
      resubmissionRequested: true
    });

    if (typeof window.createNotification === 'function' && entry.instantRewarded) {
      const notifRef = collection(db, 'users', entry.userId, 'notifications');
      await addDoc(notifRef, {
        type: 'quest_rejected',
        message: `Your proof for <strong>${entry.questTitle || 'Quest'}</strong> needs to be resubmitted. Your reward has been <strong>reversed</strong>. Reason: ${esc(reason)}`,
        read: false,
        createdAt: new Date()
      });
    }

    await logActivity('reject', modName, entry.username, `Requested resubmission for: ${entry.questTitle} — ${reason}`);
    await deleteProofImage(entry);
    showToast(entry.instantRewarded ? 'Resubmission requested. Reward reversed.' : 'Resubmission requested.');
    await loadModQueue();
  } catch (error) {
    console.error("Failed to request resubmission:", error);
    showToast('Failed.', 'error');
  }
};

// ==========================================
// USER MODERATION
// ==========================================
window.loadAllUsers = async function() {
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    allUsers = [];
    const actorRole = window.userRole || 'player';
    const actorLevel = (window.ROLE_HIERARCHY || {})[actorRole] || 0;
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const roleLevel = (window.ROLE_HIERARCHY || {})[data.role] || 0;
      if (actorLevel >= ((window.ROLE_HIERARCHY || {}).admin || 0)) {
        // Admins see everyone except owners
        if (data.role === 'owner') continue;
      } else {
        // Moderators only see players and subscribed
        if (roleLevel >= ((window.ROLE_HIERARCHY || {}).moderator || 0)) continue;
      }
      allUsers.push({
        id: docSnap.id,
        username: data.username || 'Unknown',
        displayName: data.displayName || data.username || 'Unknown',
        email: data.email || '',
        role: data.role || 'player',
        roles: data.roles || [data.role || 'player'],
        status: data.accountStatus || 'active',
        createdAt: data.createdAt || null,
        photoURL: data.photoURL || '',
        xp: data.xp || 0,
        coins: data.coins || 0,
        level: data.level || 0,
        flaggedUsername: data.flaggedUsername || false,
        flagReason: data.flagReason || '',
        warnings: data.warnings || []
      });
    }
    renderUserList();
  } catch (error) {
    console.error("Failed to load users:", error);
  }
};

window.renderUserList = function() {
  const search = (document.getElementById('userSearchBar')?.value || '').toLowerCase();
  const roleFilter = document.getElementById('userRoleFilter')?.value || 'all';
  let filtered = allUsers.filter(u => {
    if (search && !u.username.toLowerCase().includes(search) && !(u.email || '').toLowerCase().includes(search)) return false;
    if (roleFilter !== 'all') {
      const roles = u.roles || [u.role];
      let highest = 'player';
      for (const r of roles) {
        if (((window.ROLE_HIERARCHY || {})[r] || 0) > ((window.ROLE_HIERARCHY || {})[highest] || 0)) highest = r;
      }
      if (roleFilter === 'admin') {
        if (highest !== 'admin' && highest !== 'special_admin') return false;
      } else if (roleFilter === 'moderator') {
        if (highest !== 'moderator') return false;
      } else if (roleFilter === 'paid') {
        if (highest !== 'paid' && highest !== 'subscribed') return false;
      } else if (roleFilter === 'player') {
        if (highest !== 'player') return false;
      } else if (roleFilter === 'owner') {
        if (highest !== 'owner') return false;
      }
    }
    return true;
  });

  const tbody = document.getElementById('userTableBody');
  const empty = document.getElementById('userEmptyState');
  if (!filtered.length) { tbody.innerHTML = ''; empty.hidden = false; return; }
  empty.hidden = true;

  const ROLE_BADGE_STYLES = {
    player: 'background:#1e3a5f;color:#7a9bb5',
    subscribed: 'background:#1a4d2e;color:#76ca88',
    paid: 'background:#1a4d2e;color:#76ca88',
    moderator: 'background:#4a1d6e;color:#a78bfa',
    admin: 'background:#1a365d;color:#63b3ed',
    special_admin: 'background:#553c00;color:#f59e0b',
    owner: 'background:#5c1a1a;color:#ff6b6b'
  };

  function renderRoleBadges(roles) {
    return roles.map(r => {
      const style = ROLE_BADGE_STYLES[r] || 'background:#1e3a5f;color:#7a9bb5';
      const label = r === 'special_admin' ? 'special admin' : r;
      return `<span style="display:inline-block;padding:3px 8px;font-size:10px;font-weight:700;text-transform:uppercase;border:2px solid var(--deep-ink);margin:2px;${style}">${esc(label)}</span>`;
    }).join('');
  }

  tbody.innerHTML = filtered.map((user, i) => {
    const statusBadge = user.status === 'active'
      ? '<span class="badge badge-approved">active</span>'
      : user.status === 'suspended'
        ? '<span class="badge badge-suspended">suspended</span>'
        : '<span class="badge badge-banned">banned</span>';
    const flagBadge = user.flaggedUsername ? ' <span class="badge badge-warned" title="Flagged username">FLAGGED</span>' : '';
    const canAct = typeof window.canModerate === 'function' ? window.canModerate(window.userRole, user.role) : true;
    let actions = `<button class="btn-secondary" onclick="window.openUserProfile('${user.id}')">View</button>`;
    if (canAct) {
      if (user.status === 'active') {
        actions += `<button class="btn-warn" onclick="window.warnUser('${user.id}')">Warn</button>`;
        actions += `<button class="btn-purple" onclick="window.suspendUser('${user.id}')">Suspend</button>`;
        actions += `<button class="btn-danger" onclick="window.banUser('${user.id}')">Ban</button>`;
      } else if (user.status === 'suspended') {
        actions += `<button class="btn-success" onclick="window.unsuspendUser('${user.id}')">Unsuspend</button>`;
        actions += `<button class="btn-danger" onclick="window.banUser('${user.id}')">Ban</button>`;
      } else if (user.status === 'banned') {
        actions += `<button class="btn-success" onclick="window.unbanUser('${user.id}')">Unban</button>`;
      }
    }
    const roles = user.roles || [user.role];
    return `<tr>
      <td class="num-cell">${i + 1}</td>
      <td class="user-cell">${esc(user.username)}${flagBadge}</td>
      <td>${esc(user.email || '—')}</td>
      <td>${renderRoleBadges(roles)}</td>
      <td class="status-cell">${statusBadge}</td>
      <td>${formatDate(user.createdAt)}</td>
      <td class="action-buttons">${actions}</td>
    </tr>`;
  }).join('');
};

window.openUserProfile = async function(userId) {
  const user = await getUserDoc(userId);
  if (!user) { showToast('User not found.', 'error'); return; }

  const canAct = typeof window.canModerate === 'function' ? window.canModerate(window.userRole, user.role) : true;

  const modHistory = await getUserModHistory(userId);
  let historyHtml = '';
  if (modHistory.length) {
    historyHtml = `<div class="review-section" style="margin-top:20px;"><h3>Moderation History</h3>
      <table class="history-table"><thead><tr><th>Date</th><th>Action</th><th>Moderator</th><th>Reason</th></tr></thead><tbody>
      ${modHistory.map(h => `<tr><td>${formatDateTime(h.timestamp)}</td><td>${esc(h.action)}</td><td>${esc(h.moderator || 'System')}</td><td>${esc(h.reason || '—')}</td></tr>`).join('')}
      </tbody></table></div>`;
  } else {
    historyHtml = '<div style="color:#5a8aaa;font-size:12px;margin-top:14px;">No moderation history.</div>';
  }

  document.getElementById('userProfileContent').innerHTML = `
    <div class="user-profile-card">
      <div class="user-profile-header">
        <img class="user-avatar-lg" src="${esc(user.photoURL || '')}" alt="Avatar" onerror="this.style.display='none'">
        <div class="user-profile-info">
          <h3>${esc(user.displayName || user.username)}${user.flaggedUsername ? ' <span class="badge badge-warned">FLAGGED</span>' : ''}</h3>
          <p>@${esc(user.username)} · ${esc(user.email || 'No email')} · Roles: ${(user.roles || [user.role]).join(', ')} · Status: ${esc(user.status || 'active')}</p>
        </div>
      </div>
      <div class="user-profile-stats">
        <div class="user-stat"><div class="user-stat-val">${user.level || 0}</div><div class="user-stat-lbl">Level</div></div>
        <div class="user-stat"><div class="user-stat-val">${Number(user.xp || 0).toLocaleString()}</div><div class="user-stat-lbl">Total XP</div></div>
        <div class="user-stat"><div class="user-stat-val">${user.coins || 0}</div><div class="user-stat-lbl">Coins</div></div>
        <div class="user-stat"><div class="user-stat-val">${formatDate(user.createdAt)}</div><div class="user-stat-lbl">Joined</div></div>
      </div>
      <div class="user-actions">
        ${canAct ? `
        <button class="btn-warn" onclick="window.flagUsername('${user.id}')">Flag Username</button>
        ${user.status === 'active' ? `<button class="btn-purple" onclick="window.suspendUser('${user.id}');document.getElementById('userProfileModal').hidden=true;">Suspend</button>` : ''}
        ${user.status === 'active' ? `<button class="btn-danger" onclick="window.banUser('${user.id}');document.getElementById('userProfileModal').hidden=true;">Ban</button>` : ''}
        ${(user.status === 'suspended') ? `<button class="btn-success" onclick="window.unsuspendUser('${user.id}');document.getElementById('userProfileModal').hidden=true;">Unsuspend</button>` : ''}
        ${(user.status === 'banned') ? `<button class="btn-success" onclick="window.unbanUser('${user.id}');document.getElementById('userProfileModal').hidden=true;">Unban</button>` : ''}
        ` : '<div style="color:#5a8aaa;font-size:12px;margin-top:8px;">You cannot moderate this user.</div>'}
      </div>
    </div>
    ${historyHtml}
  `;
  document.getElementById('userProfileModal').hidden = false;
};

// ==========================================
// USER ACTIONS
// ==========================================
async function logActivity(actionType, moderator, target, details) {
  try {
    await setDoc(doc(db, 'modActivityLog', `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`), {
      actionType: actionType,
      moderator: moderator,
      target: target,
      details: details,
      timestamp: new Date()
    });
  } catch (e) { console.error("Failed to log activity:", e); }
}

async function getUserModHistory(userId) {
  try {
    const logRef = collection(db, 'modActivityLog');
    const q = query(logRef, where('targetUserId', '==', userId), orderBy('timestamp', 'desc'), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch (e) {
    return [];
  }
}

async function setUserStatus(userId, status, reason, evidenceImageUrl) {
  const modName = auth.currentUser ? await getUsername(auth.currentUser.uid) : 'System';
  const username = await getUsername(userId);

  await updateDoc(doc(db, 'users', userId), { accountStatus: status });

  await setDoc(doc(db, 'modActivityLog', `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`), {
    actionType: 'user_action',
    moderator: modName,
    target: username,
    targetUserId: userId,
    details: `${status === 'active' ? 'Reactivated' : status.charAt(0).toUpperCase() + status.slice(1)} user: ${username}${reason ? ' — ' + reason : ''}${evidenceImageUrl ? ' [evidence image attached]' : ''}`,
    timestamp: new Date()
  });

  showToast(`User ${status}.`);
  if (typeof window.loadAllUsers === 'function') window.loadAllUsers();
}

window.warnUser = async function(userId) {
  const result = await window.openUserActionModal('WARN USER', 'Provide a reason for this warning. At least one field (text or image) is required.', 'WARN');
  if (!result) return;
  const { reason, evidenceImageUrl } = result;
  const modName = auth.currentUser ? await getUsername(auth.currentUser.uid) : 'System';
  const username = await getUsername(userId);

  const warnEntry = { reason: reason || null, evidenceImageUrl: evidenceImageUrl || null, moderator: modName, timestamp: new Date() };

  await setDoc(doc(db, 'modActivityLog', `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`), {
    actionType: 'user_action',
    moderator: modName,
    target: username,
    targetUserId: userId,
    details: `Warned user: ${username}${reason ? ' — ' + reason : ''}${evidenceImageUrl ? ' [evidence image attached]' : ''}`,
    timestamp: new Date()
  });

  const userSnap = await getDoc(doc(db, 'users', userId));
  if (userSnap.exists()) {
    const warnings = userSnap.data().warnings || [];
    await updateDoc(doc(db, 'users', userId), {
      warnings: [...warnings, warnEntry]
    });
  }

  showToast('User warned.');
  if (typeof window.loadAllUsers === 'function') window.loadAllUsers();
};

window.suspendUser = async function(userId) {
  const result = await window.openUserActionModal('SUSPEND USER', 'Provide a reason for this suspension. At least one field (text or image) is required.', 'SUSPEND');
  if (!result) return;
  await setUserStatus(userId, 'suspended', result.reason, result.evidenceImageUrl);
};

window.banUser = async function(userId) {
  const result = await window.openUserActionModal('BAN USER', 'Provide a reason for this ban. This is a serious action and cannot be easily undone. At least one field (text or image) is required.', 'BAN');
  if (!result) return;
  await setUserStatus(userId, 'banned', result.reason, result.evidenceImageUrl);
};

window.unbanUser = async function(userId) {
  await setUserStatus(userId, 'active', 'Unbanned by moderator');
};

window.unsuspendUser = async function(userId) {
  await setUserStatus(userId, 'active', 'Unsuspended by moderator');
};

window.reactivateUser = async function(userId) {
  await setUserStatus(userId, 'active', 'Reactivated by moderator');
};

// ==========================================
// FLAG USERNAME
// ==========================================
let flagUsernameTarget = null;

window.flagUsername = function(userId) {
  flagUsernameTarget = userId;
  document.getElementById('flagUsernameReason').value = '';
  document.getElementById('flagUsernameModal').hidden = false;
};

document.getElementById('confirmFlagUsernameBtn').onclick = async () => {
  const reason = document.getElementById('flagUsernameReason').value.trim();
  if (!reason || !flagUsernameTarget) {
    showToast('Please provide a reason.', 'error');
    return;
  }

  const modName = auth.currentUser ? await getUsername(auth.currentUser.uid) : 'System';
  const username = await getUsername(flagUsernameTarget);

  await updateDoc(doc(db, 'users', flagUsernameTarget), {
    flaggedUsername: true,
    flagReason: reason
  });

  await logActivity('flag', modName, username, `Flagged username: ${username} — ${reason}`);

  document.getElementById('flagUsernameModal').hidden = true;
  flagUsernameTarget = null;
  showToast('Username flagged.');
  if (typeof window.loadAllUsers === 'function') window.loadAllUsers();
};

// ==========================================
// CONTENT MODERATION: FLAG / REMOVE PROOF
// ==========================================
window.flagProof = async function(entryId) {
  const result = await window.openUserActionModal('FLAG PROOF', 'Provide a reason for flagging this proof submission. At least one field (text or image) is required.', 'FLAG');
  if (!result) return;

  const entry = allQueueEntries.find(e => e.id === entryId);
  if (!entry) return;

  const modName = auth.currentUser ? await getUsername(auth.currentUser.uid) : 'System';

  const flagData = { flaggedProof: true };
  if (result.reason) flagData.flagProofReason = result.reason;
  if (result.evidenceImageUrl) flagData.flagProofEvidenceUrl = result.evidenceImageUrl;

  await updateDoc(doc(db, 'modQueue', entryId), flagData);
  await logActivity('flag', modName, entry.username, `Flagged proof for quest: ${entry.questTitle}${result.reason ? ' — ' + result.reason : ''}${result.evidenceImageUrl ? ' [evidence image attached]' : ''}`);
  showToast('Proof flagged.');
};

window.removeSubmission = async function(entryId) {
  if (!confirm('Remove this submission permanently?')) return;

  const entry = allQueueEntries.find(e => e.id === entryId);
  if (!entry) return;

  const modName = auth.currentUser ? await getUsername(auth.currentUser.uid) : 'System';

  await updateDoc(doc(db, 'modQueue', entryId), { status: 'removed', removedBy: modName });
  await updateDoc(doc(db, 'users', entry.userId, 'userQuests', entry.questId), { status: 'active' });
  await logActivity('flag', modName, entry.username, `Removed offensive submission for quest: ${entry.questTitle}`);
  showToast('Submission removed.');
  await loadModQueue();
};

// ==========================================
// ACTIVITY LOG
// ==========================================
window.loadActivityLog = async function() {
  try {
    const logRef = collection(db, 'modActivityLog');
    const q = query(logRef, orderBy('timestamp', 'desc'), limit(100));
    const snap = await getDocs(q);
    activityLog = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderActivityLog();
  } catch (error) {
    console.error("Failed to load activity log:", error);
  }
};

window.renderActivityLog = function() {
  const filter = document.getElementById('activityFilter')?.value || 'all';
  let filtered = activityLog;
  if (filter !== 'all') {
    filtered = activityLog.filter(e => e.actionType === filter);
  }

  const tbody = document.getElementById('activityTableBody');
  const empty = document.getElementById('activityEmptyState');
  if (!filtered.length) { tbody.innerHTML = ''; empty.hidden = false; return; }
  empty.hidden = true;

  tbody.innerHTML = filtered.map((entry, i) => {
    const actionColor = entry.actionType === 'approve' ? 'var(--green)' :
      entry.actionType === 'reject' ? 'var(--red)' :
      entry.actionType === 'flag' ? '#f59e0b' : 'var(--sky)';
    return `<tr>
      <td class="num-cell">${i + 1}</td>
      <td class="user-cell">${esc(entry.moderator || 'System')}</td>
      <td style="color:${actionColor};font-weight:700;text-transform:uppercase;">${esc(entry.actionType || '—')}</td>
      <td>${esc(entry.target || '—')}</td>
      <td>${esc(entry.details || '—')}</td>
      <td>${formatDateTime(entry.timestamp)}</td>
    </tr>`;
  }).join('');
};

// ==========================================
// MANAGE PENALTIES
// ==========================================
let allPenalties = [];

window.loadPenalties = async function() {
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    allPenalties = [];
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const status = data.accountStatus || 'active';
      const hasWarnings = data.warnings && data.warnings.length > 0;
      const flagged = data.flaggedUsername || false;
      const isPenalized = status !== 'active' || hasWarnings || flagged;

      if (!isPenalized) continue;

      const penalties = [];
      if (status === 'suspended') penalties.push({ type: 'suspended', reason: data.suspensionReason || '', issuedAt: data.suspendedAt || null });
      if (status === 'banned') penalties.push({ type: 'banned', reason: data.banReason || '', issuedAt: data.bannedAt || null });
      if (hasWarnings) {
        data.warnings.forEach(w => penalties.push({ type: 'warned', reason: w.reason || '', issuedAt: w.timestamp || null, moderator: w.moderator || 'Unknown' }));
      }
      if (flagged) penalties.push({ type: 'flagged_username', reason: data.flagReason || '', issuedAt: null });

      allPenalties.push({
        id: docSnap.id,
        username: data.username || 'Unknown',
        displayName: data.displayName || data.username || 'Unknown',
        status: status,
        penalties: penalties
      });
    }
    renderPenaltyList();
  } catch (error) {
    console.error("Failed to load penalties:", error);
  }
};

window.renderPenaltyList = function() {
  const search = (document.getElementById('penaltySearchBar')?.value || '').toLowerCase();
  const filter = document.getElementById('penaltyFilter')?.value || 'all';

  let rows = [];
  allPenalties.forEach(user => {
    user.penalties.forEach(p => {
      if (filter !== 'all' && p.type !== filter) return;
      if (search && !user.username.toLowerCase().includes(search)) return;
      rows.push({ ...p, userId: user.id, username: user.username, userStatus: user.status });
    });
  });

  rows.sort((a, b) => {
    const aTime = a.issuedAt?.seconds || 0;
    const bTime = b.issuedAt?.seconds || 0;
    return bTime - aTime;
  });

  const tbody = document.getElementById('penaltyTableBody');
  const empty = document.getElementById('penaltyEmptyState');
  if (!rows.length) { tbody.innerHTML = ''; empty.hidden = false; return; }
  empty.hidden = true;

  const removeBtns = (userId, type) => {
    if (type === 'suspended' || type === 'banned') {
      return `<button class="btn-success" onclick="window.reactivateUser('${userId}');window.loadPenalties();">Reactivate</button>`;
    }
    if (type === 'warned') {
      return `<button class="btn-secondary" onclick="window.removeWarning('${userId}')">Remove Last Warning</button>`;
    }
    if (type === 'flagged_username') {
      return `<button class="btn-secondary" onclick="window.unflagUsername('${userId}')">Unflag</button>`;
    }
    return '';
  };

  const badgeClass = type => {
    if (type === 'suspended') return 'badge-suspended';
    if (type === 'banned') return 'badge-banned';
    if (type === 'warned') return 'badge-warned';
    return 'badge-warned';
  };

  tbody.innerHTML = rows.map((r, i) => `<tr>
    <td class="num-cell">${i + 1}</td>
    <td class="user-cell">${esc(r.username)}</td>
    <td><span class="badge ${badgeClass(r.type)}">${esc(r.type)}</span></td>
    <td>${esc(r.reason || '—')}</td>
    <td>${formatDateTime(r.issuedAt)}</td>
    <td class="action-buttons">${removeBtns(r.userId, r.type)}</td>
  </tr>`).join('');
};

window.removeWarning = async function(userId) {
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) return;
    const warnings = userSnap.data().warnings || [];
    if (!warnings.length) return;
    warnings.pop();
    await updateDoc(doc(db, 'users', userId), { warnings });
    showToast('Last warning removed.');
    window.loadPenalties();
  } catch (e) {
    console.error("Failed to remove warning:", e);
    showToast('Failed.', 'error');
  }
};

window.unflagUsername = async function(userId) {
  try {
    await updateDoc(doc(db, 'users', userId), { flaggedUsername: false, flagReason: '' });
    showToast('Username unflagged.');
    window.loadPenalties();
    if (typeof window.loadAllUsers === 'function') window.loadAllUsers();
  } catch (e) {
    console.error("Failed to unflag:", e);
    showToast('Failed.', 'error');
  }
};

// ==========================================
// DETAILED STATISTICS
// ==========================================
window.loadDetailedStats = function() {
  const total = allQueueEntries.length;
  const pending = allQueueEntries.filter(e => e.status === 'pending_review').length;
  const approved = allQueueEntries.filter(e => e.status === 'approved').length;
  const rejected = allQueueEntries.filter(e => e.status === 'rejected').length;

  // Average review time (submittedAt -> reviewedAt)
  let totalReviewTime = 0;
  let reviewedCount = 0;
  allQueueEntries.forEach(e => {
    if (e.submittedAt?.seconds && e.reviewedAt?.seconds) {
      totalReviewTime += (e.reviewedAt.seconds - e.submittedAt.seconds);
      reviewedCount++;
    }
  });
  const avgMinutes = reviewedCount > 0 ? Math.round((totalReviewTime / reviewedCount) / 60) : 0;

  const flagged = allQueueEntries.filter(e => e.aiReason).length;
  const clean = total - flagged;

  document.getElementById('detailedStats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Total Submissions</div></div>
    <div class="stat-card"><div class="stat-value">${pending}</div><div class="stat-label">Pending Review</div></div>
    <div class="stat-card"><div class="stat-value">${approved}</div><div class="stat-label">Approved</div></div>
    <div class="stat-card"><div class="stat-value">${rejected}</div><div class="stat-label">Rejected</div></div>
    <div class="stat-card"><div class="stat-value">${flagged}</div><div class="stat-label">AI Flagged</div></div>
    <div class="stat-card"><div class="stat-value">${clean}</div><div class="stat-label">Clean Submissions</div></div>
    <div class="stat-card"><div class="stat-value">${avgMinutes}m</div><div class="stat-label">Avg Review Time</div></div>
    <div class="stat-card"><div class="stat-value">${allUsers.length}</div><div class="stat-label">Total Players</div></div>
  `;
};

// ==========================================
// TOAST
// ==========================================
function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (t) {
    t.textContent = msg;
    t.className = 'toast show' + (type === 'error' ? ' error' : '');
    setTimeout(() => t.className = 'toast', 2500);
  }
}

// ==========================================
// AWARD QUEST REWARDS (called by moderator on approve)
// ==========================================
async function awardQuestRewards(userId, questId) {
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

    if (newLevel > (userData.level || 0)) {
      showLevelUpModal(newLevel);
    }

    console.log(`Rewards awarded to ${userId}: +${xpReward} XP, +${coinReward} Coins. New level: ${newLevel}`);
  } catch (error) {
    console.error("Error awarding quest rewards:", error);
  }
}

// ==========================================
// REVERSE QUEST REWARDS (instant-reward reversal)
// ==========================================
async function reverseQuestRewards(userId, questId) {
  try {
    const questSnap = await getDoc(doc(db, 'quests', questId));
    if (!questSnap.exists()) return;

    const questData = questSnap.data();
    const xpReward = questData.finalXP || questData.xp || 0;
    const coinReward = questData.Reward ?? questData.reward ?? 0;

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    const newXP = Math.max(0, (userData.xp || 0) - xpReward);
    const newCoins = Math.max(0, (userData.coins || 0) - coinReward);

    const progress = getProgressToNextLevel(newXP);

    let completedAt = null;
    try {
      const uqSnap = await getDoc(doc(db, 'users', userId, 'userQuests', questId));
      if (uqSnap.exists()) {
        const uq = uqSnap.data();
        completedAt = uq.completedAt || uq.submittedAt || null;
      }
    } catch (e) {
      console.warn("Could not read userQuest for period reversal:", e);
    }

    const update = {
      xp: newXP,
      coins: newCoins,
      level: progress.level,
      xpInLevel: progress.xpInLevel,
      totalCoinsEarned: Math.max(0, (userData.totalCoinsEarned || 0) - coinReward),
      questsCompleted: Math.max(0, (userData.questsCompleted || 0) - 1)
    };
    const periodUpdate = reversePeriodXpUpdate(userData, completedAt, xpReward);
    Object.assign(update, periodUpdate);
    if (periodUpdate.dailyXP !== undefined) {
      update.dailyCompletions = Math.max(0, (userData.dailyCompletions || 0) - 1);
    }

    await updateDoc(userRef, update);
    console.log(`Reversed rewards for ${userId}: -${xpReward} XP, -${coinReward} Coins. New level: ${progress.level}`);
  } catch (error) {
    console.error("Error reversing quest rewards:", error);
  }
}

// ==========================================
// INIT
// ==========================================

loadModQueue();
