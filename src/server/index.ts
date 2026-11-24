/**
 * KarmaGrid Devvit Web Server (v0.15.4+).
 * Implements:
 * - GET /api/leaderboard : Daily Redis Leaderboard
 * - POST /api/score      : Anti-cheat verification & Score submission
 * - POST /internal/menu/create-post        : Moderator Menu action to create KarmaGrid interactive post
 * - POST /internal/triggers/on-app-install : Auto-spawn initial post upon install/upgrade (Redis deduped)
 * - POST /internal/scheduler/daily-post    : Daily 00:00 UTC cron job to publish fresh puzzle post (Redis deduped)
 */

import type { IncomingHttpHeaders } from "node:http";
import {
	context,
	createServer,
	getServerPort,
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

export const DAILY_POST_DEDUP_PREFIX = "karmagrid:posted:";

export interface DedupRedisClient {
	get(key: string): Promise<string | null | undefined>;
	set(key: string, value: string): Promise<string | null | undefined>;
}

export interface RedditPostCreator {
	submitCustomPost(options: {
		subredditName: string;
		title: string;
	}): Promise<{ id?: string; url?: string }>;
}

export interface DailyPostResult {
	status: "success" | "skipped" | "error";
	created: boolean;
	date: string;
	dedupKey: string;
	subredditName: string;
	postId?: string;
	url?: string;
	reason?: string;
	message?: string;
}

export interface ServerRouteDependencies {
	redditClient?: RedditPostCreator;
	redisClient?: DedupRedisClient;
	getSubredditName?: (headers: IncomingHttpHeaders) => string;
	now?: () => Date;
}

export function getDailyPostDedupKey(dateStr: string): string {
	return `${DAILY_POST_DEDUP_PREFIX}${dateStr}`;
}

export function formatDailyPostTitle(dateStr: string): string {
	return `⭐ KarmaGrid Daily — Subreddit Logic Puzzle (${dateStr})`;
}

export function resolveSubredditName(
	headers: IncomingHttpHeaders,
	fallback: string = "karmagrid_daily_dev",
): string {
	const rawHeader =
		headers["devvit-subreddit-name"] ?? headers["x-devvit-subreddit-name"];
	const headerName = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
	try {
		return context.subredditName || headerName || fallback;
	} catch {
		return headerName || fallback;
	}
}

/**
 * Shared daily puzzle post creator with Redis deduplication (`karmagrid:posted:YYYY-MM-DD`).
 * Used by both `POST /internal/scheduler/daily-post` (00:00 UTC cron)
 * and `POST /internal/triggers/on-app-install` (`onAppInstall` / `onAppUpgrade`).
 */
export async function ensureDailyPost(options: {
	subredditName: string;
	source: "scheduler" | "trigger";
	dateStr?: string;
	redditClient?: RedditPostCreator;
	redisClient?: DedupRedisClient;
	now?: () => Date;
}): Promise<DailyPostResult> {
	const dateStr =
		options.dateStr ||
		(options.now ? options.now() : new Date()).toISOString().split("T")[0];
	const dedupKey = getDailyPostDedupKey(dateStr);
	const redisClient: DedupRedisClient = options.redisClient ?? redis;
	const redditClient: RedditPostCreator = options.redditClient ?? reddit;

	try {
		const existingPostId = await redisClient.get(dedupKey);
		if (existingPostId) {
			console.log(
				`[KarmaGrid] ${options.source} skipped duplicate post for ${dateStr} (already recorded in Redis: ${dedupKey} = ${existingPostId})`,
			);
			return {
				status: "skipped",
				created: false,
				date: dateStr,
				dedupKey,
				subredditName: options.subredditName,
				postId: existingPostId,
				reason: "already_posted_today",
			};
		}
	} catch (redisReadErr: unknown) {
		const msg =
			redisReadErr instanceof Error
				? redisReadErr.message
				: String(redisReadErr);
		console.warn(
			`[KarmaGrid] ${options.source} Redis dedup read failed for ${dedupKey}: ${msg}`,
		);
	}

	try {
		const post = await redditClient.submitCustomPost({
			subredditName: options.subredditName,
			title: formatDailyPostTitle(dateStr),
		});
		const shortId = String(post.id || "").replace(/^t3_/, "");
		const postUrl =
			post.url ||
			`https://reddit.com/r/${options.subredditName}/comments/${shortId}`;

		try {
			await redisClient.set(dedupKey, String(post.id || postUrl || "posted"));
		} catch (redisWriteErr: unknown) {
			const msg =
				redisWriteErr instanceof Error
					? redisWriteErr.message
					: String(redisWriteErr);
			console.warn(
				`[KarmaGrid] ${options.source} Redis dedup write failed for ${dedupKey}: ${msg}`,
			);
		}

		console.log(
			`[KarmaGrid] ${options.source} created post ${post.id} in r/${options.subredditName} (${dateStr}): ${postUrl}`,
		);

		return {
			status: "success",
			created: true,
			date: dateStr,
			dedupKey,
			subredditName: options.subredditName,
			postId: post.id,
			url: postUrl,
		};
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(
			`[KarmaGrid] ${options.source} daily post creation failed for ${dateStr}:`,
			msg,
		);
		return {
			status: "error",
			created: false,
			date: dateStr,
			dedupKey,
			subredditName: options.subredditName,
			message: msg,
		};
	}
}

/**
 * Main Devvit Server HTTP Request Dispatcher Factory
 */
export function createKarmaGridServer(deps: ServerRouteDependencies = {}) {
	return createServer(async (req, res) => {
		const url = new URL(
			req.url || "/",
			`http://${req.headers.host || "localhost"}`,
		);
		const method = (req.method || "GET").toUpperCase();
		const getSubreddit =
			deps.getSubredditName ?? ((headers) => resolveSubredditName(headers));
		const nowFn = deps.now ?? (() => new Date());

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
				const todayStr = nowFn().toISOString().split("T")[0];
				const subredditName = getSubreddit(req.headers);
				const redditClient: RedditPostCreator = deps.redditClient ?? reddit;
				const redisClient: DedupRedisClient = deps.redisClient ?? redis;
				try {
					const post = await redditClient.submitCustomPost({
						subredditName,
						title: formatDailyPostTitle(todayStr),
					});
					const shortId = String(post.id || "").replace(/^t3_/, "");
					const postUrl =
						post.url ||
						`https://reddit.com/r/${subredditName}/comments/${shortId}`;
					try {
						await redisClient.set(
							getDailyPostDedupKey(todayStr),
							String(post.id || postUrl || "posted"),
						);
					} catch {
						// Best-effort dedup mark on manual menu creation
					}
					console.log(
						`[KarmaGrid] Menu created post ${post.id} in r/${subredditName}: ${postUrl}`,
					);
					res.statusCode = 200;
					return res.end(
						JSON.stringify({
							navigateTo: postUrl,
							showToast: {
								text: "KarmaGrid Daily post created!",
								appearance: "success",
							},
						}),
					);
				} catch (err: unknown) {
					const msg = err instanceof Error ? err.message : String(err);
					console.error("[KarmaGrid] Menu create-post failed:", msg);
					res.statusCode = 200;
					return res.end(
						JSON.stringify({
							showToast: `Could not create KarmaGrid post: ${msg}`,
						}),
					);
				}
			}

			// 4. POST /internal/triggers/on-app-install (also handles onAppUpgrade)
			if (
				method === "POST" &&
				url.pathname === "/internal/triggers/on-app-install"
			) {
				const subredditName = getSubreddit(req.headers);
				const result = await ensureDailyPost({
					subredditName,
					source: "trigger",
					redditClient: deps.redditClient,
					redisClient: deps.redisClient,
					now: nowFn,
				});
				res.statusCode = 200;
				return res.end(JSON.stringify(result));
			}

			// 5. POST /internal/scheduler/daily-post (Daily 00:00 UTC Cron Scheduler)
			if (
				method === "POST" &&
				url.pathname === "/internal/scheduler/daily-post"
			) {
				const subredditName = getSubreddit(req.headers);
				const result = await ensureDailyPost({
					subredditName,
					source: "scheduler",
					redditClient: deps.redditClient,
					redisClient: deps.redisClient,
					now: nowFn,
				});
				res.statusCode = result.status === "error" ? 500 : 200;
				return res.end(JSON.stringify(result));
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
}

export const appServer = createKarmaGridServer();

if (!process.env.VITEST) {
	const port = getServerPort();
	appServer.on("error", (err) => {
		console.error("[KarmaGrid Server] error:", err);
	});
	appServer.listen(port, () => {
		console.log(`[KarmaGrid Server] listening on port ${port}`);
	});
}
