// ONLINE QUIZ — bulk question text parser (pure logic: no DOM, no Firebase).
//
// Turns pasted text into question objects in exactly the shape that
// HangoutAdminRepository.addQuestion() stores. The text is normally produced by
// Claude in this format (one block per question, blocks start with "Q:"):
//
//   Q: Who won the first Jnanpith award for Kannada?
//   A) Kuvempu
//   B) D.R. Bendre
//   C) Masti Venkatesha Iyengar
//   D) V.K. Gokak
//   ANSWER: A
//   EXPLAIN: Kuvempu received it in 1967 for Sri Ramayana Darshanam.
//   POINTS: 5      (optional)
//   TIME: 30       (optional, seconds; "1m" also works)
//   TYPE: MCQ      (optional: MCQ, TF or SHORT; guessed when left out)
//   ---
//
// Short answer: no options, "ANSWER:" holds the correct text.
// True / False: "TYPE: TF" and "ANSWER: TRUE" or "ANSWER: FALSE".
//
// The parser is deliberately forgiving about labels (A. / A) / (A) / ಎ) / 1.) and
// bullets, but it never guesses an answer: a question without a recognisable
// correct answer is reported as a problem instead of being saved.
window.HangoutQuizImport = (() => {
  const LIMITS = { text: 4000, option: 300, explanation: 2000, answer: 1000, points: 10000, time: 3600 };
  const KANNADA_LABELS = ["ಎ", "ಬಿ", "ಸಿ", "ಡಿ", "ಇ", "ಎಫ್", "ಜಿ", "ಎಚ್"];
  const LETTERS = "ABCDEFGH";

  const KEY_RE = /^(Q(?:UESTION)?\s*\d*|ಪ್ರಶ್ನೆ\s*\d*|ANSWER|ANS|ಉತ್ತರ|EXPLAIN|EXPLANATION|NOTES?|ವಿವರಣೆ|POINTS?|MARKS?|ಅಂಕಗಳು|ಅಂಕ|TIME(?:\s*LIMIT)?|SECONDS?|TYPE)\s*[:：]\s*(.*)$/i;
  // "Q1." / "Q 3)" style starters (no colon) are only accepted for Q with a number.
  const NUMBERED_Q_RE = /^Q\s*\d+\s*[.)]\s*(.*)$/i;
  const SEPARATOR_RE = /^\s*(?:-{3,}|={3,}|_{3,}|\*{3,})\s*$/;

  function fieldOf(rawKey) {
    const key = rawKey.replace(/\s+/g, "").toUpperCase();
    if (/^(Q|QUESTION|ಪ್ರಶ್ನೆ)\d*$/.test(key)) return "question";
    if (["ANSWER", "ANS", "ಉತ್ತರ"].includes(key)) return "answer";
    if (["EXPLAIN", "EXPLANATION", "NOTE", "NOTES", "ವಿವರಣೆ"].includes(key)) return "explain";
    if (["POINT", "POINTS", "MARK", "MARKS", "ಅಂಕ", "ಅಂಕಗಳು"].includes(key)) return "points";
    if (["TIME", "TIMELIMIT", "SECOND", "SECONDS"].includes(key)) return "time";
    if (key === "TYPE") return "type";
    return "";
  }

  // Remove markdown noise and list bullets that websites / chat apps add.
  function cleanLine(line) {
    return String(line)
      .replace(/\u00a0/g, " ")
      .replace(/\*\*|__/g, "")
      .replace(/^\s*[*•▪●◦–—-]\s+(?=\S)/, "")
      .replace(/\s+$/, "");
  }

  // Matches an option line and returns { index, text } or null. Accepts
  // "A)", "A.", "A:", "(A)", "a)", "1)", "ಎ)", "(ಎ)", "ಬಿ." ...
  function matchOption(line) {
    const text = line.trim();
    const latin = text.match(/^\(\s*([A-Ha-h1-8])\s*\)\s*(.*)$/) || text.match(/^([A-Ha-h1-8])\s*[).:]\s*(.*)$/);
    if (latin) {
      const label = latin[1].toUpperCase();
      return { index: /\d/.test(label) ? Number(label) - 1 : LETTERS.indexOf(label), text: latin[2].trim() };
    }
    const kannada = text.match(/^\(?\s*(ಎಫ್|ಎಚ್|ಎ|ಬಿ|ಸಿ|ಡಿ|ಇ|ಜಿ)\s*[).:]\s*(.*)$/);
    if (kannada) return { index: KANNADA_LABELS.indexOf(kannada[1]), text: kannada[2].trim() };
    return null;
  }

  // Split the pasted text into one block per question.
  function splitBlocks(text) {
    const blocks = [];
    const ignored = [];
    let current = null;
    const flush = () => { if (current) { blocks.push(current); current = null; } };
    String(text || "").replace(/\r\n?/g, "\n").split("\n").forEach(original => {
      if (SEPARATOR_RE.test(original)) { flush(); return; }
      const line = cleanLine(original);
      const key = line.trim().match(KEY_RE);
      const numbered = !key && line.trim().match(NUMBERED_Q_RE);
      if ((key && fieldOf(key[1]) === "question") || numbered) {
        flush();
        current = { raw: [original], lines: [{ field: "question", value: (key ? key[2] : numbered[1]).trim() }] };
        return;
      }
      if (!current) { if (line.trim()) ignored.push(line.trim()); return; }
      current.raw.push(original);
      if (key && fieldOf(key[1])) { current.lines.push({ field: fieldOf(key[1]), value: key[2].trim() }); return; }
      current.lines.push({ field: "", value: line });
    });
    flush();
    return { blocks, ignored };
  }

  function parseTime(value) {
    const match = String(value).trim().match(/^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes)?\.?$/i);
    if (!match) return NaN;
    const amount = Number(match[1]);
    return /^m/i.test(match[2] || "") ? amount * 60 : amount;
  }

  const normalizeText = value => String(value || "").toLowerCase().replace(/[\s.,;:!?'"“”‘’()\-–—]+/g, " ").trim();

  function resolveType(raw, optionCount) {
    const value = String(raw || "").toLowerCase().replace(/[\s_\-/]+/g, "");
    if (!value) return optionCount >= 2 ? "mcq" : "short";
    if (["mcq", "mc", "multiplechoice", "choice", "options"].includes(value)) return "mcq";
    if (["tf", "truefalse", "trueorfalse", "boolean", "ಸರಿತಪ್ಪು"].includes(value)) return "trueFalse";
    if (["short", "shortanswer", "sa", "text", "written", "descriptive"].includes(value)) return "short";
    return "";
  }

  function parseBoolean(value) {
    const normalized = String(value || "").trim().toLowerCase().replace(/[.)\s]+$/g, "");
    if (["true", "t", "yes", "y", "ಸರಿ", "ಹೌದು"].includes(normalized)) return true;
    if (["false", "f", "no", "n", "ತಪ್ಪು", "ಅಲ್ಲ", "ಇಲ್ಲ"].includes(normalized)) return false;
    return null;
  }

  function resolveChoice(answer, options) {
    const text = String(answer || "").trim();
    if (!text) return -1;
    const leading = matchOption(text) || (/^[A-Ha-h1-8]$/.test(text) ? { index: /\d/.test(text) ? Number(text) - 1 : LETTERS.indexOf(text.toUpperCase()), text: "" } : null)
      || (KANNADA_LABELS.includes(text) ? { index: KANNADA_LABELS.indexOf(text), text: "" } : null);
    if (leading && leading.index >= 0 && leading.index < options.length) return leading.index;
    const byText = options.findIndex(option => normalizeText(option) === normalizeText(text));
    return byText;
  }

  function buildQuestion(block, defaults, number) {
    const errors = [];
    const warnings = [];
    const parts = { question: [], answer: [], explain: [], points: [], time: [], type: [] };
    const options = [];
    let field = "question";
    block.lines.forEach(entry => {
      if (entry.field) {
        field = entry.field;
        if (field !== "question" || parts.question.length === 0 || entry.value) parts[field].push(entry.value);
        return;
      }
      const value = entry.value;
      const option = (field === "question" || field === "option") ? matchOption(value) : null;
      if (option && option.index === options.length) { options.push(option.text); field = "option"; return; }
      if (field === "option") {
        // A line that looks like an option label but is out of order (A, B, D) or beyond H
        // is reported instead of being silently glued onto the previous option.
        if (matchOption(value) || /^\(?\s*[A-Za-z]\s*[).:]\s+\S/.test(value.trim())) {
          errors.push(`The line "${value.trim().slice(0, 40)}" looks like an option but is out of order or beyond H.`);
        } else if (value.trim()) {
          options[options.length - 1] = `${options[options.length - 1]} ${value.trim()}`.trim();
        }
        return;
      }
      if (parts[field]) parts[field].push(value);
    });
    const join = list => list.join("\n").replace(/\n{3,}/g, "\n\n").trim();

    const text = join(parts.question);
    const explanation = join(parts.explain);
    const answerRaw = join(parts.answer);
    const type = resolveType(join(parts.type), options.length);

    if (!text) errors.push("The question text is empty.");
    if (text.length > LIMITS.text) errors.push(`The question is longer than ${LIMITS.text} characters.`);
    if (explanation.length > LIMITS.explanation) errors.push(`The explanation is longer than ${LIMITS.explanation} characters.`);
    if (!type) errors.push(`Unknown TYPE "${join(parts.type)}". Use MCQ, TF or SHORT.`);

    let points = defaults.points;
    if (parts.points.length) {
      points = Number(String(join(parts.points)).replace(/[^\d]/g, ""));
      if (!Number.isInteger(points) || points < 1 || points > LIMITS.points) errors.push(`POINTS must be a whole number from 1 to ${LIMITS.points}.`);
    }
    let timeLimit = defaults.timeLimit;
    if (parts.time.length) {
      timeLimit = parseTime(join(parts.time));
      if (!Number.isInteger(timeLimit) || timeLimit < 1 || timeLimit > LIMITS.time) errors.push(`TIME must be 1 to ${LIMITS.time} seconds (for example 30, 45s or 1m).`);
    }

    const question = { text, type: type || "short", points, timeLimit, options: {}, correctAnswer: "", explanation, imageUrl: "", audioUrl: "" };
    let answerLabel = "";

    if (type === "mcq") {
      if (options.length < 2) errors.push("A multiple choice question needs at least 2 options (A, B, C ...).");
      if (options.length > 8) errors.push("A multiple choice question can have at most 8 options.");
      options.forEach((option, index) => {
        if (!option) errors.push(`Option ${LETTERS[index]} is empty.`);
        if (option.length > LIMITS.option) errors.push(`Option ${LETTERS[index]} is longer than ${LIMITS.option} characters.`);
        question.options[`option${index + 1}`] = option;
      });
      if (!answerRaw) errors.push("No ANSWER: line found.");
      else {
        const chosen = resolveChoice(answerRaw, options);
        if (chosen < 0) errors.push(`ANSWER "${answerRaw.slice(0, 40)}" does not match any option.`);
        else { question.correctAnswer = `option${chosen + 1}`; answerLabel = `${LETTERS[chosen]}) ${options[chosen]}`; }
      }
    } else if (type === "trueFalse") {
      if (options.length) warnings.push("Options were ignored because this is a True / False question.");
      question.options = { true: "True", false: "False" };
      const value = parseBoolean(answerRaw);
      if (!answerRaw) errors.push("No ANSWER: line found (use TRUE or FALSE).");
      else if (value === null) errors.push(`ANSWER "${answerRaw.slice(0, 40)}" must be TRUE or FALSE.`);
      else { question.correctAnswer = value ? "true" : "false"; answerLabel = value ? "True" : "False"; }
    } else if (type === "short") {
      if (options.length) errors.push("This question has options but TYPE says SHORT. Remove TYPE or set TYPE: MCQ.");
      if (!answerRaw) errors.push("No ANSWER: line found.");
      else if (answerRaw.length > LIMITS.answer) errors.push(`The answer is longer than ${LIMITS.answer} characters.`);
      else { question.correctAnswer = answerRaw; answerLabel = answerRaw; }
    }

    return { number, raw: block.raw.join("\n").trim(), question, answerLabel, errors, warnings };
  }

  /**
   * parse(text, { points, timeLimit, existingTexts })
   * -> { items: [{ number, raw, question, answerLabel, errors, warnings, duplicate }], ignored: [] }
   */
  function parse(text, defaults = {}) {
    const settings = { points: Number(defaults.points) || 1, timeLimit: Number(defaults.timeLimit) || 60 };
    const existing = new Set((defaults.existingTexts || []).map(normalizeText).filter(Boolean));
    const seen = new Set();
    const { blocks, ignored } = splitBlocks(text);
    const items = blocks.map((block, index) => {
      const item = buildQuestion(block, settings, index + 1);
      const key = normalizeText(item.question.text);
      item.duplicate = Boolean(key) && (existing.has(key) || seen.has(key));
      if (key) seen.add(key);
      return item;
    });
    return { items, ignored };
  }

  return Object.freeze({ parse, LIMITS });
})();
