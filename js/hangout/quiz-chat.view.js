// ONLINE QUIZ — live chat (UI only): text, emoji, voice notes, live updates.
// Only this panel scrolls. Data calls go through HangoutRepository.
window.HangoutQuizChat = (() => {
  const LOAD_LAST = 60;
  const VOICE_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uFE0F|\u200D|\s)+$/u;

  function mount(panel, ctx) {
    panel.innerHTML = `
      <div class="hg-chat-list" data-role="list"><div class="hg-chat-empty" data-role="empty">No messages yet.<br>Say hi 👋</div></div>
      <div class="hg-emoji-panel" data-role="emoji" hidden>${HangoutService.EMOJIS.map(e => `<button type="button" data-emoji="${e}" aria-label="Emoji">${e}</button>`).join("")}</div>
      <div class="hg-recorder" data-role="recorder" hidden>
        <span class="hg-rec-dot"></span><span class="hg-rec-time" data-role="recTime">0:00</span>
        <button type="button" class="hg-btn is-light" data-act="recCancel">Cancel</button>
        <button type="button" class="hg-btn" data-act="recSend">Send</button>
      </div>
      <div class="hg-composer" data-role="composer">
        <button type="button" class="hg-icon-btn" data-act="emoji" aria-label="Emoji"><i class="fa-regular fa-face-smile"></i></button>
        <input type="text" data-role="input" maxlength="${HangoutService.MAX_TEXT}" placeholder="Message" autocomplete="off" aria-label="Message">
        <button type="button" class="hg-icon-btn hg-send" data-act="action" aria-label="Record voice message"><i class="fa-solid fa-microphone"></i></button>
      </div>`;

    const $ = role => panel.querySelector(`[data-role="${role}"]`);
    const list = $("list"), input = $("input"), actionBtn = panel.querySelector('[data-act="action"]');
    let stick = true, buffer = [], raf = 0, audio = null, playingId = "", sending = false, rec = null;
    const voiceCache = new Map();

    list.addEventListener("scroll", () => { stick = list.scrollHeight - list.scrollTop - list.clientHeight < 80; });
    const toBottom = () => { list.scrollTop = list.scrollHeight; };

    // ---------- rendering ----------
    function messageHTML(id, m) {
      const own = m.uid === ctx.user.uid;
      const author = ctx.users()[m.uid];
      const name = author?.name || m.name || "Player";
      const removed = m.deleted === true;
      const emojiOnly = !removed && !m.voice && EMOJI_ONLY.test(String(m.text || "").trim());
      let body;
      if (removed) body = '<span class="hg-msg-text">Message removed by admin</span>';
      else if (m.voice) body = `<div class="hg-voice"><button type="button" class="hg-voice-play" data-act="play" data-id="${escapeHTML(id)}" aria-label="Play voice message"><i class="fa-solid fa-play"></i></button><div class="hg-voice-bar"><span></span></div><span class="hg-voice-dur">${HangoutService.formatDuration(m.voiceDur)}</span></div>`;
      else body = `<span class="hg-msg-text">${escapeHTML(m.text)}</span>`;
      const hide = ctx.isQuizAdmin() && !removed ? `<button type="button" class="hg-msg-del" data-act="hide" data-id="${escapeHTML(id)}">Hide</button>` : "";
      return `<div class="hg-msg ${own ? "is-own" : ""} ${removed ? "is-removed" : ""}" data-id="${escapeHTML(id)}" data-uid="${escapeHTML(m.uid)}">
        ${HangoutUI.avatar(author?.photo, name, m.uid)}
        <div class="hg-bubble ${emojiOnly ? "is-emoji" : ""}">
          <div class="hg-msg-meta"><span class="hg-msg-name">${escapeHTML(name)}</span><time class="hg-msg-time">${escapeHTML(HangoutService.formatTime(m.createdAt))}</time>${hide}</div>
          ${body}
        </div>
      </div>`;
    }

    function flush() {
      raf = 0;
      if (!buffer.length) return;
      const items = buffer; buffer = [];
      $("empty")?.remove();
      const wasStuck = stick;
      const html = items.map(item => item.html).join("");
      list.insertAdjacentHTML("beforeend", html);
      if (wasStuck || items.some(item => item.own)) { toBottom(); stick = true; }
    }

    const handlers = {
      added(id, m) {
        if (!m || list.querySelector(`[data-id="${CSS.escape(id)}"]`)) return;
        buffer.push({ html: messageHTML(id, m), own: m.uid === ctx.user.uid });
        if (!raf) raf = requestAnimationFrame(flush);
      },
      changed(id, m) {
        const el = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
        if (el && m) el.outerHTML = messageHTML(id, m);
      },
      removed(id) { list.querySelector(`[data-id="${CSS.escape(id)}"]`)?.remove(); }
    };
    const stopChat = HangoutRepository.subscribeChat(LOAD_LAST, handlers);

    // ---------- sending text ----------
    function syncActionButton() {
      const hasText = input.value.trim().length > 0;
      actionBtn.innerHTML = `<i class="fa-solid ${hasText ? "fa-paper-plane" : "fa-microphone"}"></i>`;
      actionBtn.setAttribute("aria-label", hasText ? "Send message" : "Record voice message");
    }
    input.addEventListener("input", syncActionButton);
    input.addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); void sendText(); } });

    async function sendText() {
      const text = input.value.trim();
      if (!text || sending) return;
      sending = true;
      input.value = ""; syncActionButton();
      try { await HangoutRepository.sendText(HangoutRepository.newMessageKey(), { uid: ctx.user.uid, name: ctx.user.name, text: text.slice(0, HangoutService.MAX_TEXT) }); }
      catch (error) { console.error("Hangout message failed:", error); input.value = text; syncActionButton(); showToast("Message could not be sent. Try again.", "error"); }
      finally { sending = false; }
    }

    // ---------- emoji ----------
    panel.querySelector('[data-act="emoji"]').addEventListener("click", () => { $("emoji").hidden = !$("emoji").hidden; });
    $("emoji").addEventListener("click", event => {
      const button = event.target.closest("[data-emoji]");
      if (!button) return;
      const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
      input.value = input.value.slice(0, start) + button.dataset.emoji + input.value.slice(end);
      input.setSelectionRange(start + button.dataset.emoji.length, start + button.dataset.emoji.length);
      syncActionButton();
    });

    // ---------- voice recording ----------
    async function startRecording() {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { showToast("Voice recording is not supported on this browser.", "warning"); return; }
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (error) { showToast("Allow microphone access to record a voice message.", "error"); return; }
      const mime = VOICE_TYPES.find(type => MediaRecorder.isTypeSupported?.(type)) || "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 });
      rec = { recorder, stream, chunks: [], started: Date.now(), send: false, timer: 0 };
      const current = rec;
      recorder.ondataavailable = event => { if (event.data?.size) current.chunks.push(event.data); };
      recorder.onstop = () => finishRecording(current);
      recorder.start();
      $("composer").hidden = true; $("emoji").hidden = true; $("recorder").hidden = false;
      current.timer = setInterval(() => {
        const seconds = (Date.now() - current.started) / 1000;
        $("recTime").textContent = HangoutService.formatDuration(seconds);
        if (seconds >= HangoutService.MAX_VOICE_SECONDS) stopRecording(true);
      }, 250);
    }

    function stopRecording(send) {
      if (!rec) return;
      rec.send = send;
      if (rec.recorder.state !== "inactive") rec.recorder.stop(); else finishRecording(rec);
    }

    async function finishRecording(current) {
      clearInterval(current.timer);
      current.stream.getTracks().forEach(track => track.stop());
      if (rec === current) rec = null;
      $("recorder").hidden = true; $("composer").hidden = false;
      if (!current.send) return;
      const duration = Math.min(HangoutService.MAX_VOICE_SECONDS, (Date.now() - current.started) / 1000);
      if (duration < 0.8) { showToast("Voice message is too short.", "warning"); return; }
      try {
        const blob = new Blob(current.chunks, { type: current.recorder.mimeType || "audio/webm" });
        const audioData = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
        if (audioData.length > HangoutService.MAX_VOICE_CHARS) { showToast("Voice message is too long. Keep it shorter.", "warning"); return; }
        await HangoutRepository.sendVoice(HangoutRepository.newMessageKey(), { uid: ctx.user.uid, name: ctx.user.name, audio: audioData, duration: Math.round(duration) });
      } catch (error) { console.error("Hangout voice message failed:", error); showToast("Voice message could not be sent.", "error"); }
    }

    panel.querySelector('[data-act="recCancel"]').addEventListener("click", () => stopRecording(false));
    panel.querySelector('[data-act="recSend"]').addEventListener("click", () => stopRecording(true));
    actionBtn.addEventListener("click", () => { if (input.value.trim()) void sendText(); else void startRecording(); });

    // ---------- voice playback + moderation (event delegation) ----------
    function stopPlayback() {
      if (audio) { audio.pause(); audio = null; }
      list.querySelectorAll(".hg-voice-play i").forEach(i => { i.className = "fa-solid fa-play"; });
      list.querySelectorAll(".hg-voice-bar span").forEach(bar => { bar.style.width = "0"; });
      playingId = "";
    }

    async function togglePlay(id, button) {
      if (playingId === id) { stopPlayback(); return; }
      stopPlayback();
      try {
        if (!voiceCache.has(id)) voiceCache.set(id, await HangoutRepository.readVoice(id));
        const source = voiceCache.get(id);
        if (!source) throw new Error("Voice data missing");
        audio = new Audio(source);
        playingId = id;
        const icon = button.querySelector("i"), bar = button.parentElement.querySelector(".hg-voice-bar span");
        icon.className = "fa-solid fa-pause";
        audio.addEventListener("timeupdate", () => { if (audio && audio.duration) bar.style.width = `${(audio.currentTime / audio.duration) * 100}%`; });
        audio.addEventListener("ended", stopPlayback);
        await audio.play();
      } catch (error) { console.error("Hangout voice playback failed:", error); stopPlayback(); showToast("Could not play this voice message.", "error"); }
    }

    list.addEventListener("click", async event => {
      const control = event.target.closest("[data-act]");
      if (!control) return;
      if (control.dataset.act === "play") void togglePlay(control.dataset.id, control);
      if (control.dataset.act === "hide") {
        const ok = await showConfirmSheet({ title: "Hide this message?", message: "It will be hidden for everyone in the chat.", confirmLabel: "Hide", danger: true });
        if (!ok) return;
        try { await HangoutAdminRepository.hideMessage(control.dataset.id); showToast("Message hidden.", "success"); }
        catch (error) { console.error("Hangout hide failed:", error); showToast("Could not hide the message. Sign in as an official.", "error"); }
      }
    });

    return {
      onShow() { if (stick) toBottom(); },
      // Names/photos arrive from the users list; refresh avatars already on screen.
      refreshAvatars() {
        const users = ctx.users();
        list.querySelectorAll(".hg-msg").forEach(row => {
          const user = users[row.dataset.uid];
          const nameEl = row.querySelector(".hg-msg-name");
          if (user?.name && nameEl && nameEl.textContent !== user.name) nameEl.textContent = user.name;
          const avatar = row.querySelector(".hg-avatar");
          if (user?.photo && avatar && !avatar.querySelector("img")) avatar.outerHTML = HangoutUI.avatar(user.photo, user.name, row.dataset.uid);
        });
      },
      unmount() {
        stopChat();
        if (raf) cancelAnimationFrame(raf);
        if (rec) { rec.send = false; try { rec.recorder.state !== "inactive" ? rec.recorder.stop() : finishRecording(rec); } catch (error) { /* ignore */ } }
        stopPlayback();
      }
    };
  }

  return Object.freeze({ mount });
})();
