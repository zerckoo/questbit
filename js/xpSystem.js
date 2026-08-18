// ==========================================
// XP SYSTEM — Reusable Helper Functions
// ==========================================
// All XP, level, and reward calculations live here.
// Import GameBalance for config values.

import { GameBalance } from './gameBalance.js';

// =====================
// LEVELING FUNCTIONS
// =====================

/**
 * Get the total XP required to reach a given level.
 * Level 1 = 100 XP, Level 2 = 250 XP, etc.
 */
function getXPForLevel(level) {
  if (level <= 0) return 0;
  const { base, growth } = GameBalance.xpCurve;
  return Math.floor(base * level * (level + growth) / 2);
}

/**
 * Get the player's current level from their total XP.
 * Inverts the XP curve formula.
 */
function getLevelFromXP(totalXP) {
  if (!totalXP || totalXP <= 0) return 0;
  const { base, growth } = GameBalance.xpCurve;
  // Solve: base * L * (L + growth) / 2 = totalXP
  // base*L^2 + base*growth*L - 2*totalXP = 0
  // L = (-base*growth + sqrt(base^2*growth^2 + 8*base*totalXP)) / (2*base)
  const a = base;
  const b = base * growth;
  const c = -2 * totalXP;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;
  const level = Math.floor((-b + Math.sqrt(discriminant)) / (2 * a));
  return Math.max(0, level);
}

/**
 * Get detailed progress info for the current level.
 * Returns: { level, xpInLevel, xpForNextLevel, xpForCurrentLevel, percent }
 */
function getProgressToNextLevel(totalXP) {
  const level = getLevelFromXP(totalXP);
  const xpForCurrentLevel = getXPForLevel(level);
  const xpForNextLevel = getXPForLevel(level + 1);
  const xpInLevel = totalXP - xpForCurrentLevel;
  const xpNeeded = xpForNextLevel - xpForCurrentLevel;
  const percent = xpNeeded > 0 ? Math.min((xpInLevel / xpNeeded) * 100, 100) : 0;

  return {
    level,
    xpInLevel,
    xpForNextLevel,
    xpForCurrentLevel,
    xpNeeded,
    percent
  };
}

// =====================
// REWARD CALCULATION
// =====================

/**
 * Calculate the final XP for a quest completion.
 * Final XP = baseXP * adventureMultiplier
 */
function calculateFinalXP(baseXP, adventureRating) {
  const rating = GameBalance.adventureRatings[adventureRating];
  if (!rating) return baseXP || 0;
  return Math.round((baseXP || 0) * rating.multiplier);
}

/**
 * Get the allowed XP range for an effort level.
 */
function getEffortXPRange(effort) {
  return GameBalance.efforts[effort] || GameBalance.efforts.medium;
}

/**
 * Get the adventure multiplier for a rating.
 */
function getAdventureMultiplier(rating) {
  const r = GameBalance.adventureRatings[rating];
  return r ? r.multiplier : 1.0;
}

/**
 * Get the verification type for an effort level.
 */
function getVerificationRule(effort) {
  return GameBalance.verificationRules[effort] || GameBalance.verificationRules.medium;
}

/**
 * Calculate coins awarded for a quest based on effort.
 */
function calculateCoins(effort) {
  const config = GameBalance.coinRewards[effort];
  if (!config) return 0;
  return Math.round(config.base * config.multiplier);
}

// =====================
// PROGRESS UPDATE (for Firestore writes)
// =====================

/**
 * Given old XP and newly awarded XP, compute the full update object
 * to write to the user document. Handles multi-level jumps.
 */
function computeLevelUpdate(currentXP, awardedXP, currentCoins, awardedCoins) {
  const newTotalXP = currentXP + awardedXP;
  const progress = getProgressToNextLevel(newTotalXP);
  const newCoins = currentCoins + awardedCoins;
  const oldLevel = getLevelFromXP(currentXP);
  const levelsGained = progress.level - oldLevel;

  return {
    xp: newTotalXP,
    level: progress.level,
    xpInLevel: progress.xpInLevel,
    coins: newCoins,
    levelsGained,
    percent: progress.percent
  };
}

// =====================
// LEVEL-UP MODAL
// =====================

function showLevelUpModal(newLevel) {
    if (document.getElementById('levelUpModal')) return;

    const modal = document.createElement('div');
    modal.id = 'levelUpModal';
    modal.innerHTML = `
    <div class="lu-overlay"></div>
    <div class="lu-card">
        <div class="lu-stars">&#11088;</div>
        <div class="lu-title">LEVEL UP!</div>
        <div class="lu-sub">You reached</div>
        <div class="lu-level">LEVEL ${newLevel}</div>
        <div class="lu-msg">Your adventure continues. Keep completing quests to grow stronger!</div>
        <button class="lu-btn" id="luCloseBtn">CONTINUE</button>
    </div>
    `;
    document.body.appendChild(modal);

    const style = document.createElement('style');
    style.textContent = `
    #levelUpModal{position:fixed;z-index:9999;inset:0;display:grid;place-items:center;padding:20px}
    #levelUpModal .lu-overlay{position:absolute;inset:0;background:rgba(7,18,35,.82);animation:luFadeIn .3s}
    #levelUpModal .lu-card{position:relative;z-index:1;background:#173452;border:3px solid #0b1b31;box-shadow:6px 6px 0 #071426;padding:44px 48px;text-align:center;max-width:420px;width:100%;animation:luPopIn .35s ease-out}
    #levelUpModal .lu-stars{font-size:42px;margin-bottom:8px;animation:luPulse 1.2s ease-in-out infinite}
    #levelUpModal .lu-title{color:#77cfef;font-size:clamp(28px,5vw,38px);letter-spacing:2px;margin-bottom:4px}
    #levelUpModal .lu-sub{color:#8aabc4;font-size:13px;text-transform:uppercase;letter-spacing:1px}
    #levelUpModal .lu-level{color:#f1f6fa;font-size:clamp(36px,6vw,52px);font-weight:700;margin:10px 0 16px;text-shadow:0 0 20px rgba(119,207,239,.35)}
    #levelUpModal .lu-msg{color:#8aabc4;font-size:13px;line-height:1.5;margin-bottom:28px}
    #levelUpModal .lu-btn{padding:14px 36px;color:#0b1b31;background:#77cfef;border:3px solid #0b1b31;box-shadow:4px 4px 0 #071426;cursor:pointer;font:700 15px "Silkscreen",monospace;text-transform:uppercase;transition:transform .1s,background .1s}
    #levelUpModal .lu-btn:hover{background:#91d7f0;transform:translateY(-2px)}
    @keyframes luFadeIn{from{opacity:0}to{opacity:1}}
    @keyframes luPopIn{from{opacity:0;transform:scale(.85) translateY(15px)}to{opacity:1;transform:scale(1) translateY(0)}}
    @keyframes luPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
    `;
    document.head.appendChild(style);

    function close() {
        modal.style.opacity = '0';
        modal.style.transition = 'opacity .25s';
        setTimeout(() => modal.remove(), 260);
    }

    document.getElementById('luCloseBtn').addEventListener('click', close);
    modal.querySelector('.lu-overlay').addEventListener('click', close);
}

// =====================
// EXPORTS
// =====================

const xpSystem = {
  getXPForLevel,
  getLevelFromXP,
  getProgressToNextLevel,
  calculateFinalXP,
  getEffortXPRange,
  getAdventureMultiplier,
  getVerificationRule,
  calculateCoins,
  computeLevelUpdate,
  showLevelUpModal
};

if (typeof window !== 'undefined') {
  window.xpSystem = xpSystem;
}

export {
  getXPForLevel,
  getLevelFromXP,
  getProgressToNextLevel,
  calculateFinalXP,
  getEffortXPRange,
  getAdventureMultiplier,
  getVerificationRule,
  calculateCoins,
  computeLevelUpdate,
  showLevelUpModal
};

export default xpSystem;
