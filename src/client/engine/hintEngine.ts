/**
 * Smart Deductive Hint Engine for KarmaGrid.
 * Explains *why* a cell must be a Star (⭐), Cross (✕), or cleared based on
 * strict row, column, subreddit sector, and no-touch (diagonal/orthogonal) logic.
 * Never guesses randomly — every Star/Cross suggestion is verified against
 * the puzzle's unique solution.
 */

import type { DailyPuzzle } from "./generator";
import { type Point, Solver } from "./solver";

export type HintAction =
	| "place_star"
	| "place_cross"
	| "remove_conflict"
	| "fix_mistake";

export type HintRule =
	| "conflict_resolution"
	| "mistake_correction"
	| "naked_single_sector"
	| "naked_single_row"
	| "naked_single_col"
	| "adjacency_elimination"
	| "sector_elimination"
	| "row_elimination"
	| "col_elimination"
	| "sector_line_intersection"
	| "forced_touch_elimination"
	| "unique_solution_deduction";

export interface DeductiveHint {
	row: number;
	col: number;
	action: HintAction;
	recommendedValue: 0 | 1 | 2;
	rule: HintRule;
	ruleBadge: string;
	title: string;
	explanation: string;
	relatedCells: Point[];
}

function coordLabel(row: number, col: number): string {
	return `R${row + 1}C${col + 1}`;
}

function isTouchAdjacent(
	r1: number,
	c1: number,
	r2: number,
	c2: number,
): boolean {
	return (
		Math.abs(r1 - r2) <= 1 &&
		Math.abs(c1 - c2) <= 1 &&
		!(r1 === r2 && c1 === c2)
	);
}

function isDiagonalTouch(
	r1: number,
	c1: number,
	r2: number,
	c2: number,
): boolean {
	return Math.abs(r1 - r2) === 1 && Math.abs(c1 - c2) === 1;
}

/**
 * Counts solutions consistent with a partial assignment:
 * - forcedStars: cells that MUST be Stars
 * - blockedCells: cells that CANNOT be Stars
 */
function countConstrainedSolutions(
	sectors: number[][],
	size: number,
	forcedStars: Point[],
	blockedSet: Set<string>,
	maxSolutions: number = 2,
): number {
	const forcedRowCol = new Array<number>(size).fill(-1);
	for (const pt of forcedStars) {
		if (forcedRowCol[pt.row] !== -1 && forcedRowCol[pt.row] !== pt.col) {
			return 0;
		}
		if (blockedSet.has(`${pt.row},${pt.col}`)) {
			return 0;
		}
		forcedRowCol[pt.row] = pt.col;
	}

	let solutions = 0;
	const queens = new Array<number>(size).fill(-1);
	const usedCols = new Array<boolean>(size).fill(false);
	const usedSectors = new Array<boolean>(size).fill(false);

	function backtrack(row: number) {
		if (solutions >= maxSolutions) return;
		if (row === size) {
			solutions++;
			return;
		}

		const forcedCol = forcedRowCol[row];
		const startCol = forcedCol !== -1 ? forcedCol : 0;
		const endCol = forcedCol !== -1 ? forcedCol : size - 1;

		for (let col = startCol; col <= endCol; col++) {
			if (blockedSet.has(`${row},${col}`)) continue;
			if (usedCols[col]) continue;

			const sector = sectors[row][col];
			if (usedSectors[sector]) continue;

			if (row > 0 && Math.abs(queens[row - 1] - col) <= 1) continue;

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

export class SmartHintEngine {
	/**
	 * Applies a deductive hint directly to a copy of the user's grid.
	 */
	static applyHint(userGrid: number[][], hint: DeductiveHint): number[][] {
		const next = userGrid.map((row) => [...row]);
		if (
			hint.row >= 0 &&
			hint.row < next.length &&
			hint.col >= 0 &&
			hint.col < next[hint.row].length
		) {
			next[hint.row][hint.col] = hint.recommendedValue;
		}
		return next;
	}

	/**
	 * Computes the clearest next logical step with a human-readable explanation.
	 * Returns null if the board is already solved.
	 */
	static getNextHint(
		userGrid: number[][],
		puzzle: DailyPuzzle,
	): DeductiveHint | null {
		const { size, sectors, subreddits, solution } = puzzle;

		if (Solver.isSolved(userGrid, sectors, size)) {
			return null;
		}

		const solutionSet = new Set(solution.map((pt) => `${pt.row},${pt.col}`));
		const sectorName = (s: number) => subreddits[s]?.name ?? `Sector ${s + 1}`;

		// Collect placed stars
		const placedStars: Point[] = [];
		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				if (userGrid[r]?.[c] === 1) {
					placedStars.push({ row: r, col: c });
				}
			}
		}

		// 1. Resolve active conflicts first
		const conflicts = Solver.findConflicts(userGrid, sectors, size);
		if (conflicts.length > 0) {
			const target =
				conflicts.find((pt) => !solutionSet.has(`${pt.row},${pt.col}`)) ??
				conflicts[0];
			const partner = placedStars.find(
				(s) =>
					!(s.row === target.row && s.col === target.col) &&
					(s.row === target.row ||
						s.col === target.col ||
						sectors[s.row][s.col] === sectors[target.row][target.col] ||
						isTouchAdjacent(s.row, s.col, target.row, target.col)),
			);

			const reasons: string[] = [];
			if (partner) {
				if (partner.row === target.row) {
					reasons.push(`shares Row ${target.row + 1}`);
				}
				if (partner.col === target.col) {
					reasons.push(`shares Column ${target.col + 1}`);
				}
				if (
					sectors[partner.row][partner.col] === sectors[target.row][target.col]
				) {
					reasons.push(`shares ${sectorName(sectors[target.row][target.col])}`);
				}
				if (isDiagonalTouch(partner.row, partner.col, target.row, target.col)) {
					reasons.push("touches diagonally");
				} else if (
					isTouchAdjacent(partner.row, partner.col, target.row, target.col)
				) {
					reasons.push("touches orthogonally");
				}
			}

			const partnerText = partner
				? coordLabel(partner.row, partner.col)
				: "another Star";
			const reasonText =
				reasons.length > 0 ? reasons.join(" and ") : "violates placement rules";

			return {
				row: target.row,
				col: target.col,
				action: "remove_conflict",
				recommendedValue: 0,
				rule: "conflict_resolution",
				ruleBadge: "Conflict Fix",
				title: `Remove conflicting ⭐ at ${coordLabel(target.row, target.col)}`,
				explanation: `The ⭐ at ${coordLabel(target.row, target.col)} ${reasonText} with the ⭐ at ${partnerText}. Clear ${coordLabel(target.row, target.col)} first.`,
				relatedCells: partner ? [partner] : [],
			};
		}

		// 2. Catch subtle mistakes (a Star placed off-solution, or an X blocking a true Star)
		const wrongStar = placedStars.find(
			(pt) => !solutionSet.has(`${pt.row},${pt.col}`),
		);
		if (wrongStar) {
			const sub = sectorName(sectors[wrongStar.row][wrongStar.col]);
			return {
				row: wrongStar.row,
				col: wrongStar.col,
				action: "fix_mistake",
				recommendedValue: 0,
				rule: "mistake_correction",
				ruleBadge: "Dead-End Check",
				title: `Clear misplaced ⭐ at ${coordLabel(wrongStar.row, wrongStar.col)}`,
				explanation: `Placing a ⭐ at ${coordLabel(wrongStar.row, wrongStar.col)} in ${sub} blocks required rows, columns, or adjacent cells needed to complete the rest of the board. Clear it to stay on the unique solution path.`,
				relatedCells: [],
			};
		}

		const crossedSolution = solution.find(
			(pt) => userGrid[pt.row]?.[pt.col] === 2,
		);
		if (crossedSolution) {
			const sub = sectorName(sectors[crossedSolution.row][crossedSolution.col]);
			return {
				row: crossedSolution.row,
				col: crossedSolution.col,
				action: "fix_mistake",
				recommendedValue: 0,
				rule: "mistake_correction",
				ruleBadge: "Blocked Star",
				title: `Unmark ✕ at ${coordLabel(crossedSolution.row, crossedSolution.col)}`,
				explanation: `Cell ${coordLabel(crossedSolution.row, crossedSolution.col)} in ${sub} was marked ✕, but eliminating it leaves no valid solution for the grid. Clear the ✕ so this cell can hold a ⭐.`,
				relatedCells: [],
			};
		}

		// Helper: find which already-placed Star directly blocks (r, c)
		const findDirectBlocker = (
			r: number,
			c: number,
		): {
			star: Point;
			reason: "adjacency" | "sector" | "row" | "col";
		} | null => {
			for (const star of placedStars) {
				if (isTouchAdjacent(r, c, star.row, star.col)) {
					return { star, reason: "adjacency" };
				}
			}
			for (const star of placedStars) {
				if (sectors[r][c] === sectors[star.row][star.col]) {
					return { star, reason: "sector" };
				}
			}
			for (const star of placedStars) {
				if (r === star.row) return { star, reason: "row" };
				if (c === star.col) return { star, reason: "col" };
			}
			return null;
		};

		const solvedRows = new Set(placedStars.map((p) => p.row));
		const solvedCols = new Set(placedStars.map((p) => p.col));
		const solvedSectors = new Set(
			placedStars.map((p) => sectors[p.row][p.col]),
		);

		// Compute effective open candidates (empty cells not blocked by any placed star)
		const isOpenCandidate = (r: number, c: number): boolean => {
			if (userGrid[r]?.[c] !== 0) return false;
			if (
				solvedRows.has(r) ||
				solvedCols.has(c) ||
				solvedSectors.has(sectors[r][c])
			) {
				return false;
			}
			for (const star of placedStars) {
				if (isTouchAdjacent(r, c, star.row, star.col)) return false;
			}
			return true;
		};

		const sectorCells: Point[][] = Array.from({ length: size }, () => []);
		const sectorCandidates: Point[][] = Array.from({ length: size }, () => []);
		const rowCandidates: Point[][] = Array.from({ length: size }, () => []);
		const colCandidates: Point[][] = Array.from({ length: size }, () => []);

		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				const s = sectors[r][c];
				sectorCells[s].push({ row: r, col: c });
				if (isOpenCandidate(r, c)) {
					const pt = { row: r, col: c };
					sectorCandidates[s].push(pt);
					rowCandidates[r].push(pt);
					colCandidates[c].push(pt);
				}
			}
		}

		// 3. Naked Single in Subreddit Sector (most intuitive Star deduction)
		for (let s = 0; s < size; s++) {
			if (solvedSectors.has(s)) continue;
			if (sectorCandidates[s].length === 1) {
				const target = sectorCandidates[s][0];
				if (solutionSet.has(`${target.row},${target.col}`)) {
					const sub = sectorName(s);
					const totalInSector = sectorCells[s].length;
					const explanation =
						totalInSector === 1
							? `${sub} has only one cell (${coordLabel(target.row, target.col)}), and every subreddit must have exactly one ⭐.`
							: `All other cells in ${sub} are ruled out by ✕ marks or existing Stars (row, column, or touch rules). ${coordLabel(target.row, target.col)} is the only remaining valid cell for ${sub}'s ⭐.`;

					return {
						row: target.row,
						col: target.col,
						action: "place_star",
						recommendedValue: 1,
						rule: "naked_single_sector",
						ruleBadge: "Subreddit Single",
						title: `Place ⭐ at ${coordLabel(target.row, target.col)} (${sub})`,
						explanation,
						relatedCells: sectorCells[s].filter(
							(p) => !(p.row === target.row && p.col === target.col),
						),
					};
				}
			}
		}

		// 4. Naked Single in Row
		for (let r = 0; r < size; r++) {
			if (solvedRows.has(r)) continue;
			if (rowCandidates[r].length === 1) {
				const target = rowCandidates[r][0];
				if (solutionSet.has(`${target.row},${target.col}`)) {
					return {
						row: target.row,
						col: target.col,
						action: "place_star",
						recommendedValue: 1,
						rule: "naked_single_row",
						ruleBadge: "Row Single",
						title: `Place ⭐ at ${coordLabel(target.row, target.col)} (Row ${r + 1})`,
						explanation: `Row ${r + 1} needs exactly one ⭐, and every other cell in Row ${r + 1} is blocked by ✕ marks or existing Stars. ${coordLabel(target.row, target.col)} must be a ⭐.`,
						relatedCells: Array.from({ length: size }, (_, c) => ({
							row: r,
							col: c,
						})).filter((p) => p.col !== target.col),
					};
				}
			}
		}

		// 5. Naked Single in Column
		for (let c = 0; c < size; c++) {
			if (solvedCols.has(c)) continue;
			if (colCandidates[c].length === 1) {
				const target = colCandidates[c][0];
				if (solutionSet.has(`${target.row},${target.col}`)) {
					return {
						row: target.row,
						col: target.col,
						action: "place_star",
						recommendedValue: 1,
						rule: "naked_single_col",
						ruleBadge: "Column Single",
						title: `Place ⭐ at ${coordLabel(target.row, target.col)} (Col ${c + 1})`,
						explanation: `Column ${c + 1} needs exactly one ⭐, and all other cells in Column ${c + 1} are already ruled out. ${coordLabel(target.row, target.col)} is forced to be a ⭐.`,
						relatedCells: Array.from({ length: size }, (_, r) => ({
							row: r,
							col: c,
						})).filter((p) => p.row !== target.row),
					};
				}
			}
		}

		// 6. Direct Elimination from Placed Stars (prioritize diagonal touch -> sector -> row -> col)
		const directEliminations: {
			pt: Point;
			star: Point;
			reason: "adjacency" | "sector" | "row" | "col";
			priority: number;
		}[] = [];

		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				if (userGrid[r]?.[c] !== 0) continue;
				if (solutionSet.has(`${r},${c}`)) continue;
				const blocker = findDirectBlocker(r, c);
				if (!blocker) continue;

				const priority =
					blocker.reason === "adjacency"
						? isDiagonalTouch(r, c, blocker.star.row, blocker.star.col)
							? 1
							: 2
						: blocker.reason === "sector"
							? 3
							: blocker.reason === "row"
								? 4
								: 5;

				directEliminations.push({
					pt: { row: r, col: c },
					star: blocker.star,
					reason: blocker.reason,
					priority,
				});
			}
		}

		if (directEliminations.length > 0) {
			directEliminations.sort((a, b) => a.priority - b.priority);
			const best = directEliminations[0];
			const targetCoord = coordLabel(best.pt.row, best.pt.col);
			const starCoord = coordLabel(best.star.row, best.star.col);

			if (best.reason === "adjacency") {
				const diag = isDiagonalTouch(
					best.pt.row,
					best.pt.col,
					best.star.row,
					best.star.col,
				);
				return {
					row: best.pt.row,
					col: best.pt.col,
					action: "place_cross",
					recommendedValue: 2,
					rule: "adjacency_elimination",
					ruleBadge: diag ? "No Diagonal Touch" : "No Touch Rule",
					title: `Mark ✕ at ${targetCoord}`,
					explanation: `Cell ${targetCoord} touches the ⭐ at ${starCoord} ${diag ? "diagonally" : "directly"}. Stars cannot touch in any direction, so ${targetCoord} must be ✕.`,
					relatedCells: [best.star],
				};
			}

			if (best.reason === "sector") {
				const sub = sectorName(sectors[best.pt.row][best.pt.col]);
				return {
					row: best.pt.row,
					col: best.pt.col,
					action: "place_cross",
					recommendedValue: 2,
					rule: "sector_elimination",
					ruleBadge: "Subreddit Rule",
					title: `Mark ✕ at ${targetCoord}`,
					explanation: `${sub} already has its ⭐ at ${starCoord}. Since each subreddit allows only one ⭐, mark ${targetCoord} as ✕.`,
					relatedCells: [best.star],
				};
			}

			if (best.reason === "row") {
				return {
					row: best.pt.row,
					col: best.pt.col,
					action: "place_cross",
					recommendedValue: 2,
					rule: "row_elimination",
					ruleBadge: "Row Rule",
					title: `Mark ✕ at ${targetCoord}`,
					explanation: `Row ${best.pt.row + 1} already has a ⭐ at ${starCoord}. Only one ⭐ is allowed per row, so ${targetCoord} must be ✕.`,
					relatedCells: [best.star],
				};
			}

			return {
				row: best.pt.row,
				col: best.pt.col,
				action: "place_cross",
				recommendedValue: 2,
				rule: "col_elimination",
				ruleBadge: "Column Rule",
				title: `Mark ✕ at ${targetCoord}`,
				explanation: `Column ${best.pt.col + 1} already has a ⭐ at ${starCoord}. Only one ⭐ is allowed per column, so ${targetCoord} must be ✕.`,
				relatedCells: [best.star],
			};
		}

		// 7. Sector-Line Intersection (Pointing Sectors / Locked Rows & Columns)
		for (let s = 0; s < size; s++) {
			if (solvedSectors.has(s)) continue;
			const cands = sectorCandidates[s];
			if (cands.length === 0) continue;

			const sub = sectorName(s);
			const uniqueRows = new Set(cands.map((p) => p.row));
			if (uniqueRows.size === 1) {
				const lockedRow = cands[0].row;
				const elim = rowCandidates[lockedRow].find(
					(p) =>
						sectors[p.row][p.col] !== s &&
						!solutionSet.has(`${p.row},${p.col}`),
				);
				if (elim) {
					return {
						row: elim.row,
						col: elim.col,
						action: "place_cross",
						recommendedValue: 2,
						rule: "sector_line_intersection",
						ruleBadge: "Sector-Row Lock",
						title: `Mark ✕ at ${coordLabel(elim.row, elim.col)}`,
						explanation: `All remaining valid cells for ${sub} lie in Row ${lockedRow + 1}, so Row ${lockedRow + 1}'s ⭐ must be inside ${sub}. Therefore ${coordLabel(elim.row, elim.col)} (in ${sectorName(sectors[elim.row][elim.col])}) must be ✕.`,
						relatedCells: cands,
					};
				}
			}

			const uniqueCols = new Set(cands.map((p) => p.col));
			if (uniqueCols.size === 1) {
				const lockedCol = cands[0].col;
				const elim = colCandidates[lockedCol].find(
					(p) =>
						sectors[p.row][p.col] !== s &&
						!solutionSet.has(`${p.row},${p.col}`),
				);
				if (elim) {
					return {
						row: elim.row,
						col: elim.col,
						action: "place_cross",
						recommendedValue: 2,
						rule: "sector_line_intersection",
						ruleBadge: "Sector-Col Lock",
						title: `Mark ✕ at ${coordLabel(elim.row, elim.col)}`,
						explanation: `All remaining valid cells for ${sub} lie in Column ${lockedCol + 1}, so Column ${lockedCol + 1}'s ⭐ must belong to ${sub}. Therefore ${coordLabel(elim.row, elim.col)} must be ✕.`,
						relatedCells: cands,
					};
				}
			}
		}

		// 7b. Row or Column completely contained inside a single Subreddit Sector
		for (let r = 0; r < size; r++) {
			if (solvedRows.has(r)) continue;
			const cands = rowCandidates[r];
			if (cands.length === 0) continue;
			const uniqueSectors = new Set(cands.map((p) => sectors[p.row][p.col]));
			if (uniqueSectors.size === 1) {
				const lockedSector = sectors[cands[0].row][cands[0].col];
				const elim = sectorCandidates[lockedSector].find(
					(p) => p.row !== r && !solutionSet.has(`${p.row},${p.col}`),
				);
				if (elim) {
					return {
						row: elim.row,
						col: elim.col,
						action: "place_cross",
						recommendedValue: 2,
						rule: "sector_line_intersection",
						ruleBadge: "Row-Sector Lock",
						title: `Mark ✕ at ${coordLabel(elim.row, elim.col)}`,
						explanation: `Row ${r + 1}'s only open spots are inside ${sectorName(lockedSector)}, so ${sectorName(lockedSector)}'s ⭐ must sit on Row ${r + 1}. That rules out ${coordLabel(elim.row, elim.col)} — mark it ✕.`,
						relatedCells: cands,
					};
				}
			}
		}

		for (let c = 0; c < size; c++) {
			if (solvedCols.has(c)) continue;
			const cands = colCandidates[c];
			if (cands.length === 0) continue;
			const uniqueSectors = new Set(cands.map((p) => sectors[p.row][p.col]));
			if (uniqueSectors.size === 1) {
				const lockedSector = sectors[cands[0].row][cands[0].col];
				const elim = sectorCandidates[lockedSector].find(
					(p) => p.col !== c && !solutionSet.has(`${p.row},${p.col}`),
				);
				if (elim) {
					return {
						row: elim.row,
						col: elim.col,
						action: "place_cross",
						recommendedValue: 2,
						rule: "sector_line_intersection",
						ruleBadge: "Col-Sector Lock",
						title: `Mark ✕ at ${coordLabel(elim.row, elim.col)}`,
						explanation: `Column ${c + 1}'s only open spots are inside ${sectorName(lockedSector)}, so ${sectorName(lockedSector)}'s ⭐ must sit in Column ${c + 1}. Therefore ${coordLabel(elim.row, elim.col)} must be ✕.`,
						relatedCells: cands,
					};
				}
			}
		}

		// 7c. Forced Touch Elimination: any open candidate that would wipe out an entire sector/row/col via row/col/touch
		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				if (!isOpenCandidate(r, c)) continue;
				if (solutionSet.has(`${r},${c}`)) continue;

				const cellSector = sectors[r][c];
				for (let s = 0; s < size; s++) {
					if (s === cellSector || solvedSectors.has(s)) continue;
					const cands = sectorCandidates[s];
					if (cands.length === 0) continue;

					const wipesOutSector = cands.every(
						(p) =>
							p.row === r || p.col === c || isTouchAdjacent(r, c, p.row, p.col),
					);
					if (wipesOutSector) {
						return {
							row: r,
							col: c,
							action: "place_cross",
							recommendedValue: 2,
							rule: "forced_touch_elimination",
							ruleBadge: "No-Touch Trap",
							title: `Mark ✕ at ${coordLabel(r, c)}`,
							explanation: `If you placed a ⭐ at ${coordLabel(r, c)}, its row, column, and diagonal touch zone would eliminate every remaining valid spot in ${sectorName(s)}. Therefore ${coordLabel(r, c)} must be ✕.`,
							relatedCells: cands,
						};
					}
				}
			}
		}

		// 8. Solver-Verified Contradiction Deduction (MRV: smallest unsolved sector first)
		const blockedSet = new Set<string>();
		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				if (userGrid[r]?.[c] === 2) {
					blockedSet.add(`${r},${c}`);
				}
			}
		}

		const unsolvedSectors = Array.from({ length: size }, (_, s) => s)
			.filter((s) => !solvedSectors.has(s) && sectorCandidates[s].length > 0)
			.sort((a, b) => sectorCandidates[a].length - sectorCandidates[b].length);

		for (const s of unsolvedSectors) {
			const cands = sectorCandidates[s];
			const solutionPt = cands.find((p) =>
				solutionSet.has(`${p.row},${p.col}`),
			);
			if (!solutionPt) continue;

			const alternatives = cands.filter(
				(p) => !(p.row === solutionPt.row && p.col === solutionPt.col),
			);

			// Check if an alternative immediately leads to 0 valid board completions
			const deadAlt = alternatives.find(
				(alt) =>
					countConstrainedSolutions(
						sectors,
						size,
						[...placedStars, alt],
						blockedSet,
						1,
					) === 0,
			);

			if (alternatives.length === 1 && deadAlt) {
				const sub = sectorName(s);
				return {
					row: solutionPt.row,
					col: solutionPt.col,
					action: "place_star",
					recommendedValue: 1,
					rule: "unique_solution_deduction",
					ruleBadge: "Constraint Proof",
					title: `Place ⭐ at ${coordLabel(solutionPt.row, solutionPt.col)} (${sub})`,
					explanation: `${sub} only has two open cells (${coordLabel(solutionPt.row, solutionPt.col)} and ${coordLabel(deadAlt.row, deadAlt.col)}). Trying a ⭐ at ${coordLabel(deadAlt.row, deadAlt.col)} causes a row/column/touch dead-end in other subreddits, proving ${coordLabel(solutionPt.row, solutionPt.col)} must be ⭐.`,
					relatedCells: [deadAlt],
				};
			}

			if (deadAlt) {
				const sub = sectorName(s);
				return {
					row: deadAlt.row,
					col: deadAlt.col,
					action: "place_cross",
					recommendedValue: 2,
					rule: "unique_solution_deduction",
					ruleBadge: "Constraint Proof",
					title: `Mark ✕ at ${coordLabel(deadAlt.row, deadAlt.col)}`,
					explanation: `Testing a ⭐ at ${coordLabel(deadAlt.row, deadAlt.col)} inside ${sub} creates a chain of row, column, and diagonal touch conflicts that leaves zero valid completions for the remaining subreddits. Mark ${coordLabel(deadAlt.row, deadAlt.col)} as ✕.`,
					relatedCells: cands.filter(
						(p) => !(p.row === deadAlt.row && p.col === deadAlt.col),
					),
				};
			}
		}

		// Final guaranteed fallback: pick next unplaced solution Star from smallest unsolved sector
		const fallbackStar = solution.find(
			(pt) => userGrid[pt.row]?.[pt.col] !== 1,
		);
		if (fallbackStar) {
			const s = sectors[fallbackStar.row][fallbackStar.col];
			const sub = sectorName(s);
			return {
				row: fallbackStar.row,
				col: fallbackStar.col,
				action: "place_star",
				recommendedValue: 1,
				rule: "unique_solution_deduction",
				ruleBadge: "Unique Solution",
				title: `Place ⭐ at ${coordLabel(fallbackStar.row, fallbackStar.col)} (${sub})`,
				explanation: `By eliminating all configurations that violate row, column, subreddit, or no-touch rules, ${coordLabel(fallbackStar.row, fallbackStar.col)} is uniquely required as the ⭐ for ${sub}.`,
				relatedCells: sectorCandidates[s].filter(
					(p) => !(p.row === fallbackStar.row && p.col === fallbackStar.col),
				),
			};
		}

		return null;
	}
}
