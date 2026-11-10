// Sound Synthesizer using Web Audio API (No external sound files required)
class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Knock/thud sound for hitting the coconut
  playHit(isCrit = false) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isCrit ? 'triangle' : 'sine';
    const startFreq = isCrit ? 260 : 180;
    const endFreq = isCrit ? 60 : 45;

    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.12);

    gain.gain.setValueAtTime(isCrit ? 0.45 : 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  // Crack / break sound when fully shattered
  playCrack() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // Crack noise burst
    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 800;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    whiteNoise.start(now);

    // Chime tone
    const chime = this.ctx.createOscillator();
    const chimeGain = this.ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(523.25, now); // C5
    chime.frequency.setValueAtTime(659.25, now + 0.08); // E5
    chimeGain.gain.setValueAtTime(0.2, now);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    chime.connect(chimeGain);
    chimeGain.connect(this.ctx.destination);

    chime.start(now);
    chime.stop(now + 0.36);
  }

  // Game over fanfare
  playGameOver() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const notes = [440, 392, 349.23, 293.66];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const time = this.ctx.currentTime + i * 0.16;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.25, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(time);
      osc.stop(time + 0.21);
    });
  }
}

// Game State & Logic
class CoconutBreaker {
  constructor() {
    // DOM Elements
    this.scoreEl = document.getElementById('score');
    this.smashedEl = document.getElementById('smashed-count');
    this.timerEl = document.getElementById('timer');
    this.hpTextEl = document.getElementById('hp-text');
    this.healthBarFill = document.getElementById('health-bar-fill');
    this.arena = document.getElementById('arena');
    this.coconut = document.getElementById('coconut');
    this.coconutWrap = document.getElementById('coconut-wrap');
    this.hammer = document.getElementById('hammer');
    this.comboBadge = document.getElementById('combo-badge');
    this.startBtn = document.getElementById('start-btn');
    this.resetBtn = document.getElementById('reset-btn');
    this.soundBtn = document.getElementById('sound-btn');

    // Modal elements
    this.modal = document.getElementById('game-over-modal');
    this.finalScoreEl = document.getElementById('final-score');
    this.finalSmashedEl = document.getElementById('final-smashed');
    this.finalStreakEl = document.getElementById('final-streak');
    this.playAgainBtn = document.getElementById('play-again-btn');

    // Sound system
    this.sound = new SoundFX();

    // Configuration & State
    this.maxTime = 30; // 30-second round
    this.timeLeft = this.maxTime;
    this.timerInterval = null;
    this.isPlaying = false;

    this.score = 0;
    this.smashedCount = 0;
    this.currentHp = 10;
    this.maxHp = 10;
    this.streak = 0;
    this.maxStreak = 0;
    this.lastHitTime = 0;

    this.initEvents();
    this.updateHUD();
  }

  initEvents() {
    // Start / Reset buttons
    this.startBtn.addEventListener('click', () => this.startGame());
    this.resetBtn.addEventListener('click', () => this.resetGame());
    this.playAgainBtn.addEventListener('click', () => {
      this.closeModal();
      this.startGame();
    });

    // Sound toggle
    this.soundBtn.addEventListener('click', () => {
      this.sound.enabled = !this.sound.enabled;
      this.soundBtn.textContent = this.sound.enabled ? '🔊' : '🔇';
      if (this.sound.enabled) this.sound.init();
    });

    // Hit coconut event (support mouse and touch)
    this.coconutWrap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.handleHit(e);
    });

    // Animate hammer position along with pointer inside arena
    this.arena.addEventListener('pointermove', (e) => {
      const rect = this.arena.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.hammer.style.display = 'block';
      this.hammer.style.left = `${x}px`;
      this.hammer.style.top = `${y}px`;
    });

    this.arena.addEventListener('pointerleave', () => {
      this.hammer.style.display = 'none';
    });
  }

  startGame() {
    this.resetGame();
    this.isPlaying = true;
    this.startBtn.disabled = true;
    this.startBtn.style.opacity = '0.6';
    this.sound.init();

    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      this.timerEl.textContent = `${this.timeLeft}s`;

      if (this.timeLeft <= 5) {
        this.timerEl.style.transform = 'scale(1.2)';
        setTimeout(() => this.timerEl.style.transform = 'scale(1)', 200);
      }

      if (this.timeLeft <= 0) {
        this.endGame();
      }
    }, 1000);
  }

  endGame() {
    this.isPlaying = false;
    clearInterval(this.timerInterval);
    this.startBtn.disabled = false;
    this.startBtn.style.opacity = '1';
    this.sound.playGameOver();

    // Show summary modal
    this.finalScoreEl.textContent = this.score;
    this.finalSmashedEl.textContent = this.smashedCount;
    this.finalStreakEl.textContent = this.maxStreak;
    this.modal.classList.remove('hidden');
  }

  closeModal() {
    this.modal.classList.add('hidden');
  }

  resetGame() {
    clearInterval(this.timerInterval);
    this.isPlaying = false;
    this.timeLeft = this.maxTime;
    this.score = 0;
    this.smashedCount = 0;
    this.streak = 0;
    this.maxStreak = 0;
    this.maxHp = 10;
    this.currentHp = this.maxHp;

    this.startBtn.disabled = false;
    this.startBtn.style.opacity = '1';
    this.timerEl.textContent = `${this.timeLeft}s`;
    this.resetCoconutVisual();
    this.updateHUD();
    this.closeModal();
  }

  handleHit(e) {
    if (!this.isPlaying) {
      // Auto-start if user immediately clicks on the coconut
      this.startGame();
    }

    const now = Date.now();
    // Fast tapping combo detector (hit within 500ms)
    if (now - this.lastHitTime < 500) {
      this.streak++;
    } else {
      this.streak = 1;
    }
    this.lastHitTime = now;
    if (this.streak > this.maxStreak) this.maxStreak = this.streak;

    // Critical hit chance (15%) or when streak >= 5
    const isCrit = Math.random() < 0.15 || this.streak >= 6;
    const damage = isCrit ? 2 : 1;

    // Score calculation with streak multiplier
    const multiplier = Math.min(Math.floor(this.streak / 3) + 1, 4);
    const earnedScore = (damage * 10) * multiplier;
    this.score += earnedScore;

    this.currentHp = Math.max(0, this.currentHp - damage);

    // Audio effect
    this.sound.playHit(isCrit);

    // Animations
    this.animateHammerSmash();
    this.animateShake();
    this.spawnDamagePopup(e, damage, isCrit);
    this.updateCracks();
    this.updateHUD();

    // Show combo badge
    if (multiplier > 1) {
      this.comboBadge.textContent = `COMBO x${multiplier}! 🔥`;
      this.comboBadge.classList.add('active');
      clearTimeout(this.comboTimeout);
      this.comboTimeout = setTimeout(() => {
        this.comboBadge.classList.remove('active');
      }, 700);
    }

    // Check if coconut is cracked open
    if (this.currentHp <= 0) {
      this.shatterCoconut();
    }
  }

  animateHammerSmash() {
    this.hammer.classList.add('smash-anim');
    setTimeout(() => {
      this.hammer.classList.remove('smash-anim');
    }, 90);
  }

  animateShake() {
    this.coconut.classList.remove('shake-hit');
    // Trigger reflow to restart animation
    void this.coconut.offsetWidth;
    this.coconut.classList.add('shake-hit');
  }

  updateCracks() {
    const hpPercent = (this.currentHp / this.maxHp) * 100;
    this.coconut.classList.remove('stage-0', 'stage-1', 'stage-2', 'stage-3', 'stage-4');

    if (hpPercent <= 0) {
      this.coconut.classList.add('stage-4');
    } else if (hpPercent <= 25) {
      this.coconut.classList.add('stage-3');
    } else if (hpPercent <= 50) {
      this.coconut.classList.add('stage-2');
    } else if (hpPercent <= 75) {
      this.coconut.classList.add('stage-1');
    } else {
      this.coconut.classList.add('stage-0');
    }
  }

  spawnDamagePopup(e, damage, isCrit) {
    const arenaRect = this.arena.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = `dmg-pop ${isCrit ? 'critical' : ''}`;
    pop.textContent = isCrit ? `CRIT! -${damage}` : `-${damage}`;

    const x = (e.clientX || arenaRect.left + arenaRect.width / 2) - arenaRect.left + (Math.random() * 30 - 15);
    const y = (e.clientY || arenaRect.top + arenaRect.height / 2) - arenaRect.top + (Math.random() * 20 - 10);

    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;

    this.arena.appendChild(pop);
    setTimeout(() => pop.remove(), 650);
  }

  shatterCoconut() {
    this.sound.playCrack();
    this.smashedCount++;
    this.score += 50; // Bonus for breaking a whole coconut

    // Spawn shards & water droplets
    this.spawnShatterParticles();

    // Scale up hardness for the next coconut slightly to add fun progression
    this.maxHp = Math.min(10 + Math.floor(this.smashedCount * 1.5), 25);
    this.currentHp = this.maxHp;

    // Quick burst effect
    this.coconut.style.transform = 'scale(1.25)';
    setTimeout(() => {
      this.coconut.style.transform = '';
      this.resetCoconutVisual();
      this.updateHUD();
    }, 180);
  }

  spawnShatterParticles() {
    const arenaRect = this.arena.getBoundingClientRect();
    const centerX = arenaRect.width / 2;
    const centerY = arenaRect.height / 2;

    // Shell Brown Shards
    for (let i = 0; i < 16; i++) {
      const shard = document.createElement('div');
      shard.className = 'shard';

      const angle = Math.random() * Math.PI * 2;
      const distance = 80 + Math.random() * 110;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;
      const rot = Math.random() * 720 - 360;

      const size = 8 + Math.random() * 16;
      shard.style.width = `${size}px`;
      shard.style.height = `${size * 0.8}px`;
      shard.style.backgroundColor = Math.random() > 0.4 ? '#45220a' : '#fffaf0';
      shard.style.left = `${centerX}px`;
      shard.style.top = `${centerY}px`;
      shard.style.setProperty('--tx', `${tx}px`);
      shard.style.setProperty('--ty', `${ty}px`);
      shard.style.setProperty('--rot', `${rot}deg`);

      this.arena.appendChild(shard);
      setTimeout(() => shard.remove(), 700);
    }

    // Refreshing Water splashes
    for (let i = 0; i < 10; i++) {
      const splash = document.createElement('div');
      splash.className = 'water-splash';

      const angle = Math.random() * Math.PI * 2;
      const distance = 50 + Math.random() * 90;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;

      splash.style.left = `${centerX}px`;
      splash.style.top = `${centerY}px`;
      splash.style.setProperty('--tx', `${tx}px`);
      splash.style.setProperty('--ty', `${ty}px`);

      this.arena.appendChild(splash);
      setTimeout(() => splash.remove(), 600);
    }
  }

  resetCoconutVisual() {
    this.coconut.classList.remove('stage-1', 'stage-2', 'stage-3', 'stage-4');
    this.coconut.classList.add('stage-0');
  }

  updateHUD() {
    this.scoreEl.textContent = this.score;
    this.smashedEl.textContent = this.smashedCount;
    this.hpTextEl.textContent = `${this.currentHp} / ${this.maxHp}`;

    const percentage = Math.max(0, (this.currentHp / this.maxHp) * 100);
    this.healthBarFill.style.width = `${percentage}%`;

    // Dynamic health bar color
    if (percentage > 50) {
      this.healthBarFill.style.background = 'linear-gradient(90deg, #22c55e, #84cc16)';
    } else if (percentage > 25) {
      this.healthBarFill.style.background = 'linear-gradient(90deg, #eab308, #f97316)';
    } else {
      this.healthBarFill.style.background = 'linear-gradient(90deg, #f97316, #ef4444)';
    }
  }
}

// Initialize game on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new CoconutBreaker();
});

