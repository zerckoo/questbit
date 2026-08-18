import { auth, db } from './firebase.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

const ACHIEVEMENTS = [
  { id: "first_quest",      name: "First Quest",         desc: "Complete your first quest",              icon: "&#127942;", check: (d) => (d.questsCompleted || 0) >= 1 },
  { id: "quest_5",          name: "Quest Apprentice",    desc: "Complete 5 quests",                      icon: "&#9989;",   check: (d) => (d.questsCompleted || 0) >= 5 },
  { id: "quest_10",         name: "Quest Master",        desc: "Complete 10 quests",                     icon: "&#127941;", check: (d) => (d.questsCompleted || 0) >= 10 },
  { id: "quest_25",         name: "Veteran Adventurer",  desc: "Complete 25 quests",                     icon: "&#128737;", check: (d) => (d.questsCompleted || 0) >= 25 },
  { id: "quest_50",         name: "Legendary Hero",      desc: "Complete 50 quests",                     icon: "&#128081;", check: (d) => (d.questsCompleted || 0) >= 50 },
  { id: "level_5",          name: "Rising Star",         desc: "Reach Level 5",                          icon: "&#11088;",  check: (d) => (d.level || 0) >= 5 },
  { id: "level_10",         name: "Veteran Explorer",    desc: "Reach Level 10",                         icon: "&#127775;", check: (d) => (d.level || 0) >= 10 },
  { id: "level_25",         name: "Peerless Champion",   desc: "Reach Level 25",                         icon: "&#128142;", check: (d) => (d.level || 0) >= 25 },
  { id: "coins_1000",       name: "Coin Collector",      desc: "Earn 1,000 Quest Coins",                 icon: "&#129689;", check: (d) => (d.totalCoinsEarned || d.coins || 0) >= 1000 },
  { id: "coins_5000",       name: "Wealthy Adventurer",  desc: "Earn 5,000 Quest Coins",                 icon: "&#128176;", check: (d) => (d.totalCoinsEarned || d.coins || 0) >= 5000 },
  { id: "streak_7",         name: "Dedicated",           desc: "Maintain a 7-day streak",                icon: "&#128293;", check: (d) => (d.streakDays || 0) >= 7 },
  { id: "streak_30",        name: "Devoted",             desc: "Maintain a 30-day streak",               icon: "&#127755;", check: (d) => (d.streakDays || 0) >= 30 },
  { id: "daily_3",          name: "Speed Runner",        desc: "Complete 3 quests in one day",           icon: "&#9889;",   check: (d) => (d.maxDailyCompletions || 0) >= 3 },
  { id: "daily_5",          name: "Marathon Runner",     desc: "Complete 5 quests in one day",           icon: "&#128694;", check: (d) => (d.maxDailyCompletions || 0) >= 5 },
];

window.ACHIEVEMENT_DEFS = ACHIEVEMENTS;

let earnedIds = new Set();

window.getEarnedAchievements = function() {
  return earnedIds;
};

window.checkAndAwardAchievements = async function() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    const userData = userSnap.data();

    for (const ach of ACHIEVEMENTS) {
      if (earnedIds.has(ach.id)) continue;
      if (ach.check(userData)) {
        earnedIds.add(ach.id);
        await setDoc(doc(db, 'users', currentUser.uid, 'achievements', ach.id), {
          id: ach.id,
          name: ach.name,
          desc: ach.desc,
          icon: ach.icon,
          earnedAt: new Date()
        });
        if (typeof window.createNotification === 'function') {
          window.createNotification('level_up', `Achievement unlocked: <strong>${ach.name}</strong>! ${ach.desc}`);
        }
        if (typeof window.showToast === 'function') {
          window.showToast(`Achievement: ${ach.name}!`);
        }
      }
    }
  } catch (err) {
    console.error("Error checking achievements:", err);
  }
};

async function loadEarnedAchievements() {
  const currentUser = auth.currentUser;
  if (!currentUser) { earnedIds = new Set(); return; }

  try {
    const achRef = collection(db, 'users', currentUser.uid, 'achievements');
    const snapshot = await getDocs(achRef);
    earnedIds = new Set();
    snapshot.forEach(docSnap => earnedIds.add(docSnap.id));
  } catch (err) {
    console.error("Error loading achievements:", err);
  }
}

function renderAchievementModal() {
  const list = document.getElementById('achievementGrid');
  if (!list) return;

  list.innerHTML = ACHIEVEMENTS.map(ach => {
    const earned = earnedIds.has(ach.id);
    const style = earned
      ? 'background:#1b3f63;border-color:var(--sky);'
      : 'background:#142238;border-color:#1a2a40;opacity:.55;filter:grayscale(.6);';
    const earnedLabel = earned ? '<div style="margin-top:6px;color:var(--green);font-size:10px;font-weight:700">EARNED</div>' : '';
    return `
      <div class="ach-card" style="${style}">
        <div class="ach-icon">${ach.icon}</div>
        <div class="ach-name">${ach.name}</div>
        <div class="ach-desc">${ach.desc}</div>
        ${earnedLabel}
      </div>
    `;
  }).join('');
}

function initAchievementUI() {
  const achBtn = document.getElementById('achBtn');
  const achModal = document.getElementById('achModal');
  const achClose = document.getElementById('achCloseBtn');

  if (achBtn) {
    achBtn.addEventListener('click', () => {
      renderAchievementModal();
      if (achModal) achModal.hidden = false;
    });
  }

  if (achClose) {
    achClose.addEventListener('click', () => {
      if (achModal) achModal.hidden = true;
    });
  }

  if (achModal) {
    achModal.addEventListener('click', (e) => {
      if (e.target === achModal) achModal.hidden = true;
    });
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    await loadEarnedAchievements();
    setTimeout(() => window.checkAndAwardAchievements(), 2000);
  } else {
    earnedIds = new Set();
  }
});

initAchievementUI();
