// =========================
// Import Firestore
// =========================

import { db } from "./firebase.js";

import {
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const questsContainer = document.getElementById("featuredGrid");


// =========================
// Load Quests
// =========================

async function loadQuests() {

    try {

        // Reference to the "quests" collection
        const questsRef = collection(db, "quests");

        // Only load published quests
        const q = query(
            questsRef,
            where("isPublished", "==", true)
        );

        // Get all matching quests
        const snapshot = await getDocs(q);

        console.log("=== Quests Loaded ===");
        
        questsContainer.innerHTML = "";

        // Print every quest
        snapshot.forEach((doc) => {

            console.log(doc.id);
            const quest = doc.data();
            const card = document.createElement("div");

            card.innerHTML = `
            <h3>${quest.title}</h3>
            <p>${quest.description}</p>
            <p>${quest.xp} XP</p>
`;

questsContainer.appendChild(card);

});

    } catch (error) {

        console.error("Failed to load quests:", error);

    }

}


// =========================
// Start
// =========================

loadQuests();