/**
 * KarmaGrid Devvit Backend Handler.
 * Handles Webview RPC messages:
 * - INIT_GAME: Loads user streak and daily puzzle meta.
 * - DEVVIT_RECORD_WIN: Anti-cheat solution validation and leaderboard recording.
 * - GET_LEADERBOARD: Returns top 10 fastest solves for today.
 */

import { DailyGenerator } from "../client/engine/generator";
import { Solver } from "../client/engine/solver";
import {
	InMemoryRedisClient,
	KarmaGridRedisStore,
	type LeaderboardEntry,
	type MinimalRedisClient,
	type UserStatsRecord,
} from "./redisStore";

export interface DevvitIncomingMessage {
	type: "INIT_GAME" | "DEVVIT_RECORD_WIN" | "GET_LEADERBOARD";
	data?: {
		date?: string;
		seconds?: number;
		userGrid?: number[][];
		userId?: string;
		username?: string;
	};
}

export interface DevvitResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

export class KarmaGridServer {
	private store: KarmaGridRedisStore;

	constructor(redisClient?: MinimalRedisClient) {
		this.store = new KarmaGridRedisStore(
			redisClient ?? new InMemoryRedisClient(),
		);
	}

	/**
	 * Process incoming IPC messages from the Devvit Webview frontend.
	 */
	async handleMessage(
		message: DevvitIncomingMessage,
		contextUser?: { id: string; name: string },
	): Promise<DevvitResponse> {
		try {
			const userId = contextUser?.id || message.data?.userId || "anon_snoo";
			const username =
				contextUser?.name || message.data?.username || "KarmaPlayer";

			switch (message.type) {
				case "INIT_GAME": {
					const date =
						message.data?.date || new Date().toISOString().split("T")[0];
					const stats = await this.store.getUserStats(userId, username);
					const leaderboard = await this.store.getDailyLeaderboard(date, 5);
					return {
						success: true,
						data: {
							userStats: stats,
							topSolves: leaderboard,
						},
					};
				}

				case "DEVVIT_RECORD_WIN": {
					const { date, seconds, userGrid } = message.data || {};
					if (!date || typeof seconds !== "number") {
						return { success: false, error: "Missing date or solve time" };
					}

					// Anti-cheat verification if grid is provided
					if (userGrid) {
						const puzzle = DailyGenerator.generateForDate(date);
						const isValid = Solver.isSolved(
							userGrid,
							puzzle.sectors,
							puzzle.size,
						);
						if (!isValid) {
							return {
								success: false,
								error: "Invalid board solution rejected by anti-cheat",
							};
						}
					}

					// Record solve time on leaderboard
					const { rank, isNewBest } = await this.store.recordDailyScore(
						date,
						userId,
						username,
						seconds,
					);

					// Update daily streak
					const updatedStats = await this.store.updateUserStreak(
						userId,
						username,
						date,
					);
					const dailyTop = await this.store.getDailyLeaderboard(date, 10);

					return {
						success: true,
						data: {
							rank,
							isNewBest,
							stats: updatedStats,
							leaderboard: dailyTop,
						},
					};
				}

				case "GET_LEADERBOARD": {
					const date =
						message.data?.date || new Date().toISOString().split("T")[0];
					const leaderboard = await this.store.getDailyLeaderboard(date, 10);
					return {
						success: true,
						data: { leaderboard },
					};
				}

				default:
					return { success: false, error: "Unknown message type" };
			}
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return { success: false, error: errorMessage };
		}
	}

	getStore(): KarmaGridRedisStore {
		return this.store;
	}
}

// Global server instance
export const serverInstance = new KarmaGridServer();
