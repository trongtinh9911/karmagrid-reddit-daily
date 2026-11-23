/**
 * Procedural Web Audio API Sound Engine.
 * 100% self-contained, zero external audio assets, zero CORS or loading errors.
 */

class SoundEngine {
	private ctx: AudioContext | null = null;
	public enabled: boolean = true;

	private initCtx() {
		if (!this.ctx && typeof window !== "undefined") {
			const AudioCtx =
				window.AudioContext ||
				(window as unknown as { webkitAudioContext: typeof AudioContext })
					.webkitAudioContext;
			if (AudioCtx) {
				this.ctx = new AudioCtx();
			}
		}
		if (this.ctx && this.ctx.state === "suspended") {
			this.ctx.resume();
		}
	}

	/**
	 * Star placed - pleasant ascending tone
	 */
	playStar() {
		if (!this.enabled) return;
		this.initCtx();
		if (!this.ctx) return;

		const now = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();

		osc.type = "triangle";
		osc.frequency.setValueAtTime(523.25, now); // C5
		osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08); // E5

		gain.gain.setValueAtTime(0.15, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

		osc.connect(gain);
		gain.connect(this.ctx.destination);

		osc.start(now);
		osc.stop(now + 0.15);
	}

	/**
	 * Cross placed - crisp click
	 */
	playCross() {
		if (!this.enabled) return;
		this.initCtx();
		if (!this.ctx) return;

		const now = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();

		osc.type = "sine";
		osc.frequency.setValueAtTime(320, now);
		osc.frequency.exponentialRampToValueAtTime(180, now + 0.04);

		gain.gain.setValueAtTime(0.1, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

		osc.connect(gain);
		gain.connect(this.ctx.destination);

		osc.start(now);
		osc.stop(now + 0.05);
	}

	/**
	 * Cell cleared
	 */
	playClear() {
		if (!this.enabled) return;
		this.initCtx();
		if (!this.ctx) return;

		const now = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();

		osc.type = "sine";
		osc.frequency.setValueAtTime(260, now);
		osc.frequency.exponentialRampToValueAtTime(150, now + 0.04);

		gain.gain.setValueAtTime(0.08, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

		osc.connect(gain);
		gain.connect(this.ctx.destination);

		osc.start(now);
		osc.stop(now + 0.05);
	}

	/**
	 * Conflict buzzer
	 */
	playError() {
		if (!this.enabled) return;
		this.initCtx();
		if (!this.ctx) return;

		const now = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();

		osc.type = "sawtooth";
		osc.frequency.setValueAtTime(130, now);
		osc.frequency.linearRampToValueAtTime(110, now + 0.12);

		gain.gain.setValueAtTime(0.12, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

		osc.connect(gain);
		gain.connect(this.ctx.destination);

		osc.start(now);
		osc.stop(now + 0.12);
	}

	/**
	 * Victory Fanfare - 4-note harmonious arpeggio
	 */
	playVictory() {
		if (!this.enabled) return;
		this.initCtx();
		if (!this.ctx) return;

		const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
		const now = this.ctx.currentTime;

		notes.forEach((freq, idx) => {
			const osc = this.ctx!.createOscillator();
			const gain = this.ctx!.createGain();

			osc.type = "triangle";
			osc.frequency.setValueAtTime(freq, now + idx * 0.08);

			gain.gain.setValueAtTime(0.18, now + idx * 0.08);
			gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

			osc.connect(gain);
			gain.connect(this.ctx!.destination);

			osc.start(now + idx * 0.08);
			osc.stop(now + idx * 0.08 + 0.35);
		});
	}
}

export const soundEngine = new SoundEngine();
