import type React from "react";

interface HowToPlayModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({
	isOpen,
	onClose,
}) => {
	if (!isOpen) return null;

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-content" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h2 className="modal-title">How to Play KarmaGrid</h2>
					<button type="button" className="close-btn" onClick={onClose}>
						✕
					</button>
				</div>

				<div className="modal-body">
					<div className="rule-item">
						<div className="rule-number">1</div>
						<div>
							<strong>One Star per Row &amp; Column:</strong> Place exactly one
							Snoo Karma Star ⭐ in every horizontal row and vertical column.
						</div>
					</div>

					<div className="rule-item">
						<div className="rule-number">2</div>
						<div>
							<strong>One Star per Subreddit:</strong> The grid is divided into
							colored Subreddit sectors. Each colored sector must have exactly
							one ⭐.
						</div>
					</div>

					<div className="rule-item">
						<div className="rule-number">3</div>
						<div>
							<strong>No Touching:</strong> Stars cannot touch each other in any
							direction — not even diagonally!
						</div>
					</div>

					<div className="rule-item">
						<div className="rule-number">4</div>
						<div>
							<strong>Smart Hints &amp; Archive Practice:</strong> Click{" "}
							<strong>💡 Hint</strong> for a step-by-step logical explanation,
							or switch between <strong>5×5</strong>, <strong>6×6</strong>, and{" "}
							<strong>7×7 Master</strong> practice boards anytime without
							risking your Daily Streak.
						</div>
					</div>

					<div className="shortcuts-box">
						<div className="shortcuts-title">Keyboard Shortcuts</div>
						<div className="shortcuts-grid">
							<span>
								<kbd className="kbd-tag">Z</kbd> Undo
							</span>
							<span>
								<kbd className="kbd-tag">Y</kbd> Redo
							</span>
							<span>
								<kbd className="kbd-tag">H</kbd> Smart Hint
							</span>
							<span>
								<kbd className="kbd-tag">R</kbd> Reset
							</span>
						</div>
					</div>
				</div>

				<button
					type="button"
					className="control-btn primary-btn"
					onClick={onClose}
				>
					Got it, let's play!
				</button>
			</div>
		</div>
	);
};
