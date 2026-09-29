(function (global) {
  const DEFAULT_DEDUP_WINDOW_MS = 4500;
  const DEFAULT_MAX_QUEUE_SIZE = 10;
  const DEFAULT_WATCHDOG_TIMEOUT_MS = 15000;
  const DEFAULT_PLAYBACK_RATE = 1.1;
  const DEFAULT_VOLUME = 1.0;
  const DEFAULT_GAIN_MULTIPLIER = 1.5;

  let sharedAudioCtx = null;

  function getAudioContext() {
    try {
      if (!sharedAudioCtx) {
        const AudioCtx = global.AudioContext || global.webkitAudioContext;
        if (AudioCtx) {
          sharedAudioCtx = new AudioCtx();
        }
      }
      if (sharedAudioCtx && sharedAudioCtx.state === "suspended") {
        sharedAudioCtx.resume().catch(() => {});
      }
    } catch (e) {}
    return sharedAudioCtx;
  }

  // Tự động kích hoạt toàn diện (Tự khởi động AudioContext & Media Pipeline mà không bắt buộc click)
  function aggressiveAutoUnlock() {
    try {
      const ctx = getAudioContext();
      if (ctx) {
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }
        // Phát một buffer rỗng siêu ngắn để đánh thức pipeline âm thanh Web Audio
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      }
    } catch (e) {}

    try {
      const silentAudio = new Audio("/audio/silent.mp3");
      silentAudio.volume = 0.001;
      silentAudio.play().catch(() => {});
    } catch (e) {}
  }

  // Khởi chạy kích hoạt tự động ngay lập tức
  aggressiveAutoUnlock();

  if (typeof document !== "undefined") {
    // Kích hoạt khi trang tải xong
    if (document.readyState === "complete" || document.readyState === "interactive") {
      aggressiveAutoUnlock();
    } else {
      document.addEventListener("DOMContentLoaded", aggressiveAutoUnlock, { once: true });
      window.addEventListener("load", aggressiveAutoUnlock, { once: true });
    }

    // Định kỳ thử kích hoạt trong 10 giây đầu khi vừa mở màn hình TV
    let unlockRetries = 0;
    const unlockInterval = setInterval(() => {
      unlockRetries++;
      aggressiveAutoUnlock();
      const ctx = getAudioContext();
      if ((ctx && ctx.state === "running") || unlockRetries > 15) {
        clearInterval(unlockInterval);
      }
    }, 600);

    // Bắt mọi sự kiện người dùng (chuột, chạm, phím, di chuột, chuyển tab)
    ["click", "keydown", "touchstart", "pointerdown", "mousedown", "mousemove", "focus", "visibilitychange", "wheel"].forEach((evt) => {
      document.addEventListener(evt, aggressiveAutoUnlock, { passive: true });
    });
  }

  class AudioQueueManager {
    constructor({
      isEnabled,
      gapMs = 350,
      dedupWindowMs = DEFAULT_DEDUP_WINDOW_MS,
      maxQueueSize = DEFAULT_MAX_QUEUE_SIZE,
      watchdogTimeoutMs = DEFAULT_WATCHDOG_TIMEOUT_MS,
      playbackRate = DEFAULT_PLAYBACK_RATE,
      volume = DEFAULT_VOLUME,
      gainMultiplier = DEFAULT_GAIN_MULTIPLIER,
    } = {}) {
      this.isEnabled = typeof isEnabled === "function" ? isEnabled : () => true;
      this.gapMs = gapMs;
      this.dedupWindowMs = dedupWindowMs;
      this.maxQueueSize = maxQueueSize;
      this.watchdogTimeoutMs = watchdogTimeoutMs;
      this.playbackRate = playbackRate;
      this.volume = volume;
      this.gainMultiplier = gainMultiplier;
      this.queue = [];
      this.isPlaying = false;
      this.currentAudio = null;
      this.currentBufferSource = null;
      this.currentText = "";
      this.lastEnqueuedText = "";
      this.lastEnqueuedAt = 0;
      this.generation = 0;
      this.watchdogTimer = null;
    }

    setPlaybackRate(rate) {
      if (typeof rate === "number" && rate > 0) {
        this.playbackRate = rate;
      }
    }

    setVolume(vol) {
      if (typeof vol === "number" && vol >= 0) {
        this.volume = vol;
      }
    }

    setGain(gain) {
      if (typeof gain === "number" && gain >= 0) {
        this.gainMultiplier = gain;
      }
    }

    enqueue(speakText) {
      if (!this.isEnabled() || !speakText || !speakText.trim()) return false;

      // Mỗi khi nhận lệnh enqueue, cố gắng kích hoạt lại pipeline âm thanh
      aggressiveAutoUnlock();

      const text = speakText.trim();
      const now = Date.now();
      const isCurrent = this.isPlaying && this.currentText === text;
      const isQueued = this.queue.includes(text);
      const isRecentlyEnqueued =
        this.lastEnqueuedText === text &&
        now - this.lastEnqueuedAt < this.dedupWindowMs;

      if (isCurrent || isQueued || isRecentlyEnqueued) return false;

      if (this.queue.length >= this.maxQueueSize) {
        this.queue.shift();
      }

      this.queue.push(text);
      this.lastEnqueuedText = text;
      this.lastEnqueuedAt = now;
      if (!this.isPlaying) this.playNext();
      return true;
    }

    playNext() {
      if (this.queue.length === 0) {
        this.isPlaying = false;
        this.currentAudio = null;
        this.currentBufferSource = null;
        this.currentText = "";
        return;
      }

      this.isPlaying = true;
      this.currentText = this.queue.shift();
      const textToSpeak = this.currentText;
      const generation = this.generation;
      let advanced = false;
      let fallbackStarted = false;

      if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
      this.watchdogTimer = setTimeout(() => {
        if (!advanced && generation === this.generation) {
          advance();
        }
      }, this.watchdogTimeoutMs);

      const advance = () => {
        if (advanced || generation !== this.generation) return;
        advanced = true;
        if (this.watchdogTimer) {
          clearTimeout(this.watchdogTimer);
          this.watchdogTimer = null;
        }
        setTimeout(() => {
          if (generation === this.generation) this.playNext();
        }, this.gapMs);
      };

      const fallbackToBrowserSpeech = () => {
        if (fallbackStarted || advanced || generation !== this.generation) return;
        fallbackStarted = true;

        if (!("speechSynthesis" in global)) {
          advance();
          return;
        }

        try {
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.lang = "vi-VN";
          utterance.rate = this.playbackRate || DEFAULT_PLAYBACK_RATE;
          utterance.volume = Math.min(1.0, Math.max(0, this.volume || 1.0));
          utterance.onend = advance;
          utterance.onerror = advance;
          global.speechSynthesis.speak(utterance);
        } catch (error) {
          advance();
        }
      };

      const fallbackToWebAudioBuffer = async () => {
        try {
          const ctx = getAudioContext();
          if (ctx) {
            if (ctx.state === "suspended") {
              await ctx.resume().catch(() => {});
            }
            const res = await fetch(`/api/tts?text=${encodeURIComponent(textToSpeak)}`);
            if (!res.ok) throw new Error("TTS fetch failed");
            const arrayBuf = await res.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuf);
            
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.playbackRate.value = this.playbackRate;

            let finalNode = source;
            if (this.gainMultiplier > 1.0) {
              const gainNode = ctx.createGain();
              gainNode.gain.value = this.gainMultiplier;
              source.connect(gainNode);
              finalNode = gainNode;
            }
            finalNode.connect(ctx.destination);

            this.currentBufferSource = source;
            source.onended = advance;
            source.start(0);
            return;
          }
        } catch (e) {
          console.warn("[AudioQueue] Web Audio fallback lỗi, chuyển sang SpeechSynthesis:", e);
        }
        fallbackToBrowserSpeech();
      };

      // Thử phát bằng thẻ Audio
      try {
        const audio = new Audio(`/api/tts?text=${encodeURIComponent(textToSpeak)}`);
        this.currentAudio = audio;
        audio.volume = Math.min(1.0, Math.max(0, this.volume));
        audio.playbackRate = this.playbackRate;
        audio.defaultPlaybackRate = this.playbackRate;

        const enforceRate = () => {
          try {
            audio.playbackRate = this.playbackRate;
          } catch (e) {}
        };
        audio.addEventListener("loadedmetadata", enforceRate);
        audio.addEventListener("play", enforceRate);

        audio.onended = advance;
        audio.onerror = () => {
          fallbackToWebAudioBuffer();
        };

        const ctx = getAudioContext();
        if (ctx && ctx.state === "running" && this.gainMultiplier > 1.0) {
          try {
            const source = ctx.createMediaElementSource(audio);
            const gainNode = ctx.createGain();
            gainNode.gain.value = this.gainMultiplier;
            source.connect(gainNode);
            gainNode.connect(ctx.destination);
          } catch (e) {}
        }

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn("[AudioQueue] audio.play() bị chặn hoặc lỗi, tự động thử Web Audio buffer...", err);
            fallbackToWebAudioBuffer();
          });
        }
      } catch (error) {
        fallbackToWebAudioBuffer();
      }
    }

    clear() {
      this.generation += 1;
      this.queue = [];
      if (this.watchdogTimer) {
        clearTimeout(this.watchdogTimer);
        this.watchdogTimer = null;
      }
      if (this.currentAudio) {
        try {
          this.currentAudio.pause();
        } catch (error) {}
      }
      if (this.currentBufferSource) {
        try {
          this.currentBufferSource.stop();
        } catch (error) {}
      }
      this.currentAudio = null;
      this.currentBufferSource = null;
      this.isPlaying = false;
      this.currentText = "";
      this.lastEnqueuedText = "";
      this.lastEnqueuedAt = 0;
      if ("speechSynthesis" in global) global.speechSynthesis.cancel();
    }
  }

  global.AudioQueueManager = AudioQueueManager;
  global.aggressiveAutoUnlock = aggressiveAutoUnlock;
})(window);
