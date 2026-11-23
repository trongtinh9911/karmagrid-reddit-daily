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
					<button className="close-btn" onClick={onClose}>
						✕
					</button>
				</div>

				<div className="modal-body">
					<div className="rule-item">
						<div className="rule-number">1</div>
						<div>
							<strong>One Star per Row & Column:</strong> Place exactly one Snoo
							Karma Star ⭐ in every horizontal row and vertical column.
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
							direction—not even diagonally!
						</div>
					</div>

					<div className="rule-item">
						<div className="rule-number">4</div>
						<div>
							<strong>Controls:</strong> Tap a cell once to place a ⭐. Tap
							again to mark an ✕ (to eliminate cells you know are empty). Tap a
							third time to clear.
						</div>
					</div>
				</div>

				<button className="control-btn primary-btn" onClick={onClose}>
					Got it, let's play!
				</button>
			</div>
		</div>
	);
};
