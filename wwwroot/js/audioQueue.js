(function (global) {
  const DEFAULT_DEDUP_WINDOW_MS = 4500;
  const DEFAULT_MAX_QUEUE_SIZE = 10;
  const DEFAULT_WATCHDOG_TIMEOUT_MS = 15000;
  const DEFAULT_PLAYBACK_RATE = 1.10;
  const DEFAULT_VOLUME = 1.0;
  const DEFAULT_GAIN_MULTIPLIER = 1.5;

  let sharedAudioCtx = null;

  function getAudioContext() {
    try {
      if (!sharedAudioCtx) {
        const AudioCtx = global.AudioContext || global.AudioContext || window.AudioContext || window.webkitAudioContext;
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

  // Tự động kích hoạt AudioContext khi có tương tác người dùng
  if (typeof document !== "undefined") {
    const unlockCtx = () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    };
    ["click", "keydown", "touchstart", "pointerdown"].forEach((evt) => {
      document.addEventListener(evt, unlockCtx, { passive: true });
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

      const text = speakText.trim();
      const now = Date.now();
      const isCurrent = this.isPlaying && this.currentText === text;
      const isQueued = this.queue.includes(text);
      const isRecentlyEnqueued =
        this.lastEnqueuedText === text &&
        now - this.lastEnqueuedAt < this.dedupWindowMs;

      if (isCurrent || isQueued || isRecentlyEnqueued) return false;

      // Giới hạn độ dài hàng đợi: nếu quá tải thì loại bỏ phần tử cũ nhất
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
        this.currentText = "";
        return;
      }

      this.isPlaying = true;
      this.currentText = this.queue.shift();
      const textToSpeak = this.currentText;
      const generation = this.generation;
      let advanced = false;
      let fallbackStarted = false;

      // Watchdog bảo vệ: nếu audio bị stall (treo) quá thời gian quy định thì tự chuyển tiếp
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
        if (fallbackStarted || advanced || generation !== this.generation)
          return;
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

      try {
        const audio = new Audio(
          `/api/tts?text=${encodeURIComponent(textToSpeak)}`,
        );
        this.currentAudio = audio;
        audio.volume = Math.min(1.0, Math.max(0, this.volume));
        audio.playbackRate = this.playbackRate;
        audio.defaultPlaybackRate = this.playbackRate;

        // Đảm bảo tốc độ phát được áp dụng ngay khi metadata được tải
        const enforceRate = () => {
          try {
            audio.playbackRate = this.playbackRate;
          } catch (e) {}
        };
        audio.addEventListener("loadedmetadata", enforceRate);
        audio.addEventListener("play", enforceRate);

        audio.onended = advance;
        audio.onerror = fallbackToBrowserSpeech;

        // Kích âm lượng qua Web Audio API Gain Node nếu được hỗ trợ
        const ctx = getAudioContext();
        if (ctx && this.gainMultiplier > 1.0) {
          try {
            const source = ctx.createMediaElementSource(audio);
            const gainNode = ctx.createGain();
            gainNode.gain.value = this.gainMultiplier;
            source.connect(gainNode);
            gainNode.connect(ctx.destination);
          } catch (e) {
            // Dự phòng phát bình thường nếu không thể gán MediaElementSource
          }
        }

        audio.play().catch(fallbackToBrowserSpeech);
      } catch (error) {
        fallbackToBrowserSpeech();
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
      this.currentAudio = null;
      this.isPlaying = false;
      this.currentText = "";
      this.lastEnqueuedText = "";
      this.lastEnqueuedAt = 0;
      if ("speechSynthesis" in global) global.speechSynthesis.cancel();
    }
  }

  global.AudioQueueManager = AudioQueueManager;
})(window);
