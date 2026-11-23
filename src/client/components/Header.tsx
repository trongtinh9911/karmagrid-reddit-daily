import type React from "react";
import {
	DIFFICULTY_META,
	type GameMode,
	type PracticeDifficulty,
} from "../engine/generator";

interface HeaderProps {
	dayNumber: number;
	dailySize: number;
	mode: GameMode;
	isPractice: boolean;
	difficultyLabel: string;
	variantIndex: number;
	seconds: number;
	streak: number;
	soundEnabled: boolean;
	onSelectMode: (mode: GameMode) => void;
	onNextPractice: () => void;
	onToggleSound: () => void;
	onOpenHelp: () => void;
	onOpenStats: () => void;
	onOpenLeaderboard: () => void;
}

const PRACTICE_TIERS: PracticeDifficulty[] = ["5x5", "6x6", "7x7"];

export const Header: React.FC<HeaderProps> = ({
	dayNumber,
	dailySize,
	mode,
	isPractice,
	difficultyLabel,
	variantIndex,
	seconds,
	streak,
	soundEnabled,
	onSelectMode,
	onNextPractice,
	onToggleSound,
	onOpenHelp,
	onOpenStats,
	onOpenLeaderboard,
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
							<span
								className={`title-badge ${isPractice ? "practice-badge" : ""}`}
							>
								{isPractice ? `Archive #${variantIndex + 1}` : `#${dayNumber}`}
							</span>
						</div>
					</div>
				</div>

				<div className="header-actions">
					<button
						className="icon-button"
						onClick={onOpenLeaderboard}
						title="Daily Leaderboard"
						aria-label="Daily Leaderboard"
					>
						🏆
					</button>
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

			<div className="mode-switcher" role="tablist" aria-label="Puzzle Mode">
				<button
					type="button"
					role="tab"
					aria-selected={mode === "daily"}
					className={`mode-pill ${mode === "daily" ? "active daily-active" : ""}`}
					onClick={() => onSelectMode("daily")}
					title="Today's official daily puzzle (counts toward streak & leaderboard)"
				>
					<span>📅 Daily</span>
					<span className="mode-sub">
						{dailySize}×{dailySize}
					</span>
				</button>

				{PRACTICE_TIERS.map((tier) => {
					const meta = DIFFICULTY_META[tier];
					const isActive = mode === tier;
					return (
						<button
							key={tier}
							type="button"
							role="tab"
							aria-selected={isActive}
							className={`mode-pill ${isActive ? "active" : ""}`}
							onClick={() => onSelectMode(tier)}
							title={`Practice ${meta.label} (${meta.schedule}) — Daily streak protected`}
						>
							<span>{meta.shortLabel}</span>
							<span className="mode-sub">{meta.schedule}</span>
						</button>
					);
				})}
			</div>

			<div className="status-bar">
				<div className="timer-box">
					<span>⏱️</span>
					<span>{formatTime(seconds)}</span>
					<span className="difficulty-tag">{difficultyLabel}</span>
				</div>

				{isPractice ? (
					<div className="practice-status-group">
						<span
							className="streak-safe-pill"
							title="Practice mode never affects your Daily streak"
						>
							🛡️ Streak Safe
						</span>
						<button
							type="button"
							className="next-archive-btn"
							onClick={onNextPractice}
							title="Load another archive puzzle of this difficulty"
						>
							🎲 Next
						</button>
					</div>
				) : (
					<div className="streak-pill">
						<span>🔥</span>
						<span>{streak} Day Streak</span>
					</div>
				)}
			</div>
		</>
	);
};
