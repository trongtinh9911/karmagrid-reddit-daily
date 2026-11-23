import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Board } from "./components/Board";
import { Controls } from "./components/Controls";
import { Header } from "./components/Header";
import { HowToPlayModal } from "./components/HowToPlayModal";
import { StatsModal } from "./components/StatsModal";
import { WinModal } from "./components/WinModal";
import { soundEngine } from "./engine/audio";
import { DevvitBridge, type GameStats } from "./engine/devvitBridge";
import { type DailyPuzzle, PuzzleGenerator } from "./engine/generator";
import { type Point, Solver } from "./engine/solver";
import "./styles/theme.css";

export const App: React.FC = () => {
	const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null);
	const [userGrid, setUserGrid] = useState<number[][]>([]);
	const [history, setHistory] = useState<number[][][]>([]);
	const [redoStack, setRedoStack] = useState<number[][][]>([]);
	const [conflicts, setConflicts] = useState<Point[]>([]);
	const [isWon, setIsWon] = useState<boolean>(false);
	const [seconds, setSeconds] = useState<number>(0);
	const [stats, setStats] = useState<GameStats>(() => DevvitBridge.getStats());
	const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

	// Modals
	const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
	const [isStatsOpen, setIsStatsOpen] = useState<boolean>(false);
	const [isWinOpen, setIsWinOpen] = useState<boolean>(false);

	const timerRef = useRef<NodeJS.Timeout | null>(null);

	// Initialize today's puzzle
	useEffect(() => {
		const todayStr = new Date().toISOString().split("T")[0];
		const daily = PuzzleGenerator.generateForDate(todayStr);
		setPuzzle(daily);

		const initialGrid = Array.from({ length: daily.size }, () =>
			new Array(daily.size).fill(0),
		);
		setUserGrid(initialGrid);

		// If first time player, show tutorial
		const existingStats = DevvitBridge.getStats();
		if (existingStats.played === 0) {
			setIsHelpOpen(true);
		}
	}, []);

	// Timer loop
	useEffect(() => {
		if (!isWon) {
			timerRef.current = setInterval(() => {
				setSeconds((s) => s + 1);
			}, 1000);
		} else if (timerRef.current) {
			clearInterval(timerRef.current);
		}

		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, [isWon]);

	// Push to undo history
	const pushState = (newGrid: number[][]) => {
		setHistory((prev) => [...prev, userGrid.map((row) => [...row])]);
		setRedoStack([]);
		setUserGrid(newGrid);
	};

	// Cell Click (Left click / Tap): 0 -> 1 -> 2 -> 0
	const handleCellClick = useCallback(
		(row: number, col: number) => {
			if (!puzzle || isWon) return;

			const newGrid = userGrid.map((r) => [...r]);
			const current = newGrid[row][col];
			const next = (current + 1) % 3;
			newGrid[row][col] = next;

			if (next === 1) soundEngine.playStar();
			else if (next === 2) soundEngine.playCross();
			else soundEngine.playClear();

			pushState(newGrid);

			// Check conflicts
			const foundConflicts = Solver.findConflicts(
				newGrid,
				puzzle.sectors,
				puzzle.size,
			);
			setConflicts(foundConflicts);
			if (foundConflicts.length > 0 && next === 1) {
				soundEngine.playError();
			}

			// Check win condition
			if (Solver.isSolved(newGrid, puzzle.sectors, puzzle.size)) {
				setIsWon(true);
				soundEngine.playVictory();
				const updatedStats = DevvitBridge.recordWin(puzzle.date, seconds);
				setStats(updatedStats);
				setTimeout(() => setIsWinOpen(true), 600);
			}
		},
		[puzzle, userGrid, isWon, seconds],
	);

	// Cell Right Click (Secondary action): Toggle 0 <-> 2 directly
	const handleCellRightClick = useCallback(
		(row: number, col: number, e: React.MouseEvent) => {
			e.preventDefault();
			if (!puzzle || isWon) return;

			const newGrid = userGrid.map((r) => [...r]);
			const current = newGrid[row][col];
			newGrid[row][col] = current === 2 ? 0 : 2;

			if (newGrid[row][col] === 2) soundEngine.playCross();
			else soundEngine.playClear();

			pushState(newGrid);
		},
		[puzzle, userGrid, isWon],
	);

	// Undo move
	const handleUndo = () => {
		if (history.length === 0 || isWon || !puzzle) return;
		const previous = history[history.length - 1];
		setRedoStack((prev) => [...prev, userGrid.map((r) => [...r])]);
		setHistory((prev) => prev.slice(0, prev.length - 1));
		setUserGrid(previous);

		const foundConflicts = Solver.findConflicts(
			previous,
			puzzle.sectors,
			puzzle.size,
		);
		setConflicts(foundConflicts);
		soundEngine.playClear();
	};

	// Redo move
	const handleRedo = () => {
		if (redoStack.length === 0 || isWon || !puzzle) return;
		const next = redoStack[redoStack.length - 1];
		setHistory((prev) => [...prev, userGrid.map((r) => [...r])]);
		setRedoStack((prev) => prev.slice(0, prev.length - 1));
		setUserGrid(next);

		const foundConflicts = Solver.findConflicts(
			next,
			puzzle.sectors,
			puzzle.size,
		);
		setConflicts(foundConflicts);
		soundEngine.playStar();
	};

	// Clear board
	const handleClear = () => {
		if (!puzzle || isWon) return;
		const emptyGrid = Array.from({ length: puzzle.size }, () =>
			new Array(puzzle.size).fill(0),
		);
		pushState(emptyGrid);
		setConflicts([]);
		soundEngine.playClear();
	};

	// Auto-X helper: marks X in rows, cols, diagonals, and sectors of placed stars
	const handleAutoX = () => {
		if (!puzzle || isWon) return;
		const size = puzzle.size;
		const newGrid = userGrid.map((r) => [...r]);
		let changed = false;

		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				if (newGrid[r][c] === 1) {
					const starSector = puzzle.sectors[r][c];

					for (let i = 0; i < size; i++) {
						for (let j = 0; j < size; j++) {
							if (i === r && j === c) continue;
							if (newGrid[i][j] !== 0) continue;

							const sameRow = i === r;
							const sameCol = j === c;
							const sameSector = puzzle.sectors[i][j] === starSector;
							const isAdjacent = Math.abs(i - r) <= 1 && Math.abs(j - c) <= 1;

							if (sameRow || sameCol || sameSector || isAdjacent) {
								newGrid[i][j] = 2;
								changed = true;
							}
						}
					}
				}
			}
		}

		if (changed) {
			pushState(newGrid);
			soundEngine.playCross();
		}
	};

	const toggleSound = () => {
		const next = !soundEnabled;
		setSoundEnabled(next);
		soundEngine.enabled = next;
	};

	if (!puzzle) {
		return (
			<div style={{ color: "white", padding: "24px" }}>
				Loading KarmaGrid...
			</div>
		);
	}

	const shareText = DevvitBridge.generateShareText(
		puzzle.dayNumber,
		puzzle.date,
		seconds,
		userGrid,
		puzzle.sectors,
		puzzle.size,
	);

	return (
		<div className="app-container">
			<Header
				dayNumber={puzzle.dayNumber}
				seconds={seconds}
				streak={stats.currentStreak}
				soundEnabled={soundEnabled}
				onToggleSound={toggleSound}
				onOpenHelp={() => setIsHelpOpen(true)}
				onOpenStats={() => setIsStatsOpen(true)}
			/>

			<Board
				size={puzzle.size}
				sectors={puzzle.sectors}
				userGrid={userGrid}
				conflicts={conflicts}
				subreddits={puzzle.subreddits}
				onCellClick={handleCellClick}
				onCellRightClick={handleCellRightClick}
			/>

			<Controls
				canUndo={history.length > 0}
				canRedo={redoStack.length > 0}
				onUndo={handleUndo}
				onRedo={handleRedo}
				onClear={handleClear}
				onAutoX={handleAutoX}
				subreddits={puzzle.subreddits}
			/>

			<HowToPlayModal
				isOpen={isHelpOpen}
				onClose={() => setIsHelpOpen(false)}
			/>

			<StatsModal
				isOpen={isStatsOpen}
				stats={stats}
				onClose={() => setIsStatsOpen(false)}
			/>

			<WinModal
				isOpen={isWinOpen}
				dayNumber={puzzle.dayNumber}
				seconds={seconds}
				streak={stats.currentStreak}
				shareText={shareText}
				onClose={() => setIsWinOpen(false)}
			/>
		</div>
	);
};
