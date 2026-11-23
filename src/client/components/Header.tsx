import type React from "react";

interface HeaderProps {
	dayNumber: number;
	seconds: number;
	streak: number;
	soundEnabled: boolean;
	onToggleSound: () => void;
	onOpenHelp: () => void;
	onOpenStats: () => void;
}

export const Header: React.FC<HeaderProps> = ({
	dayNumber,
	seconds,
	streak,
	soundEnabled,
	onToggleSound,
	onOpenHelp,
	onOpenStats,
}) => {
	const formatTime = (secs: number) => {
		const m = Math.floor(secs / 60);
		const s = secs % 60;
		return `${m}:${s.toString().padStart(2, "0")}`;
	};

	return (
		<>
			<header className="game-header">
				<div className="logo-group">
					<div className="snoo-icon">K</div>
					<div>
						<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
							<span className="title-text">KarmaGrid</span>
							<span className="title-badge">#{dayNumber}</span>
						</div>
					</div>
				</div>

				<div className="header-actions">
					<button
						className="icon-button"
						onClick={onToggleSound}
						title={soundEnabled ? "Mute" : "Unmute"}
						aria-label="Toggle Sound"
					>
						{soundEnabled ? "🔊" : "🔇"}
					</button>
					<button
						className="icon-button"
						onClick={onOpenHelp}
						title="How to play"
						aria-label="How to play"
					>
						❓
					</button>
					<button
						className="icon-button"
						onClick={onOpenStats}
						title="Statistics"
						aria-label="Statistics"
					>
						📊
					</button>
				</div>
			</header>

			<div className="status-bar">
				<div className="timer-box">
					<span>⏱️</span>
					<span>{formatTime(seconds)}</span>
				</div>

				<div className="streak-pill">
					<span>🔥</span>
					<span>{streak} Day Streak</span>
				</div>
			</div>
		</>
	);
};
