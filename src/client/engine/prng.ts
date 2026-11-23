/**
 * Deterministic PRNG using Mulberry32 algorithm.
 * Guarantees identical sequence across all platforms for a given seed.
 */
export class PRNG {
	private state: number;

	constructor(seed: number | string) {
		if (typeof seed === "string") {
			let hash = 0;
			for (let i = 0; i < seed.length; i++) {
				hash = (hash << 5) - hash + seed.charCodeAt(i);
				hash |= 0;
			}
			this.state = hash >>> 0;
		} else {
			this.state = seed >>> 0;
		}
	}

	/**
	 * Generates a float in [0, 1)
	 */
	next(): number {
		let t = (this.state += 0x6d2b79f5);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	/**
	 * Generates integer in [min, max]
	 */
	nextInt(min: number, max: number): number {
		return Math.floor(this.next() * (max - min + 1)) + min;
	}

	/**
	 * Randomly shuffles an array in-place
	 */
	shuffle<T>(array: T[]): T[] {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(this.next() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
		return array;
	}
}
