import type React from "react";
import type { SubredditTheme } from "../engine/generator";
import type { DeductiveHint } from "../engine/hintEngine";

interface ControlsProps {
	canUndo: boolean;
	canRedo: boolean;
	isWon: boolean;
	activeHint: DeductiveHint | null;
	onUndo: () => void;
	onRedo: () => void;
	onHint: () => void;
	onApplyHint: () => void;
	onDismissHint: () => void;
	onClear: () => void;
	onAutoX: () => void;
	subreddits: SubredditTheme[];
}

export const Controls: React.FC<ControlsProps> = ({
	canUndo,
	canRedo,
	isWon,
	activeHint,
	onUndo,
	onRedo,
	onHint,
	onApplyHint,
	onDismissHint,
	onClear,
	onAutoX,
	subreddits,
}) => {
	return (
		<>
			{activeHint && (
				<div
					className={`hint-banner hint-banner-${activeHint.action}`}
					role="status"
				>
					<div className="hint-banner-header">
						<div className="hint-banner-title-row">
							<span className="hint-rule-badge">{activeHint.ruleBadge}</span>
							<strong className="hint-banner-title">{activeHint.title}</strong>
						</div>
						<button
							type="button"
							className="hint-dismiss-btn"
							onClick={onDismissHint}
							aria-label="Dismiss hint"
							title="Dismiss (Esc)"
						>
							✕
						</button>
					</div>
					<p className="hint-banner-text">{activeHint.explanation}</p>
					<div className="hint-banner-actions">
						<button
							type="button"
							className="hint-apply-btn"
							onClick={onApplyHint}
						>
							Apply Step <kbd className="kbd-inline">Enter</kbd>
						</button>
					</div>
				</div>
			)}

			<div className="controls-bar">
				<button
					type="button"
					className="control-btn"
					onClick={onUndo}
					disabled={!canUndo || isWon}
					title="Undo move (Z)"
				>
					<span>↩️</span>
					<span className="control-label">
						Undo <kbd className="kbd-tag">Z</kbd>
					</span>
				</button>

				<button
					type="button"
					className="control-btn"
					onClick={onRedo}
					disabled={!canRedo || isWon}
					title="Redo move (Y)"
				>
					<span>↪️</span>
					<span className="control-label">
						Redo <kbd className="kbd-tag">Y</kbd>
					</span>
				</button>

				<button
					type="button"
					className={`control-btn hint-btn ${activeHint ? "hint-btn-active" : ""}`}
					onClick={onHint}
					disabled={isWon}
					title="Smart Deductive Hint (H)"
				>
					<span>💡</span>
					<span className="control-label">
						Hint <kbd className="kbd-tag">H</kbd>
					</span>
				</button>

				<button
					type="button"
					className="control-btn"
					onClick={onAutoX}
					disabled={isWon}
					title="Mark X around placed stars"
				>
					<span>✨</span>
					<span className="control-label">Auto-X</span>
				</button>

				<button
					type="button"
					className="control-btn"
					onClick={onClear}
					disabled={isWon}
					title="Reset board (R)"
				>
					<span>🗑️</span>
					<span className="control-label">
						Reset <kbd className="kbd-tag">R</kbd>
					</span>
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
