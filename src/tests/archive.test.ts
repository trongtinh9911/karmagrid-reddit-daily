import { beforeEach, describe, expect, it } from "vitest";
import { DevvitBridge } from "../client/engine/devvitBridge";
import {
	DailyGenerator,
	type PracticeDifficulty,
} from "../client/engine/generator";
import { Solver } from "../client/engine/solver";

class MockLocalStorage implements Storage {
	private store = new Map<string, string>();
	get length(): number {
		return this.store.size;
	}
	clear(): void {
		this.store.clear();
	}
	getItem(key: string): string | null {
		return this.store.get(key) ?? null;
	}
	key(index: number): string | null {
		return Array.from(this.store.keys())[index] ?? null;
	}
	removeItem(key: string): void {
		this.store.delete(key);
	}
	setItem(key: string, value: string): void {
		this.store.set(key, value);
	}
}

describe("Archive / Practice Mode Generator", () => {
	const tiers: { tier: PracticeDifficulty; expectedSize: number }[] = [
		{ tier: "5x5", expectedSize: 5 },
		{ tier: "6x6", expectedSize: 6 },
		{ tier: "7x7", expectedSize: 7 },
	];

	for (const { tier, expectedSize } of tiers) {
		it(`generates valid, uniquely solvable ${tier} archive puzzles across variants`, () => {
			const p0 = DailyGenerator.generateArchive(tier, 0);
			const p1 = DailyGenerator.generateArchive(tier, 1);
			const p0Repeat = DailyGenerator.generateArchive(tier, 0);

			expect(p0.size).toBe(expectedSize);
			expect(p0.isPractice).toBe(true);
			expect(p0.mode).toBe(tier);
			expect(p0.subreddits.length).toBe(expectedSize);
			expect(p0.solution.length).toBe(expectedSize);

			// Deterministic for same variant
			expect(p0.sectors).toEqual(p0Repeat.sectors);
			expect(p0.solution).toEqual(p0Repeat.solution);

			// Distinct archive dates for distinct variants
			expect(p0.dateStr).not.toBe(p1.dateStr);

			// Verify solution passes Solver cleanly
			for (const puzzle of [p0, p1]) {
				const grid = Array.from({ length: puzzle.size }, () =>
					new Array<number>(puzzle.size).fill(0),
				);
				for (const pt of puzzle.solution) {
					grid[pt.row][pt.col] = 1;
				}
				expect(Solver.isSolved(grid, puzzle.sectors, puzzle.size)).toBe(true);
				expect(Solver.hasUniqueSolution(puzzle.sectors, puzzle.size)).toBe(
					true,
				);
			}
		});
	}
});

describe("Practice Streak Protection & Leaderboard Integration", () => {
	beforeEach(() => {
		const mockStorage = new MockLocalStorage();
		Object.defineProperty(globalThis, "localStorage", {
			value: mockStorage,
			configurable: true,
			writable: true,
		});
	});

	it("preserves Daily streak completely when winning Practice / Archive puzzles", () => {
		// Win Daily on 2026-11-22 and 2026-11-23 -> streak = 2
		DevvitBridge.recordWin("2026-11-22", 40);
		const afterDaily = DevvitBridge.recordWin("2026-11-23", 32);
		expect(afterDaily.currentStreak).toBe(2);
		expect(afterDaily.played).toBe(2);
		expect(afterDaily.lastPlayedDate).toBe("2026-11-23");

		// Now play and win 5x5, 6x6, and 7x7 Practice archive puzzles with older dates
		const afterPractice5 = DevvitBridge.recordWin("2026-01-05", 18, {
			isPractice: true,
		});
		const afterPractice7 = DevvitBridge.recordWin("2026-01-04", 95, {
			isPractice: true,
		});

		expect(afterPractice5.currentStreak).toBe(2);
		expect(afterPractice5.played).toBe(2);
		expect(afterPractice7.currentStreak).toBe(2);
		expect(afterPractice7.maxStreak).toBe(2);
		expect(afterPractice7.lastPlayedDate).toBe("2026-11-23");
	});

	it("loads live leaderboard from /api/leaderboard when server responds with Devvit wrapper JSON", async () => {
		const mockFetch = (async () =>
			new Response(
				JSON.stringify({
					success: true,
					data: {
						date: "2026-11-23",
						leaderboard: [
							{
								username: "u/FastSnoo",
								seconds: 19,
								date: "2026-11-23",
								rank: 1,
							},
							{
								username: "u/SecondPlace",
								seconds: 31,
								date: "2026-11-23",
								rank: 2,
							},
						],
					},
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			)) as unknown as typeof fetch;

		const result = await DevvitBridge.fetchLeaderboard("2026-11-23", mockFetch);
		expect(result.source).toBe("live_api");
		expect(result.entries.length).toBe(2);
		expect(result.entries[0].username).toBe("u/FastSnoo");
		expect(result.entries[0].seconds).toBe(19);
		expect(result.entries[0].rank).toBe(1);
	});

	it("falls back smoothly to local leaderboard on GitHub Pages 404 HTML response", async () => {
		DevvitBridge.recordLocalScore("2026-11-23", 15);

		const html404Fetch = (async () =>
			new Response("<!doctype html><html><body>404 Not Found</body></html>", {
				status: 404,
				headers: { "Content-Type": "text/html" },
			})) as unknown as typeof fetch;

		const result = await DevvitBridge.fetchLeaderboard(
			"2026-11-23",
			html404Fetch,
		);
		expect(result.source).toBe("local_fallback");
		expect(result.entries.length).toBeGreaterThanOrEqual(6);
		expect(result.entries[0].username).toBe("u/You (Local)");
		expect(result.entries[0].seconds).toBe(15);
		expect(result.entries[0].isCurrentUser).toBe(true);
	});

	it("skips server score submission in Practice mode and submits in Daily mode", async () => {
		let callCount = 0;
		const spyFetch = (async () => {
			callCount++;
			return new Response(JSON.stringify({ rank: 1 }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;

		const practiceRes = await DevvitBridge.submitScore(
			"2026-01-04",
			44,
			[[1]],
			true,
			spyFetch,
		);
		expect(practiceRes.synced).toBe(false);
		expect(callCount).toBe(0);

		const dailyRes = await DevvitBridge.submitScore(
			"2026-11-23",
			29,
			[[1]],
			false,
			spyFetch,
		);
		expect(dailyRes.synced).toBe(true);
		expect(dailyRes.rank).toBe(1);
		expect(callCount).toBe(1);
	});

	it("formats Practice share text cleanly with archive label and hint count", () => {
		const share = DevvitBridge.generateShareText(
			4,
			"2026-01-04",
			64,
			[
				[1, 0],
				[0, 1],
			],
			[
				[0, 0],
				[1, 1],
			],
			2,
			{
				isPractice: true,
				difficultyLabel: "7×7 Sunday Master",
				hintsUsed: 2,
			},
		);

		expect(share).toContain(
			"KarmaGrid Archive · 7×7 Sunday Master (2026-01-04)",
		);
		expect(share).toContain("Solved with 2 deductive hints");
	});
});
