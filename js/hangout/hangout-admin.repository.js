// HANGOUT — quiz admin writes for approved Google accounts.
window.HangoutAdminRepository = (() => {
  const QUIZ_ADMIN_EMAILS = ["kebir.limra@gmail.com", "ayfaramboor@gmail.com"];
  const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
  const MEDIA_TYPES = /^(image\/(jpeg|png|webp|gif)|audio\/(mpeg|mp4|ogg|wav|webm|aac|x-m4a))$/i;

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
      return snap.val() || {};
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

    async uploadQuestionMedia(roomId, questionId, file, expectedKind) {
      requireQuizAdmin();
      await window.firebaseReady;
      if (!file || file.size > MAX_MEDIA_BYTES || !MEDIA_TYPES.test(file.type)
        || (expectedKind && !file.type.startsWith(`${expectedKind}/`))) {
        throw new Error("Choose an image or audio file under 10 MB in a supported format.");
      }
      const app = HangoutAuth.isUsingMainSession() ? firebase.app() : HangoutFirebase.app();
      if (typeof firebase.storage !== "function" || !app) throw new Error("Firebase Storage is unavailable.");
      const kind = file.type.startsWith("image/") ? "image" : "audio";
      const storageRef = firebase.storage(app).ref(`quiz-media/${roomId}/${questionId}/${kind}-${Date.now()}`);
      await storageRef.put(file, { contentType: file.type, cacheControl: "public,max-age=3600" });
      return storageRef.getDownloadURL();
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
              questionId,
              questionNumber: question.questionNumber,
              questionText: question.text || "",
              questionPoints: Number(question.points) || 0,
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
      const roomSnap = await db.ref(`hangout/rooms/${roomId}`).once("value");
      const room = roomSnap.val();
      const question = room?.questions?.[questionId];
      if (!room || !question || question.deleted) throw new Error("The selected question no longer exists.");
      const timestamp = now();
      const options = Object.entries(question.options || {}).map(([id, text]) => ({ id, text }));
      const payload = {
        roomId, roomName: room.name || "", questionId, questionNumber: question.questionNumber,
        title: room.name || "", text: question.text || "", type: question.type || "mcq",
        options, points: Number(question.points) || 0, imageUrl: question.imageUrl || "",
        audioUrl: question.audioUrl || "", timeLimit: Number(question.timeLimit) || 60,
        startedAt: firebase.database.ServerValue.TIMESTAMP,
        remainingMs: null, answerRevealed: false, status: "live", updatedAt: timestamp
      };
      const updates = {
        [`hangout/answerKeys/${roomId}/${questionId}`]: { correctAnswer: question.correctAnswer || "", updatedAt: timestamp },
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
      if (quiz.status === "revealed" || quiz.status === "completed") return true;
      const timestamp = now();
      await db.ref("hangout/quiz").update({
        status: "revealed",
        remainingMs: 0,
        answerRevealed: true,
        correctAnswer: question.correctAnswer || "",
        explanation: question.explanation || "",
        updatedAt: timestamp
      });
      await appendQuizAudit("hangout.quiz.answer.reveal", "hangout/quiz", questionId, timestamp);
      return true;
    },

    async endQuiz(roomId) {
      requireQuizAdmin();
      const db = await database();
      const quiz = (await db.ref("hangout/quiz").once("value")).val();
      const timestamp = now();
      const updates = { [`hangout/rooms/${roomId}/status`]: "completed", [`hangout/rooms/${roomId}/updatedAt`]: timestamp };
      if (quiz?.roomId === roomId && quiz.questionId) {
        const question = (await db.ref(`hangout/rooms/${roomId}/questions/${quiz.questionId}`).once("value")).val();
        if (question) {
          updates["hangout/quiz"] = {
            ...quiz,
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
      await appendQuizAudit("hangout.quiz.end", "hangout/quiz", roomId, timestamp);
    },

    async evaluateAnswer(row, result) {
      requireQuizAdmin();
      if (!["correct", "wrong"].includes(result)) throw new Error("Choose Correct or Wrong.");
      const db = await database();
      const answerRef = db.ref(`hangout/answers/${row.roomId}/${row.questionId}/${row.uid}/evaluation`);
      const timestamp = now();
      const points = result === "correct" ? row.questionPoints : 0;
      let evaluation = (await answerRef.once("value")).val();
      if (!evaluation) {
        try {
          const transaction = await answerRef.transaction(current => current || {
            result,
            points,
            evaluatedAt: timestamp,
            evaluatorUid: window.firebaseAuth?.currentUser?.uid || "",
            pointsAwarded: points === 0
          });
          evaluation = transaction.snapshot.val();
        } catch (error) {
          evaluation = (await answerRef.once("value")).val();
          if (!evaluation) throw error;
        }
      }
      if (!evaluation) throw new Error("The answer evaluation could not be saved.");
      if (evaluation.result !== result) throw new Error("This answer was already evaluated with a different result.");

      if (evaluation.points > 0 && !evaluation.pointsAwarded) {
        await this.awardEvaluatedAnswer(row.uid, row.roomId, row.questionId, row.answerId, evaluation.points, row.questionNumber);
        await answerRef.child("pointsAwarded").set(true);
      }
      return evaluation;
    },

    async awardEvaluatedAnswer(uid, roomId, questionId, answerId, points, questionNumber) {
      requireQuizAdmin();
      const db = await database();
      const timestamp = now();
      await this.awardRoomQuestionPoints(uid, roomId, questionId, points, "manual");
      const result = await db.ref(`hangout/scores/${uid}`).transaction(current => {
        const score = current || { points: 0, autoAwards: {}, manualAwards: {} };
        if (score.manualAwards?.[answerId]) return;
        return {
          ...score,
          points: (Number(score.points) || 0) + points,
          updatedAt: timestamp,
          manualAwards: { ...(score.manualAwards || {}), [answerId]: true }
        };
      });
      if (!result.committed && !result.snapshot.child(`manualAwards/${answerId}`).exists()) {
        throw new Error("Score could not be saved. Try again.");
      }
      await db.ref(`hangout/scoreLog/${uid}/${answerId}`).set({
        points,
        at: timestamp,
        note: `Question #${questionNumber} evaluation`
      });
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
        return { ...value, autoPointsAwarded };
      }
      return { ...value, autoPointsAwarded: false };
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
