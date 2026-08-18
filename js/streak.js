import { auth, db } from './firebase.js';
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

const STREAK_REWARDS = [
  { days: 3,  coins: 50,  msg: "3-day streak bonus: +50 QC!" },
  { days: 7,  coins: 150, msg: "7-day streak bonus: +150 QC!" },
  { days: 14, coins: 300, msg: "14-day streak bonus: +300 QC!" },
  { days: 30, coins: 500, msg: "30-day streak bonus: +500 QC!" },
];

function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getYesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function updateStreakDisplay(streakDays) {
  const badge = document.getElementById('navStreak');
  const count = document.getElementById('navStreakCount');
  if (badge) badge.hidden = false;
  if (count) count.textContent = streakDays || 0;
}

function setStreakActive(isActive) {
  const badge = document.getElementById('navStreak');
  if (badge) badge.classList.toggle("inactive", !isActive);
}

window.updateStreakDisplay = updateStreakDisplay;
window.setStreakActive = setStreakActive;

window.activateStreakToday = async function() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  try {
    const userRef = doc(db, 'users', currentUser.uid);
    await updateDoc(userRef, { streakActiveToday: true });
    setStreakActive(true);
    if (window.userData) window.userData.streakActiveToday = true;
  } catch (err) {
    console.error("Failed to activate streak:", err);
  }
};

async function processStreak() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const data = userSnap.data();
    const today = getTodayStr();
    const yesterday = getYesterdayStr();
    const lastDate = data.lastStreakDate || '';
    let streakDays = data.streakDays || 0;

    if (lastDate === today) {
      updateStreakDisplay(streakDays);
      setStreakActive(data.streakActiveToday === true);
      return;
    }

    if (lastDate === yesterday) {
      streakDays += 1;
    } else if (lastDate !== today) {
      streakDays = 1;
    }

    await updateDoc(userRef, {
      lastStreakDate: today,
      streakDays: streakDays,
      lastActive: new Date(),
      streakActiveToday: false
    });

    if (window.userData) {
      window.userData.lastStreakDate = today;
      window.userData.streakDays = streakDays;
      window.userData.streakActiveToday = false;
    }

    updateStreakDisplay(streakDays);
    setStreakActive(false);

    for (const reward of STREAK_REWARDS) {
      if (streakDays === reward.days) {
        const userSnap2 = await getDoc(userRef);
        if (userSnap2.exists()) {
          const currentCoins = userSnap2.data().coins || 0;
          await updateDoc(userRef, { coins: currentCoins + reward.coins });
          if (window.userData) window.userData.coins = currentCoins + reward.coins;
          if (typeof window.updateCoinDisplay === 'function') window.updateCoinDisplay(currentCoins + reward.coins);
          if (typeof window.showToast === 'function') window.showToast(reward.msg);
          if (typeof window.createNotification === 'function') {
            window.createNotification('coins_earned', reward.msg);
          }
        }
        break;
      }
    }

    if (typeof window.checkAndAwardAchievements === 'function') {
      setTimeout(() => window.checkAndAwardAchievements(), 1000);
    }

  } catch (err) {
    console.error("Streak processing error:", err);
  }
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    processStreak();
  } else {
    updateStreakDisplay(0);
    setStreakActive(false);
  }
});
