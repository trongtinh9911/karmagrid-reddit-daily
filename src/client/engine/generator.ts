import { PRNG } from "./prng";
import { type Point, Solver } from "./solver";

export interface SubredditTheme {
	name: string;
	color: string;
	borderColor: string;
	textColor: string;
}

export const SUBREDDIT_PALETTE: SubredditTheme[] = [
	{
		name: "r/gaming",
		color: "#1E3A5F",
		borderColor: "#3B82F6",
		textColor: "#93C5FD",
	},
	{
		name: "r/AskReddit",
		color: "#4A1D24",
		borderColor: "#EF4444",
		textColor: "#FCA5A5",
	},
	{
		name: "r/science",
		color: "#14382A",
		borderColor: "#10B981",
		textColor: "#A7F3D0",
	},
	{
		name: "r/memes",
		color: "#443311",
		borderColor: "#F59E0B",
		textColor: "#FDE68A",
	},
	{
		name: "r/technology",
		color: "#2E1065",
		borderColor: "#8B5CF6",
		textColor: "#DDD6FE",
	},
	{
		name: "r/art",
		color: "#4C1D42",
		borderColor: "#EC4899",
		textColor: "#FBCFE8",
	},
	{
		name: "r/music",
		color: "#134E4A",
		borderColor: "#14B8A6",
		textColor: "#99F6E4",
	},
];

export interface DailyPuzzle {
	date: string;
	dateStr: string;
	dayNumber: number;
	size: number;
	dayName: string;
	sectors: number[][];
	subreddits: SubredditTheme[];
	solution: Point[];
}

export class PuzzleGenerator {
	/**
	 * Generates a deterministic daily puzzle from date string 'YYYY-MM-DD'.
	 */
	static generateForDate(dateStr: string): DailyPuzzle {
		const prng = new PRNG(dateStr);
		const dateObj = new Date(dateStr);

		// Calculate day number since epoch / start date (e.g. 2026-01-01 is Day 1)
		const startDate = new Date("2026-01-01");
		const diffTime = Math.abs(dateObj.getTime() - startDate.getTime());
		const dayNumber = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

		// Grid size based on day of week:
		// Sunday (0): 7x7 Master
		// Mon-Wed (1-3): 5x5 Sprint
		// Thu-Sat (4-6): 6x6 Challenge
		const dayOfWeek = dateObj.getDay();
		let size = 5;
		if (dayOfWeek === 0) size = 7;
		else if (dayOfWeek >= 4) size = 6;

		const dayNames = [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		];
		const dayName = dayNames[dayOfWeek];

		// Select subreddits
		const subreddits = SUBREDDIT_PALETTE.slice(0, size);

		// Attempt generation with uniqueness check
		let sectors: number[][] = [];
		let solution: Point[] = [];
		let attempts = 0;

		while (attempts < 100) {
			attempts++;
			const candidatePrng = new PRNG(`${dateStr}_attempt_${attempts}`);
			const validQueens = this.findRandomValidQueens(size, candidatePrng);
			if (!validQueens) continue;

			const candSectors = this.growSectors(size, validQueens, candidatePrng);
			if (!candSectors) continue;

			const solutions = Solver.solve(candSectors, size, 2);
			if (solutions.length === 1) {
				sectors = candSectors;
				solution = validQueens.map((c, r) => ({ row: r, col: c }));
				break;
			}
		}

		// Safety fallback: guaranteed solvable Voronoi partition
		if (sectors.length === 0) {
			const fallbackPrng = new PRNG(dateStr + "_fallback");
			const validQueens = this.findValidQueensBacktrack(size, fallbackPrng);
			sectors =
				this.growSectors(size, validQueens, fallbackPrng) ||
				this.createDefaultSectors(size);
			solution = validQueens.map((c, r) => ({ row: r, col: c }));
		}

		return {
			date: dateStr,
			dateStr,
			dayNumber,
			size,
			dayName,
			sectors,
			subreddits,
			solution,
		};
	}

	/**
	 * Finds a valid placement of size queens where no two touch and 1 per row/col.
	 */
	private static findRandomValidQueens(
		size: number,
		prng: PRNG,
	): number[] | null {
		const cols = Array.from({ length: size }, (_, i) => i);
		prng.shuffle(cols);
		const queens: number[] = new Array(size).fill(-1);

		function backtrack(row: number): boolean {
			if (row === size) return true;
			const rowCols = [...cols];
			prng.shuffle(rowCols);

			for (const col of rowCols) {
				if (queens.includes(col)) continue;
				if (row > 0) {
					const prevCol = queens[row - 1];
					if (Math.abs(prevCol - col) <= 1) continue;
				}
				queens[row] = col;
				if (backtrack(row + 1)) return true;
				queens[row] = -1;
			}
			return false;
		}

		return backtrack(0) ? queens : null;
	}

	/**
	 * Deterministic backtracking search for valid queen placements.
	 */
	private static findValidQueensBacktrack(size: number, prng: PRNG): number[] {
		const queens: number[] = new Array(size).fill(-1);
		const availableCols = Array.from({ length: size }, (_, i) => i);
		prng.shuffle(availableCols);

		function backtrack(row: number): boolean {
			if (row === size) return true;
			for (const col of availableCols) {
				if (queens.slice(0, row).includes(col)) continue;
				if (row > 0 && Math.abs(queens[row - 1] - col) <= 1) continue;
				queens[row] = col;
				if (backtrack(row + 1)) return true;
				queens[row] = -1;
			}
			return false;
		}

		backtrack(0);
		return queens;
	}

	/**
	 * Grows connected, contiguous sectors around each queen position using percolation.
	 */
	private static growSectors(
		size: number,
		queens: number[],
		prng: PRNG,
	): number[][] | null {
		const grid: number[][] = Array.from({ length: size }, () =>
			new Array(size).fill(-1),
		);
		const queues: Point[][] = Array.from({ length: size }, () => []);

		// Seed each queen in its own sector
		for (let r = 0; r < size; r++) {
			const c = queens[r];
			grid[r][c] = r; // sector ID = r
			queues[r].push({ row: r, col: c });
		}

		let unassigned = size * size - size;
		const directions = [
			{ r: -1, c: 0 },
			{ r: 1, c: 0 },
			{ r: 0, c: -1 },
			{ r: 0, c: 1 },
		];

		let rounds = 0;
		while (unassigned > 0 && rounds < 200) {
			rounds++;
			const order = Array.from({ length: size }, (_, i) => i);
			prng.shuffle(order);

			let expandedInRound = false;

			for (const sector of order) {
				if (queues[sector].length === 0) continue;

				// Pick a random cell from the current frontier
				const idx = prng.nextInt(0, queues[sector].length - 1);
				const cell = queues[sector][idx];

				// Shuffle directions
				const shuffledDirs = prng.shuffle([...directions]);
				let expanded = false;

				for (const dir of shuffledDirs) {
					const nr = cell.row + dir.r;
					const nc = cell.col + dir.c;

					if (
						nr >= 0 &&
						nr < size &&
						nc >= 0 &&
						nc < size &&
						grid[nr][nc] === -1
					) {
						grid[nr][nc] = sector;
						queues[sector].push({ row: nr, col: nc });
						unassigned--;
						expanded = true;
						expandedInRound = true;
						break;
					}
				}

				// If cell has no more expandable neighbors, remove from queue
				let hasFreeNeighbor = false;
				for (const dir of directions) {
					const nr = cell.row + dir.r;
					const nc = cell.col + dir.c;
					if (
						nr >= 0 &&
						nr < size &&
						nc >= 0 &&
						nc < size &&
						grid[nr][nc] === -1
					) {
						hasFreeNeighbor = true;
						break;
					}
				}
				if (!hasFreeNeighbor) {
					queues[sector].splice(idx, 1);
				}
			}

			// If stuck, assign remaining unassigned cells to the closest neighbor sector
			if (!expandedInRound && unassigned > 0) {
				for (let r = 0; r < size; r++) {
					for (let c = 0; c < size; c++) {
						if (grid[r][c] === -1) {
							for (const dir of directions) {
								const nr = r + dir.r;
								const nc = c + dir.c;
								if (
									nr >= 0 &&
									nr < size &&
									nc >= 0 &&
									nc < size &&
									grid[nr][nc] !== -1
								) {
									grid[r][c] = grid[nr][nc];
									unassigned--;
									break;
								}
							}
						}
					}
				}
			}
		}

		return unassigned === 0 ? grid : null;
	}

	/**
	 * Deterministic fallback partition if random percolation encounters an anomaly.
	 */
	private static createDefaultSectors(size: number): number[][] {
		const grid: number[][] = Array.from({ length: size }, () =>
			new Array(size).fill(0),
		);
		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				grid[r][c] = r; // Each row is its own sector
			}
		}
		return grid;
	}
}

export const DailyGenerator = PuzzleGenerator;
