// ==========================================
// GAME BALANCE CONFIGURATION
// ==========================================
// Single source of truth for all game balance values.
// Edit this file to rebalance the entire game.

const GameBalance = {

  // =====================
  // ROLE HIERARCHY
  // =====================
  roles: {
    player: 1,
    subscribed: 2,
    paid: 2,
    moderator: 3,
    admin: 4,
    special_admin: 5,
    owner: 6
  },

  // =====================
  // XP / LEVELING CURVE
  // =====================
  // Formula: totalXPForLevel(N) = XP_BASE * N * (N + XP_GROWTH) / 2
  // Level 1: 100 XP, Level 2: 250 XP, Level 3: 450 XP, Level 5: 1000 XP
  xpCurve: {
    base: 50,
    growth: 3
  },

  // =====================
  // EFFORT (replaces Difficulty)
  // =====================
  // Each effort tier has an allowed XP range.
  // Quest creators must set base XP within the range for the selected effort.
  efforts: {
    easy:      { label: 'Easy',      minXP: 25,  maxXP: 75  },
    medium:    { label: 'Medium',    minXP: 75,  maxXP: 150 },
    hard:      { label: 'Hard',      minXP: 150, maxXP: 300 },
    epic:      { label: 'Epic',      minXP: 300, maxXP: 450 },
    legendary: { label: 'Legendary', minXP: 450, maxXP: 800 }
  },

  // =====================
  // ADVENTURE RATING
  // =====================
  // Multiplier applied to base XP to get final XP.
  // Final XP = baseXP * multiplier (rounded to nearest integer)
  adventureRatings: {
    common:    { label: 'Common',    multiplier: 1.00 },
    uncommon:  { label: 'Uncommon',  multiplier: 1.10 },
    rare:      { label: 'Rare',      multiplier: 1.25 },
    epic:      { label: 'Epic',      multiplier: 1.40 },
    legendary: { label: 'Legendary', multiplier: 1.60 }
  },

  // =====================
  // VERIFICATION RULES
  // =====================
  // Determines verification path based on effort level.
  // 'ai'         = auto AI check, approve if clean
  // 'ai_or_mod'  = AI check first; if low confidence, send to moderator
  // 'mod'        = always require moderator approval
  verificationRules: {
    easy:      { type: 'ai',       description: 'AI verification' },
    medium:    { type: 'ai',       description: 'AI verification' },
    hard:      { type: 'ai_or_mod', description: 'AI verification; low confidence → moderator' },
    epic:      { type: 'mod',      description: 'Always requires moderator approval' },
    legendary: { type: 'mod',      description: 'Always requires moderator approval' }
  },

  // =====================
  // COIN REWARDS
  // =====================
  // Coin multiplier per effort (coins = base coins * multiplier)
  coinRewards: {
    easy:      { base: 10,  multiplier: 1.0 },
    medium:    { base: 25,  multiplier: 1.0 },
    hard:      { base: 50,  multiplier: 1.0 },
    epic:      { base: 100, multiplier: 1.0 },
    legendary: { base: 200, multiplier: 1.0 }
  }
};

if (typeof window !== 'undefined') {
  window.GameBalance = GameBalance;
}

export { GameBalance };
export default GameBalance;
