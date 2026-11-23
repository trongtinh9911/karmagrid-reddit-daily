import type React from "react";
import type { SubredditTheme } from "../engine/generator";

interface ControlsProps {
	canUndo: boolean;
	canRedo: boolean;
	onUndo: () => void;
	onRedo: () => void;
	onClear: () => void;
	onAutoX: () => void;
	subreddits: SubredditTheme[];
}

export const Controls: React.FC<ControlsProps> = ({
	canUndo,
	canRedo,
	onUndo,
	onRedo,
	onClear,
	onAutoX,
	subreddits,
}) => {
	return (
		<>
			<div className="controls-bar">
				<button
					className="control-btn"
					onClick={onUndo}
					disabled={!canUndo}
					title="Undo move"
				>
					<span>↩️</span>
					<span>Undo</span>
				</button>

				<button
					className="control-btn"
					onClick={onRedo}
					disabled={!canRedo}
					title="Redo move"
				>
					<span>↪️</span>
					<span>Redo</span>
				</button>

				<button
					className="control-btn"
					onClick={onAutoX}
					title="Mark X around placed stars"
				>
					<span>✨</span>
					<span>Auto-X</span>
				</button>

				<button
					className="control-btn"
					onClick={onClear}
					title="Clear all tokens"
				>
					<span>🗑️</span>
					<span>Reset</span>
				</button>
			</div>

			<div className="legend-bar">
				{subreddits.map((sub, i) => (
					<div
						key={i}
						className="legend-tag"
						style={{
							backgroundColor: sub.color,
							borderColor: sub.borderColor,
							color: sub.textColor,
						}}
					>
						<span
							className="legend-dot"
							style={{ backgroundColor: sub.borderColor }}
						/>
						<span>{sub.name}</span>
					</div>
				))}
			</div>
		</>
	);
};
