import { auth, db } from './firebase.js';
import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  where,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

const ICONS = {
  quest_approved: '&#9989;',
  coins_earned: '&#127942;',
  xp_earned: '&#11088;',
  level_up: '&#127775;',
  quest_completed: '&#127941;',
  quest_cancelled: '&#10060;',
  warning: '&#9888;',
  info: '&#128712;'
};

function timeAgo(date) {
  if (!date) return '';
  const now = Date.now();
  const ts = date.seconds ? date.seconds * 1000 : new Date(date).getTime();
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return new Date(ts).toLocaleDateString();
}

window.createNotification = async function(type, message) {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    await addDoc(collection(db, 'users', currentUser.uid, 'notifications'), {
      type: type,
      message: message,
      read: false,
      createdAt: serverTimestamp()
    });
    refreshNotifBadge();
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
};

async function getNotifications() {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  try {
    const notifsRef = collection(db, 'users', currentUser.uid, 'notifications');
    const q = query(notifsRef, orderBy('createdAt', 'desc'), limit(30));
    const snapshot = await getDocs(q);
    const items = [];
    snapshot.forEach(docSnap => {
      items.push({ id: docSnap.id, ...docSnap.data() });
    });
    return items;
  } catch (err) {
    console.error('Failed to load notifications:', err);
    return [];
  }
}

async function getUnreadCount() {
  const currentUser = auth.currentUser;
  if (!currentUser) return 0;

  try {
    const notifsRef = collection(db, 'users', currentUser.uid, 'notifications');
    const q = query(notifsRef, where('read', '==', false));
    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (err) {
    return 0;
  }
}

async function markAllRead() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const notifsRef = collection(db, 'users', currentUser.uid, 'notifications');
    const q = query(notifsRef, where('read', '==', false));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.forEach(docSnap => {
      batch.update(docSnap.ref, { read: true });
    });
    await batch.commit();
    refreshNotifBadge();
  } catch (err) {
    console.error('Failed to mark notifications read:', err);
  }
}

async function clearAll() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const notifsRef = collection(db, 'users', currentUser.uid, 'notifications');
    const snapshot = await getDocs(notifsRef);
    const batch = writeBatch(db);
    snapshot.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
    renderNotifList([]);
    refreshNotifBadge();
  } catch (err) {
    console.error('Failed to clear notifications:', err);
  }
}

function renderNotifList(notifications) {
  const list = document.getElementById('notifList');
  if (!list) return;

  if (notifications.length === 0) {
    list.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
    return;
  }

  list.innerHTML = notifications.map(n => {
    const icon = ICONS[n.type] || ICONS.info;
    const unreadClass = n.read ? '' : ' unread';
    return `
      <div class="notif-item${unreadClass}" data-id="${n.id}">
        <div class="notif-icon">${icon}</div>
        <div class="notif-body">
          <p class="notif-text">${n.message}</p>
          <div class="notif-time">${timeAgo(n.createdAt)}</div>
        </div>
      </div>
    `;
  }).join('');
}

async function refreshNotifBadge() {
  const count = await getUnreadCount();
  const badge = document.getElementById('notifBadge');
  const wrap = document.getElementById('notifWrap');
  const user = auth.currentUser;
  if (wrap) wrap.hidden = !user;
  if (badge) {
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }
}

async function openDropdown() {
  const dropdown = document.getElementById('notifDropdown');
  if (!dropdown) return;
  dropdown.classList.add('open');
  const notifications = await getNotifications();
  renderNotifList(notifications);
  await markAllRead();
}

function closeDropdown() {
  const dropdown = document.getElementById('notifDropdown');
  if (dropdown) dropdown.classList.remove('open');
}

function initNotifUI() {
  const notifBtn = document.getElementById('notifBtn');
  const notifClearAll = document.getElementById('notifClearAll');
  const dropdown = document.getElementById('notifDropdown');

  if (notifBtn) {
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown && dropdown.classList.contains('open')) {
        closeDropdown();
      } else {
        openDropdown();
      }
    });
  }

  if (notifClearAll) {
    notifClearAll.addEventListener('click', (e) => {
      e.stopPropagation();
      clearAll();
    });
  }

  document.addEventListener('click', (e) => {
    if (dropdown && dropdown.classList.contains('open')) {
      if (!dropdown.contains(e.target) && e.target !== notifBtn && !notifBtn?.contains(e.target)) {
        closeDropdown();
      }
    }
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    refreshNotifBadge();
  } else {
    const wrap = document.getElementById('notifWrap');
    if (wrap) wrap.hidden = true;
  }
});

initNotifUI();
