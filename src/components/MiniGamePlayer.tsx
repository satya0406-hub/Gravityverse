import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Heart, RotateCcw, Award, AlertTriangle, Play, HelpCircle, Check, ArrowRight, ArrowLeft, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';
import { trackGames } from '../lib/analytics';

interface MiniGamePlayerProps {
  day: number;
  title: string;
  description: string;
  attemptsLeft: number;
  onSuccess: () => void;
  onFailure: () => void;
  rules?: string;
}

const GAME_RULES: Record<number, { objective: string; constraints: string[]; steps: string[] }> = {
  1: {
    objective: "Safely transport 3 Missionaries and 3 Cannibals across the river using the boat.",
    constraints: [
      "The boat can carry a maximum of 2 people at a time.",
      "The boat requires at least 1 person to navigate/row.",
      "Cannibals must NEVER outnumber Missionaries on either bank. If they do, the Missionaries are eaten!"
    ],
    steps: [
      "Click '+ Board M' or '+ Board C' to load people onto the boat on the current bank.",
      "Click '- Drop M' or '- Drop C' to unload some passengers.",
      "Click 'Row Boat' to navigate across."
    ]
  },
  2: {
    objective: "Place exactly 4 Queens on the 4x4 chess board so that they are completely safe.",
    constraints: [
      "No two queens can occupy the same horizontal row.",
      "No two queens can occupy the same vertical column.",
      "No two queens can share diagonal lines of attack."
    ],
    steps: [
      "Click any cell in the 4x4 coordinate space to place a Queen 👑.",
      "Adjust positions until exactly 4 Queens are placed with zero active conflicts."
    ]
  },
  3: {
    objective: "Establish 3 consecutive markers on a standard 3x3 play board, or force a system tie.",
    constraints: [
      "You always take the first turn as 'X'.",
      "The smart reactive AI plays defense as 'O'."
    ],
    steps: [
      "Click any empty cell to place your 'X' marker.",
      "Match 3 markers in a row, column, or diagonal, or successfully draw to clear the round!"
    ]
  },
  4: {
    objective: "Transfer the entire stack of 3 discs from Peg 1 to Peg 3.",
    constraints: [
      "You can only move one disc at a time (from the top of a peg).",
      "A larger disc can never be placed on top of a smaller disc."
    ],
    steps: [
      "Click a peg to select and pick up/lift its top-most disc (it will display a 'LIFTED' state).",
      "Click another target peg to place the disc on top."
    ]
  },
  5: {
    objective: "Extinguish every single activated light panel in the 3x3 layout.",
    constraints: [
      "Clicking a card toggles its active light state (off/on).",
      "It also automatically toggles the states of all immediate horizontal and vertical neighbors!"
    ],
    steps: [
      "Identify the interlocking nodes.",
      "Toggle panels strategically until the entire grid is empty/dark."
    ]
  },
  6: {
    objective: "Cipher Breakthrough: Decrypt the scrambled codeword 'XQLYHUVLWB' to claim the sequence key.",
    constraints: [
      "The system scrambled the word by shifting each character's alphabet index forward by 3 positions.",
      "For example, a Caesar shift of +3 means 'D' shifts from 'A'. You must shift each letter back by 3 steps!"
    ],
    steps: [
      "Convert each character of 'XQLYHUVLWB' backwards by 3 letters (e.g. D -> A, E -> B, etc.).",
      "Type your decoded uppercase word into the input console and click 'SUBMIT CODE'."
    ]
  },
  7: {
    objective: "Slide and order the randomized tiles sequentially from 1 to 8, with the blank space at the end.",
    constraints: [
      "You can only slide numbered blocks into the adjacent empty grid space."
    ],
    steps: [
      "Click any numbered block directly next to (above, below, left, or right) the blank card to slide it.",
      "Sort the blocks left-to-right, top-to-bottom: [1, 2, 3, 4, 5, 6, 7, 8, Empty]."
    ]
  },
  8: {
    objective: "Isolate and identify the mainframe secret number between index 1 and 100 within 7 tries.",
    constraints: [
      "Every submission returns feedback guiding you if the value is Higher or Lower.",
      "Exceeding 7 rounds resets the decryption core!"
    ],
    steps: [
      "Input your guessed integer, then hit Enter or click 'GUESS'.",
      "Observe the dynamic bounds range feedback (e.g. 20 ≤ X ≤ 50) and refine your guess."
    ]
  },
  9: {
    objective: "Guide your active messenger bike (🚴) from starting coordinate (top-left) to the target Finish Portal (★).",
    constraints: [
      "Red obstacles represent firewalls (█) which you cannot enter or pass through."
    ],
    steps: [
      "Use the on-screen controller pad (▲, ▼, ◀, ▶) to travel one grid cell at a time.",
      "Maneuver around walls until reaching the ★ star portal successfully."
    ]
  },
  10: {
    objective: "Perfect memory test: Replicate the glowing sequence pattern of colored panels exactly.",
    constraints: [
      "Any incorrect click resets the stream.",
      "The pattern must be followed in precise chronological order."
    ],
    steps: [
      "Click the '📺 DEMO SEQUENCE FLASHER' button to display the signal sequence.",
      "Wait for the flasher to complete, then click the numbered panels in identical order."
    ]
  },
  11: {
    objective: "Solve for the missing mathematical values X and Y in the 3x3 Magic Square grid.",
    constraints: [
      "Every single line—including horizontal rows, vertical columns, and corner-to-corner diagonal paths—must add up to the same magic sum of 15."
    ],
    steps: [
      "Analyze the numbers present (e.g. [2, 7, 6], [9, 5, X], [4, Y, 8]).",
      "Calculate what values of X and Y satisfy the constant sum parameters, key them in, and submit."
    ]
  },
  12: {
    objective: "Move a chess Knight ♞ from the top-left origin (0,0) to the lower-right terminal coordinates (4,4).",
    constraints: [
      "The Knight travels exclusively in an 'L' shape (2 squares straight and 1 to the side).",
      "You must arrive precisely at destination space in at most 4 moves!"
    ],
    steps: [
      "Click any highlighted or valid coordinate space that is exactly one Knight's hop away from your current position.",
      "Plot a route that reaches the finish coordinates (4,4) in 4 moves or fewer."
    ]
  },
  13: {
    objective: "Mental processing test: Determine if the spelled color group name matches its typographic font color.",
    constraints: [
      "You must correctly answer a continuous streak of 3 consecutive matches.",
      "Any mistake resets your current streak to 0!"
    ],
    steps: [
      "Look at the word (e.g. 'Red' written in blue text font).",
      "Click 'Match' if text spelling matches the font color. Otherwise, click 'No Match'."
    ]
  },
  14: {
    objective: "Decipher the correct 3-digit combination safe lock numbers (digits 1 to 5 only) within 6 attempts.",
    constraints: [
      "Exact match in the correct position = Bull (Exact match).",
      "Correct digit but in a different position = Cow (Misplaced match)."
    ],
    steps: [
      "Enter a guess of 3 digits from 1 to 5.",
      "Analyze the feedback (e.g. 1 Exact, 1 Misplaced) to narrow down the possible lock combination."
    ]
  }
};

export function MiniGamePlayer({
  day,
  title,
  description,
  attemptsLeft,
  onSuccess,
  onFailure,
  rules,
}: MiniGamePlayerProps) {
  // Common states
  const [gameState, setGameState] = useState<any>({});
  const [feedback, setFeedback] = useState<string>('');
  const [solved, setSolved] = useState<boolean>(false);
  const [showRules, setShowRules] = useState<boolean>(true);
  const [gameStartTime, setGameStartTime] = useState<number>(Date.now());

  // Initialize specific game states depending on active day
  useEffect(() => {
    initGame();
    try {
      trackGames.start(day.toString(), title);
    } catch (e) {
      console.warn('Analytics trackGames.start failed:', e);
    }
  }, [day, title]);

  const initGame = () => {
    setSolved(false);
    setFeedback('');
    setGameStartTime(Date.now());
    
    switch (day) {
      case 1: // River Crossing (Missionaries & Cannibals)
        setGameState({
          leftM: 3, leftC: 3,
          rightM: 0, rightC: 0,
          boatM: 0, boatC: 0,
          boatSide: 'left', // 'left' or 'right'
        });
        break;
      case 2: // N-Queens (4x4 board)
        setGameState({
          board: Array(16).fill(false), // 4x4 flat array
        });
        break;
      case 3: // Tic-Tac-Toe VS AI
        setGameState({
          board: Array(9).fill(null),
          isUserTurn: true,
        });
        break;
      case 4: // Tower of Hanoi
        setGameState({
          pegs: [
            [3, 2, 1], // Peg 0
            [],        // Peg 1
            [],        // Peg 2
          ],
          selectedPeg: null,
        });
        break;
      case 5: // Lights Out (3x3 grid)
        // Set a solvable configuration (lights initially on)
        setGameState({
          lights: [
            true, false, true,
            false, true, false,
            true, false, true
          ],
        });
        break;
      case 6: // Word Decrypter (Caesar shifts back "XQLYHUVLWB" by 3 => UNIVERSITY)
        setGameState({
          guess: '',
        });
        break;
      case 7: // Sliding 8-Puzzle (3x3)
        // Start almost solved for convenience
        setGameState({
          board: [1, 2, 3, 4, null, 5, 7, 8, 6],
        });
        break;
      case 8: // Binary Search guess (1 to 100)
        const secret = Math.floor(Math.random() * 100) + 1;
        setGameState({
          secret,
          min: 1,
          max: 100,
          guesses: [],
          currentGuess: '',
        });
        break;
      case 9: // Maze Runner (5x5 grid)
        // 0 = free, 1 = wall, 2 = start, 3 = finish
        const maze = [
          [2, 0, 1, 0, 0],
          [1, 0, 1, 0, 1],
          [0, 0, 0, 0, 0],
          [0, 1, 1, 1, 0],
          [0, 0, 0, 1, 3],
        ];
        setGameState({
          maze,
          x: 0,
          y: 0,
        });
        break;
      case 10: // Simon Sequence Repeat
        setGameState({
          sequence: [1, 3, 0, 2], // Pattern to repeat
          currentIndex: 0,
          flashedItem: null,
          demoIndex: -1,
        });
        break;
      case 11: // Magic Square Missing sum
        // Fits:
        // [2, 7, 6] = 15
        // [9, 5, X (1)] = 15
        // [4, Y (3), 8] = 15
        setGameState({
          xVal: '',
          yVal: '',
        });
        break;
      case 12: // Chess Knight jumping target
        // Knight at (0,0), target (4,4) in 4 moves
        setGameState({
          x: 0,
          y: 0,
          moves: 0,
          history: [{ x: 0, y: 0 }],
        });
        break;
      case 13: // Stroop Speed Match Test
        setGameState({
          items: [
            { text: 'Green', color: '#10b981', match: true },
            { text: 'Red', color: '#38bdf8', match: false },
            { text: 'Blue', color: '#38bdf8', match: true },
            { text: 'Yellow', color: '#ef4444', match: false }
          ],
          index: 0,
          score: 0,
        });
        break;
      case 14: // Mastermind Codecracker lock
        setGameState({
          secretCode: [3, 5, 2], // Secret combination of digits 1-5
          guesses: [],
          g1: '', g2: '', g3: '',
        });
        break;
      default:
        setGameState({});
    }
  };

  const handleWrongAttempt = () => {
    onFailure(); // Docks 1 heart in main page state
    setFeedback('❌ Warning: That attempt failed! -1 Chance (Heart)');
  };

  const triggerProgressSolve = () => {
    setSolved(true);
    setFeedback('🎉 Outstanding Mastery! DAY CHALLENGE CLEARED!');
    try {
      const durationSeconds = Math.max(1, Math.round((Date.now() - gameStartTime) / 1000));
      trackGames.complete(day.toString(), title, 100, true, durationSeconds);
    } catch (e) {
      console.warn('Analytics trackGames.complete failed:', e);
    }
    setTimeout(() => {
      onSuccess();
    }, 1500);
  };

  // ---------------- GAME LOGICS & RENDER TRIGGERS ----------------

  // 1. Missionaries & Cannibals
  const handleDay1MoveBoat = (type: 'M' | 'C', direction: 'board' | 'unboard') => {
    const s = { ...gameState };
    if (direction === 'board') {
      const isLeft = s.boatSide === 'left';
      const countInBoat = s.boatM + s.boatC;
      if (countInBoat >= 2) return;

      if (type === 'M') {
        if (isLeft && s.leftM > 0) { s.leftM--; s.boatM++; }
        else if (!isLeft && s.rightM > 0) { s.rightM--; s.boatM++; }
      } else {
        if (isLeft && s.leftC > 0) { s.leftC--; s.boatC++; }
        else if (!isLeft && s.rightC > 0) { s.rightC--; s.boatC++; }
      }
    } else {
      if (type === 'M' && s.boatM > 0) {
        if (s.boatSide === 'left') { s.leftM++; s.boatM--; }
        else { s.rightM++; s.boatM--; }
      } else if (type === 'C' && s.boatC > 0) {
        if (s.boatSide === 'left') { s.leftC++; s.boatC--; }
        else { s.rightC++; s.boatC--; }
      }
    }
    setGameState(s);
  };

  const handleDay1Row = () => {
    const s = { ...gameState };
    const boatCount = s.boatM + s.boatC;
    if (boatCount === 0) {
      setFeedback('⚠️ Boat must have at least 1 rower!');
      return;
    }

    // Move boat
    s.boatSide = s.boatSide === 'left' ? 'right' : 'left';
    setGameState(s);

    // Evaluate rules: On either side (including what is on the bank)
    // Check Left Side
    const leftMTot = s.leftM + (s.boatSide === 'left' ? s.boatM : 0);
    const leftCTot = s.leftC + (s.boatSide === 'left' ? s.boatC : 0);
    if (leftMTot > 0 && leftCTot > leftMTot) {
      handleWrongAttempt();
      initGame();
      return;
    }

    // Check Right Side
    const rightMTot = s.rightM + (s.boatSide === 'right' ? s.boatM : 0);
    const rightCTot = s.rightC + (s.boatSide === 'right' ? s.boatC : 0);
    if (rightMTot > 0 && rightCTot > rightMTot) {
      handleWrongAttempt();
      initGame();
      return;
    }

    // Victory check
    if (s.rightM + s.boatM === 3 && s.rightC + s.boatC === 3 && s.boatSide === 'right') {
      s.rightM += s.boatM;
      s.rightC += s.boatC;
      s.boatM = 0;
      s.boatC = 0;
      setGameState(s);
      triggerProgressSolve();
    }
  };

  // 2. N-Queens
  const handleDay2ToggleCell = (index: number) => {
    const s = { ...gameState };
    const b = [...s.board];
    b[index] = !b[index];
    
    const count = b.filter(Boolean).length;
    if (count > 4) {
      setFeedback('⚠️ You can place at most 4 queens on this 4x4 matrix.');
      return;
    }

    s.board = b;
    setGameState(s);

    // Live validation
    const queens: { r: number; c: number }[] = [];
    b.forEach((v, idx) => {
      if (v) {
        queens.push({ r: Math.floor(idx / 4), c: idx % 4 });
      }
    });

    let conflict = false;
    for (let i = 0; i < queens.length; i++) {
      for (let j = i + 1; j < queens.length; j++) {
        const q1 = queens[i];
        const q2 = queens[j];
        if (
          q1.r === q2.r ||
          q1.c === q2.c ||
          Math.abs(q1.r - q2.r) === Math.abs(q1.c - q2.c)
        ) {
          conflict = true;
        }
      }
    }

    if (conflict) {
      setFeedback('⚠️ Warn: Queens are in conflicting paths red-light!');
    } else {
      setFeedback(count === 4 ? '' : `👑 Queens placed: ${count}/4. No conflicts detected.`);
      if (count === 4) {
        triggerProgressSolve();
      }
    }
  };

  // 3. Tic-Tac-Toe VS Smart AI
  const handleDay3CellClick = (idx: number) => {
    if (gameState.board[idx] || !gameState.isUserTurn || solved) return;
    const b = [...gameState.board];
    b[idx] = 'X';
    setGameState({ board: b, isUserTurn: false });

    // Validate if User won
    if (checkWinner(b, 'X')) {
      triggerProgressSolve();
      return;
    }

    if (!b.includes(null)) {
      // Draw is acceptable in this survival challenge
      setFeedback('🤝 Draw! Day challenge cleared successfully.');
      triggerProgressSolve();
      return;
    }

    // AI Turn (Simulated after a small timeout)
    setTimeout(() => {
      const liveBoard = [...b];
      // Minimax or direct blocking move
      let aiIndex = findBestMove(liveBoard);
      if (aiIndex === -1) {
        // Fallback to random spot
        const free = liveBoard.map((c, i) => c === null ? i : null).filter(v => v !== null) as number[];
        if (free.length > 0) {
          aiIndex = free[Math.floor(Math.random() * free.length)];
        }
      }

      if (aiIndex !== -1) {
        liveBoard[aiIndex] = 'O';
      }

      // Validate if AI won
      if (checkWinner(liveBoard, 'O')) {
        handleWrongAttempt();
        initGame();
      } else if (!liveBoard.includes(null)) {
        setGameState({ board: liveBoard, isUserTurn: true });
        setFeedback('🤝 Draw! Day challenge cleared.');
        triggerProgressSolve();
      } else {
        setGameState({ board: liveBoard, isUserTurn: true });
      }
    }, 400);
  };

  const checkWinner = (b: any[], turn: string) => {
    const wins = [
      [0,1,2], [3,4,5], [6,7,8],
      [0,3,6], [1,4,7], [2,5,8],
      [0,4,8], [2,4,6]
    ];
    return wins.some(comb => comb.every(idx => b[idx] === turn));
  };

  const findBestMove = (b: any[]): number => {
    // 1. Can AI Win in one move?
    for (let i = 0; i < 9; i++) {
      if (b[i] === null) {
        const test = [...b]; test[i] = 'O';
        if (checkWinner(test, 'O')) return i;
      }
    }
    // 2. Can User Win in one move? Block!
    for (let i = 0; i < 9; i++) {
      if (b[i] === null) {
        const test = [...b]; test[i] = 'X';
        if (checkWinner(test, 'X')) return i;
      }
    }
    // Take center if free
    if (b[4] === null) return 4;
    return -1;
  };

  // 4. Tower of Hanoi
  const handleDay4PegClick = (pegIdx: number) => {
    const s = { ...gameState };
    if (s.selectedPeg === null) {
      if (s.pegs[pegIdx].length === 0) return;
      s.selectedPeg = pegIdx;
    } else {
      const srcPeg = s.selectedPeg;
      const srcDisk = s.pegs[srcPeg][s.pegs[srcPeg].length - 1];
      const destPeg = s.pegs[pegIdx];
      const destDisk = destPeg[destPeg.length - 1];

      if (srcPeg !== pegIdx) {
        if (!destDisk || srcDisk < destDisk) {
          // Transfer is legal
          destPeg.push(s.pegs[srcPeg].pop()!);
          s.selectedPeg = null;

          // Check Win Condition: All disks [3, 2, 1] on Peg 2
          if (s.pegs[2].length === 3) {
            triggerProgressSolve();
          }
        } else {
          setFeedback('⚠️ Cannot place a larger disk onto a smaller disk!');
          s.selectedPeg = null;
        }
      } else {
        s.selectedPeg = null;
      }
    }
    setGameState(s);
  };

  // 5. Lights Out
  const handleDay5Flip = (index: number) => {
    const s = { ...gameState };
    const l = [...s.lights];
    const triggerIndices = [
      index, // center
      index % 3 !== 0 ? index - 1 : -1, // left
      index % 3 !== 2 ? index + 1 : -1, // right
      index - 3, // up
      index + 3, // down
    ];

    triggerIndices.forEach(idx => {
      if (idx >= 0 && idx < 9) {
        l[idx] = !l[idx];
      }
    });

    s.lights = l;
    setGameState(s);

    if (l.every(light => !light)) {
      triggerProgressSolve();
    }
  };

  // 6. Word Decoder
  const handleDay6Submit = () => {
    const userGuess = (gameState.guess || '').trim().toUpperCase();
    if (userGuess === 'UNIVERSITY') {
      triggerProgressSolve();
    } else {
      handleWrongAttempt();
    }
  };

  // 7. Sliding 8-Puzzle
  const handleDay7Slide = (index: number) => {
    const s = { ...gameState };
    const b = [...s.board];
    const nullIdx = b.indexOf(null);

    const isAdjacent = 
      (Math.abs(index - nullIdx) === 1 && Math.floor(index / 3) === Math.floor(nullIdx / 3)) ||
      Math.abs(index - nullIdx) === 3;

    if (isAdjacent) {
      b[nullIdx] = b[index];
      b[index] = null;
      s.board = b;
      setGameState(s);

      // Check if board equals [1, 2, 3, 4, 5, 6, 7, 8, null]
      const winModel = [1, 2, 3, 4, 5, 6, 7, 8, null];
      const win = b.every((val, i) => val === winModel[i]);
      if (win) {
        triggerProgressSolve();
      }
    }
  };

  // 8. Guess Core Secret
  const handleDay8Guess = () => {
    const guessVal = parseInt(gameState.currentGuess);
    if (isNaN(guessVal) || guessVal < 1 || guessVal > 100) {
      setFeedback('⚠️ Please enter a number between 1 and 100');
      return;
    }

    const s = { ...gameState };
    s.guesses.push(guessVal);

    if (guessVal === s.secret) {
      triggerProgressSolve();
      return;
    } else if (guessVal < s.secret) {
      s.min = Math.max(s.min, guessVal + 1);
      setFeedback(`🔼 Too Low! Secret is higher than ${guessVal}.`);
    } else {
      s.max = Math.min(s.max, guessVal - 1);
      setFeedback(`🔽 Too High! Secret is lower than ${guessVal}.`);
    }

    s.currentGuess = '';
    
    // Max attempts check: limit guesses inside single game to 7
    if (s.guesses.length >= 7) {
      handleWrongAttempt();
      initGame();
      setFeedback(`💀 Ran out of guesses! Secret was ${s.secret}. Day reset.`);
    } else {
      setGameState(s);
    }
  };

  // 9. Maze Runner Route
  const handleDay9Move = (dx: number, dy: number) => {
    const s = { ...gameState };
    const nextX = s.x + dx;
    const nextY = s.y + dy;

    if (nextX >= 0 && nextX < 5 && nextY >= 0 && nextY < 5) {
      if (s.maze[nextY][nextX] !== 1) {
        s.x = nextX;
        s.y = nextY;
        setGameState(s);

        if (s.maze[nextY][nextX] === 3) {
          triggerProgressSolve();
        }
      } else {
        setFeedback('💥 Ouch! You hit a firewall wall obstacle.');
      }
    }
  };

  // 10. Simon Sounds
  const handleDay10Demo = () => {
    const seq = gameState.sequence || [];
    let idx = 0;
    const ticker = setInterval(() => {
      if (idx < seq.length) {
        setGameState(prev => ({ ...prev, flashedItem: seq[idx] }));
        setTimeout(() => {
          setGameState(prev => ({ ...prev, flashedItem: null }));
        }, 500);
        idx++;
      } else {
        clearInterval(ticker);
        setFeedback('👉 Your Turn! Replicate the flashed panels.');
      }
    }, 900);
  };

  const handleDay10Click = (panelIdx: number) => {
    const s = { ...gameState };
    const seq = s.sequence;
    
    if (seq[s.currentIndex] === panelIdx) {
      s.currentIndex++;
      if (s.currentIndex >= seq.length) {
        triggerProgressSolve();
      } else {
        setGameState(s);
      }
    } else {
      handleWrongAttempt();
      initGame();
    }
  };

  // 11. Magic Square math solver
  const handleDay11Submit = () => {
    const x = parseInt(gameState.xVal);
    const y = parseInt(gameState.yVal);

    if (x === 1 && y === 3) {
      triggerProgressSolve();
    } else {
      handleWrongAttempt();
    }
  };

  // 12. Chess Knight journey hop
  const handleDay12Hop = (tx: number, ty: number) => {
    const s = { ...gameState };
    const dx = Math.abs(tx - s.x);
    const dy = Math.abs(ty - s.y);

    const isKnightMove = (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
    const moveLimit = 4;

    if (isKnightMove) {
      s.x = tx;
      s.y = ty;
      s.moves++;
      s.history.push({ x: tx, y: ty });

      if (tx === 4 && ty === 4) {
        if (s.moves <= moveLimit) {
          triggerProgressSolve();
        } else {
          setFeedback(`⚠️ Reached finish coordinate, but took ${s.moves} moves instead of under ${moveLimit}! Resetting.`);
          initGame();
        }
      } else if (s.moves >= moveLimit) {
        handleWrongAttempt();
        initGame();
        setFeedback('💀 Exceeded move limit bounds! Day reset.');
      } else {
        setGameState(s);
      }
    }
  };

  // 13. Stroop Colors Match speed
  const handleDay13Submit = (selected: boolean) => {
    const s = { ...gameState };
    const currentItem = s.items[s.index];

    if (currentItem.match === selected) {
      s.score++;
      if (s.score >= 3) {
        triggerProgressSolve();
      } else {
        s.index = (s.index + 1) % s.items.length;
        setGameState(s);
        setFeedback(`👍 Correct! ${s.score}/3 streak.`);
      }
    } else {
      handleWrongAttempt();
      s.score = 0;
      s.index = 0;
      setGameState(s);
    }
  };

  // 14. Mastermind Combinations Codebreaker
  const handleDay14Guess = () => {
    const g1 = parseInt(gameState.g1);
    const g2 = parseInt(gameState.g2);
    const g3 = parseInt(gameState.g3);

    if (isNaN(g1) || isNaN(g2) || isNaN(g3) || g1<1 || g1>5 || g2<1 || g2>5 || g3<1 || g3>5) {
      setFeedback('⚠️ Enter integers between 1 and 5 in the three lock positions.');
      return;
    }

    const currentGuess = [g1, g2, g3];
    const s = { ...gameState };
    
    // Count bulls (exact matches)
    let bulls = 0;
    let cows = 0;
    const secretUsed = [...s.secretCode];
    const guessUsed = [...currentGuess];

    for (let i = 0; i < 3; i++) {
      if (guessUsed[i] === secretUsed[i]) {
        bulls++;
        secretUsed[i] = -1;
        guessUsed[i] = -2;
      }
    }

    for (let i = 0; i < 3; i++) {
      if (guessUsed[i] > 0) {
        const idx = secretUsed.indexOf(guessUsed[i]);
        if (idx !== -1) {
          cows++;
          secretUsed[idx] = -1;
        }
      }
    }

    const historyItem = {
      guess: currentGuess.join('-'),
      bulls,
      cows
    };

    s.guesses.push(historyItem);
    s.g1 = ''; s.g2 = ''; s.g3 = '';

    if (bulls === 3) {
      triggerProgressSolve();
    } else {
      if (s.guesses.length >= 6) {
        handleWrongAttempt();
        initGame();
        setFeedback('💀 System locks initiated self-destruct! Mastermind Day reset.');
      } else {
        setGameState(s);
        setFeedback(`🔍 Matches: ${bulls} Exact, ${cows} Misplaced. Try another attempt!`);
      }
    }
  };

  return (
    <div className="bg-[#0e1427] border border-white/10 p-6 sm:p-8 rounded-2xl shadow-2xl relative overflow-hidden text-left">
      {/* Background accents */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-brand-blue/5 rounded-full blur-2xl pointer-events-none" />

      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4 mb-6">
        <div>
          <span className="text-[10px] font-black uppercase text-brand-blue tracking-[0.2em] block mb-1">
            Day {day} Challenges
          </span>
          <h3 className="text-xl font-serif font-black text-white uppercase tracking-wider">
            {title}
          </h3>
          <p className="text-slate-400 text-xs mt-1 max-w-lg">
            {description}
          </p>
        </div>

        {/* Lives Counter block */}
        <div className="flex items-center gap-1.5 bg-neutral-900/40 border border-white/10 px-3.5 py-2 rounded-xl">
          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mr-1.5">
            Lives:
          </span>
          {Array.from({ length: 3 }).map((_, i) => (
            <Heart
              key={i}
              className={`w-4 h-4 transition-all ${
                i < attemptsLeft 
                  ? 'text-red-500 fill-red-500 scale-100' 
                  : 'text-neutral-700 font-extralight opacity-30 scale-90'
              }`}
            />
          ))}
        </div>
      </div>

      {/* 📖 Dynamic Game Rules Box */}
      {(rules || GAME_RULES[day]) && (
        <div className="mb-6 bg-[#040816]/75 border border-brand-blue/30 rounded-xl overflow-hidden shadow-lg shadow-black/40 text-left">
          <button
            onClick={() => setShowRules(!showRules)}
            className="w-full px-4 py-3 bg-[#0d1326] flex items-center justify-between text-left hover:bg-slate-900 border-b border-white/5 transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-brand-blue-light animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                📖 Day {day} Rules & Objective Guide
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
              <span>{showRules ? 'HIDE' : 'SHOW'} RULES</span>
              {showRules ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>
          
          {showRules && (
            <div className="p-4 sm:p-5 space-y-4 text-xs leading-relaxed text-slate-300 font-sans">
              {rules ? (
                <div className="space-y-1.5 bg-[#0b101f]/60 p-3 rounded-lg border border-white/5">
                  <span className="text-[10px] text-brand-blue-light font-extrabold uppercase tracking-widest block mb-1 font-mono">
                    📋 Custom Puzzle Rules & Instructions
                  </span>
                  <div className="text-slate-200 whitespace-pre-wrap font-medium leading-relaxed">
                    {rules}
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <span className="text-[10px] text-brand-blue-light font-extrabold uppercase tracking-widest block mb-1 font-mono">
                      🎯 Objective
                    </span>
                    <p className="text-slate-200 font-medium">
                      {GAME_RULES[day].objective}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5 bg-[#0b101f]/60 p-3 rounded-lg border border-white/5">
                      <span className="text-[10px] text-red-400/90 font-extrabold uppercase tracking-wider block font-mono">
                        ⚠️ Rules & Constraints
                      </span>
                      <ul className="list-disc pl-4 space-y-1 text-slate-400">
                        {GAME_RULES[day].constraints.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-1.5 bg-[#0b101f]/60 p-3 rounded-lg border border-white/5">
                      <span className="text-[10px] text-emerald-400/90 font-extrabold uppercase tracking-wider block font-mono">
                        🕹️ How To Play
                      </span>
                      <ol className="list-decimal pl-4 space-y-1 text-slate-400">
                        {GAME_RULES[day].steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {feedback && (
        <div className={`mb-6 p-4 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center gap-2.5 ${
          feedback.includes('❌') || feedback.includes('⚙️') || feedback.includes('💀')
            ? 'bg-red-500/10 border-red-500/20 text-red-400'
            : feedback.includes('🎉') || feedback.includes('👍')
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 animation-pulse'
            : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500'
        }`}>
          {feedback.includes('❌') ? <ShieldAlert className="w-4 h-4" /> : <InfoCircle className="w-4 h-4" />}
          <span>{feedback}</span>
        </div>
      )}

      {/* Interactive Play Arena */}
      <div className="bg-[#060913] rounded-2xl border border-white/5 p-4 sm:p-6 min-h-[220px] flex flex-col items-center justify-center relative">
        {attemptsLeft <= 0 ? (
          <div className="text-center py-8">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4 animate-bounce" />
            <h4 className="text-white text-lg font-black uppercase tracking-wider mb-2">
              No Attempts Left Screen
            </h4>
            <p className="text-slate-400 text-xs max-w-md mx-auto mb-6">
              You are out of lives for this challenge. Use the simulation deck at the bottom to reset your data or restore your chances instantly!
            </p>
          </div>
        ) : solved ? (
          <div className="text-center py-8 animate-pulse text-emerald-400">
            <Award className="w-16 h-16 mx-auto mb-4 text-emerald-400 animate-spin" />
            <h4 className="text-xl font-black uppercase tracking-widest mb-1">
              CHALLENGE SOLVED!
            </h4>
            <p className="text-xs text-slate-400">Unlocking next day loop timer after 24:00 countdown...</p>
          </div>
        ) : (
          <div className="w-full">
            {/* ------------ GAME 1: Missionaries & Cannibals ----------- */}
            {day === 1 && gameState.leftM !== undefined && (
              <div className="text-center w-full max-w-md mx-auto">
                <p className="text-xs text-slate-400 mb-4 font-mono">
                  Banks: M = Missionaries, C = Cannibals. Boat max = 2. Cannibals must never outnumber Missionaries on either side!
                </p>
                <div className="grid grid-cols-3 gap-4 items-center mb-6 bg-slate-900/50 p-4 border border-white/5 rounded-xl">
                  {/* Left Bank */}
                  <div className="p-2 border border-white/5 rounded-lg text-center">
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase">Left Bank</span>
                    <div className="text-sm font-black text-white mt-1">
                      {gameState.leftM}M | {gameState.leftC}C
                    </div>
                  </div>
                  {/* River with boat */}
                  <div className="flex flex-col items-center justify-center p-2">
                    <span className="text-[10px] text-slate-500 font-bold uppercase mb-1">Boat ({gameState.boatSide === 'left' ? '←' : '→'})</span>
                    <div className="text-xs font-black text-brand-blue bg-brand-blue/10 px-2 py-1 rounded max-w-full">
                      {gameState.boatM > 0 || gameState.boatC > 0 ? `${gameState.boatM}M | ${gameState.boatC}C` : 'Empty'}
                    </div>
                  </div>
                  {/* Right Bank */}
                  <div className="p-2 border border-white/5 rounded-lg text-center">
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase">Right Bank</span>
                    <div className="text-sm font-black text-white mt-1">
                      {gameState.rightM}M | {gameState.rightC}C
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
                  <button 
                    onClick={() => handleDay1MoveBoat('M', 'board')}
                    disabled={gameState.boatSide === 'left' ? gameState.leftM === 0 : gameState.rightM === 0}
                    className="px-3 py-1.5 bg-neutral-900 border border-white/10 rounded-lg text-xs font-bold text-slate-300 hover:border-brand-blue transition disabled:opacity-40"
                  >
                    + Board M
                  </button>
                  <button 
                    onClick={() => handleDay1MoveBoat('C', 'board')}
                    disabled={gameState.boatSide === 'left' ? gameState.leftC === 0 : gameState.rightC === 0}
                    className="px-3 py-1.5 bg-neutral-900 border border-white/10 rounded-lg text-xs font-bold text-slate-300 hover:border-brand-blue transition disabled:opacity-40"
                  >
                    + Board C
                  </button>
                  <button 
                    onClick={() => handleDay1MoveBoat('M', 'unboard')}
                    disabled={gameState.boatM === 0}
                    className="px-3 py-1.5 bg-neutral-900 border border-white/10 rounded-lg text-xs font-bold text-slate-300 hover:border-red-500/40 transition disabled:opacity-40"
                  >
                    - Drop M
                  </button>
                  <button 
                    onClick={() => handleDay1MoveBoat('C', 'unboard')}
                    disabled={gameState.boatC === 0}
                    className="px-3 py-1.5 bg-neutral-900 border border-white/10 rounded-lg text-xs font-bold text-slate-300 hover:border-red-500/40 transition disabled:opacity-40"
                  >
                    - Drop C
                  </button>
                </div>
                
                <button
                  onClick={handleDay1Row}
                  className="w-full py-2.5 bg-brand-blue text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-blue-600 active:scale-95 transition"
                >
                  🚀 Row Boat to {gameState.boatSide === 'left' ? 'Right Bank' : 'Left Bank'}
                </button>
              </div>
            )}

            {/* ------------ GAME 2: N-Queens ---------- */}
            {day === 2 && gameState.board !== undefined && (
              <div className="text-center max-w-md mx-auto">
                <p className="text-xs text-slate-400 mb-4 font-mono">
                  Toggle squares to place 4 Queens safely so they do not share rows, columns, or diagonals.
                </p>
                <div className="grid grid-cols-4 gap-2 w-48 h-48 mx-auto mb-4 bg-slate-900/50 p-2 rounded-xl border border-white/5">
                  {gameState.board.map((isQueen: boolean, index: number) => {
                    const row = Math.floor(index / 4);
                    const col = index % 4;
                    const isDarkCell = (row + col) % 2 === 1;

                    return (
                      <button
                        key={index}
                        onClick={() => handleDay2ToggleCell(index)}
                        className={`w-full h-full rounded flex items-center justify-center text-sm font-black transition-all ${
                          isQueen 
                            ? 'bg-brand-blue text-white ring-2 ring-white/20' 
                            : isDarkCell 
                            ? 'bg-neutral-800 text-slate-500 hover:bg-neutral-700' 
                            : 'bg-neutral-700 text-slate-400 hover:bg-neutral-600'
                        }`}
                      >
                        {isQueen ? '👑' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ------------ GAME 3: Tic-Tac-Toe VS AI ------------ */}
            {day === 3 && gameState.board !== undefined && (
              <div className="text-center max-w-xs mx-auto">
                <p className="text-xs text-slate-400 mb-4 font-mono">
                  Get 3 in a row or successfully draw to secure victory against our defensive system AI.
                </p>
                <div className="grid grid-cols-3 gap-2 w-48 h-48 mx-auto mb-4 bg-slate-900/50 p-2 rounded-xl border border-white/5">
                  {gameState.board.map((val: string | null, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => handleDay3CellClick(idx)}
                      disabled={val !== null || !gameState.isUserTurn}
                      className={`w-full h-full rounded-xl flex items-center justify-center text-lg font-black transition-all ${
                        val === 'X' 
                          ? 'bg-brand-blue text-white' 
                          : val === 'O' 
                          ? 'bg-red-500/20 border border-red-500/30 text-red-400' 
                          : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'
                      }`}
                    >
                      {val || ''}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                  {gameState.isUserTurn ? '🟢 Your Turn (X)' : '🔴 System Thinking...'}
                </div>
              </div>
            )}

            {/* ------------ GAME 4: Tower of Hanoi ------------ */}
            {day === 4 && gameState.pegs !== undefined && (
              <div className="text-center w-full max-w-sm mx-auto">
                <p className="text-xs text-slate-400 mb-4 font-mono">
                  Select a peg to lift the top disc. Click another peg to place it. No larger disc on smaller disc! Goal: Move all to Peg 3.
                </p>
                <div className="grid grid-cols-3 gap-4 h-32 items-end mb-4 bg-neutral-900/40 p-4 border border-white/5 rounded-xl">
                  {gameState.pegs.map((peg: number[], pegIdx: number) => {
                    const isSelected = gameState.selectedPeg === pegIdx;
                    return (
                      <button
                        key={pegIdx}
                        onClick={() => handleDay4PegClick(pegIdx)}
                        className={`h-full w-full rounded-lg transition-all flex flex-col-reverse items-center justify-start pb-2 border ${
                          isSelected 
                            ? 'bg-brand-blue/15 border-brand-blue/40 ring-2 ring-brand-blue/30' 
                            : 'bg-neutral-800/20 border-white/5 hover:border-white/10'
                        }`}
                      >
                        {peg.map((size: number, cardIdx: number) => (
                          <div
                            key={cardIdx}
                            style={{ width: `${size * 25 + 20}%` }}
                            className="h-4 bg-gradient-to-r from-brand-blue to-blue-500 text-[9px] font-black text-white rounded flex items-center justify-center mb-0.5 border border-white/10 shadow-lg"
                          >
                            {size}
                          </div>
                        ))}
                        {isSelected && peg.length > 0 && (
                          <div className="text-[9px] text-brand-blue tracking-wider font-extrabold uppercase animate-pulse mb-auto mt-1">
                            LIFTED
                          </div>
                        )}
                        <span className="text-[8px] text-slate-500 font-bold block bg-neutral-900 px-1 py-0.5 rounded leading-none">
                          Peg {pegIdx + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ------------ GAME 5: Lights Out ------------ */}
            {day === 5 && gameState.lights !== undefined && (
              <div className="text-center max-w-xs mx-auto">
                <p className="text-xs text-slate-400 mb-4 font-mono">
                  Turn out every light card in the panel. Flipping a card toggles itself and its straight horizontal & vertical neighbors.
                </p>
                <div className="grid grid-cols-3 gap-2 w-48 h-48 mx-auto mb-4 bg-slate-900/50 p-2 rounded-xl border border-white/5">
                  {gameState.lights.map((light: boolean, index: number) => (
                    <button
                      key={index}
                      onClick={() => handleDay5Flip(index)}
                      className={`w-full h-full rounded-xl transition-all ${
                        light 
                          ? 'bg-brand-blue shadow-lg shadow-brand-blue/20 border border-white/20' 
                          : 'bg-neutral-800/40 border border-white/5 hover:bg-neutral-800/85'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ------------ GAME 6: Word Decrypter ----------- */}
            {day === 6 && gameState.guess !== undefined && (
              <div className="text-center max-w-md mx-auto p-2">
                <div className="text-2xl font-mono text-center text-yellow-400 font-extrabold tracking-widest bg-slate-900/70 p-4 border border-white/5 rounded-xl mb-4">
                  XQLYHUVLWB
                </div>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed font-mono">
                  Decrypt the secret cipher! Clue: Shift back each character alphabet by 3 letters! (Clue word matches: Academic excellence platform)
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={gameState.guess}
                    onChange={(e) => setGameState({ guess: e.target.value })}
                    placeholder="ENTER DECRYPTED CODE"
                    className="flex-1 bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white uppercase tracking-wider font-mono outline-none focus:border-brand-blue"
                  />
                  <button
                    onClick={handleDay6Submit}
                    className="px-6 py-2.5 bg-brand-blue hover:bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition"
                  >
                    SUBMIT CODE
                  </button>
                </div>
              </div>
            )}

            {/* ------------ GAME 7: Sliding 8-Puzzle ----------- */}
            {day === 7 && gameState.board !== undefined && (
              <div className="text-center max-w-xs mx-auto">
                <p className="text-xs text-slate-400 mb-4 font-mono">
                  Slide adjacent blocks into the blank card. Line them up from 1 to 8.
                </p>
                <div className="grid grid-cols-3 gap-2 w-48 h-48 mx-auto mb-4 bg-slate-900/50 p-2 rounded-xl border border-white/5">
                  {gameState.board.map((val: number | null, index: number) => (
                    <button
                      key={index}
                      onClick={() => handleDay7Slide(index)}
                      disabled={val === null}
                      className={`w-full h-full rounded-xl flex items-center justify-center text-sm font-black transition-all ${
                        val === null 
                          ? 'bg-neutral-900 border border-dashed border-white/10 text-slate-500' 
                          : 'bg-brand-blue hover:scale-[1.03] text-white shadow-md'
                      }`}
                    >
                      {val || ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ------------ GAME 8: Binary Guessing Bounds ---------- */}
            {day === 8 && gameState.guesses !== undefined && (
              <div className="text-center max-w-md mx-auto">
                <p className="text-xs text-slate-400 mb-4 font-mono">
                  Deduce the system secret number from 1 to 100 within 7 guesses.
                </p>
                <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 mb-4 text-center">
                  <span className="text-[10px] text-slate-500 font-extrabold uppercase">Known Bounds Range:</span>
                  <div className="text-2xl font-black text-brand-blue tracking-wide mt-1">
                    {gameState.min} ≤ X ≤ {gameState.max}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-1">
                    Attempts Used: {gameState.guesses.length}/7
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={gameState.currentGuess}
                    onChange={(e) => setGameState({ ...gameState, currentGuess: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && handleDay8Guess()}
                    placeholder="ENTER GUESS (1-100)"
                    className="flex-1 bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white tracking-wider font-mono outline-none focus:border-brand-blue"
                  />
                  <button
                    onClick={handleDay8Guess}
                    className="px-6 py-2.5 bg-brand-blue hover:bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition"
                  >
                    GUESS
                  </button>
                </div>
              </div>
            )}

            {/* ------------ GAME 9: Grid Maze Escape ----------- */}
            {day === 9 && gameState.maze !== undefined && (
              <div className="text-center max-w-xs mx-auto">
                <p className="text-xs text-slate-400 mb-4 font-mono">
                  Navigate Player (P) to the Finish Portal (★). Avoid hitting firewall block (█) nodes.
                </p>
                <div className="grid grid-cols-5 gap-1.5 w-44 h-44 mx-auto mb-4 bg-slate-900/50 p-2 rounded-xl border border-white/5">
                  {gameState.maze.map((rowArr: number[], yIdx: number) => 
                    rowArr.map((cellVal: number, xIdx: number) => {
                      const isPlayer = gameState.x === xIdx && gameState.y === yIdx;
                      return (
                        <div
                          key={`${yIdx}-${xIdx}`}
                          className={`w-full h-full rounded flex items-center justify-center text-xs font-black transition-all ${
                            isPlayer 
                              ? 'bg-brand-blue text-white ring-2 ring-white/10 scale-105' 
                              : cellVal === 1 
                              ? 'bg-red-500/10 border border-red-500/20 text-red-500/70' 
                              : cellVal === 3 
                              ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 animate-pulse text-sm' 
                              : 'bg-neutral-800/30 text-slate-600'
                          }`}
                        >
                          {isPlayer ? '🚴' : cellVal === 1 ? '█' : cellVal === 3 ? '★' : ''}
                        </div>
                      );
                    })
                  )}
                </div>
                {/* Controller Pad */}
                <div className="flex justify-center gap-1">
                  <button onClick={() => handleDay9Move(0, -1)} className="px-3 py-1.5 bg-neutral-950 text-slate-300 border border-white/5 rounded-lg text-xs font-bold hover:border-brand-blue font-mono">▲ Up</button>
                  <button onClick={() => handleDay9Move(0, 1)} className="px-3 py-1.5 bg-neutral-950 text-slate-300 border border-white/5 rounded-lg text-xs font-bold hover:border-brand-blue font-mono">▼ Down</button>
                  <button onClick={() => handleDay9Move(-1, 0)} className="px-3 py-1.5 bg-neutral-950 text-slate-300 border border-white/5 rounded-lg text-xs font-bold hover:border-brand-blue font-mono">◀ L</button>
                  <button onClick={() => handleDay9Move(1, 0)} className="px-3 py-1.5 bg-neutral-950 text-slate-300 border border-white/5 rounded-lg text-xs font-bold hover:border-brand-blue font-mono">R ▶</button>
                </div>
              </div>
            )}

            {/* ------------ GAME 10: Simon Glow Sequence ------------ */}
            {day === 10 && gameState.sequence !== undefined && (
              <div className="text-center max-w-xs mx-auto">
                <p className="text-xs text-slate-400 mb-4 font-mono">
                  Watch the dynamic sequence flashing sequence of panels, then repeat the clicks exactly.
                </p>
                <button
                  onClick={handleDay10Demo}
                  className="px-4 py-2 bg-neutral-900 hover:bg-neutral-850 text-slate-300 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-wider mb-4 transition"
                >
                  📺 DEMO SEQUENCE FLASHER
                </button>
                <div className="grid grid-cols-2 gap-2 w-40 h-40 mx-auto bg-slate-900/50 p-2 rounded-xl border border-white/5">
                  {[0, 1, 2, 3].map((panelIdx) => {
                    const colors = [
                      'bg-emerald-500 shadow-emerald-500/30 ring-4 ring-emerald-400/25',
                      'bg-brand-blue shadow-brand-blue/30 ring-4 ring-brand-blue/25',
                      'bg-yellow-500 shadow-yellow-500/30 ring-4 ring-yellow-400/25',
                      'bg-red-500 shadow-red-500/30 ring-4 ring-red-400/25'
                    ];
                    const darkColors = [
                      'bg-emerald-950/40 border border-emerald-500/10 text-emerald-700 hover:bg-emerald-900/30',
                      'bg-blue-950/40 border border-brand-blue/10 text-brand-blue/70 hover:bg-blue-900/30',
                      'bg-yellow-950/40 border border-yellow-500/10 text-yellow-700 hover:bg-yellow-900/30',
                      'bg-red-950/40 border border-red-500/10 text-red-700 hover:bg-red-900/30'
                    ];
                    const isFlashed = gameState.flashedItem === panelIdx;

                    return (
                      <button
                        key={panelIdx}
                        onClick={() => handleDay10Click(panelIdx)}
                        className={`w-full h-full rounded-xl transition-all ${
                          isFlashed ? colors[panelIdx] : darkColors[panelIdx]
                        }`}
                      >
                        {panelIdx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ------------ GAME 11: Magic Square math solver ------------ */}
            {day === 11 && gameState.xVal !== undefined && (
              <div className="text-center max-w-md mx-auto">
                <p className="text-xs text-slate-400 mb-4 font-mono leading-relaxed">
                  Solve the Magic Square matrix! Rows, columns, and diagonals should sum to 15 correctly.
                </p>
                <div className="grid grid-cols-3 gap-2 w-48 mx-auto mb-6 bg-slate-900/50 p-3 rounded-xl border border-white/5 text-center font-mono">
                  <div className="p-2 bg-neutral-900 text-white rounded">2</div>
                  <div className="p-2 bg-neutral-900 text-white rounded">7</div>
                  <div className="p-2 bg-neutral-900 text-white rounded">6</div>
                  <div className="p-2 bg-neutral-900 text-white rounded animate-pulse">9</div>
                  <div className="p-2 bg-neutral-900 text-white rounded">5</div>
                  <div className="p-2 border border-brand-blue text-brand-blue bg-brand-blue/5 rounded text-xs font-black uppercase">
                    X
                  </div>
                  <div className="p-2 bg-neutral-900 text-white rounded">4</div>
                  <div className="p-2 border border-brand-blue text-brand-blue bg-brand-blue/5 rounded text-xs font-black uppercase">
                    Y
                  </div>
                  <div className="p-2 bg-neutral-900 text-white rounded">8</div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <input
                    type="number"
                    value={gameState.xVal}
                    onChange={(e) => setGameState({ ...gameState, xVal: e.target.value })}
                    placeholder="Value of X"
                    className="bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white text-center font-mono outline-none focus:border-brand-blue"
                  />
                  <input
                    type="number"
                    value={gameState.yVal}
                    onChange={(e) => setGameState({ ...gameState, yVal: e.target.value })}
                    placeholder="Value of Y"
                    className="bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white text-center font-mono outline-none focus:border-brand-blue"
                  />
                </div>
                <button
                  onClick={handleDay11Submit}
                  className="w-full py-2.5 bg-brand-blue text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-blue-600 transition"
                >
                  ALIGN MATRIX
                </button>
              </div>
            )}

            {/* ------------ GAME 12: Chess Knight Leap ---------- */}
            {day === 12 && gameState.moves !== undefined && (
              <div className="text-center max-w-xs mx-auto">
                <p className="text-xs text-slate-400 mb-4 font-mono leading-tight">
                  Leap Knight (♞) from (0,0) to Chess finish star at (4,4) in exactly 4 steps. Valid chess jumps represent L-shapes!
                </p>
                <div className="grid grid-cols-5 gap-1 w-44 h-44 mx-auto mb-4 bg-slate-900/50 p-2 rounded-xl border border-white/5 text-[9px]">
                  {Array.from({ length: 5 }).map((_, rIdx) => 
                    Array.from({ length: 5 }).map((_, cIdx) => {
                      const isKnight = gameState.x === cIdx && gameState.y === rIdx;
                      const isTarget = rIdx === 4 && cIdx === 4;
                      const isDark = (rIdx + cIdx) % 2 === 1;

                      // Check if valid knight move from current position
                      const dx = Math.abs(cIdx - gameState.x);
                      const dy = Math.abs(rIdx - gameState.y);
                      const canHop = (dx === 1 && dy === 2) || (dx === 2 && dy === 1);

                      return (
                        <button
                          key={`${rIdx}-${cIdx}`}
                          disabled={!canHop}
                          onClick={() => handleDay12Hop(cIdx, rIdx)}
                          className={`w-full h-full rounded transition-all flex items-center justify-center font-bold ${
                            isKnight 
                              ? 'bg-brand-blue text-white text-xs scale-105' 
                              : canHop 
                              ? 'bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 scale-[0.97]' 
                              : isTarget 
                              ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' 
                              : isDark 
                              ? 'bg-neutral-850 text-slate-600' 
                              : 'bg-neutral-800 text-slate-700'
                          }`}
                        >
                          {isKnight ? '♞' : isTarget ? '★' : `${rIdx},${cIdx}`}
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  Knight Moves Hopped: {gameState.moves}/4 Bound limit
                </div>
              </div>
            )}

            {/* ------------ GAME 13: Stroop speed reaction ------------ */}
            {day === 13 && gameState.items !== undefined && (
              <div className="text-center max-w-sm mx-auto p-4">
                <p className="text-xs text-slate-400 mb-6 font-mono leading-relaxed">
                  Stroop reaction test: Does the text spell identical to the rendered text display color below?
                </p>
                {gameState.items && gameState.items[gameState.index] && (
                  <div className="mb-6">
                    <div 
                      style={{ color: gameState.items[gameState.index].color }}
                      className="text-4xl font-black uppercase text-center tracking-widest bg-slate-950 p-6 border border-white/5 rounded-2xl shadow-xl transition-all"
                    >
                      {gameState.items[gameState.index].text}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <button
                    onClick={() => handleDay13Submit(true)}
                    className="py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95"
                  >
                    🟢 YES (MATCH)
                  </button>
                  <button
                    onClick={() => handleDay13Submit(false)}
                    className="py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95"
                  >
                    🔴 NO (CLASH)
                  </button>
                </div>
                <div className="text-[9px] text-slate-500 font-mono uppercase tracking-widest mt-2 block">
                  Streak Progress: {gameState.score}/3 correct answers
                </div>
              </div>
            )}

            {/* ------------ GAME 14: Mastermind Combination Guessing ----------- */}
            {day === 14 && gameState.secretCode !== undefined && (
              <div className="text-center max-w-md mx-auto">
                <p className="text-xs text-slate-400 mb-4 font-mono leading-relaxed">
                  Crack the 3-position lockdown key combination. Digits contain 1 to 5. Check logs below for exact matches and misplaced helper clues!
                </p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={gameState.g1}
                    onChange={(e) => setGameState({ ...gameState, g1: e.target.value })}
                    placeholder="Slot 1"
                    className="bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-center font-mono outline-none text-xs text-white focus:border-brand-blue"
                  />
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={gameState.g2}
                    onChange={(e) => setGameState({ ...gameState, g2: e.target.value })}
                    placeholder="Slot 2"
                    className="bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-center font-mono outline-none text-xs text-white focus:border-brand-blue"
                  />
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={gameState.g3}
                    onChange={(e) => setGameState({ ...gameState, g3: e.target.value })}
                    placeholder="Slot 3"
                    className="bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-center font-mono outline-none text-xs text-white focus:border-brand-blue"
                  />
                </div>
                <button
                  onClick={handleDay14Guess}
                  className="w-full py-2.5 bg-brand-blue text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-blue-600 transition mb-4"
                >
                  🔓 TRIAL OVERRIDE
                </button>
                {gameState.guesses.length > 0 && (
                  <div className="max-h-24 overflow-y-auto text-left bg-black/40 border border-white/5 p-2 rounded-lg font-mono text-[9px] text-slate-400">
                    <span className="text-[8px] text-slate-500 font-extrabold block border-b border-white/5 pb-1 mb-1 uppercase text-center">Historical Guess Console Logs</span>
                    {gameState.guesses.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between py-0.5 border-b border-white/5 last:border-none">
                        <span>Attempt {i+1}: {item.guess}</span>
                        <span className="text-brand-blue font-extrabold">{item.bulls} Exact, {item.cows} Misplaced</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual testing claim override */}
      <div className="border-t border-white/5 pt-4 mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <span className="text-[10px] text-slate-500 font-extrabold uppercase font-mono">
          Embedded Fallback Sandbox Terminal
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={initGame}
            className="px-3.5 py-1.5 bg-neutral-900/60 hover:bg-neutral-900 text-slate-400 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> Reset Day View
          </button>
          <button
            onClick={triggerProgressSolve}
            className="px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-400 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            Claim Interactive Secret Victory Key →
          </button>
        </div>
      </div>
    </div>
  );
}

// Private modular info icon inside component
function InfoCircle(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={props.className} style={{ width: '1em', height: '1em' }}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function InfoCircleIcon(props: any) {
  return <InfoCircle className="w-4 h-4" />;
}
