// ==========================================
// RANKINGS PAGE — leaderboard by XP earned per period
// ==========================================
import { auth, db } from './firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getPeriodXP } from './periods.js';

const TOP_N = 25;

const listEl = document.getElementById('rankingsList');
const statusEl = document.getElementById('rankingsStatus');
const myRankEl = document.getElementById('myRankRow');

let allRankUsers = [];
let currentPeriod = 'daily';
let currentUid = null;

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function initials(username, displayName) {
  const name = (username || displayName || 'A').trim();
  return name.charAt(0).toUpperCase();
}

async function loadUsers() {
  statusEl.textContent = 'Loading adventurers...';
  listEl.innerHTML = '';
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    allRankUsers = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (!data.username) return;
      allRankUsers.push({
        uid: docSnap.id,
        username: data.username,
        displayName: data.displayName || '',
        photoURL: data.photoURL || '',
        level: data.level || 0,
        userData: data
      });
    });
    renderRankings();
  } catch (e) {
    console.error('Failed to load rankings:', e);
    statusEl.textContent = 'Failed to load rankings.';
    listEl.innerHTML = '<div class="rankings-empty">Something went wrong. Try refreshing.</div>';
    myRankEl.hidden = true;
  }
}

function avatarHtml(u) {
  const initial = esc(initials(u.username, u.displayName));
  if (u.photoURL) {
    return `
      <span class="rank-avatar">
        <span class="rank-avatar-initial">${initial}</span>
        <img class="rank-avatar-img" src="${esc(u.photoURL)}" alt="" loading="lazy" onerror="this.style.display='none'; this.parentElement.querySelector('.rank-avatar-initial').style.display='flex';">
      </span>
    `;
  }
  return `<span class="rank-avatar"><span class="rank-avatar-initial">${initial}</span></span>`;
}

function renderRankings() {
  const rows = allRankUsers
    .map(u => ({ ...u, xp: getPeriodXP(u.userData, currentPeriod) }))
    .sort((a, b) => b.xp - a.xp || (a.username || '').localeCompare(b.username || ''));

  const ranked = rows.map((u, i) => ({ ...u, rank: i + 1 }));
  const top = ranked.filter(u => u.xp > 0).slice(0, TOP_N);
  const periodLabel = currentPeriod.charAt(0).toUpperCase() + currentPeriod.slice(1);

  if (top.length === 0) {
    statusEl.textContent = `No XP earned this ${currentPeriod.toLowerCase()} yet.`;
    listEl.innerHTML = '<div class="rankings-empty">No adventurers have earned XP in this period yet. Go complete a quest!</div>';
    myRankEl.hidden = true;
    return;
  }

  statusEl.textContent = `Top ${top.length} — XP earned this ${currentPeriod.toLowerCase()} period.`;

  listEl.innerHTML = top.map(u => {
    const isMe = currentUid && u.uid === currentUid;
    const medal = u.rank === 1 ? 'rank-gold' : u.rank === 2 ? 'rank-silver' : u.rank === 3 ? 'rank-bronze' : '';
    return `
      <div class="rank-row ${isMe ? 'rank-me' : ''}">
        <span class="rank-no ${medal}">${String(u.rank).padStart(2, '0')}</span>
        ${avatarHtml(u)}
        <span class="rank-name">${esc(u.username).toUpperCase()}</span>
        <span class="rank-level">LV ${u.level}</span>
        <span class="rank-xp">${Number(u.xp).toLocaleString()} XP</span>
      </div>`;
  }).join('');

  const me = ranked.find(u => u.uid === currentUid);
  if (me) {
    myRankEl.hidden = false;
    if (me.xp > 0) {
      myRankEl.innerHTML = `Your rank: <strong>#${me.rank}</strong> &middot; ${esc(me.username).toUpperCase()} &middot; LV ${me.level} &middot; ${Number(me.xp).toLocaleString()} XP this ${currentPeriod.toLowerCase()}`;
    } else {
      myRankEl.innerHTML = `You have <strong>0 XP</strong> this ${currentPeriod.toLowerCase()}. Complete a quest to climb the board!`;
    }
  } else {
    myRankEl.hidden = true;
  }
}

document.querySelectorAll('.period-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentPeriod = tab.dataset.period;
    renderRankings();
  });
});

document.getElementById('rankingsRefreshBtn').addEventListener('click', loadUsers);

onAuthStateChanged(auth, user => {
  currentUid = user ? user.uid : null;
  if (user) {
    loadUsers();
  } else {
    statusEl.textContent = 'Sign in to view the rankings.';
    listEl.innerHTML = '<div class="rankings-empty">Sign in to see who is climbing the leaderboard.</div>';
    myRankEl.hidden = true;
  }
});
