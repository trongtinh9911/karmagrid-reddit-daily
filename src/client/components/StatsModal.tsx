import type React from "react";
import type { GameStats } from "../engine/devvitBridge";

interface StatsModalProps {
	isOpen: boolean;
	stats: GameStats;
	onClose: () => void;
}

export const StatsModal: React.FC<StatsModalProps> = ({
	isOpen,
	stats,
	onClose,
}) => {
	if (!isOpen) return null;

	const winPct =
		stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-content" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h2 className="modal-title">Your KarmaGrid Stats</h2>
					<button className="close-btn" onClick={onClose}>
						✕
					</button>
				</div>

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

					<div style={{ marginTop: "12px" }}>
						<h4
							style={{
								fontSize: "12px",
								textTransform: "uppercase",
								color: "var(--text-secondary)",
								marginBottom: "8px",
							}}
						>
							Solve Time Distribution
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

				<button className="control-btn primary-btn" onClick={onClose}>
					Close
				</button>
			</div>
		</div>
	);
};
