const {onRequest} = require("firebase-functions/v2/https");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

exports.helloWorld = onRequest((req, res) => {
  res.send("Hello World!");
});

exports.syncPublicProfile = onDocumentWritten(
    "users/{userId}", async (event) => {
      const userId = event.params.userId;
      const after = event.data && event.data.after;
      const publicProfileRef = db.collection("publicProfiles").doc(userId);

      if (!after || !after.exists) {
        await publicProfileRef.delete();
        return;
      }

      const user = after.data();
      await publicProfileRef.set({
        username: user.username || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        level: Number.isFinite(user.level) ? user.level : 0,
        dailyXP: Number.isFinite(user.dailyXP) ? user.dailyXP : 0,
        dailyResetDate: user.dailyResetDate || "",
        weeklyXP: Number.isFinite(user.weeklyXP) ? user.weeklyXP : 0,
        weeklyResetDate: user.weeklyResetDate || "",
        monthlyXP: Number.isFinite(user.monthlyXP) ? user.monthlyXP : 0,
        monthlyResetDate: user.monthlyResetDate || "",
        yearlyXP: Number.isFinite(user.yearlyXP) ? user.yearlyXP : 0,
        yearlyResetDate: user.yearlyResetDate || "",
      });
    });
