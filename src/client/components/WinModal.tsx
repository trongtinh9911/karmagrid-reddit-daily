import type React from "react";
import { useState } from "react";

interface WinModalProps {
	isOpen: boolean;
	dayNumber: number;
	seconds: number;
	streak: number;
	shareText: string;
	onClose: () => void;
}

export const WinModal: React.FC<WinModalProps> = ({
	isOpen,
	dayNumber,
	seconds,
	streak,
	shareText,
	onClose,
}) => {
	const [copied, setCopied] = useState(false);

	if (!isOpen) return null;

	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	const timeFormatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

	const handleCopy = () => {
		navigator.clipboard.writeText(shareText);
		setCopied(true);
		setTimeout(() => setCopied(false), 2500);
	};

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-content" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h2 className="modal-title">🎉 Subreddit Cleared!</h2>
					<button className="close-btn" onClick={onClose}>
						✕
					</button>
				</div>

				<div className="modal-body">
					<p style={{ textAlign: "center", fontSize: "15px" }}>
						You solved <strong>KarmaGrid #{dayNumber}</strong> in{" "}
						<strong style={{ color: "var(--accent-gold)" }}>
							{timeFormatted}
						</strong>
						!
					</p>

					<div
						style={{
							display: "flex",
							justifyContent: "center",
							gap: "12px",
							margin: "8px 0",
						}}
					>
						<div
							className="streak-pill"
							style={{ fontSize: "14px", padding: "6px 12px" }}
						>
							🔥 {streak} Day Streak
						</div>
					</div>

					<div className="share-card">{shareText}</div>
				</div>

				<button className="control-btn primary-btn" onClick={handleCopy}>
					{copied ? "✅ Copied to Clipboard!" : "📋 Share Reddit Result"}
				</button>
			</div>
		</div>
	);
};
