/**
 * Constraint Satisfaction Solver for KarmaGrid / Queens Logic.
 * Rules:
 * 1. Exactly one queen per row.
 * 2. Exactly one queen per column.
 * 3. Exactly one queen per sector.
 * 4. No two queens may touch each other (not even diagonally, Chebyshev distance > 1).
 */

export interface Point {
	row: number;
	col: number;
}

export class Solver {
	/**
	 * Check if placing a queen at (row, col) is valid given current placements.
	 * queens: array of column indices for each row, or -1 if unplaced.
	 */
	static isValidMove(
		row: number,
		col: number,
		queens: number[],
		sectors: number[][],
		size: number,
	): boolean {
		// Row conflict if another queen is already placed in this row
		if (queens[row] !== -1 && queens[row] !== col) {
			return false;
		}

		const currentSector = sectors[row][col];

		for (let r = 0; r < size; r++) {
			const c = queens[r];
			if (c === -1 || r === row) continue;

			// 1. Column conflict
			if (c === col) return false;

			// 2. Touch conflict (Chebyshev distance <= 1: horizontal, vertical, diagonal)
			if (Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1) {
				return false;
			}

			// 3. Sector conflict
			if (sectors[r][c] === currentSector) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Finds all solutions up to maxSolutions.
	 * Returns array of queen column positions for each row.
	 */
	static solve(
		sectors: number[][],
		size: number,
		maxSolutions: number = 2,
	): number[][] {
		const solutions: number[][] = [];
		const queens: number[] = new Array(size).fill(-1);
		const usedCols: boolean[] = new Array(size).fill(false);
		const usedSectors: boolean[] = new Array(size).fill(false);

		function backtrack(row: number) {
			if (solutions.length >= maxSolutions) return;

			if (row === size) {
				solutions.push([...queens]);
				return;
			}

			for (let col = 0; col < size; col++) {
				if (usedCols[col]) continue;

				const sector = sectors[row][col];
				if (usedSectors[sector]) continue;

				// Check adjacency with previous row
				if (row > 0) {
					const prevCol = queens[row - 1];
					if (Math.abs(prevCol - col) <= 1) continue;
				}

				// Check general validity (for any other potential edge cases)
				queens[row] = col;
				usedCols[col] = true;
				usedSectors[sector] = true;

				backtrack(row + 1);

				queens[row] = -1;
				usedCols[col] = false;
				usedSectors[sector] = false;
			}
		}

		backtrack(0);
		return solutions;
	}

	/**
	 * Returns true if the board has exactly one unique solution.
	 */
	static hasUniqueSolution(sectors: number[][], size: number): boolean {
		const solutions = this.solve(sectors, size, 2);
		return solutions.length === 1;
	}

	/**
	 * Detects all conflicting cells in an active board state.
	 * userGrid: 0 = empty, 1 = star/queen, 2 = cross (X)
	 */
	static findConflicts(
		userGrid: number[][],
		sectors: number[][],
		size: number,
	): Point[] {
		const stars: Point[] = [];
		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				if (userGrid[r][c] === 1) {
					stars.push({ row: r, col: c });
				}
			}
		}

		const conflictSet = new Set<string>();

		for (let i = 0; i < stars.length; i++) {
			for (let j = i + 1; j < stars.length; j++) {
				const p1 = stars[i];
				const p2 = stars[j];

				const sameRow = p1.row === p2.row;
				const sameCol = p1.col === p2.col;
				const sameSector = sectors[p1.row][p1.col] === sectors[p2.row][p2.col];
				const touching =
					Math.abs(p1.row - p2.row) <= 1 && Math.abs(p1.col - p2.col) <= 1;

				if (sameRow || sameCol || sameSector || touching) {
					conflictSet.add(`${p1.row},${p1.col}`);
					conflictSet.add(`${p2.row},${p2.col}`);
				}
			}
		}

		return Array.from(conflictSet).map((s) => {
			const [row, col] = s.split(",").map(Number);
			return { row, col };
		});
	}

	/**
	 * Checks if the user's current board has won.
	 */
	static isSolved(
		userGrid: number[][],
		sectors: number[][],
		size: number,
	): boolean {
		let starCount = 0;
		const queens: number[] = new Array(size).fill(-1);

		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				if (userGrid[r][c] === 1) {
					starCount++;
					if (queens[r] !== -1) return false; // More than 1 per row
					queens[r] = c;
				}
			}
		}

		if (starCount !== size) return false;

		// Check conflicts
		const conflicts = this.findConflicts(userGrid, sectors, size);
		return conflicts.length === 0;
	}
}
