// HANGOUT — quiz admin writes for the single approved Google account.
window.HangoutAdminRepository = (() => {
  const QUIZ_ADMIN_EMAIL = "kebir.limra@gmail.com";

  function isQuizAdmin() {
    const user = window.firebaseAuth?.currentUser;
    return typeof currentUserRole === "function"
      && currentUserRole() === "member"
      && String(user?.email || "").toLowerCase() === QUIZ_ADMIN_EMAIL;
  }

  function requireQuizAdmin() {
    if (!isQuizAdmin()) {
      throw new Error("Quiz admin access is available only to the approved account.");
    }
  }

  async function appendQuizAudit(action, path, recordId = "", afterUpdatedAt = "") {
    try {
      await window.firebaseReady;
      const user = window.firebaseAuth?.currentUser;
      if (!user || !window.firebaseDb) throw new Error("Firebase is unavailable.");
      await window.firebaseDb.ref("auditLog").push({
        action,
        path,
        recordId,
        actorUid: user.uid,
        actorRole: "quizAdmin",
        beforeUpdatedAt: "",
        afterUpdatedAt,
        clientAt: new Date().toISOString(),
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });
    } catch (error) {
      console.error("Quiz admin audit event could not be recorded:", error);
    }
  }

  return Object.freeze({
    isQuizAdmin,

    async saveQuiz(quiz) {
      requireQuizAdmin();
      const updatedAt = new Date().toISOString();
      await window.firebaseDb.ref("hangout/quiz").set({ ...quiz, updatedAt });
      await appendQuizAudit("hangout.quiz.update", "hangout/quiz", "", updatedAt);
    },

    // Adds (or subtracts) points and keeps a history line for the player's profile.
    async awardPoints(uid, delta, note) {
      requireQuizAdmin();
      await window.firebaseReady;
      const now = new Date().toISOString();
      const result = await window.firebaseDb.ref(`hangout/scores/${uid}`).transaction(
        current => ({ points: Number(current?.points || 0) + delta, updatedAt: now }),
      );
      if (!result.committed) throw new Error("Score could not be saved. Try again.");
      await appendQuizAudit("hangout.score.award", `hangout/scores/${uid}`, uid, now);
      const entry = { points: delta, at: now };
      if (note) entry.note = note;
      await window.firebaseDb.ref(`hangout/scoreLog/${uid}`).push(entry);
      return result.snapshot.val().points;
    },

    // Moderation is a soft delete (deleted:true), like the rest of the website.
    async hideMessage(messageId) {
      requireQuizAdmin();
      await window.firebaseDb.ref(`hangout/chat/${messageId}/deleted`).set(true);
      await appendQuizAudit("hangout.chat.hide", "hangout/chat", messageId);
    }
  });
})();
