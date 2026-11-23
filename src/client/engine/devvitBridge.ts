/**
 * Devvit Web Bridge with Local Sandbox Fallback.
 * Allows seamless execution inside Reddit interactive posts AND local standalone browsers.
 */

export interface GameStats {
	played: number;
	won: number;
	currentStreak: number;
	maxStreak: number;
	lastPlayedDate: string;
	guessDistribution: Record<string, number>; // solve time brackets
}

export class DevvitBridge {
	private static isDevvitEnv(): boolean {
		return typeof window !== "undefined" && window.parent !== window;
	}

	/**
	 * Loads user stats from Devvit Redis or local storage fallback.
	 */
	static getStats(): GameStats {
		const defaultStats: GameStats = {
			played: 0,
			won: 0,
			currentStreak: 0,
			maxStreak: 0,
			lastPlayedDate: "",
			guessDistribution: {
				"<30s": 0,
				"30-60s": 0,
				"1-2m": 0,
				"2-3m": 0,
				">3m": 0,
			},
		};

		try {
			const stored = localStorage.getItem("karmagrid_stats");
			if (stored) {
				return { ...defaultStats, ...JSON.parse(stored) };
			}
		} catch (err) {
			console.warn("[DevvitBridge] Could not read localStorage stats:", err);
		}
		return defaultStats;
	}

	/**
	 * Saves updated game stats upon winning.
	 */
	static recordWin(dateStr: string, secondsTaken: number): GameStats {
		const stats = this.getStats();

		// Check if already won today to avoid double-counting streak
		if (stats.lastPlayedDate === dateStr) {
			return stats;
		}

		stats.played += 1;
		stats.won += 1;

		// Streak logic: check if last played date was yesterday
		const today = new Date(dateStr);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const yesterdayStr = yesterday.toISOString().split("T")[0];

		if (stats.lastPlayedDate === yesterdayStr) {
			stats.currentStreak += 1;
		} else {
			stats.currentStreak = 1;
		}

		if (stats.currentStreak > stats.maxStreak) {
			stats.maxStreak = stats.currentStreak;
		}

		stats.lastPlayedDate = dateStr;

		// Distribution
		if (secondsTaken < 30) stats.guessDistribution["<30s"] += 1;
		else if (secondsTaken <= 60) stats.guessDistribution["30-60s"] += 1;
		else if (secondsTaken <= 120) stats.guessDistribution["1-2m"] += 1;
		else if (secondsTaken <= 180) stats.guessDistribution["2-3m"] += 1;
		else stats.guessDistribution[">3m"] += 1;

		try {
			localStorage.setItem("karmagrid_stats", JSON.stringify(stats));
		} catch (err) {
			console.warn("[DevvitBridge] Could not save stats to localStorage:", err);
		}

		// If running in Devvit iframe, post message to Redis backend
		if (this.isDevvitEnv()) {
			window.parent.postMessage(
				{
					type: "DEVVIT_RECORD_WIN",
					data: {
						date: dateStr,
						seconds: secondsTaken,
						streak: stats.currentStreak,
					},
				},
				"*",
			);
		}

		return stats;
	}

	/**
	 * Generates formatted Reddit Markdown / Emoji Share text.
	 */
	static generateShareText(
		dayNumber: number,
		dateStr: string,
		seconds: number,
		userGrid: number[][],
		sectors: number[][],
		size: number,
	): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		const timeFormatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

		let gridEmojis = "";
		for (let r = 0; r < size; r++) {
			let rowStr = "";
			for (let c = 0; c < size; c++) {
				if (userGrid[r][c] === 1) {
					rowStr += "⭐";
				} else {
					rowStr += "⬛";
				}
			}
			gridEmojis += rowStr + "\n";
		}

		return (
			`KarmaGrid #${dayNumber} (${dateStr})\n` +
			`⏱️ ${timeFormatted} | Solved without hints!\n\n` +
			`>!${gridEmojis.trim()}!<\n\n` +
			`Play the Daily Reddit Game: reddit.com/r/karmagrid`
		);
	}
}
