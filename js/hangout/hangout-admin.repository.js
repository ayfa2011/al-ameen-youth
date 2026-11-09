// HANGOUT — quiz admin writes for approved Google accounts.
window.HangoutAdminRepository = (() => {
  const QUIZ_ADMIN_EMAILS = ["kebir.limra@gmail.com", "ayfaramboor@gmail.com"];
  const MAX_MEDIA_BYTES = 200 * 1024;
  const MEDIA_TYPES = /^(image\/(jpeg|png|webp|gif)|audio\/(mpeg|mp4|ogg|wav|webm|aac|x-m4a))$/i;
  const historyBackfills = new Set();

  function isQuizAdmin() {
    const user = window.firebaseAuth?.currentUser;
    return typeof currentUserRole === "function"
      && currentUserRole() === "member"
      && QUIZ_ADMIN_EMAILS.includes(String(user?.email || "").toLowerCase());
  }

  function requireQuizAdmin() {
    if (!isQuizAdmin()) {
      throw new Error("Quiz admin access is available only to the approved account.");
    }
  }

  async function appendQuizAudit(action, path, recordId = "", afterUpdatedAt = "") {
    try {
      await window.firebaseReady;
      const db = HangoutFirebase.db();
      const user = HangoutAuth.isUsingMainSession()
        ? window.firebaseAuth?.currentUser
        : HangoutFirebase.auth()?.currentUser;
      if (!user || !db) throw new Error("Firebase is unavailable.");
      await db.ref("auditLog").push({
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

  const database = async () => {
    await window.firebaseReady;
    const db = HangoutFirebase.db();
    if (!db) throw new Error("Firebase is unavailable.");
    return db;
  };
  const roomRef = async roomId => (await database()).ref(`hangout/rooms/${roomId}`);
  const now = () => new Date().toISOString();

  return Object.freeze({
    isQuizAdmin,

    async listRooms() {
      requireQuizAdmin();
      const snap = await (await database()).ref("hangout/rooms").once("value");
      const rooms = snap.val() || {};
      const roomsNeedingBackfill = Object.keys(rooms)
        .filter(roomId => !historyBackfills.has(roomId));
      roomsNeedingBackfill.forEach(roomId => historyBackfills.add(roomId));
      if (roomsNeedingBackfill.length) {
        Promise.all(roomsNeedingBackfill.map(roomId => this.refreshPlayerQuizHistory(roomId)))
          .catch(error => {
            roomsNeedingBackfill.forEach(roomId => historyBackfills.delete(roomId));
            console.error("Existing quiz history could not be backfilled:", error);
            showToast("Existing quiz history could not be synced. Check database rules and retry.", "error");
          });
      }
      return rooms;
    },

    async createRoom(room) {
      requireQuizAdmin();
      const db = await database();
      const ref = db.ref("hangout/rooms").push();
      const timestamp = now();
      await ref.set({ ...room, questionCounter: 0, createdAt: timestamp, updatedAt: timestamp });
      await appendQuizAudit("hangout.quiz.room.create", `hangout/rooms/${ref.key}`, ref.key, timestamp);
      return ref.key;
    },

    async updateRoom(roomId, fields) {
      requireQuizAdmin();
      const timestamp = now();
      await (await roomRef(roomId)).update({ ...fields, updatedAt: timestamp });
      await appendQuizAudit("hangout.quiz.room.update", `hangout/rooms/${roomId}`, roomId, timestamp);
    },

    newQuestionId(roomId) {
      requireQuizAdmin();
      const db = HangoutFirebase.db();
      if (!db) throw new Error("Firebase is unavailable.");
      return db.ref(`hangout/rooms/${roomId}/questions`).push().key;
    },

    async encodeQuestionMedia(file, expectedKind) {
      requireQuizAdmin();
      await window.firebaseReady;
      if (!file || file.size > MAX_MEDIA_BYTES || !MEDIA_TYPES.test(file.type)
        || (expectedKind && !file.type.startsWith(`${expectedKind}/`))) {
        throw new Error("Choose a supported image or audio file no larger than 200 KB.");
      }
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.addEventListener("load", () => resolve(reader.result), { once: true });
        reader.addEventListener("error", () => reject(reader.error || new Error("The media file could not be read.")), { once: true });
        reader.readAsDataURL(file);
      });
      if (typeof dataUrl !== "string") throw new Error("The media file could not be encoded.");
      return dataUrl;
    },

    async addQuestion(roomId, questionId, question) {
      requireQuizAdmin();
      const ref = await roomRef(roomId);
      const counterRef = ref.child("questionCounter");
      const result = await counterRef.transaction(current => (Number(current) || 0) + 1);
      if (!result.committed) throw new Error("Question number could not be generated.");
      const questionNumber = result.snapshot.val();
      const timestamp = now();
      await ref.child(`questions/${questionId}`).set({ ...question, questionNumber, createdAt: timestamp, updatedAt: timestamp });
      await ref.update({ updatedAt: timestamp });
      await appendQuizAudit("hangout.quiz.question.create", `hangout/rooms/${roomId}/questions/${questionId}`, questionId, timestamp);
      return questionNumber;
    },

    async updateQuestion(roomId, questionId, question) {
      requireQuizAdmin();
      const db = await database();
      const active = (await db.ref("hangout/quiz").once("value")).val();
      if (active?.roomId === roomId && active?.questionId === questionId && ["live", "paused", "revealed"].includes(active.status)) {
        throw new Error("End or advance this live question before editing it.");
      }
      const timestamp = now();
      await db.ref(`hangout/rooms/${roomId}/questions/${questionId}`).update({ ...question, updatedAt: timestamp });
      await appendQuizAudit("hangout.quiz.question.update", `hangout/rooms/${roomId}/questions/${questionId}`, questionId, timestamp);
    },

    async deleteQuestion(roomId, questionId) {
      requireQuizAdmin();
      const db = await database();
      const active = (await db.ref("hangout/quiz").once("value")).val();
      if (active?.roomId === roomId && active?.questionId === questionId && ["live", "paused", "revealed"].includes(active.status)) {
        throw new Error("End or advance this live question before deleting it.");
      }
      const timestamp = now();
      await db.ref(`hangout/rooms/${roomId}/questions/${questionId}`).update({ deleted: true, updatedAt: timestamp });
      await appendQuizAudit("hangout.quiz.question.delete", `hangout/rooms/${roomId}/questions/${questionId}`, questionId, timestamp);
    },

    async listEvaluations() {
      requireQuizAdmin();
      const db = await database();
      const [roomsSnap, answersSnap] = await Promise.all([
        db.ref("hangout/rooms").once("value"),
        db.ref("hangout/answers").once("value")
      ]);
      const rooms = roomsSnap.val() || {};
      const answers = answersSnap.val() || {};
      const rows = [];
      Object.entries(answers).forEach(([roomId, questions]) => {
        Object.entries(questions || {}).forEach(([questionId, players]) => {
          const room = rooms[roomId];
          const question = room?.questions?.[questionId];
          if (!question) return;
          Object.entries(players || {}).forEach(([uid, answer]) => {
            rows.push({
              ...answer,
              uid,
              answerId: `${roomId}_${questionId}_${uid}`,
              roomId,
              roomName: room.name || "Quiz room",
              roomMonth: room.month || "",
              questionId,
              questionNumber: question.questionNumber,
              questionText: question.text || "",
              questionPoints: Number(answer.questionPoints) || Number(question.points) || 0,
              questionType: question.type || "mcq"
            });
          });
        });
      });
      return rows.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
    },

    async publishQuestion(roomId, questionId) {
      requireQuizAdmin();
      const db = await database();
      const activeQuiz = (await db.ref("hangout/quiz").once("value")).val();
      if (activeQuiz?.questionId && ["live", "paused"].includes(activeQuiz.status)
        && (activeQuiz.roomId !== roomId || activeQuiz.questionId !== questionId)) {
        await this.revealQuestion(activeQuiz.roomId, activeQuiz.questionId);
      }
      const roomSnap = await db.ref(`hangout/rooms/${roomId}`).once("value");
      const room = roomSnap.val();
      const question = room?.questions?.[questionId];
      if (!room || !question || question.deleted) throw new Error("The selected question no longer exists.");
      const timestamp = now();
      const options = Object.entries(question.options || {}).map(([id, text]) => ({ id, text }));
      const payload = {
        roomId, roomName: room.name || "", monthLabel: room.month || "", questionId, questionNumber: question.questionNumber,
        title: room.name || "", text: question.text || "", type: question.type || "mcq",
        options, points: Number(question.points) || 0, imageUrl: question.imageUrl || "",
        audioUrl: question.audioUrl || "", timeLimit: Number(question.timeLimit) || 60,
        publishedAt: question.publishedAt || timestamp,
        startedAt: firebase.database.ServerValue.TIMESTAMP,
        remainingMs: null, answerRevealed: false, status: "live", updatedAt: timestamp
      };
      const updates = {
        [`hangout/answerKeys/${roomId}/${questionId}`]: { correctAnswer: question.correctAnswer || "", updatedAt: timestamp },
        [`hangout/rooms/${roomId}/questions/${questionId}/publishedAt`]: question.publishedAt || timestamp,
        "hangout/quiz": payload,
        [`hangout/rooms/${roomId}/status`]: "live",
        [`hangout/rooms/${roomId}/updatedAt`]: timestamp
      };
      await db.ref().update(updates);
      await appendQuizAudit("hangout.quiz.question.publish", `hangout/rooms/${roomId}/questions/${questionId}`, questionId, timestamp);
    },

    async setRoomStatus(roomId, status) {
      requireQuizAdmin();
      const db = await database();
      const active = (await db.ref("hangout/quiz").once("value")).val();
      if (active?.roomId === roomId && ["live", "paused", "revealed"].includes(active.status) && status !== "completed") {
        throw new Error("Use Quiz Control to pause, resume or advance the active question.");
      }
      if (status === "completed") {
        if (active?.roomId === roomId) return this.endQuiz(roomId);
      }
      const timestamp = now();
      const updates = {
        [`hangout/rooms/${roomId}/status`]: status,
        [`hangout/rooms/${roomId}/updatedAt`]: timestamp
      };
      await db.ref().update(updates);
      if (status === "completed") await this.refreshPlayerQuizHistory(roomId);
      await appendQuizAudit("hangout.quiz.room.status", `hangout/rooms/${roomId}`, roomId, timestamp);
    },

    async getControlRoomData(roomId) {
      requireQuizAdmin();
      const db = await database();
      const [roomSnap, answersSnap] = await Promise.all([
        db.ref(`hangout/rooms/${roomId}`).once("value"),
        db.ref(`hangout/answers/${roomId}`).once("value")
      ]);
      const room = roomSnap.val();
      if (!room) throw new Error("The quiz room no longer exists.");
      const participants = new Set();
      Object.values(answersSnap.val() || {}).forEach(questionAnswers => {
        Object.keys(questionAnswers || {}).forEach(uid => participants.add(uid));
      });
      return { room, participants: participants.size };
    },

    async getCurrentQuiz() {
      requireQuizAdmin();
      return (await (await database()).ref("hangout/quiz").once("value")).val();
    },

    async getRoomScoreData(roomId) {
      requireQuizAdmin();
      const db = await database();
      const [roomSnap, scoresSnap, resultSnap, answersSnap, globalScoresSnap] = await Promise.all([
        db.ref(`hangout/rooms/${roomId}`).once("value"),
        db.ref(`hangout/roomScores/${roomId}`).once("value"),
        db.ref(`hangout/publicResults/${roomId}`).once("value"),
        db.ref(`hangout/answers/${roomId}`).once("value"),
        db.ref("hangout/scores").once("value")
      ]);
      const room = roomSnap.val();
      if (!room) throw new Error("The quiz room no longer exists.");
      const scores = scoresSnap.val() || {};
      const answers = answersSnap.val() || {};
      const globalScores = globalScoresSnap.val() || {};
      const missingAwards = {};
      Object.entries(answers).forEach(([questionId, players]) => {
        Object.entries(players || {}).forEach(([uid, answer]) => {
          const global = globalScores[uid] || {};
          const autoAward = global.autoAwards?.[`${roomId}_${questionId}`];
          const evaluation = answer?.evaluation;
          const award = autoAward
            ? { points: Number(autoAward.points) || 0, kind: "automatic", at: answer.submittedAt || now() }
            : evaluation?.pointsAwarded && Number(evaluation.points) > 0
              ? { points: Number(evaluation.points), kind: "manual", at: evaluation.evaluatedAt || now() }
              : null;
          if (!award || scores[uid]?.awards?.[questionId]) return;
          (missingAwards[uid] ||= {})[questionId] = award;
        });
      });
      await Promise.all(Object.entries(missingAwards).map(async ([uid, awards]) => {
          const ref = db.ref(`hangout/roomScores/${roomId}/${uid}`);
          const migrated = await ref.transaction(current => {
            const score = current || { points: 0, awards: {}, adjustments: {} };
            const additions = Object.fromEntries(Object.entries(awards).filter(([questionId]) => !score.awards?.[questionId]));
            if (!Object.keys(additions).length) return;
            return {
              ...score,
              points: (Number(score.points) || 0) + Object.values(additions).reduce((total, award) => total + award.points, 0),
              updatedAt: now(),
              awards: { ...(score.awards || {}), ...additions }
            };
          });
          const savedAwards = migrated.snapshot.child("awards");
          if (Object.keys(awards).some(questionId => !savedAwards.child(questionId).exists())) {
            throw new Error("Could not restore this player's saved room score.");
          }
      }));
      const finalScores = (await db.ref(`hangout/roomScores/${roomId}`).once("value")).val() || {};
      return { room, scores: finalScores, publicResult: resultSnap.val() || null };
    },

    subscribeRoomScores(roomId, callback, onError) {
      requireQuizAdmin();
      const db = HangoutFirebase.db();
      if (!db) throw new Error("Firebase is unavailable.");
      const ref = db.ref(`hangout/roomScores/${roomId}`);
      const listener = snapshot => callback(snapshot.val() || {});
      ref.on("value", listener, onError);
      return () => ref.off("value", listener);
    },

    async adjustRoomScore(roomId, uid, delta, reason) {
      requireQuizAdmin();
      if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) {
        throw new Error("Enter a non-zero whole number of points.");
      }
      const note = String(reason || "").trim();
      if (!note || note.length > 200) throw new Error("Enter a reason of up to 200 characters.");
      const db = await database();
      const ref = db.ref(`hangout/roomScores/${roomId}/${uid}`);
      const historyId = db.ref(`hangout/roomScores/${roomId}/${uid}/adjustments`).push().key;
      const user = HangoutAuth.isUsingMainSession()
        ? window.firebaseAuth?.currentUser
        : HangoutFirebase.auth()?.currentUser;
      const editor = String(user?.displayName || user?.email || "Quiz admin").slice(0, 120);
      const editedAt = now();
      const result = await ref.transaction(current => {
        const score = current || { points: 0, awards: {}, adjustments: {} };
        if (score.adjustments?.[historyId]) return;
        const previousScore = Number(score.points) || 0;
        const newTotal = previousScore + delta;
        if (newTotal < 0) return;
        return {
          ...score,
          points: newTotal,
          updatedAt: editedAt,
          adjustments: {
            ...(score.adjustments || {}),
            [historyId]: {
              previousScore,
              adjustedPoints: delta,
              newTotal,
              reason: note,
              editedBy: editor,
              editedAt
            }
          }
        };
      });
      if (!result.committed && !result.snapshot.child(`adjustments/${historyId}`).exists()) {
        if (Number(result.snapshot.child("points").val() || 0) + delta < 0) {
          throw new Error("The adjustment cannot make a player's score negative.");
        }
        throw new Error("Score adjustment could not be saved. Try again.");
      }
      await appendQuizAudit("hangout.score.adjust", `hangout/roomScores/${roomId}/${uid}`, historyId, editedAt);
      await this.refreshPlayerQuizHistory(roomId);
      const published = (await db.ref(`hangout/publicResults/${roomId}/published`).once("value")).val();
      if (published) await this.setRoomResultsPublished(roomId, true);
      return result.snapshot.val();
    },

    async setRoomResultsPublished(roomId, published) {
      requireQuizAdmin();
      const db = await database();
      const [roomSnap, scoresSnap, usersSnap] = await Promise.all([
        db.ref(`hangout/rooms/${roomId}`).once("value"),
        db.ref(`hangout/roomScores/${roomId}`).once("value"),
        db.ref("hangout/users").once("value")
      ]);
      const room = roomSnap.val();
      if (!room) throw new Error("The quiz room no longer exists.");
      if (published && room.status !== "completed") {
        throw new Error("End the quiz before publishing its final results.");
      }
      const publicResult = published ? (() => {
        const scores = scoresSnap.val() || {};
        const users = usersSnap.val() || {};
        const rows = Object.entries(scores).map(([uid, score]) => ({
          uid,
          name: String(users[uid]?.name || "Player").slice(0, 80),
          points: Number(score?.points) || 0
        })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
        rows.forEach((row, index) => {
          row.rank = index > 0 && row.points === rows[index - 1].points ? rows[index - 1].rank : index + 1;
        });
        return {
          roomId,
          roomName: String(room.name || "Quiz Room").slice(0, 120),
          published: true,
          updatedAt: now(),
          rows: Object.fromEntries(rows.map(row => [row.uid, row]))
        };
      })() : {
        roomId,
        roomName: String(room.name || "Quiz Room").slice(0, 120),
        published: false,
        updatedAt: now()
      };
      await db.ref(`hangout/publicResults/${roomId}`).set(publicResult);
      await appendQuizAudit(
        published ? "hangout.results.publish" : "hangout.results.unpublish",
        `hangout/publicResults/${roomId}`,
        roomId,
        publicResult.updatedAt
      );
      return publicResult;
    },

    async pauseQuiz(roomId) {
      requireQuizAdmin();
      const db = await database();
      const ref = db.ref("hangout/quiz");
      const quiz = (await ref.once("value")).val();
      if (!quiz || quiz.roomId !== roomId || quiz.status !== "live") throw new Error("This room does not have a live question to pause.");
      const startedAt = Number(quiz.startedAt);
      const duration = quiz.remainingMs == null ? Number(quiz.timeLimit) * 1000 : Number(quiz.remainingMs);
      const remainingMs = Math.max(0, startedAt + duration - await HangoutFirebase.serverNow());
      if (remainingMs === 0) return this.revealQuestion(roomId, quiz.questionId);
      await ref.update({ status: "paused", remainingMs, updatedAt: now() });
      await appendQuizAudit("hangout.quiz.pause", "hangout/quiz", quiz.questionId);
    },

    async resumeQuiz(roomId) {
      requireQuizAdmin();
      const db = await database();
      const ref = db.ref("hangout/quiz");
      const quiz = (await ref.once("value")).val();
      if (!quiz || quiz.roomId !== roomId || quiz.status !== "paused") throw new Error("This room does not have a paused question.");
      if (Number(quiz.remainingMs) <= 0) return this.revealQuestion(roomId, quiz.questionId);
      await ref.update({ status: "live", startedAt: firebase.database.ServerValue.TIMESTAMP, updatedAt: now() });
      await appendQuizAudit("hangout.quiz.resume", "hangout/quiz", quiz.questionId);
    },

    async revealQuestion(roomId, questionId) {
      requireQuizAdmin();
      const db = await database();
      const [quizSnap, questionSnap] = await Promise.all([
        db.ref("hangout/quiz").once("value"),
        db.ref(`hangout/rooms/${roomId}/questions/${questionId}`).once("value")
      ]);
      const quiz = quizSnap.val();
      const question = questionSnap.val();
      if (!quiz || quiz.roomId !== roomId || quiz.questionId !== questionId || !question) return false;
      if (question.type !== "short") {
        const [answersSnap, answerKeySnap] = await Promise.all([
          db.ref(`hangout/answers/${roomId}/${questionId}`).once("value"),
          db.ref(`hangout/answerKeys/${roomId}/${questionId}`).once("value")
        ]);
        const correctAnswer = answerKeySnap.child("correctAnswer").val();
        const answers = answersSnap.val() || {};
        const awardId = `${roomId}_${questionId}`;
        for (const [uid, answer] of Object.entries(answers)) {
          if (answer?.answer !== correctAnswer) continue;
          const points = Number(answer.questionPoints) || 0;
          const scoreRef = db.ref(`hangout/scores/${uid}`);
          const result = await scoreRef.transaction(current => {
            const score = current || { points: 0, autoAwards: {}, manualAwards: {} };
            if (score.autoAwards?.[awardId]) return;
            return {
              ...score,
              points: (Number(score.points) || 0) + points,
              updatedAt: now(),
              autoAwards: {
                ...(score.autoAwards || {}),
                [awardId]: { roomId, questionId, points }
              },
              lastAward: { roomId, questionId, points }
            };
          });
          const savedAward = result.snapshot.child(`autoAwards/${awardId}`);
          if (!savedAward.exists()) throw new Error(`Could not award the correct answer for player ${uid}.`);
          const awardedPoints = Number(savedAward.child("points").val()) || 0;
          await this.awardRoomQuestionPoints(uid, roomId, questionId, awardedPoints);
          await db.ref(`hangout/scoreLog/${uid}/${awardId}`).set({
            points: awardedPoints,
            at: answer.submittedAt || now(),
            note: `Question #${question.questionNumber} correct answer`
          });
        }
      }
      if (quiz.status === "revealed" || quiz.status === "completed") {
        await this.refreshPlayerQuizHistory(roomId);
        return true;
      }
      const timestamp = now();
      await db.ref("hangout/quiz").update({
        status: "revealed",
        remainingMs: 0,
        answerRevealed: true,
        correctAnswer: question.correctAnswer || "",
        explanation: question.explanation || "",
        updatedAt: timestamp
      });
      await this.refreshPlayerQuizHistory(roomId);
      await appendQuizAudit("hangout.quiz.answer.reveal", "hangout/quiz", questionId, timestamp);
      return true;
    },

    async refreshPlayerQuizHistory(roomId) {
      requireQuizAdmin();
      const db = await database();
      const [roomSnap, answersSnap, roomScoresSnap, quizSnap] = await Promise.all([
        db.ref(`hangout/rooms/${roomId}`).once("value"),
        db.ref(`hangout/answers/${roomId}`).once("value"),
        db.ref(`hangout/roomScores/${roomId}`).once("value"),
        db.ref("hangout/quiz").once("value")
      ]);
      const room = roomSnap.val();
      if (!room) throw new Error("The quiz room no longer exists.");
      const answers = answersSnap.val() || {};
      const scores = roomScoresSnap.val() || {};
      const activeQuiz = quizSnap.val() || {};
      const questions = Object.entries(room.questions || {})
        .filter(([questionId, question]) => question && !question.deleted && (question.publishedAt || answers[questionId]))
        .sort((a, b) => Number(a[1].questionNumber) - Number(b[1].questionNumber));
      const participantIds = new Set(
        Object.values(answers).flatMap(players => Object.keys(players || {}))
      );
      if (!participantIds.size) return;

      const rows = [...participantIds].map(uid => {
        const score = scores[uid] || {};
        const earned = questions.map(([questionId, question]) => {
          const answer = answers[questionId]?.[uid] || null;
          const awaitingReveal = activeQuiz.roomId === roomId && activeQuiz.questionId === questionId
            && ["live", "paused"].includes(activeQuiz.status);
          if (!answer && awaitingReveal) return null;
          const evaluation = answer?.evaluation || null;
          const correctAnswer = awaitingReveal ? "" : String(question.correctAnswer || "");
          const status = !answer
            ? "unanswered"
            : awaitingReveal
              ? "awaitingResult"
            : question.type === "short"
              ? evaluation?.result || "pending"
              : answer.answer === correctAnswer ? "correct" : "wrong";
          return {
            questionId,
            roomName: String(room.name || "Quiz room"),
            roomMonth: String(room.month || ""),
            questionNumber: Number(question.questionNumber) || 0,
            questionText: String(question.text || "").slice(0, 4000),
            type: question.type || "mcq",
            questionPoints: Number(answer?.questionPoints) || Number(question.points) || 0,
            options: question.options || {},
            answer: String(answer?.answer || ""),
            submittedAt: String(answer?.submittedAt || ""),
            status,
            correctAnswer,
            awardedPoints: Number(score.awards?.[questionId]?.points) || 0,
            evaluation: evaluation ? {
              result: evaluation.result,
              points: Number(evaluation.points) || 0,
              evaluatedAt: evaluation.evaluatedAt || "",
              evaluatorUid: evaluation.evaluatorUid || ""
            } : null,
            evaluationHistory: evaluation?.history || {}
          };
        }).filter(Boolean);
        const pending = earned.filter(item => item.status === "pending").length;
        const completed = room.status === "completed";
        const totalScore = Number(score.points) || 0;
        return {
          uid,
          score,
          earned,
          pending,
          summary: {
            roomName: String(room.name || "Quiz room"),
            month: String(room.month || ""),
            status: completed ? (pending ? "evaluationPending" : "completed") : "inProgress",
            isFinal: completed && pending === 0,
            totalQuestions: questions.length,
            totalScore,
            maxScore: questions.reduce((total, [, question]) => total + (Number(question.points) || 0), 0),
            correct: earned.filter(item => item.status === "correct").length,
            wrong: earned.filter(item => item.status === "wrong").length,
            unanswered: earned.filter(item => item.status === "unanswered").length,
            pending,
            rank: 0,
            updatedAt: now()
          }
        };
      });
      rows.sort((a, b) => b.summary.totalScore - a.summary.totalScore || a.uid.localeCompare(b.uid));
      rows.forEach((row, index) => {
        row.summary.rank = index > 0 && row.summary.totalScore === rows[index - 1].summary.totalScore
          ? rows[index - 1].summary.rank
          : index + 1;
      });
      const updates = {};
      rows.forEach(row => {
        const base = `hangout/playerQuizHistory/${row.uid}/${roomId}`;
        row.earned.forEach(item => {
          updates[`${base}/questions/${item.questionId}`] = item;
        });
        updates[`${base}/summary`] = row.summary;
      });
      await db.ref().update(updates);
    },

    async endQuiz(roomId) {
      requireQuizAdmin();
      const db = await database();
      const quiz = (await db.ref("hangout/quiz").once("value")).val();
      const timestamp = now();
      const updates = { [`hangout/rooms/${roomId}/status`]: "completed", [`hangout/rooms/${roomId}/updatedAt`]: timestamp };
      if (quiz?.roomId === roomId && quiz.questionId) {
        await this.revealQuestion(roomId, quiz.questionId);
        const latestQuiz = (await db.ref("hangout/quiz").once("value")).val() || quiz;
        const question = (await db.ref(`hangout/rooms/${roomId}/questions/${quiz.questionId}`).once("value")).val();
        if (question) {
          updates["hangout/quiz"] = {
            ...latestQuiz,
            status: "completed",
            remainingMs: 0,
            answerRevealed: true,
            correctAnswer: question.correctAnswer || "",
            explanation: question.explanation || "",
            updatedAt: timestamp
          };
        }
      }
      await db.ref().update(updates);
      await this.refreshPlayerQuizHistory(roomId);
      await appendQuizAudit("hangout.quiz.end", "hangout/quiz", roomId, timestamp);
    },

    async evaluateAnswer(row, result) {
      requireQuizAdmin();
      if (!["correct", "wrong"].includes(result)) throw new Error("Choose Correct or Wrong.");
      const db = await database();
      const answerRef = db.ref(`hangout/answers/${row.roomId}/${row.questionId}/${row.uid}/evaluation`);
      const timestamp = now();
      const points = result === "correct" ? row.questionPoints : 0;
      const historyId = db.ref(`hangout/answers/${row.roomId}/${row.questionId}/${row.uid}/evaluation/history`).push().key;
      const evaluatorUid = window.firebaseAuth?.currentUser?.uid || HangoutFirebase.auth()?.currentUser?.uid || "";
      let previousEvaluation = null;
      const transaction = await answerRef.transaction(current => {
        previousEvaluation = current;
        const next = {
          ...(current || {}),
          result,
          points,
          evaluatedAt: timestamp,
          evaluatorUid,
          pointsAwarded: false
        };
        if (current?.result) {
          next.history = {
            ...(current.history || {}),
            [historyId]: {
              result: current.result,
              points: Number(current.points) || 0,
              evaluatedAt: current.evaluatedAt || "",
              evaluatorUid: current.evaluatorUid || "",
              pointsAwarded: current.pointsAwarded === true
            }
          };
        }
        return next;
      });
      if (!transaction.committed) throw new Error("The answer evaluation could not be saved.");
      const evaluation = transaction.snapshot.val();
      if (!evaluation) throw new Error("The answer evaluation could not be saved.");
      await this.applyEvaluatedAnswerScore(
        row.uid,
        row.roomId,
        row.questionId,
        row.answerId,
        Number(evaluation.points) || 0,
        row.questionNumber,
        previousEvaluation?.pointsAwarded === true ? Number(previousEvaluation.points) || 0 : 0,
        !previousEvaluation?.result
      );
      await answerRef.child("pointsAwarded").set(true);
      return { ...evaluation, pointsAwarded: true };
    },

    async applyEvaluatedAnswerScore(uid, roomId, questionId, answerId, points, questionNumber, legacyPoints, isInitialEvaluation) {
      requireQuizAdmin();
      const db = await database();
      const timestamp = now();
      let scoreDelta = 0;
      const globalResult = await db.ref(`hangout/scores/${uid}`).transaction(current => {
        const score = current || { points: 0, autoAwards: {}, manualAwards: {} };
        const previous = typeof score.manualAwards?.[answerId] === "number"
          ? score.manualAwards[answerId]
          : score.manualAwards?.[answerId] === true ? legacyPoints : 0;
        scoreDelta = points - previous;
        if (Number(score.points || 0) + scoreDelta < 0) return;
        return {
          ...score,
          points: (Number(score.points) || 0) + scoreDelta,
          updatedAt: timestamp,
          manualAwards: { ...(score.manualAwards || {}), [answerId]: points }
        };
      });
      const savedManualPoints = globalResult.snapshot.child(`manualAwards/${answerId}`).val();
      if (globalResult.snapshot.child("points").val() < 0) {
        throw new Error("The score cannot be reduced below zero.");
      }
      if (savedManualPoints !== points) throw new Error("Score could not be reconciled. Try again.");

      const roomRef = db.ref(`hangout/roomScores/${roomId}/${uid}`);
      const roomResult = await roomRef.transaction(current => {
        const score = current || { points: 0, awards: {}, adjustments: {} };
        const existingAward = score.awards?.[questionId];
        if (existingAward && existingAward.kind !== "manual") return;
        const previous = Number(existingAward?.points) || 0;
        const delta = points - previous;
        if ((Number(score.points) || 0) + delta < 0) return;
        if (delta === 0 && existingAward?.kind === "manual") return;
        return {
          ...score,
          points: (Number(score.points) || 0) + delta,
          updatedAt: timestamp,
          awards: {
            ...(score.awards || {}),
            [questionId]: { points, kind: "manual", at: timestamp }
          },
          lastAward: { questionId, points }
        };
      });
      const savedRoomAward = roomResult.snapshot.child(`awards/${questionId}`).val();
      if (Number(savedRoomAward?.points) !== points || savedRoomAward?.kind !== "manual") {
        throw new Error("Room scoreboard could not be reconciled. Retry the evaluation.");
      }

      if (isInitialEvaluation) {
        await db.ref(`hangout/scoreLog/${uid}/${answerId}`).set({
          points,
          at: timestamp,
          note: `Question #${questionNumber} evaluation`
        });
      } else if (scoreDelta !== 0) {
        await db.ref(`hangout/scoreLog/${uid}`).push({
          points: scoreDelta,
          at: timestamp,
          note: `Question #${questionNumber} re-evaluation`
        });
      }
      const published = (await db.ref(`hangout/publicResults/${roomId}/published`).once("value")).val();
      if (published) await this.setRoomResultsPublished(roomId, true);
      await this.refreshPlayerQuizHistory(roomId);
    },

    async awardRoomQuestionPoints(uid, roomId, questionId, points, kind = "automatic") {
      const db = await database();
      const timestamp = now();
      const ref = db.ref(`hangout/roomScores/${roomId}/${uid}`);
      const result = await ref.transaction(current => {
        const score = current || { points: 0, awards: {}, adjustments: {} };
        if (score.awards?.[questionId]) return;
        const amount = Number(points) || 0;
        return {
          ...score,
          points: (Number(score.points) || 0) + amount,
          updatedAt: timestamp,
          awards: {
            ...(score.awards || {}),
            [questionId]: { points: amount, kind, at: timestamp }
          },
          lastAward: { questionId, points: amount }
        };
      });
      if (!result.committed && !result.snapshot.child(`awards/${questionId}`).exists()) {
        throw new Error("Room score could not be updated.");
      }
      if (kind === "manual" && isQuizAdmin()) {
        const published = (await db.ref(`hangout/publicResults/${roomId}/published`).once("value")).val();
        if (published) await this.setRoomResultsPublished(roomId, true);
      }
      return result.snapshot.val();
    },

    async submitAnswer(quiz, user, answer) {
      const db = await database();
      const answerRef = db.ref(`hangout/answers/${quiz.roomId}/${quiz.questionId}/${user.uid}`);
      const value = {
        uid: user.uid,
        playerName: String(user.name || "Player").slice(0, 80),
        answer: String(answer).slice(0, 1000),
        questionPoints: Number(quiz.points) || 0,
        submittedAt: now()
      };
      try {
        await answerRef.set(value);
      } catch (error) {
        const existing = (await answerRef.once("value")).val();
        if (existing?.answer !== value.answer) throw error;
      }

      let historySaved = false;
      try {
        const historyRef = db.ref(`hangout/playerQuizHistory/${user.uid}/${quiz.roomId}/questions/${quiz.questionId}`);
        const options = Object.fromEntries((quiz.options || []).map(option => [option.id, option.text]));
        const historyResult = await historyRef.transaction(current => {
          if (current) return;
          return {
            roomName: String(quiz.roomName || "Quiz room").slice(0, 120),
            roomMonth: String(quiz.monthLabel || "").slice(0, 40),
            questionNumber: Number(quiz.questionNumber) || 0,
            questionText: String(quiz.text || "").slice(0, 4000),
            type: quiz.type || "mcq",
            questionPoints: Number(quiz.points) || 0,
            options,
            answer: value.answer,
            submittedAt: value.submittedAt,
            status: quiz.type === "short" ? "pending" : "awaitingResult"
          };
        });
        historySaved = historyResult.snapshot.exists();
      } catch (error) {
        console.error("Player quiz history could not be recorded at submission:", error);
      }

      if (quiz.type !== "short") {
        const awardId = `${quiz.roomId}_${quiz.questionId}`;
        const scoreRef = db.ref(`hangout/scores/${user.uid}`);
        const timestamp = now();
        let autoPointsAwarded = false;
        let result;
        try {
          result = await scoreRef.transaction(current => {
            const score = current || { points: 0, autoAwards: {}, manualAwards: {} };
            if (score.autoAwards?.[awardId]) return;
            return {
              ...score,
              points: (Number(score.points) || 0) + Number(quiz.points || 0),
              updatedAt: timestamp,
              autoAwards: {
                ...(score.autoAwards || {}),
                [awardId]: {
                  roomId: quiz.roomId,
                  questionId: quiz.questionId,
                  points: Number(quiz.points || 0)
                }
              },
              lastAward: {
                roomId: quiz.roomId,
                questionId: quiz.questionId,
                points: Number(quiz.points || 0)
              }
            };
          });
        } catch (error) {
          if (error?.code === "PERMISSION_DENIED") return { ...value, autoPointsAwarded: false };
          throw new Error("Your answer was saved, but the score could not be updated.");
        }
        if (result.committed) {
          autoPointsAwarded = true;
        } else if (result.snapshot.child(`autoAwards/${awardId}`).exists()) {
          autoPointsAwarded = true;
        } else {
          throw new Error("Your answer was saved, but the score could not be updated.");
        }
        if (autoPointsAwarded) {
          await this.awardRoomQuestionPoints(user.uid, quiz.roomId, quiz.questionId, Number(quiz.points || 0));
          await db.ref(`hangout/scoreLog/${user.uid}/${awardId}`).set({
            points: Number(quiz.points || 0),
            at: timestamp,
            note: `Question #${quiz.questionNumber} correct answer`
          });
        }
        return { ...value, autoPointsAwarded, historySaved };
      }
      return { ...value, autoPointsAwarded: false, historySaved };
    },

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
        current => ({ ...(current || {}), points: Number(current?.points || 0) + delta, updatedAt: now }),
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
