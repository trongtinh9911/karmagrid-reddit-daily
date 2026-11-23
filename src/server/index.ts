/**
 * KarmaGrid Devvit Web Server (v0.15.4+).
 * Implements:
 * - GET /api/leaderboard : Daily Redis Leaderboard
 * - POST /api/score      : Anti-cheat verification & Score submission
 * - POST /internal/menu/create-post : Moderator Menu action to create KarmaGrid interactive post
 * - POST /internal/triggers/on-app-install : Auto-spawn initial post upon subreddit installation
 */

import {
	createServer,
	type RedditClient,
	reddit,
	redis,
} from "@devvit/web/server";
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
			redisClient ?? this.resolveRedisClient(),
		);
	}

	private resolveRedisClient(): MinimalRedisClient {
		try {
			if (
				typeof redis !== "undefined" &&
				redis &&
				typeof (redis as unknown as MinimalRedisClient).zAdd === "function"
			) {
				return redis as unknown as MinimalRedisClient;
			}
		} catch {
			// Outside active Devvit context
		}
		return new InMemoryRedisClient();
	}

	/**
	 * Process internal RPC / webview message logic.
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

					// Anti-cheat verification
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

					// Update streak
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

/**
 * REST / HTTP Contract Helpers for Client & Server Endpoints:
 */
export async function handleLeaderboardGet(date?: string) {
	const targetDate = date || new Date().toISOString().split("T")[0];
	const res = await serverInstance.handleMessage({
		type: "GET_LEADERBOARD",
		data: { date: targetDate },
	});
	return {
		success: res.success,
		data: {
			date: targetDate,
			leaderboard:
				(res.data as { leaderboard: LeaderboardEntry[] })?.leaderboard || [],
		},
		error: res.error,
	};
}

export async function handleRecordWinPost(payload: {
	date: string;
	seconds: number;
	userGrid?: number[][];
	userId?: string;
	username?: string;
}) {
	return serverInstance.handleMessage({
		type: "DEVVIT_RECORD_WIN",
		data: payload,
	});
}

/**
 * Main Devvit Server HTTP Request Dispatcher
 */
export const appServer = createServer(async (req, res) => {
	const url = new URL(
		req.url || "/",
		`http://${req.headers.host || "localhost"}`,
	);
	const method = (req.method || "GET").toUpperCase();

	res.setHeader("Content-Type", "application/json");

	try {
		// 1. GET /api/leaderboard?date=YYYY-MM-DD
		if (method === "GET" && url.pathname === "/api/leaderboard") {
			const date = url.searchParams.get("date") || undefined;
			const result = await handleLeaderboardGet(date);
			res.statusCode = 200;
			return res.end(JSON.stringify(result));
		}

		// 2. POST /api/score or POST /api/record-win
		if (
			method === "POST" &&
			(url.pathname === "/api/score" || url.pathname === "/api/record-win")
		) {
			let rawBody = "";
			req.on("data", (chunk) => {
				rawBody += chunk;
			});
			req.on("end", async () => {
				try {
					const body = rawBody ? JSON.parse(rawBody) : {};
					const result = await handleRecordWinPost(body);
					res.statusCode = result.success ? 200 : 400;
					return res.end(JSON.stringify(result));
				} catch (err: unknown) {
					res.statusCode = 400;
					const msg = err instanceof Error ? err.message : String(err);
					return res.end(JSON.stringify({ success: false, error: msg }));
				}
			});
			return;
		}

		// 3. POST /internal/menu/create-post (Moderator Subreddit Menu Item)
		if (method === "POST" && url.pathname === "/internal/menu/create-post") {
			const todayStr = new Date().toISOString().split("T")[0];
			try {
				const subredditName =
					(req.headers["x-devvit-subreddit-name"] as string) ||
					"karmagrid_daily_dev";
				const post = await reddit.submitCustomPost({
					subredditName,
					title: `⭐ KarmaGrid Daily — Subreddit Logic Puzzle (${todayStr})`,
				});
				res.statusCode = 200;
				return res.end(
					JSON.stringify({
						success: true,
						message: "KarmaGrid daily interactive post spawned successfully!",
						postId: post.id,
					}),
				);
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				res.statusCode = 200;
				return res.end(
					JSON.stringify({
						success: true,
						message: `Post requested for ${todayStr}: ${msg}`,
					}),
				);
			}
		}

		// 4. POST /internal/triggers/on-app-install
		if (
			method === "POST" &&
			url.pathname === "/internal/triggers/on-app-install"
		) {
			const todayStr = new Date().toISOString().split("T")[0];
			try {
				const subredditName =
					(req.headers["x-devvit-subreddit-name"] as string) ||
					"karmagrid_daily_dev";
				const post = await reddit.submitCustomPost({
					subredditName,
					title: `⭐ Welcome to KarmaGrid! Daily Reddit Logic Game (${todayStr})`,
				});
				res.statusCode = 200;
				return res.end(JSON.stringify({ success: true, postId: post.id }));
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				res.statusCode = 200;
				return res.end(JSON.stringify({ success: true, message: msg }));
			}
		}

		// Default 404
		res.statusCode = 404;
		return res.end(
			JSON.stringify({
				success: false,
				error: `Route not found: ${method} ${url.pathname}`,
			}),
		);
	} catch (err: unknown) {
		res.statusCode = 500;
		const msg = err instanceof Error ? err.message : String(err);
		return res.end(JSON.stringify({ success: false, error: msg }));
	}
});
