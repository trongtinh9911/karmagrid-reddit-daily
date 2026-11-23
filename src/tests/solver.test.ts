import { describe, expect, it } from "vitest";
import { DailyGenerator } from "../client/engine/generator";
import { Solver } from "../client/engine/solver";

describe("Solver Logic & Constraints", () => {
	it("detects valid moves according to rules", () => {
		const size = 5;
		const sectors = [
			[0, 0, 1, 1, 1],
			[0, 0, 1, 1, 1],
			[2, 2, 2, 3, 3],
			[4, 4, 4, 3, 3],
			[4, 4, 4, 3, 3],
		];

		// Place queen at (0, 0)
		const queens = [0, -1, -1, -1, -1];

		// (1, 0) is invalid: same column
		expect(Solver.isValidMove(1, 0, queens, sectors, size)).toBe(false);

		// (1, 1) is invalid: touching diagonally
		expect(Solver.isValidMove(1, 1, queens, sectors, size)).toBe(false);

		// (0, 2) is invalid: same row
		expect(Solver.isValidMove(0, 2, queens, sectors, size)).toBe(false);

		// (1, 2) is invalid: same sector 0? wait, (1, 2) is sector 1, but touching (0, 0)? No, dx=2, dy=1, not touching. Sector is 1. (0,0) is sector 0.
		// So (1, 2) should be valid!
		expect(Solver.isValidMove(1, 2, queens, sectors, size)).toBe(true);
	});

	it("detects conflicts between placed stars", () => {
		const size = 5;
		const sectors = [
			[0, 0, 1, 1, 1],
			[0, 0, 1, 1, 1],
			[2, 2, 2, 3, 3],
			[4, 4, 4, 3, 3],
			[4, 4, 4, 3, 3],
		];

		const userGrid = [
			[1, 0, 1, 0, 0], // Two stars in row 0
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0],
		];

		const conflicts = Solver.findConflicts(userGrid, sectors, size);
		expect(conflicts.length).toBe(2);
		expect(conflicts.some((p) => p.row === 0 && p.col === 0)).toBe(true);
		expect(conflicts.some((p) => p.row === 0 && p.col === 2)).toBe(true);
	});

	it("identifies a fully solved winning board", () => {
		const puzzle = DailyGenerator.generateForDate("2026-11-23");
		const size = puzzle.size;

		// Convert solution points to userGrid
		const userGrid: number[][] = Array.from({ length: size }, () =>
			new Array(size).fill(0),
		);
		for (const pt of puzzle.solution) {
			userGrid[pt.row][pt.col] = 1;
		}

		expect(Solver.isSolved(userGrid, puzzle.sectors, size)).toBe(true);
		expect(Solver.findConflicts(userGrid, puzzle.sectors, size).length).toBe(0);
	});

	it("rejects an incomplete board", () => {
		const puzzle = DailyGenerator.generateForDate("2026-11-23");
		const size = puzzle.size;

		const userGrid: number[][] = Array.from({ length: size }, () =>
			new Array(size).fill(0),
		);
		// Only place 1 star
		if (puzzle.solution.length > 0) {
			userGrid[puzzle.solution[0].row][puzzle.solution[0].col] = 1;
		}

		expect(Solver.isSolved(userGrid, puzzle.sectors, size)).toBe(false);
	});

	it("rejects board with conflicting diagonal touch", () => {
		const puzzle = DailyGenerator.generateForDate("2026-11-23");
		const size = puzzle.size;

		const userGrid: number[][] = Array.from({ length: size }, () =>
			new Array(size).fill(0),
		);
		// Place two diagonal stars at (0, 0) and (1, 1)
		userGrid[0][0] = 1;
		userGrid[1][1] = 1;

		expect(Solver.isSolved(userGrid, puzzle.sectors, size)).toBe(false);
		const conflicts = Solver.findConflicts(userGrid, puzzle.sectors, size);
		expect(conflicts.length).toBe(2);
	});
});
