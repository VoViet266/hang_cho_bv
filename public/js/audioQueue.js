(function (global) {
  const DEFAULT_DEDUP_WINDOW_MS = 4500;
  const DEFAULT_MAX_QUEUE_SIZE = 10;
  const DEFAULT_WATCHDOG_TIMEOUT_MS = 15000;

  class AudioQueueManager {
    constructor({
      isEnabled,
      gapMs = 350,
      dedupWindowMs = DEFAULT_DEDUP_WINDOW_MS,
      maxQueueSize = DEFAULT_MAX_QUEUE_SIZE,
      watchdogTimeoutMs = DEFAULT_WATCHDOG_TIMEOUT_MS,
    } = {}) {
      this.isEnabled = typeof isEnabled === "function" ? isEnabled : () => true;
      this.gapMs = gapMs;
      this.dedupWindowMs = dedupWindowMs;
      this.maxQueueSize = maxQueueSize;
      this.watchdogTimeoutMs = watchdogTimeoutMs;
      this.queue = [];
      this.isPlaying = false;
      this.currentAudio = null;
      this.currentText = "";
      this.lastEnqueuedText = "";
      this.lastEnqueuedAt = 0;
      this.generation = 0;
      this.watchdogTimer = null;
    }

    enqueue(speakText) {
      if (!this.isEnabled() || !speakText || !speakText.trim()) return false;

      const text = speakText.trim();
      const now = Date.now();
      const isCurrent = this.isPlaying && this.currentText === text;
      const isQueued = this.queue.includes(text);
      const isRecentlyEnqueued = this.lastEnqueuedText === text &&
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
        if (fallbackStarted || advanced || generation !== this.generation) return;
        fallbackStarted = true;

        if (!("speechSynthesis" in global)) {
          advance();
          return;
        }

        try {
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.lang = "vi-VN";
          utterance.onend = advance;
          utterance.onerror = advance;
          global.speechSynthesis.speak(utterance);
        } catch (error) {
          advance();
        }
      };

      try {
        this.currentAudio = new Audio(`/api/tts?text=${encodeURIComponent(textToSpeak)}`);
        this.currentAudio.volume = 1;
        this.currentAudio.onended = advance;
        this.currentAudio.onerror = fallbackToBrowserSpeech;
        this.currentAudio.play().catch(fallbackToBrowserSpeech);
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
