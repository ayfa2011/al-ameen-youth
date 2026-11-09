// HANGOUT — business logic ONLY (ranking, validation, formatting).
// No DOM, no Firebase, no Google code. Pure functions that are easy to test.
window.HangoutService = (() => {
  const MAX_TEXT = 500;
  const MAX_VOICE_SECONDS = 45;
  const MAX_VOICE_CHARS = 380000; // must stay below the 400000 limit in the database rules
  const EMOJIS = "😀 😁 😂 🤣 😊 😍 😘 😎 🤔 😢 😭 😡 👍 👎 👏 🙏 💪 🔥 ✨ 🎉 ❤️ 💙 💯 ✅ ❌ ⭐ 🏆 🥇 🥈 🥉 📚 💡 🤝 👋 😅 🙌 😴 🤩 😇 🥳 😬 🤗 😋 🤭 😜 🫶 🕌 🌙".split(" ");

  const monthLabel = (date = new Date()) => new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);

  // Competition ranking: equal points share a rank (1, 2, 2, 4).
  function buildLeaderboard(users, scores) {
    const rows = Object.entries(users || {}).map(([uid, user]) => ({
      uid, name: user?.name || "Player", photo: user?.photo || "", points: Number(scores?.[uid]?.points || 0)
    }));
    rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    rows.forEach((row, index) => { row.rank = index > 0 && row.points === rows[index - 1].points ? rows[index - 1].rank : index + 1; });
    return rows;
  }

  const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };
  const medalFor = rank => MEDALS[rank] || "";
  const rankLabel = rank => `#${String(rank).padStart(2, "0")}`;
  const initialOf = name => (String(name || "?").trim()[0] || "?").toUpperCase();

  function cleanQuiz(raw) {
    const quiz = raw || {};
    return {
      monthLabel: String(quiz.monthLabel || "").trim(),
      title: String(quiz.title || "").trim(),
      text: String(quiz.text || "").trim(),
      imageUrl: safeImage(quiz.imageUrl)
    };
  }
  // Only https links or embedded data:image pictures are shown.
  function safeImage(url) {
    const value = String(url || "").trim();
    return /^https:\/\//i.test(value) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value) ? value : "";
  }

  const formatDuration = seconds => { const s = Math.max(0, Math.round(seconds || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const formatTime = ts => ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const formatDate = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }); };

  return Object.freeze({
    MAX_TEXT, MAX_VOICE_SECONDS, MAX_VOICE_CHARS, EMOJIS,
    monthLabel, buildLeaderboard, medalFor, rankLabel, initialOf, cleanQuiz, safeImage, formatDuration, formatTime, formatDate
  });
})();
