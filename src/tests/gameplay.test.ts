import { beforeEach, describe, expect, it } from "vitest";
import { DevvitBridge } from "../client/engine/devvitBridge";
import { DailyGenerator } from "../client/engine/generator";
import { KarmaGridServer } from "../server/index";
import { InMemoryRedisClient, KarmaGridRedisStore } from "../server/redisStore";

describe("Gameplay Bridge & Share Generator", () => {
	it("generates formatted Reddit Markdown share text with spoiler tags", () => {
		const size = 5;
		const userGrid = [
			[1, 0, 0, 0, 0],
			[0, 0, 1, 0, 0],
			[0, 0, 0, 0, 1],
			[0, 1, 0, 0, 0],
			[0, 0, 0, 1, 0],
		];
		const sectors = [
			[0, 0, 1, 1, 1],
			[0, 0, 1, 1, 1],
			[2, 2, 2, 3, 3],
			[4, 4, 4, 3, 3],
			[4, 4, 4, 3, 3],
		];

		const shareText = DevvitBridge.generateShareText(
			42,
			"2026-11-23",
			45,
			userGrid,
			sectors,
			size,
		);

		expect(shareText).toContain("KarmaGrid #42 (2026-11-23)");
		expect(shareText).toContain("⏱️ 45s");
		expect(shareText).toContain(">!");
		expect(shareText).toContain("!<");
		expect(shareText).toContain("⭐");
		expect(shareText).toContain("⬛");
	});
});

describe("Server Leaderboard & Anti-Cheat RPC", () => {
	let redisClient: InMemoryRedisClient;
	let store: KarmaGridRedisStore;
	let server: KarmaGridServer;

	beforeEach(() => {
		redisClient = new InMemoryRedisClient();
		store = new KarmaGridRedisStore(redisClient);
		server = new KarmaGridServer(redisClient);
	});

	it("initializes game session via INIT_GAME RPC", async () => {
		const res = await server.handleMessage(
			{ type: "INIT_GAME", data: { date: "2026-11-23" } },
			{ id: "snoo_1", name: "spez" },
		);

		expect(res.success).toBe(true);
		expect(res.data).toBeDefined();
		const data = res.data as any;
		expect(data.userStats.username).toBe("spez");
		expect(data.userStats.currentStreak).toBe(0);
	});

	it("validates legitimate win and updates daily leaderboard", async () => {
		const date = "2026-11-23";
		const puzzle = DailyGenerator.generateForDate(date);
		const size = puzzle.size;

		// Build valid winning grid
		const validGrid: number[][] = Array.from({ length: size }, () =>
			new Array(size).fill(0),
		);
		for (const pt of puzzle.solution) {
			validGrid[pt.row][pt.col] = 1;
		}

		const res = await server.handleMessage(
			{
				type: "DEVVIT_RECORD_WIN",
				data: {
					date,
					seconds: 35,
					userGrid: validGrid,
				},
			},
			{ id: "user_fast", name: "SpeedRunnerSnoo" },
		);

		expect(res.success).toBe(true);
		const data = res.data as any;
		expect(data.rank).toBe(1);
		expect(data.isNewBest).toBe(true);
		expect(data.stats.currentStreak).toBe(1);
		expect(data.leaderboard.length).toBe(1);
		expect(data.leaderboard[0].username).toBe("u/SpeedRunnerSnoo");
		expect(data.leaderboard[0].seconds).toBe(35);
	});

	it("rejects illegitimate win attempt via anti-cheat validation", async () => {
		const date = "2026-11-23";
		const puzzle = DailyGenerator.generateForDate(date);
		const size = puzzle.size;

		// Build invalid grid with conflict
		const fakeGrid: number[][] = Array.from({ length: size }, () =>
			new Array(size).fill(0),
		);
		fakeGrid[0][0] = 1;
		fakeGrid[0][1] = 1; // 2 stars in same row!

		const res = await server.handleMessage(
			{
				type: "DEVVIT_RECORD_WIN",
				data: {
					date,
					seconds: 10,
					userGrid: fakeGrid,
				},
			},
			{ id: "cheater_99", name: "BotCheater" },
		);

		expect(res.success).toBe(false);
		expect(res.error).toContain("rejected by anti-cheat");
	});

	it("maintains sorted order of fastest players on leaderboard", async () => {
		const date = "2026-11-23";

		// Record player 1: 50s
		await store.recordDailyScore(date, "u1", "SlowPoke", 50);
		// Record player 2: 25s
		await store.recordDailyScore(date, "u2", "Flash", 25);
		// Record player 3: 40s
		await store.recordDailyScore(date, "u3", "Medium", 40);

		const leaderboard = await store.getDailyLeaderboard(date, 5);
		expect(leaderboard.length).toBe(3);
		expect(leaderboard[0].username).toBe("u/Flash");
		expect(leaderboard[0].seconds).toBe(25);
		expect(leaderboard[0].rank).toBe(1);

		expect(leaderboard[1].username).toBe("u/Medium");
		expect(leaderboard[1].seconds).toBe(40);
		expect(leaderboard[1].rank).toBe(2);

		expect(leaderboard[2].username).toBe("u/SlowPoke");
		expect(leaderboard[2].seconds).toBe(50);
		expect(leaderboard[2].rank).toBe(3);
	});
});
