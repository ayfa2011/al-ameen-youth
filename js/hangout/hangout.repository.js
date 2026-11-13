// HANGOUT — database access for signed-in Google users ONLY.
// All Hangout paths live under "hangout/". Officials' admin writes are in
// hangout-admin.repository.js. No rendering and no Google-login code here.
window.HangoutRepository = (() => {
  const db = () => {
    const database = HangoutFirebase.db();
    if (!database) throw new Error(HangoutFirebase.unavailableMessage());
    return database;
  };
  const ref = path => db().ref(`hangout/${path}`);
  // Returns an unsubscribe function.
  const listen = (query, event, handler, onError) => {
    query.on(event, handler, error => {
      console.error(`Hangout listener failed (${event}):`, error);
      onError?.(error);
    });
    return () => query.off(event, handler);
  };

  return Object.freeze({
    newMessageKey: () => ref("chat").push().key,

    // ---- profile (own record only) ----
    async saveOwnProfile(profile) {
      const own = ref(`users/${profile.uid}`);
      const existing = await own.child("joinedAt").once("value");
      const data = { name: String(profile.name).slice(0, 80), photo: String(profile.photo || "").slice(0, 600) };
      if (!existing.exists()) data.joinedAt = HangoutFirebase.serverTimestamp();
      await own.update(data);
    },

    // ---- live data ----
    subscribeQuiz: cb => listen(ref("quiz"), "value", snap => cb(snap.val())),
    subscribeNextQuiz: cb => listen(ref("nextQuiz"), "value", snap => cb(snap.val())),
    subscribeUsers: cb => listen(ref("users"), "value", snap => cb(snap.val() || {})),
    subscribeScores: cb => listen(ref("scores"), "value", snap => cb(snap.val() || {})),
    subscribePublicResults: cb => listen(ref("publicResults"), "value", snap => cb(snap.val() || {})),
    subscribeScoreLog: (uid, cb) => listen(ref(`scoreLog/${uid}`).limitToLast(50), "value", snap => cb(snap.val() || {})),
    subscribeOwnQuizHistory: (uid, cb, onError) =>
      listen(ref(`playerQuizHistory/${uid}`), "value", snap => cb(snap.val() || {}), onError),
    async getRoomParticipants(roomId) {
      const answersSnap = await ref(`answers/${roomId}`).once("value");
      const answers = answersSnap.val() || {};
      const participants = new Set();
      Object.values(answers).forEach(questionAnswers => {
        Object.keys(questionAnswers || {}).forEach(uid => participants.add(uid));
      });
      return [...participants];
    },
    async readPlayerRoomHistory(uid, roomId) {
      const snap = await ref(`playerQuizHistory/${uid}/${roomId}`).once("value");
      return snap.val() || null;
    },
    subscribeOwnAnswer: (roomId, questionId, uid, cb) =>
      listen(ref(`answers/${roomId}/${questionId}/${uid}`), "value", snap => cb(snap.val())),
    async readTimedOutAnswerKey(roomId, questionId) {
      return (await ref(`answerKeys/${roomId}/${questionId}`).once("value")).val();
    },
    subscribeChat(limit, handlers) {
      const query = ref("chat").limitToLast(limit);
      const stops = [
        listen(query, "child_added", snap => handlers.added(snap.key, snap.val())),
        listen(query, "child_changed", snap => handlers.changed(snap.key, snap.val())),
        listen(query, "child_removed", snap => handlers.removed(snap.key))
      ];
      return () => stops.forEach(stop => stop());
    },

    // ---- chat writes ----
    sendText(key, { uid, name, text }) {
      return ref(`chat/${key}`).set({ uid, name, text, createdAt: HangoutFirebase.serverTimestamp() });
    },
    // Audio is stored apart from the chat list so the chat stays light.
    async sendVoice(key, { uid, name, audio, duration }) {
      await ref(`voice/${key}`).set(audio);
      await ref(`chat/${key}`).set({ uid, name, voice: true, voiceDur: duration, createdAt: HangoutFirebase.serverTimestamp() });
    },
    async readVoice(key) { return (await ref(`voice/${key}`).once("value")).val(); }
  });
})();
