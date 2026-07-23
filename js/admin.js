import { db } from "./firebase.js";

import {
    collection,
    doc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    deleteField
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const questsCol = collection(db, "quests");

// =========================
// Load All Quests
// =========================

async function loadQuests() {
    try {
        const snapshot = await getDocs(questsCol);
        const loaded = [];

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            loaded.push({
                id: loaded.length + 1,
                firestoreId: docSnap.id,
                title: data.title || "",
                desc: data.description || data.desc || "",
                xp: data.xp || 0,
                reward: data.Reward ?? data.reward ?? 0,
                biome: data.biome || "general",
                difficulty: data.difficulty || "medium",
                category: data.category || "",
                budget: data.budget || data.cost || "free",
                time: data.estimatedTime || data.time || "",
                status: data.isPublished ? "published" : "draft",
                image: data.image || "",
                verify: data.verificationType || data.verify || "manual",
                createdAt: data.createdAt || null
            });
        });

        loaded.sort((a, b) => {
            const aTime = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
            const bTime = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
            return bTime - aTime;
        });

        loaded.forEach((q, i) => q.id = i + 1);

        window.quests.length = 0;
        loaded.forEach(q => window.quests.push(q));
        window.nextId = loaded.length + 1;

        if (typeof window.renderQuests === "function") {
            window.renderQuests();
        }

    } catch (error) {
        console.error("Failed to load quests:", error);
        const container = document.getElementById("adminQuestsContainer");
        if (container) {
            container.innerHTML = '<div style="padding:20px;color:#ff6b6b;background:#1b3455;border:2px solid var(--deep-ink);text-align:center;">Failed to load quests: ' + error.message + '</div>';
        }
    }
}

// =========================
// Create Quest
// =========================

window.createQuestInDB = async function (questData) {
    try {
        const docRef = await addDoc(questsCol, {
            title: questData.title,
            description: questData.desc,
            xp: questData.xp,
            Reward: questData.reward,
            biome: questData.biome,
            difficulty: questData.difficulty,
            category: questData.category,
            budget: questData.budget,
            estimatedTime: questData.time,
            image: questData.image,
            verificationType: questData.verify,
            isPublished: questData.status === "published",
            createdAt: serverTimestamp()
        });
        console.log("Quest created:", docRef.id);
        await loadQuests();
        return true;
    } catch (error) {
        console.error("Failed to create quest:", error);
        alert("Failed to create quest: " + error.message);
        return false;
    }
};

// =========================
// Update Quest
// =========================

window.updateQuestInDB = async function (firestoreId, questData) {
    try {
        const questRef = doc(db, "quests", firestoreId);
        await updateDoc(questRef, {
            title: questData.title,
            description: questData.desc,
            xp: questData.xp,
            Reward: questData.reward,
            reward: deleteField(),
            biome: questData.biome,
            difficulty: questData.difficulty,
            category: questData.category,
            budget: questData.budget,
            estimatedTime: questData.time,
            image: questData.image,
            verificationType: questData.verify,
            isPublished: questData.status === "published"
        });
        console.log("Quest updated:", firestoreId);
        await loadQuests();
        return true;
    } catch (error) {
        console.error("Failed to update quest:", error);
        alert("Failed to update quest: " + error.message);
        return false;
    }
};

// =========================
// Delete Quest
// =========================

window.deleteQuestFromDB = async function (firestoreId) {
    try {
        const questRef = doc(db, "quests", firestoreId);
        await deleteDoc(questRef);
        console.log("Quest deleted:", firestoreId);
        await loadQuests();
        return true;
    } catch (error) {
        console.error("Failed to delete quest:", error);
        alert("Failed to delete quest: " + error.message);
        return false;
    }
};

// =========================
// Toggle Publish
// =========================

window.togglePublishInDB = async function (firestoreId, currentStatus) {
    try {
        const questRef = doc(db, "quests", firestoreId);
        await updateDoc(questRef, {
            isPublished: currentStatus !== "published"
        });
        console.log("Quest publish toggled:", firestoreId);
        await loadQuests();
        return true;
    } catch (error) {
        console.error("Failed to toggle publish:", error);
        alert("Failed to toggle publish: " + error.message);
        return false;
    }
};

// =========================
// Start
// =========================

loadQuests();
