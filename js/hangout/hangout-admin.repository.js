// HANGOUT — official/admin writes ONLY.
// Uses the website's existing official session and the audited helpers in
// js/firebase-data.js (same pattern as the other features). Hangout Google
// users can never run these; the database rules also block them.
window.HangoutAdminRepository = (() => {
  function requireOfficial() {
    if (typeof isSupervisorLoggedIn !== "function" || !isSupervisorLoggedIn()) {
      throw new Error("Officials access is required for Hangout admin actions.");
    }
  }

  return Object.freeze({
    isOfficial: () => typeof isSupervisorLoggedIn === "function" && isSupervisorLoggedIn(),

    saveQuiz(quiz) {
      requireOfficial();
      return auditedFirebaseUpdate({ "hangout/quiz": { ...quiz, updatedAt: new Date().toISOString() } }, { action: "hangout.quiz.update", path: "hangout/quiz" });
    },

    // Adds (or subtracts) points and keeps a history line for the player's profile.
    async awardPoints(uid, delta, note) {
      requireOfficial();
      const now = new Date().toISOString();
      const result = await firebaseAuditedTransaction(`hangout/scores/${uid}`,
        current => ({ points: Number(current?.points || 0) + delta, updatedAt: now }),
        { action: "hangout.score.award", path: `hangout/scores/${uid}`, recordId: uid, afterUpdatedAt: now });
      if (!result.committed) throw new Error("Score could not be saved. Try again.");
      const entry = { points: delta, at: now };
      if (note) entry.note = note;
      await firebasePush(`hangout/scoreLog/${uid}`, entry);
      return result.snapshot.val().points;
    },

    // Moderation is a soft delete (deleted:true), like the rest of the website.
    hideMessage(messageId) {
      requireOfficial();
      return auditedFirebaseUpdate({ [`hangout/chat/${messageId}/deleted`]: true }, { action: "hangout.chat.hide", path: "hangout/chat", recordId: messageId });
    }
  });
})();
