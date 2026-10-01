(function (global) {
  const DEFAULT_WATCHDOG_TIMEOUT_MS = 15000;
  const DEFAULT_TTS_NETWORK_TIMEOUT_MS = 3500; // 3.5s timeout: nếu mạng lag/chậm, tự động chuyển fallback ngay không để khoảng lặng lâu
  const DEFAULT_PLAYBACK_RATE = 1.1;
  const DEFAULT_VOLUME = 1.0;
  const DEFAULT_GAIN_MULTIPLIER = 1.5;

  let sharedAudioCtx = null;
  let cachedBestViVoice = null;

  // ═══════════════ CHUẨN HÓA VĂN BẢN ĐỌC TIẾNG VIỆT ═══════════════
  function normalizeSpeakText(text) {
    if (!text || typeof text !== "string") return "";
    let cleaned = text.trim();

    // 1. Loại bỏ số 0 vô nghĩa trước số ô, phòng, quầy, cửa (ví dụ: "ô số 01" -> "ô số 1", "phòng 05" -> "phòng 5")
    cleaned = cleaned.replace(/\b(ô|ô\s+số|cửa|cửa\s+số|phòng|phòng\s+số|quầy|quầy\s+số|bàn|bàn\s+số|số)\s+0+(\d+)\b/gi, "$1 $2");

    // 2. Chuẩn hóa dấu câu để ngữ điệu ngắt nghỉ tự nhiên
    cleaned = cleaned.replace(/\s*,\s*/g, ", ");
    cleaned = cleaned.replace(/\s*\.\s*/g, ". ");
    cleaned = cleaned.replace(/[,]+/g, ",");
    cleaned = cleaned.replace(/[\.]+/g, ".");
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    return cleaned;
  }

  // ═══════════════ TÌM GIỌNG ĐỌC TIẾNG VIỆT CHUẨN NHẤT ═══════════════
  function findBestVietnameseVoice() {
    if (!("speechSynthesis" in global)) return null;
    try {
      const voices = global.speechSynthesis.getVoices() || [];
      if (!voices.length) return null;

      // Ưu tiên các giọng đọc AI / Natural chất lượng cao của Microsoft / Google
      const preferredNames = [
        "microsoft hoaimy online",
        "microsoft namminh online",
        "microsoft an online",
        "hoaimy",
        "namminh",
        "an",
        "google tiếng việt",
        "google vi-vn",
        "vietnamese",
      ];

      for (const pref of preferredNames) {
        const match = voices.find(
          (v) => (v.name && v.name.toLowerCase().includes(pref)) ||
                 (v.voiceURI && v.voiceURI.toLowerCase().includes(pref))
        );
        if (match) return match;
      }

      // Giọng bất kỳ có mã vi-VN hoặc vi
      const viVoice = voices.find(
        (v) => (v.lang && (v.lang.toLowerCase() === "vi-vn" || v.lang.toLowerCase().startsWith("vi")))
      );
      if (viVoice) return viVoice;

      return voices[0] || null;
    } catch (e) {
      return null;
    }
  }

  function getBestVoice() {
    if (!cachedBestViVoice) {
      cachedBestViVoice = findBestVietnameseVoice();
    }
    return cachedBestViVoice;
  }

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      cachedBestViVoice = findBestVietnameseVoice();
    };
  }

  // ═══════════════ QUẢN LÝ WEBAUDIO CONTEXT & AUTO-RESUME ═══════════════
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

    // Bắt mọi sự kiện người dùng (chuột, chạm, phím, di chuột, chuyển tab, mạng khôi phục)
    ["click", "keydown", "touchstart", "pointerdown", "mousedown", "mousemove", "focus", "visibilitychange", "wheel", "online"].forEach((evt) => {
      document.addEventListener(evt, aggressiveAutoUnlock, { passive: true });
    });
  }

  // ═══════════════ AUDIO QUEUE MANAGER ═══════════════
  class AudioQueueManager {
    constructor({
      isEnabled,
      gapMs = 350,
      dedupWindowMs = 600,
      maxQueueSize = 50,
      watchdogTimeoutMs = DEFAULT_WATCHDOG_TIMEOUT_MS,
      networkTimeoutMs = DEFAULT_TTS_NETWORK_TIMEOUT_MS,
      playbackRate = DEFAULT_PLAYBACK_RATE,
      volume = DEFAULT_VOLUME,
      gainMultiplier = DEFAULT_GAIN_MULTIPLIER,
      onStart = null,
      onEnd = null,
      onQueueChange = null,
    } = {}) {
      this.isEnabled = typeof isEnabled === "function" ? isEnabled : () => true;
      this.gapMs = gapMs;
      this.dedupWindowMs = dedupWindowMs;
      this.maxQueueSize = maxQueueSize;
      this.watchdogTimeoutMs = watchdogTimeoutMs;
      this.networkTimeoutMs = networkTimeoutMs;
      this.playbackRate = playbackRate;
      this.volume = volume;
      this.gainMultiplier = gainMultiplier;
      this.onStart = typeof onStart === "function" ? onStart : null;
      this.onEnd = typeof onEnd === "function" ? onEnd : null;
      this.onQueueChange = typeof onQueueChange === "function" ? onQueueChange : null;

      this.queue = [];
      this.isPlaying = false;
      this.currentAudio = null;
      this.currentBufferSource = null;
      this.currentText = "";
      this.currentMeta = null;
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

    getQueueStatus() {
      return {
        isPlaying: this.isPlaying,
        currentText: this.currentText,
        currentMeta: this.currentMeta,
        queueLength: this.queue.length,
        queue: [...this.queue],
      };
    }

    prefetchNext() {
      try {
        if (this.queue.length > 0) {
          const nextItem = this.queue[0];
          const nextText = typeof nextItem === "string" ? nextItem : nextItem.text;
          if (nextText) {
            const cleanText = normalizeSpeakText(nextText);
            const prefetchAudio = new Audio(`/api/tts?text=${encodeURIComponent(cleanText)}`);
            prefetchAudio.preload = "auto";
          }
        }
      } catch (e) {}
    }

    enqueue(speakText, meta = null) {
      if (!this.isEnabled() || !speakText || !String(speakText).trim()) return false;

      // Kích hoạt lại pipeline âm thanh
      aggressiveAutoUnlock();

      const text = normalizeSpeakText(String(speakText));
      if (!text) return false;

      const now = Date.now();
      const isCurrent = this.isPlaying && this.currentText === text;
      const isQueued = this.queue.some(
        (item) => (typeof item === "string" ? item : item.text) === text
      );
      const isRecentlyEnqueued =
        this.lastEnqueuedText === text &&
        now - this.lastEnqueuedAt < this.dedupWindowMs;

      // Chống trùng lặp trong khoảng debounce
      if (isCurrent || isQueued || isRecentlyEnqueued) return false;

      if (this.queue.length >= this.maxQueueSize) {
        this.queue.shift();
      }

      const itemObj = { text, meta: meta || {}, enqueuedAt: now };
      this.queue.push(itemObj);
      this.lastEnqueuedText = text;
      this.lastEnqueuedAt = now;

      if (this.onQueueChange) {
        try {
          this.onQueueChange(this.getQueueStatus());
        } catch (e) {}
      }

      if (!this.isPlaying) {
        this.playNext();
      } else {
        this.prefetchNext();
      }
      return true;
    }

    playNext() {
      if (this.queue.length === 0) {
        this.isPlaying = false;
        this.currentAudio = null;
        this.currentBufferSource = null;
        this.currentText = "";
        this.currentMeta = null;

        if (this.onQueueChange) {
          try {
            this.onQueueChange(this.getQueueStatus());
          } catch (e) {}
        }
        return;
      }

      this.isPlaying = true;
      const itemObj = this.queue.shift();
      this.currentText = typeof itemObj === "string" ? itemObj : itemObj.text;
      this.currentMeta = typeof itemObj === "string" ? null : itemObj.meta;

      const textToSpeak = this.currentText;
      const currentMeta = this.currentMeta;
      const generation = this.generation;
      let advanced = false;
      let fallbackStarted = false;
      let networkTimer = null;

      if (this.onStart) {
        try {
          this.onStart({ text: textToSpeak, meta: currentMeta });
        } catch (e) {}
      }

      if (this.onQueueChange) {
        try {
          this.onQueueChange(this.getQueueStatus());
        } catch (e) {}
      }

      this.prefetchNext();

      if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
      this.watchdogTimer = setTimeout(() => {
        if (!advanced && generation === this.generation) {
          advance();
        }
      }, this.watchdogTimeoutMs);

      const advance = () => {
        if (advanced || generation !== this.generation) return;
        advanced = true;

        if (networkTimer) {
          clearTimeout(networkTimer);
          networkTimer = null;
        }

        if (this.watchdogTimer) {
          clearTimeout(this.watchdogTimer);
          this.watchdogTimer = null;
        }

        if (this.onEnd) {
          try {
            this.onEnd({ text: textToSpeak, meta: currentMeta });
          } catch (e) {}
        }

        setTimeout(() => {
          if (generation === this.generation) this.playNext();
        }, this.gapMs);
      };

      // ═══════════════ FALLBACK 3: TRÌNH DUYỆT SPEECH SYNTHESIS NATIVE (OFFLINE 100%) ═══════════════
      const fallbackToBrowserSpeech = () => {
        if (fallbackStarted || advanced || generation !== this.generation) return;
        fallbackStarted = true;

        if (networkTimer) {
          clearTimeout(networkTimer);
          networkTimer = null;
        }

        if (!("speechSynthesis" in global)) {
          advance();
          return;
        }

        try {
          global.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          const bestVoice = getBestVoice();
          if (bestVoice) {
            utterance.voice = bestVoice;
            utterance.lang = bestVoice.lang || "vi-VN";
          } else {
            utterance.lang = "vi-VN";
          }
          utterance.rate = this.playbackRate || DEFAULT_PLAYBACK_RATE;
          utterance.volume = Math.min(1.0, Math.max(0, this.volume || 1.0));
          utterance.pitch = 1.0;
          utterance.onend = advance;
          utterance.onerror = advance;
          global.speechSynthesis.speak(utterance);
        } catch (error) {
          advance();
        }
      };

      // ═══════════════ FALLBACK 2: WEB AUDIO API BUFFER (CÓ KHUẾCH ĐẠI GAIN) ═══════════════
      const fallbackToWebAudioBuffer = async () => {
        try {
          const ctx = getAudioContext();
          if (ctx) {
            if (ctx.state === "suspended") {
              await ctx.resume().catch(() => {});
            }

            const abortController = new AbortController();
            const fetchTimeout = setTimeout(() => abortController.abort(), this.networkTimeoutMs);

            const res = await fetch(`/api/tts?text=${encodeURIComponent(textToSpeak)}`, {
              signal: abortController.signal,
            });
            clearTimeout(fetchTimeout);

            if (!res.ok) throw new Error("TTS fetch failed");
            const arrayBuf = await res.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuf);

            if (advanced || generation !== this.generation) return;

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
          console.warn("[AudioQueue] Web Audio fallback chậm hoặc lỗi, chuyển sang SpeechSynthesis:", e);
        }
        fallbackToBrowserSpeech();
      };

      // ═══════════════ LỚP 1: PHÁT BẰNG THẺ HTML5 AUDIO (TTS CHUẨN BACKEND) ═══════════════
      try {
        const audio = new Audio(`/api/tts?text=${encodeURIComponent(textToSpeak)}`);
        this.currentAudio = audio;
        audio.volume = Math.min(1.0, Math.max(0, this.volume));
        audio.playbackRate = this.playbackRate;
        audio.defaultPlaybackRate = this.playbackRate;

        // Nếu quá networkTimeoutMs mà Audio chưa bắt đầu phát do mạng chậm -> kích hoạt fallback ngay
        let hasStartedPlaying = false;
        networkTimer = setTimeout(() => {
          if (!hasStartedPlaying && !advanced && generation === this.generation) {
            console.warn("[AudioQueue] Mạng chậm (quá 3.5s chưa tải xong audio), kích hoạt fallback giọng đọc tức thì...");
            if (this.currentAudio) {
              try { this.currentAudio.pause(); } catch (e) {}
              this.currentAudio = null;
            }
            fallbackToWebAudioBuffer();
          }
        }, this.networkTimeoutMs);

        const enforceRate = () => {
          try {
            audio.playbackRate = this.playbackRate;
          } catch (e) {}
        };
        audio.addEventListener("loadedmetadata", enforceRate);
        audio.addEventListener("playing", () => {
          hasStartedPlaying = true;
          if (networkTimer) {
            clearTimeout(networkTimer);
            networkTimer = null;
          }
          enforceRate();
        });

        audio.onended = advance;
        audio.onerror = () => {
          if (networkTimer) {
            clearTimeout(networkTimer);
            networkTimer = null;
          }
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
            if (networkTimer) {
              clearTimeout(networkTimer);
              networkTimer = null;
            }
            fallbackToWebAudioBuffer();
          });
        }
      } catch (error) {
        if (networkTimer) {
          clearTimeout(networkTimer);
          networkTimer = null;
        }
        fallbackToWebAudioBuffer();
      }
    }

    clear() {
      this.generation += 1;
      const prevItem = this.currentText
        ? { text: this.currentText, meta: this.currentMeta }
        : null;
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
      this.currentMeta = null;
      this.lastEnqueuedText = "";
      this.lastEnqueuedAt = 0;
      if ("speechSynthesis" in global) global.speechSynthesis.cancel();

      if (this.onEnd && prevItem) {
        try {
          this.onEnd(prevItem);
        } catch (e) {}
      }
      if (this.onQueueChange) {
        try {
          this.onQueueChange(this.getQueueStatus());
        } catch (e) {}
      }
    }
  }

  global.AudioQueueManager = AudioQueueManager;
  global.aggressiveAutoUnlock = aggressiveAutoUnlock;
  global.normalizeSpeakText = normalizeSpeakText;
})(window);
