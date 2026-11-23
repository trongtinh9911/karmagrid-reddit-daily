import type React from "react";
import type { SubredditTheme } from "../engine/generator";
import type { DeductiveHint } from "../engine/hintEngine";
import type { Point } from "../engine/solver";

interface BoardProps {
	size: number;
	sectors: number[][];
	userGrid: number[][]; // 0 = empty, 1 = star, 2 = cross
	conflicts: Point[];
	subreddits: SubredditTheme[];
	activeHint?: DeductiveHint | null;
	onCellClick: (row: number, col: number) => void;
	onCellRightClick: (row: number, col: number, e: React.MouseEvent) => void;
}

export const Board: React.FC<BoardProps> = ({
	size,
	sectors,
	userGrid,
	conflicts,
	subreddits,
	activeHint = null,
	onCellClick,
	onCellRightClick,
}) => {
	const isConflict = (r: number, c: number) =>
		conflicts.some((p) => p.row === r && p.col === c);

	const isHintTarget = (r: number, c: number) =>
		activeHint !== null && activeHint.row === r && activeHint.col === c;

	const isHintRelated = (r: number, c: number) =>
		activeHint !== null &&
		activeHint.relatedCells.some((p) => p.row === r && p.col === c);

	return (
		<div className="board-wrapper">
			<div
				className="grid-board"
				style={{
					gridTemplateColumns: `repeat(${size}, 1fr)`,
					gridTemplateRows: `repeat(${size}, 1fr)`,
				}}
			>
				{Array.from({ length: size }).map((_, r) =>
					Array.from({ length: size }).map((_, c) => {
						const sectorId = sectors[r]?.[c] ?? 0;
						const theme = subreddits[sectorId] || subreddits[0];
						const state = userGrid[r]?.[c] ?? 0;
						const conflict = isConflict(r, c);
						const hintTarget = isHintTarget(r, c);
						const hintRelated = !hintTarget && isHintRelated(r, c);

						// Determine if neighboring cell belongs to a different sector
						const borderTop = r > 0 && sectors[r - 1][c] !== sectorId;
						const borderBottom = r < size - 1 && sectors[r + 1][c] !== sectorId;
						const borderLeft = c > 0 && sectors[r][c - 1] !== sectorId;
						const borderRight = c < size - 1 && sectors[r][c + 1] !== sectorId;

						const hintClass = hintTarget
							? activeHint?.action === "place_star"
								? "hint-target-star"
								: activeHint?.action === "place_cross"
									? "hint-target-cross"
									: "hint-target-fix"
							: hintRelated
								? "hint-related"
								: "";

						const borderClasses = [
							borderTop ? "sector-border-top" : "cell-border-top",
							borderBottom ? "sector-border-bottom" : "cell-border-bottom",
							borderLeft ? "sector-border-left" : "cell-border-left",
							borderRight ? "sector-border-right" : "cell-border-right",
							conflict ? "conflict-bg" : "",
							hintClass,
						]
							.filter(Boolean)
							.join(" ");

						return (
							<div
								key={`${r}-${c}`}
								className={`cell ${borderClasses}`}
								data-coord={`R${r + 1}C${c + 1}`}
								title={`R${r + 1}C${c + 1} · ${theme.name}`}
								style={{
									backgroundColor: theme.color,
								}}
								onClick={() => onCellClick(r, c)}
								onContextMenu={(e) => onCellRightClick(r, c, e)}
							>
								{r === 0 && <span className="coord-col-tag">{c + 1}</span>}
								{c === 0 && <span className="coord-row-tag">{r + 1}</span>}
								{state === 1 && (
									<svg
										viewBox="0 0 24 24"
										fill="currentColor"
										className={`token-star ${conflict ? "token-conflict" : ""}`}
									>
										<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
									</svg>
								)}
								{state === 2 && <span className="token-cross">✕</span>}
								{state === 0 &&
									hintTarget &&
									activeHint?.action === "place_star" && (
										<span className="hint-ghost-star" aria-hidden="true">
											⭐
										</span>
									)}
								{state === 0 &&
									hintTarget &&
									activeHint?.action === "place_cross" && (
										<span className="hint-ghost-cross" aria-hidden="true">
											✕
										</span>
									)}
							</div>
						);
					}),
				)}
			</div>
		</div>
	);
};
