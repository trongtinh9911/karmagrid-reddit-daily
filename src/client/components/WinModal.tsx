import type React from "react";
import { useState } from "react";

interface WinModalProps {
	isOpen: boolean;
	dayNumber: number;
	isPractice: boolean;
	difficultyLabel: string;
	seconds: number;
	streak: number;
	hintsUsed: number;
	shareText: string;
	onNextPractice?: () => void;
	onBackToDaily?: () => void;
	onOpenLeaderboard?: () => void;
	onClose: () => void;
}

export const WinModal: React.FC<WinModalProps> = ({
	isOpen,
	dayNumber,
	isPractice,
	difficultyLabel,
	seconds,
	streak,
	hintsUsed,
	shareText,
	onNextPractice,
	onBackToDaily,
	onOpenLeaderboard,
	onClose,
}) => {
	const [copied, setCopied] = useState(false);

	if (!isOpen) return null;

	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	const timeFormatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

	const handleCopy = () => {
		navigator.clipboard?.writeText(shareText);
		setCopied(true);
		setTimeout(() => setCopied(false), 2500);
	};

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-content" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h2 className="modal-title">
						{isPractice ? "🎯 Archive Cleared!" : "🎉 Subreddit Cleared!"}
					</h2>
					<button type="button" className="close-btn" onClick={onClose}>
						✕
					</button>
				</div>

				<div className="modal-body">
					<p style={{ textAlign: "center", fontSize: "15px" }}>
						You solved{" "}
						<strong>
							{isPractice ? difficultyLabel : `KarmaGrid #${dayNumber}`}
						</strong>{" "}
						in{" "}
						<strong style={{ color: "var(--accent-gold)" }}>
							{timeFormatted}
						</strong>
						{hintsUsed === 0 ? " with zero hints!" : `!`}
					</p>

					<div
						style={{
							display: "flex",
							justifyContent: "center",
							gap: "8px",
							flexWrap: "wrap",
							margin: "4px 0",
						}}
					>
						{isPractice ? (
							<div
								className="streak-safe-pill"
								style={{ fontSize: "13px", padding: "5px 12px" }}
							>
								🛡️ Daily Streak Protected ({streak} Day{streak === 1 ? "" : "s"})
							</div>
						) : (
							<div
								className="streak-pill"
								style={{ fontSize: "14px", padding: "6px 12px" }}
							>
								🔥 {streak} Day Streak
							</div>
						)}
					</div>

					<div className="share-card">{shareText}</div>
				</div>

				<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
					<button
						type="button"
						className="control-btn primary-btn"
						onClick={handleCopy}
					>
						{copied ? "✅ Copied to Clipboard!" : "📋 Share Reddit Result"}
					</button>

					{isPractice ? (
						<div style={{ display: "flex", gap: "8px" }}>
							{onNextPractice && (
								<button
									type="button"
									className="control-btn"
									onClick={() => {
										onClose();
										onNextPractice();
									}}
								>
									🎲 Next Practice
								</button>
							)}
							{onBackToDaily && (
								<button
									type="button"
									className="control-btn"
									onClick={() => {
										onClose();
										onBackToDaily();
									}}
								>
									📅 Back to Daily
								</button>
							)}
						</div>
					) : (
						onOpenLeaderboard && (
							<button
								type="button"
								className="control-btn"
								onClick={() => {
									onClose();
									onOpenLeaderboard();
								}}
							>
								🏆 View Daily Leaderboard
							</button>
						)
					)}
				</div>
			</div>
		</div>
	);
};
