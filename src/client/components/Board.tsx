import type React from "react";
import type { SubredditTheme } from "../engine/generator";
import type { Point } from "../engine/solver";

interface BoardProps {
	size: number;
	sectors: number[][];
	userGrid: number[][]; // 0 = empty, 1 = star, 2 = cross
	conflicts: Point[];
	subreddits: SubredditTheme[];
	onCellClick: (row: number, col: number) => void;
	onCellRightClick: (row: number, col: number, e: React.MouseEvent) => void;
}

export const Board: React.FC<BoardProps> = ({
	size,
	sectors,
	userGrid,
	conflicts,
	subreddits,
	onCellClick,
	onCellRightClick,
}) => {
	const isConflict = (r: number, c: number) =>
		conflicts.some((p) => p.row === r && p.col === c);

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

						// Determine if neighboring cell belongs to a different sector
						const borderTop = r > 0 && sectors[r - 1][c] !== sectorId;
						const borderBottom = r < size - 1 && sectors[r + 1][c] !== sectorId;
						const borderLeft = c > 0 && sectors[r][c - 1] !== sectorId;
						const borderRight = c < size - 1 && sectors[r][c + 1] !== sectorId;

						const borderClasses = [
							borderTop ? "sector-border-top" : "cell-border-top",
							borderBottom ? "sector-border-bottom" : "cell-border-bottom",
							borderLeft ? "sector-border-left" : "cell-border-left",
							borderRight ? "sector-border-right" : "cell-border-right",
							conflict ? "conflict-bg" : "",
						].join(" ");

						return (
							<div
								key={`${r}-${c}`}
								className={`cell ${borderClasses}`}
								style={{
									backgroundColor: theme.color,
								}}
								onClick={() => onCellClick(r, c)}
								onContextMenu={(e) => onCellRightClick(r, c, e)}
							>
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
							</div>
						);
					}),
				)}
			</div>
		</div>
	);
};
