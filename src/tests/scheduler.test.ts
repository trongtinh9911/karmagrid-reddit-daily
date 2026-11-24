import fs from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	createKarmaGridServer,
	formatDailyPostTitle,
	getDailyPostDedupKey,
	type RedditPostCreator,
} from "../server/index";
import { InMemoryRedisClient } from "../server/redisStore";

interface DevvitConfig {
	name: string;
	post: {
		dir: string;
		entrypoints: Record<string, { entry: string; height?: string }>;
	};
	server: {
		dir: string;
		entry: string;
	};
	permissions: {
		redis?: boolean;
		reddit?: boolean | { enable?: boolean };
	};
	menu?: {
		items: Array<{
			label: string;
			endpoint: string;
			location: string;
		}>;
	};
	triggers?: {
		onAppInstall?: string;
		onAppUpgrade?: string;
	};
	scheduler?: {
		tasks: Record<
			string,
			{
				endpoint: string;
				cron?: string;
				data?: Record<string, unknown>;
			}
		>;
	};
}

const DEVVIT_TEST_HEADERS = {
	"Content-Type": "application/json",
	"devvit-subreddit": "t5_karmagrid",
	"devvit-subreddit-name": "karmagrid_daily_dev",
};

function loadDevvitConfig(): DevvitConfig {
	const configPath = path.resolve(process.cwd(), "devvit.json");
	return JSON.parse(fs.readFileSync(configPath, "utf8")) as DevvitConfig;
}

async function withTestServer<T>(
	server: ReturnType<typeof createKarmaGridServer>,
	fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", () => resolve());
	});
	const address = server.address() as AddressInfo;
	const baseUrl = `http://127.0.0.1:${address.port}`;
	try {
		return await fn(baseUrl);
	} finally {
		server.closeAllConnections?.();
		await new Promise<void>((resolve, reject) => {
			server.close((err) => (err ? reject(err) : resolve()));
		});
	}
}

describe("devvit.json Cron Scheduler Configuration", () => {
	it("defines a valid 00:00 UTC daily cron task pointing to /internal/scheduler/daily-post", () => {
		const config = loadDevvitConfig();

		expect(config.scheduler).toBeDefined();
		expect(config.scheduler?.tasks).toBeDefined();

		const tasks = Object.entries(config.scheduler?.tasks || {});
		expect(tasks.length).toBeGreaterThanOrEqual(1);

		const dailyTaskEntry = tasks.find(
			([, task]) => task.endpoint === "/internal/scheduler/daily-post",
		);
		expect(dailyTaskEntry).toBeDefined();

		const [, dailyTask] = dailyTaskEntry!;
		expect(dailyTask.endpoint).toBe("/internal/scheduler/daily-post");
		expect(dailyTask.endpoint).toMatch(/^\/internal\/.+/);
		expect(dailyTask.cron).toBe("0 0 * * *");
	});

	it("keeps permissions, post/server dirs, menu, and install/upgrade triggers intact", () => {
		const config = loadDevvitConfig();

		expect(config.permissions.redis).toBe(true);
		expect(config.permissions.reddit).toEqual({ enable: true });
		expect(config.post.dir).toBe("dist/client");
		expect(config.server.dir).toBe("dist/server");
		expect(
			config.menu?.items.some(
				(item) => item.endpoint === "/internal/menu/create-post",
			),
		).toBe(true);
		expect(config.triggers?.onAppInstall).toBe(
			"/internal/triggers/on-app-install",
		);
		expect(config.triggers?.onAppUpgrade).toBe(
			"/internal/triggers/on-app-install",
		);
	});
});

describe("POST /internal/scheduler/daily-post & Shared Redis Deduplication", () => {
	it("publishes a daily custom post and records karmagrid:posted:<YYYY-MM-DD> in Redis", async () => {
		const redisClient = new InMemoryRedisClient();
		const submitCustomPost = vi.fn().mockResolvedValue({
			id: "t3_cron001",
			url: "https://reddit.com/r/karmagrid_daily_dev/comments/cron001",
		});
		const redditClient: RedditPostCreator = { submitCustomPost };

		const server = createKarmaGridServer({
			redditClient,
			redisClient,
			now: () => new Date("2026-11-24T00:00:05.000Z"),
		});

		await withTestServer(server, async (baseUrl) => {
			const res = await fetch(`${baseUrl}/internal/scheduler/daily-post`, {
				method: "POST",
				headers: DEVVIT_TEST_HEADERS,
				body: JSON.stringify({ name: "daily-karmagrid-post" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.status).toBe("success");
			expect(body.created).toBe(true);
			expect(body.date).toBe("2026-11-24");
			expect(body.dedupKey).toBe("karmagrid:posted:2026-11-24");
			expect(body.postId).toBe("t3_cron001");

			expect(submitCustomPost).toHaveBeenCalledTimes(1);
			expect(submitCustomPost).toHaveBeenCalledWith({
				subredditName: "karmagrid_daily_dev",
				title: formatDailyPostTitle("2026-11-24"),
			});
			expect(await redisClient.get(getDailyPostDedupKey("2026-11-24"))).toBe(
				"t3_cron001",
			);
		});
	});

	it("deduplicates repeated scheduler invocations and onAppUpgrade on the same UTC day", async () => {
		const redisClient = new InMemoryRedisClient();
		const submitCustomPost = vi.fn().mockResolvedValue({
			id: "t3_cron002",
			url: "https://reddit.com/r/karmagrid_daily_dev/comments/cron002",
		});
		const redditClient: RedditPostCreator = { submitCustomPost };

		const server = createKarmaGridServer({
			redditClient,
			redisClient,
			now: () => new Date("2026-11-24T08:30:00.000Z"),
		});

		await withTestServer(server, async (baseUrl) => {
			// First cron run creates post
			const first = await fetch(`${baseUrl}/internal/scheduler/daily-post`, {
				method: "POST",
				headers: DEVVIT_TEST_HEADERS,
			});
			expect(first.status).toBe(200);
			const firstBody = (await first.json()) as Record<string, unknown>;
			expect(firstBody.status).toBe("success");
			expect(firstBody.created).toBe(true);

			// Second cron run on same UTC day must skip
			const second = await fetch(`${baseUrl}/internal/scheduler/daily-post`, {
				method: "POST",
				headers: DEVVIT_TEST_HEADERS,
			});
			expect(second.status).toBe(200);
			const secondBody = (await second.json()) as Record<string, unknown>;
			expect(secondBody.status).toBe("skipped");
			expect(secondBody.created).toBe(false);
			expect(secondBody.reason).toBe("already_posted_today");
			expect(secondBody.postId).toBe("t3_cron002");

			// onAppInstall / onAppUpgrade trigger on same UTC day shares dedup key and skips
			const upgrade = await fetch(
				`${baseUrl}/internal/triggers/on-app-install`,
				{
					method: "POST",
					headers: DEVVIT_TEST_HEADERS,
				},
			);
			expect(upgrade.status).toBe(200);
			const upgradeBody = (await upgrade.json()) as Record<string, unknown>;
			expect(upgradeBody.status).toBe("skipped");
			expect(upgradeBody.created).toBe(false);
			expect(upgradeBody.dedupKey).toBe("karmagrid:posted:2026-11-24");

			expect(submitCustomPost).toHaveBeenCalledTimes(1);
		});
	});

	it("shares dedup in reverse order (trigger first, then scheduler skips) and posts again on the next UTC day", async () => {
		const redisClient = new InMemoryRedisClient();
		let currentDate = new Date("2026-11-24T12:00:00.000Z");
		let postCounter = 0;
		const submitCustomPost = vi.fn().mockImplementation(async () => {
			postCounter += 1;
			return {
				id: `t3_day${postCounter}`,
				url: `https://reddit.com/r/karmagrid_daily_dev/comments/day${postCounter}`,
			};
		});

		const server = createKarmaGridServer({
			redditClient: { submitCustomPost },
			redisClient,
			now: () => currentDate,
		});

		await withTestServer(server, async (baseUrl) => {
			// Install/upgrade trigger posts on Day 1
			const triggerRes = await fetch(
				`${baseUrl}/internal/triggers/on-app-install`,
				{ method: "POST", headers: DEVVIT_TEST_HEADERS },
			);
			expect(triggerRes.status).toBe(200);
			const triggerBody = (await triggerRes.json()) as Record<string, unknown>;
			expect(triggerBody.status).toBe("success");
			expect(triggerBody.postId).toBe("t3_day1");

			// Scheduler later on Day 1 skips
			const sameDayCron = await fetch(
				`${baseUrl}/internal/scheduler/daily-post`,
				{ method: "POST", headers: DEVVIT_TEST_HEADERS },
			);
			const sameDayBody = (await sameDayCron.json()) as Record<string, unknown>;
			expect(sameDayBody.status).toBe("skipped");
			expect(submitCustomPost).toHaveBeenCalledTimes(1);

			// Advance clock to next UTC day (00:00 UTC)
			currentDate = new Date("2026-11-25T00:00:01.000Z");

			const nextDayCron = await fetch(
				`${baseUrl}/internal/scheduler/daily-post`,
				{ method: "POST", headers: DEVVIT_TEST_HEADERS },
			);
			expect(nextDayCron.status).toBe(200);
			const nextDayBody = (await nextDayCron.json()) as Record<string, unknown>;
			expect(nextDayBody.status).toBe("success");
			expect(nextDayBody.created).toBe(true);
			expect(nextDayBody.date).toBe("2026-11-25");
			expect(nextDayBody.dedupKey).toBe("karmagrid:posted:2026-11-25");
			expect(nextDayBody.postId).toBe("t3_day2");
			expect(submitCustomPost).toHaveBeenCalledTimes(2);
			expect(submitCustomPost).toHaveBeenLastCalledWith({
				subredditName: "karmagrid_daily_dev",
				title: "⭐ KarmaGrid Daily — Subreddit Logic Puzzle (2026-11-25)",
			});
		});
	});

	it("does not write Redis dedup key when Reddit API fails so a retry can succeed", async () => {
		const redisClient = new InMemoryRedisClient();
		const submitCustomPost = vi
			.fn()
			.mockRejectedValueOnce(new Error("Transient Reddit API timeout"))
			.mockResolvedValueOnce({
				id: "t3_retry_ok",
				url: "https://reddit.com/r/karmagrid_daily_dev/comments/retry_ok",
			});

		const server = createKarmaGridServer({
			redditClient: { submitCustomPost },
			redisClient,
			now: () => new Date("2026-11-26T00:00:00.000Z"),
		});

		await withTestServer(server, async (baseUrl) => {
			// First attempt fails
			const failed = await fetch(`${baseUrl}/internal/scheduler/daily-post`, {
				method: "POST",
				headers: DEVVIT_TEST_HEADERS,
			});
			expect(failed.status).toBe(500);
			const failedBody = (await failed.json()) as Record<string, unknown>;
			expect(failedBody.status).toBe("error");
			expect(failedBody.message).toContain("Transient Reddit API timeout");
			expect(await redisClient.get("karmagrid:posted:2026-11-26")).toBeNull();

			// Retry succeeds and records dedup key
			const retry = await fetch(`${baseUrl}/internal/scheduler/daily-post`, {
				method: "POST",
				headers: DEVVIT_TEST_HEADERS,
			});
			expect(retry.status).toBe(200);
			const retryBody = (await retry.json()) as Record<string, unknown>;
			expect(retryBody.status).toBe("success");
			expect(retryBody.postId).toBe("t3_retry_ok");
			expect(await redisClient.get("karmagrid:posted:2026-11-26")).toBe(
				"t3_retry_ok",
			);
		});
	});
});
