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

export type PracticeDifficulty = "5x5" | "6x6" | "7x7";
export type GameMode = "daily" | PracticeDifficulty;

export interface DifficultyMeta {
	tier: PracticeDifficulty;
	size: 5 | 6 | 7;
	label: string;
	shortLabel: string;
	schedule: string;
}

export const DIFFICULTY_META: Record<PracticeDifficulty, DifficultyMeta> = {
	"5x5": {
		tier: "5x5",
		size: 5,
		label: "5×5 Sprint",
		shortLabel: "5×5",
		schedule: "Mon–Wed",
	},
	"6x6": {
		tier: "6x6",
		size: 6,
		label: "6×6 Challenge",
		shortLabel: "6×6",
		schedule: "Thu–Sat",
	},
	"7x7": {
		tier: "7x7",
		size: 7,
		label: "7×7 Sunday Master",
		shortLabel: "7×7",
		schedule: "Sunday",
	},
};

export interface DailyPuzzle {
	date: string;
	dateStr: string;
	dayNumber: number;
	size: number;
	dayName: string;
	sectors: number[][];
	subreddits: SubredditTheme[];
	solution: Point[];
	isPractice?: boolean;
	mode?: GameMode;
	difficultyLabel?: string;
	variantIndex?: number;
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
			isPractice: false,
			mode: "daily",
			difficultyLabel: this.getDifficultyMetaForSize(size).label,
		};
	}

	/**
	 * Returns difficulty metadata for a given grid size.
	 */
	static getDifficultyMetaForSize(size: number): DifficultyMeta {
		if (size === 7) return DIFFICULTY_META["7x7"];
		if (size === 6) return DIFFICULTY_META["6x6"];
		return DIFFICULTY_META["5x5"];
	}

	/**
	 * Resolves a deterministic 2026 archive date matching the requested difficulty schedule:
	 * - 5x5: Mon–Wed
	 * - 6x6: Thu–Sat
	 * - 7x7: Sunday
	 */
	static getArchiveDateForDifficulty(
		difficulty: PracticeDifficulty,
		variantIndex: number = 0,
	): { dateStr: string; dayName: string; dayNumber: number } {
		const targetWeekdays: Record<PracticeDifficulty, number[]> = {
			"5x5": [1, 2, 3], // Mon, Tue, Wed
			"6x6": [4, 5, 6], // Thu, Fri, Sat
			"7x7": [0], // Sun
		};
		const dayNames = [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		];

		const allowed = targetWeekdays[difficulty];
		const safeIndex = Math.abs(Math.floor(variantIndex));
		const startUtc = Date.UTC(2026, 0, 1);

		let matches = 0;
		for (let offset = 0; offset < 365 * 4; offset++) {
			const current = new Date(startUtc + offset * 86_400_000);
			const dow = current.getUTCDay();
			if (allowed.includes(dow)) {
				if (matches === safeIndex) {
					const dateStr = current.toISOString().split("T")[0];
					return {
						dateStr,
						dayName: dayNames[dow],
						dayNumber: offset + 1,
					};
				}
				matches++;
			}
		}

		return { dateStr: "2026-01-05", dayName: "Monday", dayNumber: 5 };
	}

	/**
	 * Generates a deterministic Archive / Practice puzzle for the requested difficulty tier
	 * (5x5 Mon-Wed, 6x6 Thu-Sat, 7x7 Sunday Master) without affecting Daily streak.
	 */
	static generateArchive(
		difficulty: PracticeDifficulty,
		variantIndex: number = 0,
	): DailyPuzzle {
		const meta = DIFFICULTY_META[difficulty];
		const size = meta.size;
		const safeVariant = Math.abs(Math.floor(variantIndex));
		const { dateStr, dayName, dayNumber } = this.getArchiveDateForDifficulty(
			difficulty,
			safeVariant,
		);
		const subreddits = SUBREDDIT_PALETTE.slice(0, size);
		const seedBase = `${dateStr}_archive_${difficulty}_${safeVariant}`;

		let sectors: number[][] = [];
		let solution: Point[] = [];
		let attempts = 0;
		const maxAttempts = 60;

		while (attempts < maxAttempts) {
			attempts++;
			const candidatePrng = new PRNG(`${seedBase}_attempt_${attempts}`);
			const validQueens = this.findRandomValidQueens(size, candidatePrng);
			if (!validQueens) continue;

			const candSectors =
				attempts % 2 === 0
					? this.growWeightedSectors(size, validQueens, candidatePrng)
					: this.growSectors(size, validQueens, candidatePrng);
			if (!candSectors) continue;

			const uniqueSectors = this.carveUniqueSolution(
				candSectors,
				validQueens,
				size,
				candidatePrng,
			);
			if (uniqueSectors) {
				sectors = uniqueSectors;
				solution = validQueens.map((c, r) => ({ row: r, col: c }));
				break;
			}
		}

		if (sectors.length === 0) {
			const fallbackPrng = new PRNG(`${seedBase}_fallback`);
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
			isPractice: true,
			mode: difficulty,
			difficultyLabel: meta.label,
			variantIndex: safeVariant,
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
	 * Grows connected sectors with uneven weights (creating tight 1-3 cell regions alongside
	 * larger territories) which rapidly yields uniquely solvable 6x6 and 7x7 puzzles.
	 */
	private static growWeightedSectors(
		size: number,
		queens: number[],
		prng: PRNG,
	): number[][] | null {
		const grid: number[][] = Array.from({ length: size }, () =>
			new Array(size).fill(-1),
		);
		const frontiers: Point[][] = Array.from({ length: size }, () => []);
		const weights: number[] = Array.from({ length: size }, (_, i) =>
			i < 2 ? 1 : prng.nextInt(2, 6),
		);
		prng.shuffle(weights);

		for (let r = 0; r < size; r++) {
			const c = queens[r];
			grid[r][c] = r;
			frontiers[r].push({ row: r, col: c });
		}

		let unassigned = size * size - size;
		const directions = [
			{ r: -1, c: 0 },
			{ r: 1, c: 0 },
			{ r: 0, c: -1 },
			{ r: 0, c: 1 },
		];

		let rounds = 0;
		while (unassigned > 0 && rounds < 300) {
			rounds++;
			let expandedAny = false;

			for (let s = 0; s < size && unassigned > 0; s++) {
				if (frontiers[s].length === 0) continue;
				const steps = weights[s];
				for (
					let step = 0;
					step < steps && unassigned > 0 && frontiers[s].length > 0;
					step++
				) {
					const idx = prng.nextInt(0, frontiers[s].length - 1);
					const cell = frontiers[s][idx];
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
							grid[nr][nc] = s;
							frontiers[s].push({ row: nr, col: nc });
							unassigned--;
							expanded = true;
							expandedAny = true;
							break;
						}
					}

					if (!expanded) {
						frontiers[s].splice(idx, 1);
					}
				}
			}

			if (!expandedAny && unassigned > 0) {
				for (let r = 0; r < size; r++) {
					for (let c = 0; c < size; c++) {
						if (grid[r][c] !== -1) continue;
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

		return unassigned === 0 ? grid : null;
	}

	/**
	 * Checks whether all cells belonging to `sectorId` form a single 4-connected component.
	 */
	private static isSectorConnected(
		grid: number[][],
		size: number,
		sectorId: number,
		seedRow: number,
		seedCol: number,
	): boolean {
		let totalCells = 0;
		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				if (grid[r][c] === sectorId) totalCells++;
			}
		}
		if (totalCells === 0) return false;

		const visited = new Set<string>([`${seedRow},${seedCol}`]);
		const queue: Point[] = [{ row: seedRow, col: seedCol }];
		const dirs = [
			{ r: -1, c: 0 },
			{ r: 1, c: 0 },
			{ r: 0, c: -1 },
			{ r: 0, c: 1 },
		];

		while (queue.length > 0) {
			const cur = queue.shift()!;
			for (const d of dirs) {
				const nr = cur.row + d.r;
				const nc = cur.col + d.c;
				const key = `${nr},${nc}`;
				if (
					nr >= 0 &&
					nr < size &&
					nc >= 0 &&
					nc < size &&
					grid[nr][nc] === sectorId &&
					!visited.has(key)
				) {
					visited.add(key);
					queue.push({ row: nr, col: nc });
				}
			}
		}

		return visited.size === totalCells;
	}

	/**
	 * Conflict-driven sector carving: iteratively eliminates alternate solutions by
	 * reassigning a non-queen boundary cell of an alternate solution to a neighboring
	 * sector while preserving 4-connectivity of all sectors and keeping `queens` valid.
	 */
	private static carveUniqueSolution(
		initialGrid: number[][],
		queens: number[],
		size: number,
		prng: PRNG,
	): number[][] | null {
		const grid = initialGrid.map((row) => [...row]);
		const dirs = [
			{ r: -1, c: 0 },
			{ r: 1, c: 0 },
			{ r: 0, c: -1 },
			{ r: 0, c: 1 },
		];

		for (let step = 0; step < 40; step++) {
			const sols = Solver.solve(grid, size, 2);
			if (sols.length === 1) return grid;
			if (sols.length === 0) return null;

			const alt = sols.find((sol) =>
				sol.some((col, row) => col !== queens[row]),
			);
			if (!alt) return grid;

			const diffCells: Point[] = [];
			for (let r = 0; r < size; r++) {
				if (alt[r] !== queens[r]) {
					diffCells.push({ row: r, col: alt[r] });
				}
			}
			prng.shuffle(diffCells);

			let carved = false;
			for (const cell of diffCells) {
				const oldSector = grid[cell.row][cell.col];
				const neighborSectors = new Set<number>();
				for (const d of dirs) {
					const nr = cell.row + d.r;
					const nc = cell.col + d.c;
					if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
						const ns = grid[nr][nc];
						if (ns !== oldSector) neighborSectors.add(ns);
					}
				}

				const candidates = prng.shuffle(Array.from(neighborSectors));
				for (const newSector of candidates) {
					grid[cell.row][cell.col] = newSector;
					const seedRow = oldSector;
					const seedCol = queens[oldSector];
					if (this.isSectorConnected(grid, size, oldSector, seedRow, seedCol)) {
						carved = true;
						break;
					}
					grid[cell.row][cell.col] = oldSector;
				}
				if (carved) break;
			}

			if (!carved) return null;
		}

		return Solver.solve(grid, size, 2).length === 1 ? grid : null;
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
