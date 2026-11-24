'use strict';
/* WuxiaAudio.js — Âm thanh tổng hợp bằng WebAudio, KHÔNG file audio.
   Nhóm Wuxia HUD / Quests / Audio / Game Loop.
   Mỗi SFX là oscillator + noise envelope ngắn khác nhau.
   Nhạc nền: vòng hợp âm pentatonic Trung Hoa (Cung–Thương–Giốc–Chủy–Vũ).
   Expose: window.PixiEngine.WuxiaAudio
   API: init(), playSfx(name), setMuted(bool), isMuted(), toggleMusic(),
        isMusicPlaying(), resume(), destroy() */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  window.PixiEngine.Wuxia = window.PixiEngine.Wuxia || {};
  var PE = window.PixiEngine;

  /* Thang ngũ cung Trung Hoa (C–D–E–G–A), lấy C4 làm gốc. */
  var PENTA = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
  /* Vòng hợp âm nền (Hz, gốc C): C – Am – F – G, mỗi hợp âm 4 nhịp. */
  var CHORDS = [
    [130.81, 261.63, 329.63], /* C */
    [110.00, 261.63, 329.63], /* Am */
    [87.31, 261.63, 349.23],  /* F */
    [98.00, 293.66, 392.00]   /* G */
  ];
  var MELODY = [0, 2, 4, 5, 4, 2, 1, 2, 4, 7, 5, 4, 2, 0, -1, -1];
  var BEAT_MS = 420;

  var Audio = {
    ctx: null, master: null, musicGain: null, sfxGain: null,
    muted: false, musicOn: false, _musicTimer: null, _melodyStep: 0,
    _noiseBuf: null, _inited: false,

    /* Tạo AudioContext. PHẢI gọi từ user gesture (chạm/click) lần đầu,
       nếu không trình duyệt giữ context ở trạng thái suspended. */
    init: function () {
      if (this._inited && this.ctx) { this.resume(); return true; }
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 1;
        this.sfxGain.connect(this.master);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.32;
        this.musicGain.connect(this.master);
        this._inited = true;
        this.resume();
        return true;
      } catch (e) {
        this.ctx = null;
        return false;
      }
    },

    resume: function () {
      if (this.ctx && this.ctx.state === 'suspended') {
        try {
          var p = this.ctx.resume();
          if (p && typeof p.catch === 'function') p.catch(function () { /* bỏ qua */ });
        } catch (e) { /* bỏ qua */ }
      }
      return !!(this.ctx && this.ctx.state === 'running');
    },

    setMuted: function (m) {
      this.muted = !!m;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
      }
      return this.muted;
    },

    isMuted: function () { return this.muted; },

    _tone: function (freq0, freq1, dur, type, vol, when, dest) {
      if (!this.ctx) return;
      try {
        var t = (when !== undefined) ? when : this.ctx.currentTime;
        var o = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(Math.max(1, freq0), t);
        if (freq1 && freq1 !== freq0) {
          o.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t + dur);
        }
        g.gain.setValueAtTime(vol || 0.08, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g);
        g.connect(dest || this.sfxGain);
        o.start(t);
        o.stop(t + dur + 0.03);
      } catch (e) { /* bỏ qua */ }
    },

    _noise: function (dur, vol, filterFreq, when, dest) {
      if (!this.ctx) return;
      try {
        if (!this._noiseBuf) {
          var len = Math.floor(this.ctx.sampleRate * 0.5);
          this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
          var data = this._noiseBuf.getChannelData(0);
          for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        }
        var t = (when !== undefined) ? when : this.ctx.currentTime;
        var src = this.ctx.createBufferSource();
        src.buffer = this._noiseBuf;
        var flt = this.ctx.createBiquadFilter();
        flt.type = 'bandpass';
        flt.frequency.value = filterFreq || 1200;
        flt.Q.value = 0.8;
        var g = this.ctx.createGain();
        g.gain.setValueAtTime(vol || 0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(flt);
        flt.connect(g);
        g.connect(dest || this.sfxGain);
        src.start(t);
        src.stop(t + dur + 0.03);
      } catch (e) { /* bỏ qua */ }
    },

    /* SFX: swing/hit/skill/fire/ice/thunder/heal/levelup/coin/boss/victory
       (+ pickup/death/quest/click/ult — dùng nội bộ). */
    playSfx: function (name) {
      if (!this.ctx || this.muted) return false;
      this.resume();
      var self = this;
      try {
        switch (name) {
          case 'swing':
            this._noise(0.09, 0.06, 2600);
            this._tone(720, 220, 0.1, 'sine', 0.04);
            break;
          case 'hit':
            this._tone(170, 55, 0.09, 'square', 0.09);
            this._noise(0.07, 0.08, 700);
            break;
          case 'skill':
            this._tone(220, 880, 0.28, 'sawtooth', 0.06);
            this._tone(440, 1320, 0.22, 'sine', 0.04);
            break;
          case 'ult':
            this._tone(80, 440, 0.7, 'sawtooth', 0.11);
            this._tone(120, 900, 0.6, 'sine', 0.07);
            this._noise(0.5, 0.05, 1800);
            break;
          case 'fire':
            this._noise(0.45, 0.14, 500);
            this._tone(180, 60, 0.4, 'sawtooth', 0.06);
            break;
          case 'ice':
            this._tone(1400, 2400, 0.3, 'sine', 0.06);
            this._tone(1800, 2600, 0.25, 'triangle', 0.04);
            this._noise(0.2, 0.03, 5000);
            break;
          case 'thunder':
            this._noise(0.28, 0.16, 300);
            this._tone(90, 35, 0.3, 'square', 0.1);
            break;
          case 'heal':
            this._tone(523, 784, 0.25, 'sine', 0.07);
            this._tone(784, 1046, 0.3, 'sine', 0.06);
            break;
          case 'levelup':
            this._tone(523, 523, 0.12, 'sine', 0.08);
            setTimeout(function () { self._tone(659, 659, 0.12, 'sine', 0.08); }, 110);
            setTimeout(function () { self._tone(784, 784, 0.2, 'sine', 0.08); }, 220);
            break;
          case 'coin':
          case 'pickup':
            this._tone(880, 1320, 0.14, 'sine', 0.06);
            break;
          case 'boss':
            this._tone(65, 45, 0.8, 'sawtooth', 0.12);
            this._tone(98, 65, 0.8, 'square', 0.06);
            this._noise(0.6, 0.06, 250);
            break;
          case 'victory':
            [523, 659, 784, 1046].forEach(function (f, i) {
              setTimeout(function () { self._tone(f, f, 0.28, 'triangle', 0.09); }, i * 160);
            });
            break;
          case 'death':
            this._tone(300, 40, 0.35, 'sawtooth', 0.07);
            break;
          case 'quest':
            this._tone(660, 660, 0.12, 'sine', 0.07);
            setTimeout(function () { self._tone(990, 990, 0.2, 'sine', 0.07); }, 120);
            break;
          case 'click':
            this._tone(600, 500, 0.05, 'sine', 0.04);
            break;
          default:
            this._tone(440, 440, 0.08, 'sine', 0.05);
            return false;
        }
        return true;
      } catch (e) { return false; }
    },

    /* Nhạc nền: 1 nốt melody pentatonic + 1 hợp âm trầm mỗi nhịp.
       Dùng setInterval; dừng hẳn khi tắt để không tốn CPU. */
    toggleMusic: function () {
      if (this.musicOn) { this._stopMusic(); return false; }
      if (!this.ctx) { if (!this.init()) return false; }
      this.resume();
      this.musicOn = true;
      this._melodyStep = 0;
      var self = this;
      this._musicTimer = setInterval(function () { self._musicBeat(); }, BEAT_MS);
      this._musicBeat();
      return true;
    },

    isMusicPlaying: function () { return this.musicOn; },

    _musicBeat: function () {
      if (!this.ctx || !this.musicOn || this.muted) return;
      try {
        var step = this._melodyStep++;
        var chord = CHORDS[Math.floor(step / 4) % CHORDS.length];
        var t = this.ctx.currentTime;
        /* hợp âm trầm ở đầu mỗi 4 nhịp */
        if (step % 4 === 0) {
          for (var c = 0; c < chord.length; c++) {
            this._tone(chord[c], chord[c], BEAT_MS * 4 / 1000, 'triangle', 0.05, t, this.musicGain);
          }
        }
        /* melody pentatonic, nốt -1 = nghỉ */
        var mi = MELODY[step % MELODY.length];
        if (mi >= 0) {
          var f = PENTA[mi % PENTA.length];
          this._tone(f, f, BEAT_MS / 1000 * 0.9, 'sine', 0.09, t, this.musicGain);
          this._tone(f * 2, f * 2, BEAT_MS / 1000 * 0.5, 'triangle', 0.025, t, this.musicGain);
        }
      } catch (e) { /* bỏ qua */ }
    },

    _stopMusic: function () {
      this.musicOn = false;
      if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    },

    destroy: function () {
      this._stopMusic();
      if (this.ctx) {
        try { this.ctx.close(); } catch (e) { /* bỏ qua */ }
      }
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this._noiseBuf = null;
      this._inited = false;
    }
  };

  PE.WuxiaAudio = Audio;
  PE.Wuxia.Audio = Audio;
})();
