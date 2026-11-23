/**
 * Devvit Web Bridge with Local Sandbox Fallback.
 * Allows seamless execution inside Reddit interactive posts (via /api/leaderboard & /api/score)
 * AND standalone browsers (e.g. GitHub Pages) with zero errors.
 */

import { PRNG } from "./prng";

export interface GameStats {
	played: number;
	won: number;
	currentStreak: number;
	maxStreak: number;
	lastPlayedDate: string;
	guessDistribution: Record<string, number>; // solve time brackets
}

export interface LeaderboardEntry {
	username: string;
	seconds: number;
	date: string;
	rank: number;
	isCurrentUser?: boolean;
}

export type LeaderboardSource = "live_api" | "local_fallback";

export interface LeaderboardResult {
	entries: LeaderboardEntry[];
	source: LeaderboardSource;
	date: string;
}

export interface RecordWinOptions {
	isPractice?: boolean;
	userGrid?: number[][];
}

export interface ShareTextOptions {
	isPractice?: boolean;
	difficultyLabel?: string;
	hintsUsed?: number;
}

interface LocalScoreMap {
	[dateStr: string]: number; // best solve time in seconds
}

const LOCAL_STATS_KEY = "karmagrid_stats";
const LOCAL_SCORES_KEY = "karmagrid_local_scores";

const COMMUNITY_BENCHMARK_USERS = [
	"u/SnooTactician",
	"u/LogicWizard42",
	"u/GridNinja_r",
	"u/KarmaSpeedrun",
	"u/SubredditSage",
	"u/StarCollector",
	"u/DailyPuzzler",
];

function safeGetStorage(key: string): string | null {
	try {
		if (typeof localStorage === "undefined") return null;
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function safeSetStorage(key: string, value: string): void {
	try {
		if (typeof localStorage === "undefined") return;
		localStorage.setItem(key, value);
	} catch {
		// Ignore storage quota or SSR environment errors
	}
}

function normalizeEntries(
	raw: unknown,
	dateStr: string,
): LeaderboardEntry[] | null {
	let list: unknown = null;

	if (Array.isArray(raw)) {
		list = raw;
	} else if (raw && typeof raw === "object") {
		const obj = raw as Record<string, unknown>;
		if (Array.isArray(obj.leaderboard)) {
			list = obj.leaderboard;
		} else if (Array.isArray(obj.entries)) {
			list = obj.entries;
		} else if (
			obj.data &&
			typeof obj.data === "object" &&
			Array.isArray((obj.data as Record<string, unknown>).leaderboard)
		) {
			list = (obj.data as Record<string, unknown>).leaderboard;
		} else if (
			obj.data &&
			typeof obj.data === "object" &&
			Array.isArray((obj.data as Record<string, unknown>).topSolves)
		) {
			list = (obj.data as Record<string, unknown>).topSolves;
		}
	}

	if (!Array.isArray(list)) return null;

	const entries: LeaderboardEntry[] = [];
	for (let i = 0; i < list.length; i++) {
		const item = list[i];
		if (!item || typeof item !== "object") continue;
		const rec = item as Record<string, unknown>;
		const rawName =
			typeof rec.username === "string"
				? rec.username
				: typeof rec.member === "string"
					? rec.member
					: null;
		const seconds =
			typeof rec.seconds === "number"
				? rec.seconds
				: typeof rec.score === "number"
					? rec.score
					: typeof rec.time === "number"
						? rec.time
						: null;

		if (!rawName || seconds === null || !Number.isFinite(seconds)) continue;

		entries.push({
			username: rawName.startsWith("u/") ? rawName : `u/${rawName}`,
			seconds: Math.max(0, Math.round(seconds)),
			date: typeof rec.date === "string" ? rec.date : dateStr,
			rank: typeof rec.rank === "number" ? rec.rank : i + 1,
			isCurrentUser: Boolean(rec.isCurrentUser),
		});
	}

	entries.sort((a, b) => a.seconds - b.seconds);
	return entries.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}

export class DevvitBridge {
	private static isDevvitEnv(): boolean {
		return typeof window !== "undefined" && window.parent !== window;
	}

	/**
	 * Loads user stats from local storage fallback (with safe defaults).
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
			const stored = safeGetStorage(LOCAL_STATS_KEY);
			if (stored) {
				const parsed = JSON.parse(stored) as Partial<GameStats>;
				return {
					...defaultStats,
					...parsed,
					guessDistribution: {
						...defaultStats.guessDistribution,
						...(parsed.guessDistribution ?? {}),
					},
				};
			}
		} catch (err) {
			console.warn("[DevvitBridge] Could not read localStorage stats:", err);
		}
		return defaultStats;
	}

	/**
	 * Saves updated game stats upon winning.
	 * Practice / Archive wins NEVER modify Daily streak or Daily stats.
	 */
	static recordWin(
		dateStr: string,
		secondsTaken: number,
		options?: RecordWinOptions,
	): GameStats {
		const stats = this.getStats();

		// Practice / Archive mode strictly preserves today's Daily streak and stats
		if (options?.isPractice) {
			return stats;
		}

		// Always record best local solve time for standalone leaderboard
		this.recordLocalScore(dateStr, secondsTaken);

		// Check if already won today to avoid double-counting streak
		if (stats.lastPlayedDate === dateStr) {
			return stats;
		}

		stats.played += 1;
		stats.won += 1;

		// Streak logic: check if last played date was yesterday
		const today = new Date(`${dateStr}T00:00:00Z`);
		const yesterday = new Date(today.getTime() - 86_400_000);
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

		safeSetStorage(LOCAL_STATS_KEY, JSON.stringify(stats));

		// If running in Devvit iframe, post message to Redis backend
		if (this.isDevvitEnv()) {
			window.parent.postMessage(
				{
					type: "DEVVIT_RECORD_WIN",
					data: {
						date: dateStr,
						seconds: secondsTaken,
						streak: stats.currentStreak,
						userGrid: options?.userGrid,
					},
				},
				"*",
			);
		}

		return stats;
	}

	/**
	 * Records the user's best local solve time for a daily date.
	 */
	static recordLocalScore(dateStr: string, secondsTaken: number): void {
		try {
			const raw = safeGetStorage(LOCAL_SCORES_KEY);
			const scores: LocalScoreMap = raw
				? (JSON.parse(raw) as LocalScoreMap)
				: {};
			const prev = scores[dateStr];
			if (prev === undefined || secondsTaken < prev) {
				scores[dateStr] = Math.max(1, Math.round(secondsTaken));
				safeSetStorage(LOCAL_SCORES_KEY, JSON.stringify(scores));
			}
		} catch {
			// Ignore malformed storage
		}
	}

	/**
	 * Reads the user's locally saved best solve time for a daily date, if any.
	 */
	static getLocalScore(dateStr: string): number | null {
		try {
			const raw = safeGetStorage(LOCAL_SCORES_KEY);
			if (!raw) return null;
			const scores = JSON.parse(raw) as LocalScoreMap;
			return typeof scores[dateStr] === "number" ? scores[dateStr] : null;
		} catch {
			return null;
		}
	}

	/**
	 * Generates deterministic local benchmark leaderboard merged with the player's local solve.
	 * Used cleanly when running standalone on GitHub Pages without a live Devvit server.
	 */
	static getLocalLeaderboard(dateStr: string): LeaderboardEntry[] {
		const prng = new PRNG(`leaderboard_${dateStr}`);
		const names = prng.shuffle([...COMMUNITY_BENCHMARK_USERS]).slice(0, 5);
		const entries: LeaderboardEntry[] = names.map((username, idx) => ({
			username,
			seconds: 22 + idx * 14 + prng.nextInt(0, 11),
			date: dateStr,
			rank: idx + 1,
			isCurrentUser: false,
		}));

		const myBest = this.getLocalScore(dateStr);
		if (myBest !== null) {
			entries.push({
				username: "u/You (Local)",
				seconds: myBest,
				date: dateStr,
				rank: 0,
				isCurrentUser: true,
			});
		}

		entries.sort((a, b) => a.seconds - b.seconds);
		return entries.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
	}

	/**
	 * Fetches daily leaderboard from live Devvit server `/api/leaderboard`,
	 * falling back cleanly to local leaderboard when running standalone (e.g. GitHub Pages).
	 */
	static async fetchLeaderboard(
		dateStr: string,
		fetchImpl?: typeof fetch,
	): Promise<LeaderboardResult> {
		const fetcher = fetchImpl ?? (typeof fetch === "function" ? fetch : null);

		if (fetcher) {
			const controller =
				typeof AbortController !== "undefined" ? new AbortController() : null;
			const timer = controller
				? setTimeout(() => controller.abort(), 2500)
				: null;

			try {
				const url = `/api/leaderboard?date=${encodeURIComponent(dateStr)}`;
				const response = await fetcher(url, {
					method: "GET",
					headers: { Accept: "application/json" },
					signal: controller?.signal,
				});

				if (response.ok) {
					const contentType = response.headers?.get("content-type") ?? "";
					if (
						contentType === "" ||
						contentType.toLowerCase().includes("application/json")
					) {
						const payload: unknown = await response.json();
						const entries = normalizeEntries(payload, dateStr);
						if (entries !== null) {
							return {
								entries,
								source: "live_api",
								date: dateStr,
							};
						}
					}
				}
			} catch {
				// Graceful fallback below
			} finally {
				if (timer) clearTimeout(timer);
			}
		}

		return {
			entries: this.getLocalLeaderboard(dateStr),
			source: "local_fallback",
			date: dateStr,
		};
	}

	/**
	 * Submits a verified Daily solve score to the live Devvit server `/api/score`.
	 * Silently falls back to local score persistence on standalone GitHub Pages.
	 */
	static async submitScore(
		dateStr: string,
		seconds: number,
		userGrid: number[][],
		isPractice: boolean = false,
		fetchImpl?: typeof fetch,
	): Promise<{ synced: boolean; rank?: number }> {
		if (isPractice) {
			return { synced: false };
		}

		this.recordLocalScore(dateStr, seconds);

		const fetcher = fetchImpl ?? (typeof fetch === "function" ? fetch : null);
		if (!fetcher) return { synced: false };

		const controller =
			typeof AbortController !== "undefined" ? new AbortController() : null;
		const timer = controller
			? setTimeout(() => controller.abort(), 2500)
			: null;

		try {
			const response = await fetcher("/api/score", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: JSON.stringify({
					date: dateStr,
					seconds,
					userGrid,
				}),
				signal: controller?.signal,
			});

			if (response.ok) {
				const contentType = response.headers?.get("content-type") ?? "";
				if (
					contentType === "" ||
					contentType.toLowerCase().includes("application/json")
				) {
					const data = (await response.json()) as {
						rank?: number;
						data?: { rank?: number };
					};
					return {
						synced: true,
						rank: data.rank ?? data.data?.rank,
					};
				}
			}
		} catch {
			// Standalone fallback — already stored locally
		} finally {
			if (timer) clearTimeout(timer);
		}

		return { synced: false };
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
		options?: ShareTextOptions,
	): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		const timeFormatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

		let gridEmojis = "";
		for (let r = 0; r < size; r++) {
			let rowStr = "";
			for (let c = 0; c < size; c++) {
				if (userGrid[r]?.[c] === 1) {
					rowStr += "⭐";
				} else {
					rowStr += "⬛";
				}
			}
			gridEmojis += rowStr + "\n";
		}

		const hintsUsed = options?.hintsUsed ?? 0;
		const hintLabel =
			hintsUsed === 0
				? "Solved without hints!"
				: `Solved with ${hintsUsed} deductive hint${hintsUsed === 1 ? "" : "s"}`;

		const header = options?.isPractice
			? `KarmaGrid Archive · ${options.difficultyLabel ?? `${size}×${size}`} (${dateStr})`
			: `KarmaGrid #${dayNumber} (${dateStr})`;

		return (
			`${header}\n` +
			`⏱️ ${timeFormatted} | ${hintLabel}\n\n` +
			`>!${gridEmojis.trim()}!<\n\n` +
			`Play the Daily Reddit Game: reddit.com/r/karmagrid`
		);
	}
}
