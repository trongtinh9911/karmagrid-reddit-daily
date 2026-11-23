import { describe, expect, it } from "vitest";
import { DailyGenerator } from "../client/engine/generator";
import { Solver } from "../client/engine/solver";

describe("365-Day Continuous Deterministic Stress Test (Year 2026)", () => {
	it("guarantees 100% valid solvable puzzles for all 365 days of 2026 with 0 deadlocks", () => {
		const startDate = new Date("2026-01-01T00:00:00Z");
		const failedDays: { date: string; reason: string }[] = [];
		let totalTested = 0;

		for (let dayOffset = 0; dayOffset < 365; dayOffset++) {
			const current = new Date(startDate);
			current.setUTCDate(startDate.getUTCDate() + dayOffset);
			const dateStr = current.toISOString().split("T")[0];
			totalTested++;

			try {
				const puzzle = DailyGenerator.generateForDate(dateStr);
				const { size, sectors, solution } = puzzle;

				// 1. Check grid size
				if (size !== 5 && size !== 6 && size !== 7) {
					failedDays.push({
						date: dateStr,
						reason: `Unexpected grid size: ${size}`,
					});
					continue;
				}

				// 2. Check sector bounds and distribution
				const sectorHits = new Set<number>();
				let outOfBoundsSector = false;
				for (let r = 0; r < size; r++) {
					for (let c = 0; c < size; c++) {
						const s = sectors[r][c];
						if (s < 0 || s >= size) {
							outOfBoundsSector = true;
						}
						sectorHits.add(s);
					}
				}

				if (outOfBoundsSector || sectorHits.size !== size) {
					failedDays.push({
						date: dateStr,
						reason: `Invalid sector partition: found ${sectorHits.size}/${size} sectors`,
					});
					continue;
				}

				// 3. Build userGrid from solution
				const userGrid: number[][] = Array.from({ length: size }, () =>
					new Array(size).fill(0),
				);
				for (const pt of solution) {
					if (pt.col < 0 || pt.col >= size || pt.row < 0 || pt.row >= size) {
						failedDays.push({
							date: dateStr,
							reason: `Solution out of bounds: (${pt.row}, ${pt.col})`,
						});
						continue;
					}
					userGrid[pt.row][pt.col] = 1;
				}

				// 4. Validate with Solver
				const conflicts = Solver.findConflicts(userGrid, sectors, size);
				if (conflicts.length > 0) {
					failedDays.push({
						date: dateStr,
						reason: `Solution has ${conflicts.length} conflicting cells`,
					});
					continue;
				}

				const isSolved = Solver.isSolved(userGrid, sectors, size);
				if (!isSolved) {
					failedDays.push({
						date: dateStr,
						reason: `Solver.isSolved returned false for generated solution`,
					});
				}
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				failedDays.push({ date: dateStr, reason: `Exception: ${msg}` });
			}
		}

		console.log(
			`[KarmaGrid Stress Test] Successfully validated ${totalTested}/365 days of 2026. Failures: ${failedDays.length}`,
		);

		if (failedDays.length > 0) {
			console.error("Failed days summary:", failedDays.slice(0, 10));
		}

		expect(totalTested).toBe(365);
		expect(failedDays.length).toBe(0);
	}, 30000); // 30 second timeout for 365 full solving iterations
});
