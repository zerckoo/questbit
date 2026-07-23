const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");

const signinBtn = document.getElementById("signinBtn");
const signoutBtn = document.getElementById("signoutBtn");
const qpBalance = document.getElementById("qpBalance");

const biomeTabs = document.querySelectorAll(".biome-tab");
const featuredGrid = document.getElementById("featuredGrid");
const biomeLabel = document.getElementById("biomeLabel");

const questImages = [
    "Images/Moonlit%20Sky%208%20bit.jfif",
    "Images/Ship.jfif",
    "Images/Coffee.jfif",
    "Images/Tea.jfif",
    "Images/Coke.jfif",
    "Images/Hu%20Tao.jfif",
    "Images/Pistol.jfif"
];

const questPools = {
    beach: [
        ["Tidepool Tally", "Find five tiny shoreline creatures before the tide returns.", "SCOUT QUEST", "+180 XP"],
        ["Sunset Sandwalk", "Take a mindful walk along the water and collect a smooth stone.", "EASY QUEST", "+120 XP"],
        ["Message in a Bottle", "Write a note to your future self and keep it somewhere safe.", "STORY QUEST", "+210 XP"],
        ["Shell Seeker", "Spot three different shell patterns on your next coastal stroll.", "DISCOVERY", "+160 XP"]
    ],
    sea: [
        ["Blue Horizon", "Learn one surprising fact about the ocean's deepest waters.", "KNOWLEDGE QUEST", "+190 XP"],
        ["Captain's Log", "Plan a dream voyage with three ports of call.", "STORY QUEST", "+150 XP"],
        ["Harbor Watch", "Find a peaceful waterside view and sketch its horizon.", "CALM QUEST", "+170 XP"],
        ["Current Reader", "Notice where water moves fastest during your next walk.", "SCOUT QUEST", "+200 XP"]
    ],
    forest: [
        ["Lantern Trail", "Take an evening walk and notice three sounds from the trees.", "EXPLORER QUEST", "+220 XP"],
        ["Moss Map", "Find a patch of green and make a tiny map of its surroundings.", "DISCOVERY", "+170 XP"],
        ["Canopy Chronicle", "Read beneath a tree for ten quiet minutes.", "CALM QUEST", "+140 XP"],
        ["Wildflower Witness", "Photograph or draw one plant you have never noticed before.", "SCOUT QUEST", "+200 XP"]
    ],
    mountains: [
        ["Summit Steps", "Climb a hill, staircase, or trail and count your steady steps.", "ENDURANCE QUEST", "+240 XP"],
        ["Echo Check", "Find an open place and test whether your voice carries.", "EXPLORER QUEST", "+180 XP"],
        ["Trail Rations", "Pack a thoughtful snack for your next long walk.", "PREP QUEST", "+150 XP"],
        ["Peak Postcard", "Draw the view from the highest point you visit today.", "STORY QUEST", "+210 XP"]
    ],
    city: [
        ["Hidden Arcade", "Visit a street you have never walked and find one detail to remember.", "URBAN QUEST", "+200 XP"],
        ["Café Chronicle", "Try a new drink or support a local spot.", "SOCIAL QUEST", "+150 XP"],
        ["Window Quest", "Find the most interesting window display in your neighborhood.", "SCOUT QUEST", "+170 XP"],
        ["Crosswalk Canvas", "Photograph a geometric pattern made by your city.", "CREATIVE QUEST", "+190 XP"]
    ],
    snow: [
        ["Frosty Focus", "Make a warm drink and complete one task without distractions.", "COZY QUEST", "+160 XP"],
        ["Winter Light", "Catch the softest light of the day in a photo or sketch.", "DISCOVERY", "+180 XP"],
        ["Snowbound Story", "Read or write a short tale set in a winter world.", "STORY QUEST", "+210 XP"],
        ["Cold Air Courage", "Take a brisk walk and notice how the air changes your pace.", "ENDURANCE QUEST", "+220 XP"]
    ]
};

function shuffle(items){
    return [...items].sort(() => Math.random() - .5);
}

function renderFeaturedQuests(biome){
    const selectedQuests = shuffle(questPools[biome]).slice(0, 3);
    biomeLabel.textContent = `${biome.toUpperCase()} PICKS`;
    featuredGrid.innerHTML = selectedQuests.map((quest, index) => {
        const [title, description, type, reward] = quest;
        const image = questImages[(index + biome.length) % questImages.length];
        return `
            <article class="featured-card">
                <span class="featured-type">${type}</span>
                <h3>${title}</h3>
                <img src="${image}" alt="${biome} quest artwork">
                <p>${description}</p>
                <div class="quest-meta">${biome.toUpperCase()} &middot; ${reward}</div>
                <button class="quest-accept" type="button">ACCEPT QUEST &#8250;</button>
            </article>`;
    }).join("");
}

function setSignedIn(isSignedIn){
    qpBalance.hidden = !isSignedIn;
    var wrap = document.getElementById("profileDropdownWrap");
    if (wrap) wrap.hidden = !isSignedIn;
    signinBtn.hidden = isSignedIn;
    localStorage.setItem("sideQuestDemoSignedIn", String(isSignedIn));
}

function closeRegisterModal(){
    registerModal.hidden = true;
    overlay.classList.remove("active");
}

function toggleMenu(){
    sidebar.classList.toggle("active");
    overlay.classList.toggle("active");
}

overlay.onclick = () => {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
    registerModal.hidden = true;
};

signinBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    registerModal.hidden = false;
    sidebar.classList.remove("active");
    overlay.classList.add("active");
});

registerCancelBtn.addEventListener("click", closeRegisterModal);
registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    closeRegisterModal();
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !registerModal.hidden) {
        closeRegisterModal();
    }
});

signoutBtn.onclick = () => setSignedIn(false);

biomeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        biomeTabs.forEach((item) => item.classList.remove("active"));
        tab.classList.add("active");
        renderFeaturedQuests(tab.dataset.biome);
    });
});

setSignedIn(localStorage.getItem("sideQuestDemoSignedIn") === "true");
renderFeaturedQuests("forest");
