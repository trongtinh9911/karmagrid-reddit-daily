import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Board } from "./components/Board";
import { Controls } from "./components/Controls";
import { Header } from "./components/Header";
import { HowToPlayModal } from "./components/HowToPlayModal";
import { StatsModal, type StatsModalTab } from "./components/StatsModal";
import { WinModal } from "./components/WinModal";
import { soundEngine } from "./engine/audio";
import { DevvitBridge, type GameStats } from "./engine/devvitBridge";
import {
	type DailyPuzzle,
	type GameMode,
	type PracticeDifficulty,
	PuzzleGenerator,
} from "./engine/generator";
import { type DeductiveHint, SmartHintEngine } from "./engine/hintEngine";
import { type Point, Solver } from "./engine/solver";
import "./styles/theme.css";

interface SavedSession {
	userGrid: number[][];
	history: number[][][];
	redoStack: number[][][];
	conflicts: Point[];
	isWon: boolean;
	seconds: number;
	hintsUsed: number;
}

function createEmptyGrid(size: number): number[][] {
	return Array.from({ length: size }, () => new Array<number>(size).fill(0));
}

function cloneGrid(grid: number[][]): number[][] {
	return grid.map((row) => [...row]);
}

export const App: React.FC = () => {
	const [dailyPuzzle, setDailyPuzzle] = useState<DailyPuzzle | null>(null);
	const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null);
	const [mode, setMode] = useState<GameMode>("daily");
	const [practiceVariants, setPracticeVariants] = useState<
		Record<PracticeDifficulty, number>
	>({
		"5x5": 0,
		"6x6": 0,
		"7x7": 0,
	});

	const [userGrid, setUserGrid] = useState<number[][]>([]);
	const [history, setHistory] = useState<number[][][]>([]);
	const [redoStack, setRedoStack] = useState<number[][][]>([]);
	const [conflicts, setConflicts] = useState<Point[]>([]);
	const [isWon, setIsWon] = useState<boolean>(false);
	const [seconds, setSeconds] = useState<number>(0);
	const [hintsUsed, setHintsUsed] = useState<number>(0);
	const [activeHint, setActiveHint] = useState<DeductiveHint | null>(null);
	const [stats, setStats] = useState<GameStats>(() => DevvitBridge.getStats());
	const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

	// Modals
	const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
	const [isStatsOpen, setIsStatsOpen] = useState<boolean>(false);
	const [statsModalTab, setStatsModalTab] = useState<StatsModalTab>("stats");
	const [isWinOpen, setIsWinOpen] = useState<boolean>(false);

	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const dailySessionRef = useRef<SavedSession | null>(null);

	// Initialize today's puzzle
	useEffect(() => {
		const todayStr = new Date().toISOString().split("T")[0];
		const daily = PuzzleGenerator.generateForDate(todayStr);
		setDailyPuzzle(daily);
		setPuzzle(daily);

		const initialGrid = createEmptyGrid(daily.size);
		setUserGrid(initialGrid);

		const existingStats = DevvitBridge.getStats();
		if (existingStats.played === 0) {
			setIsHelpOpen(true);
		}
	}, []);

	// Timer loop
	useEffect(() => {
		if (!isWon && puzzle) {
			timerRef.current = setInterval(() => {
				setSeconds((s) => s + 1);
			}, 1000);
		} else if (timerRef.current) {
			clearInterval(timerRef.current);
		}

		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, [isWon, puzzle]);

	// Switch between Daily and Archive / Practice difficulties without losing Daily streak or progress
	const handleSelectMode = useCallback(
		(nextMode: GameMode) => {
			if (!dailyPuzzle) return;

			// Save current Daily progress before leaving Daily mode
			if (mode === "daily") {
				dailySessionRef.current = {
					userGrid: cloneGrid(userGrid),
					history: history.map(cloneGrid),
					redoStack: redoStack.map(cloneGrid),
					conflicts: [...conflicts],
					isWon,
					seconds,
					hintsUsed,
				};
			}

			setActiveHint(null);
			setIsWinOpen(false);

			if (nextMode === "daily") {
				setMode("daily");
				setPuzzle(dailyPuzzle);
				if (dailySessionRef.current) {
					const saved = dailySessionRef.current;
					setUserGrid(cloneGrid(saved.userGrid));
					setHistory(saved.history.map(cloneGrid));
					setRedoStack(saved.redoStack.map(cloneGrid));
					setConflicts([...saved.conflicts]);
					setIsWon(saved.isWon);
					setSeconds(saved.seconds);
					setHintsUsed(saved.hintsUsed);
				} else {
					setUserGrid(createEmptyGrid(dailyPuzzle.size));
					setHistory([]);
					setRedoStack([]);
					setConflicts([]);
					setIsWon(false);
					setSeconds(0);
					setHintsUsed(0);
				}
				return;
			}

			const variant = practiceVariants[nextMode];
			const archivePuzzle = PuzzleGenerator.generateArchive(nextMode, variant);
			setMode(nextMode);
			setPuzzle(archivePuzzle);
			setUserGrid(createEmptyGrid(archivePuzzle.size));
			setHistory([]);
			setRedoStack([]);
			setConflicts([]);
			setIsWon(false);
			setSeconds(0);
			setHintsUsed(0);
		},
		[
			dailyPuzzle,
			mode,
			userGrid,
			history,
			redoStack,
			conflicts,
			isWon,
			seconds,
			hintsUsed,
			practiceVariants,
		],
	);

	// Cycle to next deterministic archive puzzle in current practice difficulty
	const handleNextPractice = useCallback(() => {
		if (mode === "daily") return;
		const nextVariant = practiceVariants[mode] + 1;
		setPracticeVariants((prev) => ({ ...prev, [mode]: nextVariant }));
		const nextPuzzle = PuzzleGenerator.generateArchive(mode, nextVariant);
		setPuzzle(nextPuzzle);
		setUserGrid(createEmptyGrid(nextPuzzle.size));
		setHistory([]);
		setRedoStack([]);
		setConflicts([]);
		setIsWon(false);
		setSeconds(0);
		setHintsUsed(0);
		setActiveHint(null);
		setIsWinOpen(false);
		soundEngine.playClear();
	}, [mode, practiceVariants]);

	// Push to undo history
	const pushState = useCallback(
		(newGrid: number[][]) => {
			setHistory((prev) => [...prev, cloneGrid(userGrid)]);
			setRedoStack([]);
			setUserGrid(newGrid);
		},
		[userGrid],
	);

	// Shared win completion handler (practice-safe)
	const finalizeWin = useCallback(
		(
			solvedGrid: number[][],
			currentPuzzle: DailyPuzzle,
			solveSeconds: number,
		) => {
			const isPracticeMode = Boolean(currentPuzzle.isPractice);
			setIsWon(true);
			setActiveHint(null);
			soundEngine.playVictory();

			const updatedStats = DevvitBridge.recordWin(
				currentPuzzle.date,
				solveSeconds,
				{
					isPractice: isPracticeMode,
					userGrid: solvedGrid,
				},
			);
			setStats(updatedStats);

			if (!isPracticeMode) {
				void DevvitBridge.submitScore(
					currentPuzzle.date,
					solveSeconds,
					solvedGrid,
					false,
				);
			}

			setTimeout(() => setIsWinOpen(true), 450);
		},
		[],
	);

	// Cell Click (Left click / Tap): 0 -> 1 -> 2 -> 0
	const handleCellClick = useCallback(
		(row: number, col: number) => {
			if (!puzzle || isWon) return;

			const newGrid = cloneGrid(userGrid);
			const current = newGrid[row][col];
			const next = (current + 1) % 3;
			newGrid[row][col] = next;

			if (next === 1) soundEngine.playStar();
			else if (next === 2) soundEngine.playCross();
			else soundEngine.playClear();

			setActiveHint(null);
			pushState(newGrid);

			const foundConflicts = Solver.findConflicts(
				newGrid,
				puzzle.sectors,
				puzzle.size,
			);
			setConflicts(foundConflicts);
			if (foundConflicts.length > 0 && next === 1) {
				soundEngine.playError();
			}

			if (Solver.isSolved(newGrid, puzzle.sectors, puzzle.size)) {
				finalizeWin(newGrid, puzzle, seconds);
			}
		},
		[puzzle, userGrid, isWon, seconds, pushState, finalizeWin],
	);

	// Cell Right Click (Secondary action): Toggle 0 <-> 2 directly
	const handleCellRightClick = useCallback(
		(row: number, col: number, e: React.MouseEvent) => {
			e.preventDefault();
			if (!puzzle || isWon) return;

			const newGrid = cloneGrid(userGrid);
			const current = newGrid[row][col];
			newGrid[row][col] = current === 2 ? 0 : 2;

			if (newGrid[row][col] === 2) soundEngine.playCross();
			else soundEngine.playClear();

			setActiveHint(null);
			pushState(newGrid);

			const foundConflicts = Solver.findConflicts(
				newGrid,
				puzzle.sectors,
				puzzle.size,
			);
			setConflicts(foundConflicts);
		},
		[puzzle, userGrid, isWon, pushState],
	);

	// Undo move
	const handleUndo = useCallback(() => {
		if (history.length === 0 || isWon || !puzzle) return;
		const previous = history[history.length - 1];
		setRedoStack((prev) => [...prev, cloneGrid(userGrid)]);
		setHistory((prev) => prev.slice(0, prev.length - 1));
		setUserGrid(previous);
		setActiveHint(null);

		const foundConflicts = Solver.findConflicts(
			previous,
			puzzle.sectors,
			puzzle.size,
		);
		setConflicts(foundConflicts);
		soundEngine.playClear();
	}, [history, isWon, puzzle, userGrid]);

	// Redo move
	const handleRedo = useCallback(() => {
		if (redoStack.length === 0 || isWon || !puzzle) return;
		const next = redoStack[redoStack.length - 1];
		setHistory((prev) => [...prev, cloneGrid(userGrid)]);
		setRedoStack((prev) => prev.slice(0, prev.length - 1));
		setUserGrid(next);
		setActiveHint(null);

		const foundConflicts = Solver.findConflicts(
			next,
			puzzle.sectors,
			puzzle.size,
		);
		setConflicts(foundConflicts);
		soundEngine.playStar();
	}, [redoStack, isWon, puzzle, userGrid]);

	// Clear board
	const handleClear = useCallback(() => {
		if (!puzzle || isWon) return;
		const emptyGrid = createEmptyGrid(puzzle.size);
		setActiveHint(null);
		pushState(emptyGrid);
		setConflicts([]);
		soundEngine.playClear();
	}, [puzzle, isWon, pushState]);

	// Apply active deductive hint
	const handleApplyHint = useCallback(() => {
		if (!puzzle || isWon || !activeHint) return;
		const newGrid = SmartHintEngine.applyHint(userGrid, activeHint);
		setActiveHint(null);
		setHintsUsed((c) => c + 1);
		pushState(newGrid);

		if (activeHint.recommendedValue === 1) soundEngine.playStar();
		else if (activeHint.recommendedValue === 2) soundEngine.playCross();
		else soundEngine.playClear();

		const foundConflicts = Solver.findConflicts(
			newGrid,
			puzzle.sectors,
			puzzle.size,
		);
		setConflicts(foundConflicts);

		if (Solver.isSolved(newGrid, puzzle.sectors, puzzle.size)) {
			finalizeWin(newGrid, puzzle, seconds);
		}
	}, [puzzle, isWon, activeHint, userGrid, pushState, finalizeWin, seconds]);

	// Smart Deductive Hint: first click explains & highlights, second click applies
	const handleHint = useCallback(() => {
		if (!puzzle || isWon) return;
		if (activeHint) {
			handleApplyHint();
			return;
		}
		const hint = SmartHintEngine.getNextHint(userGrid, puzzle);
		if (hint) {
			setActiveHint(hint);
			soundEngine.playStar();
		}
	}, [puzzle, isWon, activeHint, userGrid, handleApplyHint]);

	// Auto-X helper: marks X in rows, cols, diagonals, and sectors of placed stars
	const handleAutoX = useCallback(() => {
		if (!puzzle || isWon) return;
		const size = puzzle.size;
		const newGrid = cloneGrid(userGrid);
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
			setActiveHint(null);
			pushState(newGrid);
			soundEngine.playCross();
		}
	}, [puzzle, isWon, userGrid, pushState]);

	// Keyboard shortcuts: Z Undo, Y Redo, H Hint, R Reset, Enter Apply Hint, Esc Dismiss
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.tagName === "SELECT" ||
					target.isContentEditable)
			) {
				return;
			}

			const key = e.key.toLowerCase();

			if (key === "escape") {
				if (isHelpOpen) setIsHelpOpen(false);
				else if (isStatsOpen) setIsStatsOpen(false);
				else if (isWinOpen) setIsWinOpen(false);
				else if (activeHint) setActiveHint(null);
				return;
			}

			if (isHelpOpen || isStatsOpen || isWinOpen) {
				return;
			}

			if (key === "enter" && activeHint) {
				e.preventDefault();
				handleApplyHint();
				return;
			}

			const hasModifier = e.ctrlKey || e.metaKey;
			if (key === "z" && !e.altKey) {
				if (hasModifier && e.shiftKey) {
					e.preventDefault();
					handleRedo();
				} else if (!e.shiftKey) {
					e.preventDefault();
					handleUndo();
				}
				return;
			}

			if (key === "y" && !e.altKey) {
				e.preventDefault();
				handleRedo();
				return;
			}

			if (!hasModifier && !e.altKey && !e.shiftKey) {
				if (key === "h") {
					e.preventDefault();
					handleHint();
				} else if (key === "r") {
					e.preventDefault();
					handleClear();
				}
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [
		isHelpOpen,
		isStatsOpen,
		isWinOpen,
		activeHint,
		handleUndo,
		handleRedo,
		handleHint,
		handleApplyHint,
		handleClear,
	]);

	const toggleSound = () => {
		const next = !soundEnabled;
		setSoundEnabled(next);
		soundEngine.enabled = next;
	};

	const openStats = () => {
		setStatsModalTab("stats");
		setIsStatsOpen(true);
	};

	const openLeaderboard = () => {
		setStatsModalTab("leaderboard");
		setIsStatsOpen(true);
	};

	if (!puzzle || !dailyPuzzle) {
		return (
			<div style={{ color: "white", padding: "24px" }}>
				Loading KarmaGrid...
			</div>
		);
	}

	const isPractice = Boolean(puzzle.isPractice);
	const difficultyLabel =
		puzzle.difficultyLabel ??
		PuzzleGenerator.getDifficultyMetaForSize(puzzle.size).label;

	const shareText = DevvitBridge.generateShareText(
		puzzle.dayNumber,
		puzzle.date,
		seconds,
		userGrid,
		puzzle.sectors,
		puzzle.size,
		{
			isPractice,
			difficultyLabel,
			hintsUsed,
		},
	);

	return (
		<div className="app-container">
			<Header
				dayNumber={puzzle.dayNumber}
				dailySize={dailyPuzzle.size}
				mode={mode}
				isPractice={isPractice}
				difficultyLabel={difficultyLabel}
				variantIndex={puzzle.variantIndex ?? 0}
				seconds={seconds}
				streak={stats.currentStreak}
				soundEnabled={soundEnabled}
				onSelectMode={handleSelectMode}
				onNextPractice={handleNextPractice}
				onToggleSound={toggleSound}
				onOpenHelp={() => setIsHelpOpen(true)}
				onOpenStats={openStats}
				onOpenLeaderboard={openLeaderboard}
			/>

			<Board
				size={puzzle.size}
				sectors={puzzle.sectors}
				userGrid={userGrid}
				conflicts={conflicts}
				subreddits={puzzle.subreddits}
				activeHint={activeHint}
				onCellClick={handleCellClick}
				onCellRightClick={handleCellRightClick}
			/>

			<Controls
				canUndo={history.length > 0}
				canRedo={redoStack.length > 0}
				isWon={isWon}
				activeHint={activeHint}
				onUndo={handleUndo}
				onRedo={handleRedo}
				onHint={handleHint}
				onApplyHint={handleApplyHint}
				onDismissHint={() => setActiveHint(null)}
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
				initialTab={statsModalTab}
				dailyDate={dailyPuzzle.date}
				dailyNumber={dailyPuzzle.dayNumber}
				stats={stats}
				onClose={() => setIsStatsOpen(false)}
			/>

			<WinModal
				isOpen={isWinOpen}
				dayNumber={puzzle.dayNumber}
				isPractice={isPractice}
				difficultyLabel={difficultyLabel}
				seconds={seconds}
				streak={stats.currentStreak}
				hintsUsed={hintsUsed}
				shareText={shareText}
				onNextPractice={isPractice ? handleNextPractice : undefined}
				onBackToDaily={isPractice ? () => handleSelectMode("daily") : undefined}
				onOpenLeaderboard={!isPractice ? openLeaderboard : undefined}
				onClose={() => setIsWinOpen(false)}
			/>
		</div>
	);
};
