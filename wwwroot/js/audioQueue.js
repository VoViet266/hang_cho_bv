(function (global) {
  const managers = new Set();
  const SILENT_URL = "/audio/silent.mp3";

  function findVietnameseVoice() {
    if (!global.speechSynthesis) return null;
    try {
      const voices = global.speechSynthesis
        .getVoices()
        .filter((voice) => /^vi(?:[-_]|$)/i.test(voice.lang || ""));
      return (
        voices.find((voice) =>
          /hoaimy|namminh|google|natural/i.test(voice.name || ""),
        ) ||
        voices[0] ||
        null
      );
    } catch (error) {
      return null;
    }
  }

  function isAutoplayError(error) {
    return (
      error &&
      (error.name === "NotAllowedError" || error.error === "not-allowed")
    );
  }

  class AudioQueueManager {
    constructor({
      isEnabled = () => true,
      gapMs = 350,
      dedupWindowMs = 600,
      maxQueueSize = 50,
      maxPendingAgeMs = 60000,
      watchdogTimeoutMs = 15000,
      networkTimeoutMs = 3500,
      playbackRate = 1.1,
      volume = 1,
      gain = 2.0, // Khuếch đại âm lượng gấp đôi (200%) qua Web Audio API GainNode
      onStart = null,
      onEnd = null,
      onPlaybackStateChange = null,
    } = {}) {
      Object.assign(this, {
        isEnabled,
        gapMs,
        dedupWindowMs,
        maxQueueSize,
        maxPendingAgeMs,
        watchdogTimeoutMs,
        networkTimeoutMs,
        playbackRate,
        volume,
        gain,
        onStart,
        onEnd,
        onPlaybackStateChange,
      });
      this.audio = new global.Audio();
      this.audio.preload = "auto";
      this.audio.setAttribute("playsinline", "");
      this.audioCtx = null;
      this.gainNode = null;
      this.audioSourceNode = null;
      this.setupAudioBooster();
      this.queue = [];
      this.isPlaying = false;
      this.currentText = "";
      this.currentMeta = null;
      this.currentItem = null;
      this.started = false;
      this.playbackState = "checking";
      this.waitingForActivation = false;
      this.lastEnqueuedText = "";
      this.lastEnqueuedAt = 0;
      this.attemptId = 0;
      this.networkTimer = null;
      this.watchdogTimer = null;
      this.gapTimer = null;
      this.probeTimer = null;
      this.prefetchAudio = null;
      this.prefetchText = "";
      managers.add(this);
      // Tự thử ngay khi mở trang, không phụ thuộc click hay localStorage.
      this.startupTimer = setTimeout(() => this.unlock(), 0);
    }

    setupAudioBooster() {
      if (this.audioSourceNode) return;
      const AudioCtxClass = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtxClass) return;
      try {
        if (!this.audioCtx) {
          this.audioCtx = new AudioCtxClass();
        }
        if (this.audio && !this.audioSourceNode) {
          this.audioSourceNode = this.audioCtx.createMediaElementSource(this.audio);
          this.gainNode = this.audioCtx.createGain();
          this.gainNode.gain.value = typeof this.gain === "number" ? this.gain : 2.0;

          // Bộ nén âm DynamicsCompressor chống rè/vỡ tiếng khi khuếch đại biên độ cao
          try {
            const compressor = this.audioCtx.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-3, this.audioCtx.currentTime);
            compressor.knee.setValueAtTime(10, this.audioCtx.currentTime);
            compressor.ratio.setValueAtTime(12, this.audioCtx.currentTime);
            compressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
            compressor.release.setValueAtTime(0.25, this.audioCtx.currentTime);

            this.audioSourceNode.connect(this.gainNode);
            this.gainNode.connect(compressor);
            compressor.connect(this.audioCtx.destination);
          } catch (compErr) {
            this.audioSourceNode.connect(this.gainNode);
            this.gainNode.connect(this.audioCtx.destination);
          }
        }
      } catch (err) {
        console.warn("[AudioQueue] Không thể kết nối Web Audio GainNode:", err);
      }
    }

    resumeAudioContext() {
      this.setupAudioBooster();
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {});
      }
    }

    setGain(gainValue) {
      this.gain = gainValue;
      if (this.gainNode && this.audioCtx) {
        try {
          this.gainNode.gain.setValueAtTime(gainValue, this.audioCtx.currentTime);
        } catch (e) {
          this.gainNode.gain.value = gainValue;
        }
      }
    }

    notify(callback, value) {
      if (typeof callback === "function") {
        try {
          callback(value);
        } catch (error) {
          console.warn("[AudioQueue] Callback failed", error);
        }
      }
    }

    setState(state) {
      if (this.playbackState === state) return;
      this.playbackState = state;
      this.notify(this.onPlaybackStateChange, this.getQueueStatus());
    }

    getQueueStatus() {
      return {
        isPlaying: this.isPlaying,
        currentText: this.currentText,
        currentMeta: this.currentMeta,
        queueLength: this.queue.length,
        queue: [...this.queue],
        playbackState: this.playbackState,
        waitingForActivation: this.waitingForActivation,
      };
    }

    stopPlayback() {
      clearTimeout(this.networkTimer);
      clearTimeout(this.watchdogTimer);
      clearTimeout(this.probeTimer);
      this.networkTimer = this.watchdogTimer = this.probeTimer = null;
      this.audio.onplaying = this.audio.onended = this.audio.onerror = null;
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      if (this.utterance) {
        this.utterance.onstart =
          this.utterance.onend =
          this.utterance.onerror =
            null;
        if (global.speechSynthesis) global.speechSynthesis.cancel();
        this.utterance = null;
      }
    }

    unlock() {
      clearTimeout(this.startupTimer);
      this.resumeAudioContext();
      if (
        !this.isEnabled() ||
        this.isPlaying ||
        this.gapTimer ||
        this.probeTimer
      )
        return;
      this.waitingForActivation = false;
      if (this.queue.length) {
        this.playNext();
        return;
      }
      if (this.playbackState === "ready") return;
      const attempt = ++this.attemptId;
      const active = () => attempt === this.attemptId;
      this.audio.src = SILENT_URL;
      this.audio.muted = false;
      this.audio.volume = this.volume;
      const complete = (state) => {
        if (!active()) return;
        ++this.attemptId;
        this.stopPlayback();
        this.waitingForActivation = state === "blocked";
        this.setState(state);
      };
      this.probeTimer = setTimeout(
        () => complete("error"),
        this.networkTimeoutMs,
      );
      this.audio.onplaying = () => complete("ready");
      this.audio.onerror = () => complete("error");
      try {
        const promise = this.audio.play();
        if (promise && promise.catch) {
          promise.catch((error) =>
            complete(isAutoplayError(error) ? "blocked" : "error"),
          );
        }
      } catch (error) {
        complete(isAutoplayError(error) ? "blocked" : "error");
      }
    }

    prefetchNext() {
      const next = this.queue[0];
      if (!next || next.text === this.prefetchText || this.waitingForActivation)
        return;
      if (!this.prefetchAudio) this.prefetchAudio = new global.Audio();
      this.prefetchText = next.text;
      this.prefetchAudio.preload = "auto";
      this.prefetchAudio.src = "/api/tts?text=" + encodeURIComponent(next.text);
      this.prefetchAudio.load();
    }

    enqueue(speakText, meta = null) {
      if (!this.isEnabled()) return false;
      const text = speakText.trim();
      if (!text) return false;
      const now = Date.now();
      if (
        this.currentText === text ||
        this.queue.some((item) => item.text === text) ||
        (this.lastEnqueuedText === text &&
          now - this.lastEnqueuedAt < this.dedupWindowMs)
      )
        return false;
      if (this.queue.length >= this.maxQueueSize) this.queue.shift();
      this.queue.push({
        text,
        meta: meta || {},
        enqueuedAt: now,
        activationPending: this.waitingForActivation,
      });
      this.lastEnqueuedText = text;
      this.lastEnqueuedAt = now;
      if (!this.isPlaying && !this.waitingForActivation && !this.gapTimer)
        this.playNext();
      else if (this.isPlaying) this.prefetchNext();
      return true;
    }

    playNext() {
      clearTimeout(this.startupTimer);
      if (this.isPlaying || this.waitingForActivation || this.gapTimer) return;
      this.resumeAudioContext();
      if (!this.isEnabled()) {
        this.clear();
        return;
      }
      // Tránh gọi lại bệnh nhân đã quá lượt sau khi TV bị chặn âm thanh lâu.
      this.queue = this.queue.filter(
        (item) =>
          !item.activationPending ||
          Date.now() - item.enqueuedAt <= this.maxPendingAgeMs,
      );
      if (!this.queue.length) return;
      const attempt = ++this.attemptId;
      this.stopPlayback();
      const item = this.queue.shift();
      this.currentItem = item;
      this.currentText = item.text;
      this.currentMeta = item.meta;
      this.isPlaying = true;
      this.started = false;
      this.prefetchNext();
      const active = () => attempt === this.attemptId && this.isPlaying;
      let fallbackStarted = false;

      const start = (durationMs) => {
        if (!active()) return;
        clearTimeout(this.networkTimer);
        this.networkTimer = null;
        this.setState("ready");
        if (!this.started) {
          this.started = true;
          this.notify(this.onStart, { text: item.text, meta: item.meta });
        }
        clearTimeout(this.watchdogTimer);
        this.watchdogTimer = setTimeout(
          () => finish("error"),
          Math.max(this.watchdogTimeoutMs, durationMs + 2500),
        );
      };

      const release = () => {
        ++this.attemptId; // Vô hiệu các play promise / callback đến muộn.
        this.stopPlayback();
        if (this.started)
          this.notify(this.onEnd, { text: item.text, meta: item.meta });
        this.isPlaying = this.started = false;
        this.currentItem = this.currentMeta = null;
        this.currentText = "";
      };

      const block = () => {
        if (!active()) return;
        release();
        item.activationPending = true;
        this.queue.unshift(item);
        if (this.queue.length > this.maxQueueSize) this.queue.pop();
        this.waitingForActivation = true;
        this.setState("blocked");
      };

      const finish = (state) => {
        if (!active()) return;
        release();
        if (state) this.setState(state);
        if (this.queue.length) {
          this.gapTimer = setTimeout(() => {
            this.gapTimer = null;
            this.playNext();
          }, this.gapMs);
        }
      };

      const fallbackToSpeech = () => {
        if (!active() || fallbackStarted) return;
        fallbackStarted = true;
        // Dừng hẳn audio trước khi fallback để không có hai giọng cùng đọc.
        this.stopPlayback();
        try {
          const voice = findVietnameseVoice();
          if (!voice || !global.SpeechSynthesisUtterance) {
            finish("error");
            return;
          }
          const utterance = new global.SpeechSynthesisUtterance(item.text);
          this.utterance = utterance;
          utterance.voice = voice;
          utterance.lang = voice.lang;
          utterance.rate = this.playbackRate;
          utterance.volume = this.volume;
          utterance.onstart = () =>
            start((item.text.length * 150) / this.playbackRate);
          utterance.onend = () => finish();
          utterance.onerror = (error) =>
            isAutoplayError(error) ? block() : finish("error");
          this.watchdogTimer = setTimeout(
            () => finish("error"),
            this.watchdogTimer,
          );
          global.speechSynthesis.speak(utterance);
        } catch (error) {
          if (isAutoplayError(error)) block();
          else finish("error");
        }
      };

      this.audio.src = "/api/tts?text=" + encodeURIComponent(item.text);
      this.audio.muted = false;
      this.audio.volume = this.volume;
      this.audio.playbackRate = this.audio.defaultPlaybackRate =
        this.playbackRate;
      this.audio.onplaying = () => {
        if (fallbackStarted) return;
        const duration = this.audio.duration;
        start(
          Number.isFinite(duration)
            ? (duration * 1000) / this.playbackRate
            : this.watchdogTimeoutMs,
        );
      };
      this.audio.onended = () => finish();
      this.audio.onerror = fallbackToSpeech;
      // Nhiều TV không có giọng Việt native: cho backend đủ thời gian tạo MP3
      // (ba lượt dịch vụ có thể mất 15 giây), thay vì bỏ tên sau 3,5 giây.
      const hasSpeechFallback =
        global.SpeechSynthesisUtterance && findVietnameseVoice();
      this.networkTimer = setTimeout(
        fallbackToSpeech,
        hasSpeechFallback
          ? this.networkTimeoutMs
          : Math.max(this.networkTimeoutMs, 20000),
      );
      try {
        const promise = this.audio.play();
        if (promise && promise.catch) {
          promise.catch((error) => {
            if (!active() || fallbackStarted) return;
            if (isAutoplayError(error)) block();
            else fallbackToSpeech();
          });
        }
      } catch (error) {
        if (isAutoplayError(error)) block();
        else fallbackToSpeech();
      }
    }

    clear() {
      ++this.attemptId;
      clearTimeout(this.startupTimer);
      clearTimeout(this.gapTimer);
      this.gapTimer = null;
      this.stopPlayback();
      if (this.started && this.currentItem)
        this.notify(this.onEnd, this.currentItem);
      if (this.prefetchAudio) {
        this.prefetchAudio.removeAttribute("src");
        this.prefetchAudio.load();
      }
      this.prefetchText = this.lastEnqueuedText = this.currentText = "";
      this.lastEnqueuedAt = 0;
      this.queue = [];
      this.isPlaying = this.started = false;
      this.waitingForActivation = this.playbackState === "blocked";
      this.currentItem = this.currentMeta = null;
    }
  }

  function unlock() {
    managers.forEach((manager) => manager.unlock());
  }

  function updateSoundControl(manager, enabled) {
    const status = document.getElementById("audioPlaybackStatus");
    if (status) {
      status.hidden = true;
      status.textContent = "";
    }
    const button = document.getElementById("soundToggleBtn");
    if (!button) return;
    const state = enabled ? manager.playbackState : "off";
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("data-audio-state", state);
    const description = state === "blocked"
      ? "Loa: trình duyệt chưa cho phép tự phát âm thanh."
      : state === "error" ? "Loa: chưa phát được âm thanh." : "";
    if (description) {
      button.title = description;
      button.setAttribute("aria-label", description);
      const icon = document.getElementById("soundIcon");
      if (icon) icon.className = "fas fa-volume-up text-amber-600 text-sm";
    }
  }

  function setGain(value) {
    managers.forEach((manager) => manager.setGain(value));
  }

  global.AudioQueueManager = AudioQueueManager;
  global.QueueAudio = { unlock, updateSoundControl, setGain };

  if (typeof document !== "undefined") {
    // Capture: gọi play() bên trong thao tác thật của remote trước các handler khác.
    ["keydown", "click", "touchend", "pointerdown"].forEach((eventName) => {
      document.addEventListener(
        eventName,
        (event) => {
          if (event.isTrusted) unlock();
        },
        { capture: true, passive: true },
      );
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) unlock();
    });
    global.addEventListener("online", unlock);
  }
})(window);
