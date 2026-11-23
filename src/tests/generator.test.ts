import { describe, expect, it } from "vitest";
import { DailyGenerator } from "../client/engine/generator";
import { PRNG } from "../client/engine/prng";

describe("PRNG (Mulberry32)", () => {
	it("produces deterministic random values for the same seed", () => {
		const prng1 = new PRNG(1337);
		const prng2 = new PRNG(1337);

		for (let i = 0; i < 20; i++) {
			expect(prng1.next()).toBe(prng2.next());
		}
	});

	it("produces values strictly between 0 and 1", () => {
		const prng = new PRNG(4242);
		for (let i = 0; i < 100; i++) {
			const val = prng.next();
			expect(val).toBeGreaterThanOrEqual(0);
			expect(val).toBeLessThan(1);
		}
	});

	it("produces integer ranges correctly", () => {
		const prng = new PRNG(999);
		for (let i = 0; i < 50; i++) {
			const val = prng.nextInt(3, 8);
			expect(val).toBeGreaterThanOrEqual(3);
			expect(val).toBeLessThanOrEqual(8);
		}
	});
});

describe("DailyGenerator", () => {
	it("generates 5x5 grid on Wednesday (2026-11-25)", () => {
		const puzzle = DailyGenerator.generateForDate("2026-11-25");
		expect(puzzle.size).toBe(5);
		expect(puzzle.dateStr).toBe("2026-11-25");
		expect(puzzle.sectors.length).toBe(5);
		expect(puzzle.sectors[0].length).toBe(5);
		expect(puzzle.subreddits.length).toBe(5);
	});

	it("generates 6x6 grid on Friday (2026-11-27)", () => {
		const puzzle = DailyGenerator.generateForDate("2026-11-27");
		expect(puzzle.size).toBe(6);
		expect(puzzle.sectors.length).toBe(6);
		expect(puzzle.sectors[0].length).toBe(6);
		expect(puzzle.subreddits.length).toBe(6);
	});

	it("generates 7x7 grid on Sunday (2026-11-29)", () => {
		const puzzle = DailyGenerator.generateForDate("2026-11-29");
		expect(puzzle.size).toBe(7);
		expect(puzzle.sectors.length).toBe(7);
		expect(puzzle.sectors[0].length).toBe(7);
		expect(puzzle.subreddits.length).toBe(7);
	});

	it("partitions all cells into valid sector indices 0..size-1", () => {
		const puzzle = DailyGenerator.generateForDate("2026-11-23");
		const size = puzzle.size;
		const sectorCount = new Array(size).fill(0);

		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				const sector = puzzle.sectors[r][c];
				expect(sector).toBeGreaterThanOrEqual(0);
				expect(sector).toBeLessThan(size);
				sectorCount[sector]++;
			}
		}

		// Every sector must have at least one cell
		for (let s = 0; s < size; s++) {
			expect(sectorCount[s]).toBeGreaterThan(0);
		}
	});

	it("generates deterministic puzzle for identical date", () => {
		const p1 = DailyGenerator.generateForDate("2026-12-08");
		const p2 = DailyGenerator.generateForDate("2026-12-08");

		expect(p1.size).toBe(p2.size);
		expect(p1.sectors).toEqual(p2.sectors);
		expect(p1.solution).toEqual(p2.solution);
		expect(p1.subreddits).toEqual(p2.subreddits);
	});
});
