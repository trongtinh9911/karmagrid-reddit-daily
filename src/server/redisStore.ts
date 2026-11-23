/**
 * Redis Store abstraction for KarmaGrid Devvit backend.
 * Supports Devvit Redis Client with seamless In-Memory fallback for local tests and mocks.
 */

export interface LeaderboardEntry {
	username: string;
	seconds: number;
	date: string;
	rank: number;
}

export interface UserStatsRecord {
	username: string;
	currentStreak: number;
	maxStreak: number;
	lastPlayedDate: string;
	totalWins: number;
}

export interface MinimalRedisClient {
	zAdd(key: string, member: { member: string; score: number }): Promise<number>;
	zRange(
		key: string,
		start: number,
		stop: number,
		options?: { by?: "score"; reverse?: boolean },
	): Promise<{ member: string; score: number }[]>;
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<string | null>;
	hGet(key: string, field: string): Promise<string | undefined>;
	hSet(key: string, data: Record<string, string>): Promise<number>;
}

export class InMemoryRedisClient implements MinimalRedisClient {
	private strings = new Map<string, string>();
	private hashes = new Map<string, Map<string, string>>();
	private sortedSets = new Map<string, Map<string, number>>();

	async zAdd(
		key: string,
		member: { member: string; score: number },
	): Promise<number> {
		if (!this.sortedSets.has(key)) {
			this.sortedSets.set(key, new Map());
		}
		const set = this.sortedSets.get(key)!;
		const isNew = !set.has(member.member);
		set.set(member.member, member.score);
		return isNew ? 1 : 0;
	}

	async zRange(
		key: string,
		start: number,
		stop: number,
		options?: { by?: "score"; reverse?: boolean },
	): Promise<{ member: string; score: number }[]> {
		const set = this.sortedSets.get(key);
		if (!set) return [];

		const entries = Array.from(set.entries()).map(([member, score]) => ({
			member,
			score,
		}));

		if (options?.reverse) {
			entries.sort((a, b) => b.score - a.score);
		} else {
			entries.sort((a, b) => a.score - b.score);
		}

		const actualStop = stop < 0 ? entries.length + stop + 1 : stop + 1;
		return entries.slice(start, actualStop);
	}

	async get(key: string): Promise<string | null> {
		return this.strings.get(key) ?? null;
	}

	async set(key: string, value: string): Promise<string | null> {
		this.strings.set(key, value);
		return "OK";
	}

	async hGet(key: string, field: string): Promise<string | undefined> {
		return this.hashes.get(key)?.get(field);
	}

	async hSet(key: string, data: Record<string, string>): Promise<number> {
		if (!this.hashes.has(key)) {
			this.hashes.set(key, new Map());
		}
		const hash = this.hashes.get(key)!;
		let added = 0;
		for (const [k, v] of Object.entries(data)) {
			if (!hash.has(k)) added++;
			hash.set(k, v);
		}
		return added;
	}
}

export class KarmaGridRedisStore {
	private redis: MinimalRedisClient;

	constructor(redisClient?: MinimalRedisClient) {
		this.redis = redisClient ?? new InMemoryRedisClient();
	}

	private dailyKey(date: string): string {
		return `karmagrid:daily:${date}:leaderboard`;
	}

	private userKey(userId: string): string {
		return `karmagrid:user:${userId}:stats`;
	}

	/**
	 * Record a player's solve time on the daily leaderboard.
	 * Only updates if this is the player's best time for the day.
	 */
	async recordDailyScore(
		date: string,
		userId: string,
		username: string,
		seconds: number,
	): Promise<{ rank: number; isNewBest: boolean }> {
		const key = this.dailyKey(date);
		const memberKey = `${userId}:${username}`;

		// Read existing score
		const currentRange = await this.redis.zRange(key, 0, -1);
		const existing = currentRange.find((e) =>
			e.member.startsWith(`${userId}:`),
		);

		let isNewBest = false;
		if (!existing || seconds < existing.score) {
			await this.redis.zAdd(key, { member: memberKey, score: seconds });
			isNewBest = true;
		}

		// Calculate rank
		const allEntries = await this.redis.zRange(key, 0, -1);
		const rankIndex = allEntries.findIndex((e) => e.member === memberKey);
		const rank = rankIndex >= 0 ? rankIndex + 1 : 1;

		return { rank, isNewBest };
	}

	/**
	 * Fetch top solves for a given day.
	 */
	async getDailyLeaderboard(
		date: string,
		limit: number = 10,
	): Promise<LeaderboardEntry[]> {
		const key = this.dailyKey(date);
		const entries = await this.redis.zRange(key, 0, limit - 1);

		return entries.map((entry, idx) => {
			const parts = entry.member.split(":");
			const username = parts.length > 1 ? parts.slice(1).join(":") : parts[0];
			return {
				username: `u/${username}`,
				seconds: entry.score,
				date,
				rank: idx + 1,
			};
		});
	}

	/**
	 * Updates the player's daily streak.
	 */
	async updateUserStreak(
		userId: string,
		username: string,
		dateStr: string,
	): Promise<UserStatsRecord> {
		const key = this.userKey(userId);
		const rawStreak = await this.redis.hGet(key, "currentStreak");
		const rawMax = await this.redis.hGet(key, "maxStreak");
		const rawLast = await this.redis.hGet(key, "lastPlayedDate");
		const rawWins = await this.redis.hGet(key, "totalWins");

		let currentStreak = rawStreak ? parseInt(rawStreak, 10) : 0;
		let maxStreak = rawMax ? parseInt(rawMax, 10) : 0;
		const lastPlayedDate = rawLast ?? "";
		let totalWins = rawWins ? parseInt(rawWins, 10) : 0;

		if (lastPlayedDate !== dateStr) {
			const today = new Date(dateStr);
			const yesterday = new Date(today);
			yesterday.setDate(yesterday.getDate() - 1);
			const yesterdayStr = yesterday.toISOString().split("T")[0];

			if (lastPlayedDate === yesterdayStr) {
				currentStreak += 1;
			} else {
				currentStreak = 1;
			}

			if (currentStreak > maxStreak) {
				maxStreak = currentStreak;
			}

			totalWins += 1;

			await this.redis.hSet(key, {
				username,
				currentStreak: currentStreak.toString(),
				maxStreak: maxStreak.toString(),
				lastPlayedDate: dateStr,
				totalWins: totalWins.toString(),
			});
		}

		return {
			username,
			currentStreak,
			maxStreak,
			lastPlayedDate: dateStr,
			totalWins,
		};
	}

	/**
	 * Get user stats record.
	 */
	async getUserStats(
		userId: string,
		username: string,
	): Promise<UserStatsRecord> {
		const key = this.userKey(userId);
		const rawStreak = await this.redis.hGet(key, "currentStreak");
		const rawMax = await this.redis.hGet(key, "maxStreak");
		const rawLast = await this.redis.hGet(key, "lastPlayedDate");
		const rawWins = await this.redis.hGet(key, "totalWins");

		return {
			username,
			currentStreak: rawStreak ? parseInt(rawStreak, 10) : 0,
			maxStreak: rawMax ? parseInt(rawMax, 10) : 0,
			lastPlayedDate: rawLast ?? "",
			totalWins: rawWins ? parseInt(rawWins, 10) : 0,
		};
	}
}
