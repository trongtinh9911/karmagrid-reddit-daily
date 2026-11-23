import { describe, expect, it } from "vitest";
import { DailyGenerator, type DailyPuzzle } from "../client/engine/generator";
import { SmartHintEngine } from "../client/engine/hintEngine";
import { Solver } from "../client/engine/solver";

function emptyGrid(size: number): number[][] {
	return Array.from({ length: size }, () => new Array<number>(size).fill(0));
}

describe("Smart Deductive Hint Engine", () => {
	it("detects and explains a diagonal touch conflict between two stars", () => {
		const puzzle = DailyGenerator.generateArchive("5x5", 0);
		const grid = emptyGrid(puzzle.size);
		grid[0][0] = 1;
		grid[1][1] = 1;

		const hint = SmartHintEngine.getNextHint(grid, puzzle);
		expect(hint).not.toBeNull();
		expect(hint?.action).toBe("remove_conflict");
		expect(hint?.rule).toBe("conflict_resolution");
		expect(hint?.recommendedValue).toBe(0);
		expect(hint?.explanation.toLowerCase()).toContain("diagonally");
	});

	it("catches a misplaced star off the unique solution path", () => {
		const puzzle = DailyGenerator.generateArchive("5x5", 0);
		const grid = emptyGrid(puzzle.size);
		const solutionSet = new Set(
			puzzle.solution.map((p) => `${p.row},${p.col}`),
		);

		let wrongRow = 0;
		let wrongCol = 0;
		outer: for (let r = 0; r < puzzle.size; r++) {
			for (let c = 0; c < puzzle.size; c++) {
				if (!solutionSet.has(`${r},${c}`)) {
					wrongRow = r;
					wrongCol = c;
					break outer;
				}
			}
		}

		grid[wrongRow][wrongCol] = 1;

		const hint = SmartHintEngine.getNextHint(grid, puzzle);
		expect(hint).not.toBeNull();
		expect(hint?.action).toBe("fix_mistake");
		expect(hint?.row).toBe(wrongRow);
		expect(hint?.col).toBe(wrongCol);
		expect(hint?.recommendedValue).toBe(0);
	});

	it("catches a solution cell that the player mistakenly crossed out with X", () => {
		const puzzle = DailyGenerator.generateArchive("5x5", 0);
		const grid = emptyGrid(puzzle.size);
		const target = puzzle.solution[0];
		grid[target.row][target.col] = 2;

		const hint = SmartHintEngine.getNextHint(grid, puzzle);
		expect(hint).not.toBeNull();
		expect(hint?.action).toBe("fix_mistake");
		expect(hint?.row).toBe(target.row);
		expect(hint?.col).toBe(target.col);
		expect(hint?.recommendedValue).toBe(0);
		expect(hint?.explanation).toContain("✕");
	});

	it("deduces a naked single star in a subreddit sector when all other cells are crossed", () => {
		const puzzle = DailyGenerator.generateArchive("5x5", 0);
		const grid = emptyGrid(puzzle.size);
		const target = puzzle.solution[0];
		const targetSector = puzzle.sectors[target.row][target.col];

		for (let r = 0; r < puzzle.size; r++) {
			for (let c = 0; c < puzzle.size; c++) {
				if (
					puzzle.sectors[r][c] === targetSector &&
					!(r === target.row && c === target.col)
				) {
					grid[r][c] = 2;
				}
			}
		}

		const hint = SmartHintEngine.getNextHint(grid, puzzle);
		expect(hint).not.toBeNull();
		expect(hint?.action).toBe("place_star");
		expect(hint?.recommendedValue).toBe(1);
		expect(hint?.row).toBe(target.row);
		expect(hint?.col).toBe(target.col);
		expect(hint?.rule).toBe("naked_single_sector");
		expect(hint?.explanation).toContain(puzzle.subreddits[targetSector].name);
	});

	it("explains direct X elimination from a placed star (diagonal/sector/row/col)", () => {
		const puzzle = DailyGenerator.generateArchive("6x6", 0);
		const grid = emptyGrid(puzzle.size);
		const firstStar = puzzle.solution[0];
		grid[firstStar.row][firstStar.col] = 1;

		const hint = SmartHintEngine.getNextHint(grid, puzzle);
		expect(hint).not.toBeNull();
		expect(hint?.explanation.length).toBeGreaterThan(20);
		if (hint?.action === "place_cross") {
			expect(hint.recommendedValue).toBe(2);
			expect([
				"adjacency_elimination",
				"sector_elimination",
				"row_elimination",
				"col_elimination",
			]).toContain(hint.rule);
		}
	});

	it("returns null once the board is already solved", () => {
		const puzzle = DailyGenerator.generateArchive("5x5", 1);
		const grid = emptyGrid(puzzle.size);
		for (const pt of puzzle.solution) {
			grid[pt.row][pt.col] = 1;
		}
		expect(SmartHintEngine.getNextHint(grid, puzzle)).toBeNull();
	});

	it("solves 5x5, 6x6, and 7x7 puzzles end-to-end purely via deductive hints with 0 wrong moves", () => {
		const puzzles: DailyPuzzle[] = [
			DailyGenerator.generateArchive("5x5", 0),
			DailyGenerator.generateArchive("6x6", 0),
			DailyGenerator.generateArchive("7x7", 0),
		];

		for (const puzzle of puzzles) {
			const solutionSet = new Set(
				puzzle.solution.map((p) => `${p.row},${p.col}`),
			);
			let grid = emptyGrid(puzzle.size);
			let steps = 0;
			const maxSteps = puzzle.size * puzzle.size + 5;

			while (
				!Solver.isSolved(grid, puzzle.sectors, puzzle.size) &&
				steps < maxSteps
			) {
				const hint = SmartHintEngine.getNextHint(grid, puzzle);
				expect(hint).not.toBeNull();
				if (!hint) break;

				expect(hint.explanation.trim().length).toBeGreaterThan(15);
				expect(hint.ruleBadge.trim().length).toBeGreaterThan(3);

				// Every suggested Star must be in solution; every suggested Cross must NOT be in solution
				const key = `${hint.row},${hint.col}`;
				if (hint.action === "place_star") {
					expect(solutionSet.has(key)).toBe(true);
				} else if (hint.action === "place_cross") {
					expect(solutionSet.has(key)).toBe(false);
				}

				grid = SmartHintEngine.applyHint(grid, hint);
				steps++;
			}

			expect(Solver.isSolved(grid, puzzle.sectors, puzzle.size)).toBe(true);
		}
	});
});
