import type React from "react";
import { useEffect, useState } from "react";
import {
	DevvitBridge,
	type GameStats,
	type LeaderboardResult,
} from "../engine/devvitBridge";

export type StatsModalTab = "stats" | "leaderboard";

interface StatsModalProps {
	isOpen: boolean;
	initialTab?: StatsModalTab;
	dailyDate: string;
	dailyNumber: number;
	stats: GameStats;
	onClose: () => void;
}

function formatDuration(secs: number): string {
	const m = Math.floor(secs / 60);
	const s = secs % 60;
	return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function rankMedal(rank: number): string {
	if (rank === 1) return "🥇";
	if (rank === 2) return "🥈";
	if (rank === 3) return "🥉";
	return `#${rank}`;
}

export const StatsModal: React.FC<StatsModalProps> = ({
	isOpen,
	initialTab = "stats",
	dailyDate,
	dailyNumber,
	stats,
	onClose,
}) => {
	const [activeTab, setActiveTab] = useState<StatsModalTab>(initialTab);
	const [leaderboard, setLeaderboard] = useState<LeaderboardResult | null>(
		null,
	);
	const [loading, setLoading] = useState<boolean>(false);

	useEffect(() => {
		if (isOpen) {
			setActiveTab(initialTab);
		}
	}, [isOpen, initialTab]);

	const loadLeaderboard = async () => {
		setLoading(true);
		try {
			const res = await DevvitBridge.fetchLeaderboard(dailyDate);
			setLeaderboard(res);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (isOpen && activeTab === "leaderboard") {
			void loadLeaderboard();
		}
	}, [isOpen, activeTab, dailyDate]);

	if (!isOpen) return null;

	const winPct =
		stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-content" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h2 className="modal-title">
						{activeTab === "stats"
							? "Your KarmaGrid Stats"
							: `Daily #${dailyNumber} Leaderboard`}
					</h2>
					<button type="button" className="close-btn" onClick={onClose}>
						✕
					</button>
				</div>

				<div className="modal-tabs" role="tablist">
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === "stats"}
						className={`modal-tab-btn ${activeTab === "stats" ? "active" : ""}`}
						onClick={() => setActiveTab("stats")}
					>
						📊 My Stats
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === "leaderboard"}
						className={`modal-tab-btn ${activeTab === "leaderboard" ? "active" : ""}`}
						onClick={() => setActiveTab("leaderboard")}
					>
						🏆 Leaderboard
					</button>
				</div>

				{activeTab === "stats" ? (
					<div className="modal-body">
						<div className="stats-grid">
							<div className="stat-box">
								<div className="stat-number">{stats.played}</div>
								<div className="stat-label">Played</div>
							</div>
							<div className="stat-box">
								<div className="stat-number">{winPct}%</div>
								<div className="stat-label">Win %</div>
							</div>
							<div className="stat-box">
								<div className="stat-number">{stats.currentStreak}</div>
								<div className="stat-label">Streak</div>
							</div>
							<div className="stat-box">
								<div className="stat-number">{stats.maxStreak}</div>
								<div className="stat-label">Max</div>
							</div>
						</div>

						<div style={{ marginTop: "8px" }}>
							<h4
								style={{
									fontSize: "12px",
									textTransform: "uppercase",
									color: "var(--text-secondary)",
									marginBottom: "8px",
								}}
							>
								Daily Solve Time Distribution
							</h4>
							<div
								style={{ display: "flex", flexDirection: "column", gap: "6px" }}
							>
								{Object.entries(stats.guessDistribution).map(
									([bracket, count]) => {
										const maxVal = Math.max(
											...Object.values(stats.guessDistribution),
											1,
										);
										const pct = Math.round((count / maxVal) * 100);

										return (
											<div
												key={bracket}
												style={{
													display: "flex",
													alignItems: "center",
													fontSize: "12px",
													gap: "8px",
												}}
											>
												<span style={{ width: "50px", textAlign: "right" }}>
													{bracket}
												</span>
												<div
													style={{
														flex: 1,
														background: "var(--bg-secondary)",
														height: "18px",
														borderRadius: "4px",
														overflow: "hidden",
													}}
												>
													<div
														style={{
															width: `${Math.max(pct, count > 0 ? 8 : 0)}%`,
															background: "var(--accent-reddit)",
															height: "100%",
															display: "flex",
															alignItems: "center",
															justifyContent: "flex-end",
															paddingRight: "4px",
															color: "white",
															fontWeight: 700,
															fontSize: "10px",
														}}
													>
														{count > 0 ? count : ""}
													</div>
												</div>
											</div>
										);
									},
								)}
							</div>
						</div>
					</div>
				) : (
					<div className="modal-body">
						<div className="leaderboard-meta-row">
							<span
								className={`source-badge ${
									leaderboard?.source === "live_api"
										? "source-live"
										: "source-local"
								}`}
							>
								{leaderboard?.source === "live_api"
									? "● LIVE DEVVIT REDIS API"
									: "● STANDALONE LOCAL FALLBACK"}
							</span>
							<button
								type="button"
								className="refresh-lb-btn"
								onClick={() => void loadLeaderboard()}
								disabled={loading}
							>
								{loading ? "Loading..." : "↻ Refresh"}
							</button>
						</div>

						{loading && !leaderboard ? (
							<div className="leaderboard-empty">
								Fetching today's fastest solves...
							</div>
						) : leaderboard && leaderboard.entries.length > 0 ? (
							<div className="leaderboard-list">
								{leaderboard.entries.slice(0, 10).map((entry) => (
									<div
										key={`${entry.rank}-${entry.username}`}
										className={`leaderboard-row ${entry.isCurrentUser ? "leaderboard-row-self" : ""}`}
									>
										<span className="lb-rank">{rankMedal(entry.rank)}</span>
										<span className="lb-user">{entry.username}</span>
										<span className="lb-time">
											{formatDuration(entry.seconds)}
										</span>
									</div>
								))}
							</div>
						) : (
							<div className="leaderboard-empty">
								No daily solves recorded yet for {dailyDate}. Be the first!
							</div>
						)}
					</div>
				)}

				<button
					type="button"
					className="control-btn primary-btn"
					onClick={onClose}
				>
					Close
				</button>
			</div>
		</div>
	);
};
