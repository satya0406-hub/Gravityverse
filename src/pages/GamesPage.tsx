import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Gamepad2, Play, Sparkles, Image as ImageIcon, Lock, CheckCircle2, 
  Clock, Heart, RotateCcw, Award, ChevronLeft, ChevronRight, HelpCircle, AlertTriangle, Laptop, Eye, HelpCircle as HelpIcon, Plus, EyeOff, Save, Trash2, LogIn, Home 
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Challenge, DayProgress, ChallengeProgress } from './challengeTypes';
import { useAuth } from '../lib/AuthContext';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { MiniGamePlayer } from '../components/MiniGamePlayer';
import { handleFirestoreError } from '../lib/errorHandler';
import { trackChallenge, trackGames } from '../lib/analytics';

function generateSecretCode(): string {
  const digits1 = Math.floor(10 + Math.random() * 90).toString(); // 2 digits (e.g., 21)
  const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join(''); // 3 letters (e.g., MAD)
  const digits2 = Math.floor(100 + Math.random() * 900).toString(); // 3 digits (e.g., 201)
  const lastLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // 1 letter (e.g., T)
  return `${digits1}${letters}${digits2}${lastLetter}`;
}

// Authorized / Licensed Arcade Games Registry (structured for future game additions)
export interface AuthorizedGame {
  id: string;
  title: string;
  description: string;
  src: string;
  image?: string;
  category: string;
  badge?: string;
}

export function GamesPage() {
  // Tabs: 'arcade' or 'challenge'
  const [activeTab, setActiveTab] = useState<'arcade' | 'challenge'>('challenge');

  // Track which game is currently loaded in full page/fullscreen mode for Arcade
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  // Future authorized and licensed titles can be added here without restructuring the page
  const authorizedGames: AuthorizedGame[] = [];

  // 2. Initial Daily Challenges defaults (Placeholders to be configured by the admin)
  const defaultChallenges: Challenge[] = Array.from({ length: 14 }, (_, i) => ({
    day: i + 1,
    title: `Challenge Day ${i + 1}`,
    codename: `day_${i + 1}`,
    description: `Access this day's challenge puzzle on the live app portal, find the correct 9-character secret code (e.g. 21MAD201T), and verify it here to log your solve and unlock the next sequence day!`,
    src: '',
    image: '',
    category: 'Logic',
    difficulty: 'Medium',
  }));

  // PERSISTENCE STATE: Progress & custom play URLs
  const { user } = useAuth();
  const isAdminUser = user?.email === 'satyamanikantareddysathi@gmail.com';

  const [challenges, setChallenges] = useState<Challenge[]>(defaultChallenges);
  const [challengesLoading, setChallengesLoading] = useState<boolean>(true);

  // Load challenges from Firestore (real-time!)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'challenges'), (snapshot) => {
      const list: Challenge[] = [];
      snapshot.forEach(docSnap => {
        list.push({ ...docSnap.data() } as Challenge);
      });
      
      // Merge default challenges with incoming Firestore challenges to build a continuous Day 1-15+ sequence
      const mergedMap = new Map<number, Challenge>();
      defaultChallenges.forEach(c => {
        mergedMap.set(c.day, c);
      });
      list.forEach(c => {
        mergedMap.set(c.day, c);
      });
      const sortedMergedList = Array.from(mergedMap.values()).sort((a, b) => a.day - b.day);
      
      setChallenges(sortedMergedList);
      setChallengesLoading(false);
    }, (err) => {
      setChallenges(defaultChallenges);
      setChallengesLoading(false);
      const errMsg = err instanceof Error ? err.message : String(err || '');
      if (err?.code === 'unavailable' || errMsg.includes('offline') || errMsg.includes('network-request-failed')) {
        console.warn("Challenges real-time listener operating offline / reconnecting:", errMsg);
      } else {
        try {
          handleFirestoreError(err, 'list', 'challenges');
        } catch (e) {
          console.warn("Handled challenges firestore error:", e);
        }
      }
    });

    return () => unsub();
  }, [user]);

  // Seeding support function
  const handleSeedChallenges = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'challenges'));
      if (!querySnapshot.empty) {
        showNotice("Challenges are already initialized in the database!", "info");
        return;
      }
      for (const item of defaultChallenges) {
        await setDoc(doc(db, 'challenges', `day-${item.day}`), {
          day: item.day,
          title: item.title,
          codename: item.codename,
          description: item.description,
          src: item.src || '',
          image: item.image || '',
          category: item.category,
          difficulty: item.difficulty,
          solutionKey: generateSecretCode()
        });
      }
      showNotice("Successfully seeded initial daily challenges to Firestore!", "success");
    } catch (err: any) {
      console.error(err);
      showNotice("Error seeding challenges: " + err.message, "error");
      handleFirestoreError(err, 'write', 'challenges');
    }
  };

  // Clear support function to remove custom / seeded challenges in Firestore
  const handleClearFirestoreChallenges = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'challenges'));
      if (querySnapshot.empty) {
        showNotice("No challenges found in Firestore to clear.", "info");
        return;
      }
      
      const promises: Promise<void>[] = [];
      querySnapshot.forEach((docSnap) => {
        promises.push(deleteDoc(doc(db, 'challenges', docSnap.id)));
      });
      await Promise.all(promises);
      
      showNotice("Successfully cleared all custom challenge alignments from Firestore!", "success");
    } catch (err: any) {
      console.error(err);
      showNotice("Error clearing challenges: " + err.message, "error");
      handleFirestoreError(err, 'write', 'challenges');
    }
  };

  const [progress, setProgress] = useState<ChallengeProgress>(() => {
    const saved = localStorage.getItem('gravityverse_14day_progress') || localStorage.getItem('prince_14day_progress');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing progress data', e);
      }
    }
    
    // Default initial progress structure
    const init: ChallengeProgress = {};
    for (let d = 1; d <= 14; d++) {
      init[d] = {
        status: d === 1 ? 'unlocked' : 'locked',
        attemptsLeft: 3,
      };
    }
    return init;
  });

  // Dynamically initialize / ensure progress entries for any extra days loaded from DB:
  useEffect(() => {
    if (challenges.length === 0) return;
    let changed = false;
    const updated = { ...progress };
    challenges.forEach((c) => {
      if (!updated[c.day]) {
        updated[c.day] = {
          status: 'locked', // start as locked by default for sequential exploration
          attemptsLeft: 3,
        };
        changed = true;
      }
    });
    if (changed) {
      setProgress(updated);
    }
  }, [challenges, progress]);

  // Ticking time for 24h countdown
  const [nowTime, setNowTime] = useState<number>(Date.now());
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const bentoScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Smoothly core-scroll active day card into center view
    if (bentoScrollRef.current) {
      const children = bentoScrollRef.current.children;
      const targetCard = Array.from(children).find(child => {
        return child.getAttribute('data-day') === String(selectedDay);
      });
      if (targetCard) {
        targetCard.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }
  }, [selectedDay]);

  const scrollBento = (direction: 'left' | 'right') => {
    if (bentoScrollRef.current) {
      const scrollAmount = 300;
      bentoScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleScrollAndSelectDay = (direction: 'prev' | 'next') => {
    const sortedDays = challenges.map(c => c.day).sort((a, b) => a - b);
    if (sortedDays.length === 0) return;
    
    const currentIndex = sortedDays.indexOf(selectedDay);
    let targetDay = selectedDay;
    
    if (direction === 'prev') {
      if (currentIndex > 0) {
        targetDay = sortedDays[currentIndex - 1];
      }
    } else {
      if (currentIndex < sortedDays.length - 1) {
        targetDay = sortedDays[currentIndex + 1];
      }
    }

    if (targetDay !== selectedDay) {
      setSelectedDay(targetDay);
    } else {
      scrollBento(direction === 'prev' ? 'left' : 'right');
    }
  };
  const [showDevPanel, setShowDevPanel] = useState<boolean>(false);
  const [editingUrlDay, setEditingUrlDay] = useState<number | null>(null);
  const [tempUrlValue, setTempUrlValue] = useState<string>('');
  const [tempImageValue, setTempImageValue] = useState<string>('');
  const [tempTitleValue, setTempTitleValue] = useState<string>('');
  const [tempDescValue, setTempDescValue] = useState<string>('');
  const [tempCategoryValue, setTempCategoryValue] = useState<string>('');
  const [tempDifficultyValue, setTempDifficultyValue] = useState<'Easy' | 'Medium' | 'Hard' | 'Expert'>('Medium');
  const [tempCodenameValue, setTempCodenameValue] = useState<string>('');
  const [tempSolutionKeyValue, setTempSolutionKeyValue] = useState<string>('');
  const [tempRulesValue, setTempRulesValue] = useState<string>('');

  // User verification states for custom URL/iframe play sessions
  const [verificationPasscode, setVerificationPasscode] = useState<string>('');
  const [showRiddleModal, setShowRiddleModal] = useState<boolean>(false);
  const [currentRiddle, setCurrentRiddle] = useState<{ question: string; answers: string[]; placeholder: string } | null>(null);
  const [riddleAnswerInput, setRiddleAnswerInput] = useState<string>('');
  const [riddleTargetDay, setRiddleTargetDay] = useState<number | null>(null);

  const LOGIC_RIDDLES = [
    {
      question: "A doctor gives you 3 pills and tells you to take one every half hour. How many minutes do the pills last in total? (Enter a number)",
      answers: ["60", "sixty"],
      placeholder: "e.g. 60"
    },
    {
      question: "A farmer has 17 sheep, and all but 9 die. How many sheep are remaining? (Enter a number)",
      answers: ["9", "nine"],
      placeholder: "e.g. 9"
    },
    {
      question: "Some months have 30 days, others have 31 days. How many months have 28 days? (Enter a number)",
      answers: ["12", "twelve", "all", "all 12", "all twelve"],
      placeholder: "e.g. 12"
    },
    {
      question: "If 5 cats can catch 5 mice in 5 minutes, how many minutes does it take 100 cats to catch 100 mice? (Enter a number)",
      answers: ["5", "five"],
      placeholder: "e.g. 5"
    },
    {
      question: "You stand in a dark cabin with only one match. You have a candle, a fireplace wood stove, and a kerosene lamp. What must you light first?",
      answers: ["match", "the match", "a match"],
      placeholder: "e.g. match"
    },
    {
      question: "If you have a 3-gallon jug and a 5-gallon jug, and an infinite supply of water, what is the minimum number of steps to measure exactly 4 gallons? (Enter a number)",
      answers: ["6", "six"],
      placeholder: "e.g. 6"
    }
  ];

  const handleLaunchRiddleVerification = (dayIndex: number) => {
    const randomIndex = Math.floor(Math.random() * LOGIC_RIDDLES.length);
    setCurrentRiddle(LOGIC_RIDDLES[randomIndex]);
    setRiddleAnswerInput('');
    setRiddleTargetDay(dayIndex);
    setShowRiddleModal(true);
  };

  const handleVerifyRiddleAnswer = () => {
    if (!currentRiddle || riddleTargetDay === null) return;
    const cleanGuess = riddleAnswerInput.trim().toLowerCase();
    const isCorrect = currentRiddle.answers.some(ans => cleanGuess === ans.toLowerCase() || (cleanGuess.includes(ans.toLowerCase()) && ans.length > 2));
    
    if (isCorrect) {
      showNotice("Verification successful! Logic level approved.", "success");
      handleDayChallengeSuccess(riddleTargetDay);
      setShowRiddleModal(false);
      setCurrentRiddle(null);
      setRiddleTargetDay(null);
    } else {
      showNotice("Incorrect logical response. Please reflect and try again!", "error");
    }
  };

  const handleVerifyPasscodeAttempt = (dayIndex: number, expectedKey: string) => {
    if (!expectedKey) return;
    const cleanGuess = verificationPasscode.trim().toLowerCase();
    if (cleanGuess === expectedKey.toLowerCase()) {
      showNotice("Integrity code verified successfully! Day unlocked.", "success");
      handleDayChallengeSuccess(dayIndex);
      setVerificationPasscode('');
    } else {
      showNotice("Invalid completion passcode. Please double check the game result or try again.", "error");
    }
  };

  // Immersive Sandbox Mode (playing custom or fallback game)
  const [sandboxItem, setSandboxItem] = useState<{ day: number; type: 'iframe' | 'local' } | null>(null);
  const [playMode, setPlayMode] = useState<'local' | 'iframe'>('local');

  const handleOpenSandbox = (day: number, type: 'local' | 'iframe') => {
    try {
      const chal = challenges.find(c => c.day === day) || defaultChallenges.find(c => c.day === day);
      if (chal) {
        trackChallenge.start(chal.day.toString(), chal.title, chal.category || 'Logic Puzzle');
      }
    } catch (e) {
      console.warn('Analytics trackChallenge.start failed:', e);
    }
    setSandboxItem({ day, type });
  };

  useEffect(() => {
    const matched = challenges.find(c => c.day === selectedDay) || defaultChallenges.find(c => c.day === selectedDay);
    if (matched && matched.src) {
      setPlayMode('iframe');
    } else {
      setPlayMode('local');
    }
  }, [selectedDay, challenges]);

  // Custom non-blocking notifications & confirmation states
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmDeleteDay, setConfirmDeleteDay] = useState<number | null>(null);

  const showNotice = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((prev) => prev?.message === message ? null : prev);
    }, 4500);
  };

  // Sync state to local storage
  useEffect(() => {
    if (Object.keys(progress).length > 0) {
      localStorage.setItem('gravityverse_14day_progress', JSON.stringify(progress));
    }
  }, [progress]);

  // Clock Ticker to auto update countdowns
  useEffect(() => {
    const clock = setInterval(() => {
      setNowTime(Date.now());
    }, 1000);
    return () => clearInterval(clock);
  }, []);


  // DERIVE AVAILABILITY based on 24-hour limit
  // For each Day D (d from 2 to maxDay):
  // Let's run a check if it should unlock right now.
  useEffect(() => {
    const updated = { ...progress };
    let changed = false;
    const maxDay = challenges.length > 0 ? Math.max(...challenges.map(c => c.day)) : 14;

    for (let d = 2; d <= maxDay; d++) {
      const current = updated[d] || { status: 'locked', attemptsLeft: 3 };
      const prev = updated[d - 1];

      if (prev && prev.status === 'completed' && current.status === 'locked') {
        const completedAtPost = prev.completedAt || 0;
        const cooldown = 24 * 60 * 60 * 1000; // 24 hours
        if (Date.now() - completedAtPost >= cooldown) {
          updated[d] = {
            ...current,
            status: 'unlocked',
            attemptsLeft: 3,
          };
          changed = true;
          console.log(`[Timer Engine] Automatically unlocked Day ${d} as 24h passed!`);
        }
      }
    }

    if (changed) {
      setProgress(updated);
    }
  }, [nowTime, progress, challenges]);

  // Handle Play button for normal authorized arcade games
  const handleArcadePlay = (id: string) => {
    const g = authorizedGames.find(game => game.id === id);
    if (!g || !g.src) return;
    setActiveGameId(id);
    try {
      trackGames.opened(g.id, g.title);
      trackGames.start(g.id, g.title);
    } catch (e) {
      console.warn('Analytics trackGames failed:', e);
    }
  };

  const activeArcadeGame = authorizedGames.find(g => g.id === activeGameId && !!g.src);

  // Success handler for daily puzzle solvers
  const handleDayChallengeSuccess = (dayIndex: number) => {
    const updated = { ...progress };
    
    // Complete active day
    updated[dayIndex] = {
      ...updated[dayIndex],
      status: 'completed',
      completedAt: Date.now(),
    };

    // Lock upcoming days and launch countdown
    const maxDay = challenges.length > 0 ? Math.max(...challenges.map(c => c.day)) : 14;
    for (let d = dayIndex + 1; d <= maxDay; d++) {
      if (!updated[d] || updated[d].status !== 'completed') {
        updated[d] = {
          status: 'locked',
          attemptsLeft: 3,
        };
      }
    }

    try {
      const chal = challenges.find(c => c.day === dayIndex) || defaultChallenges.find(c => c.day === dayIndex);
      if (chal) {
        const completedCount = Object.values(updated).filter(p => p.status === 'completed').length;
        trackChallenge.complete(
          chal.day.toString(),
          chal.title,
          chal.category || 'Logic Puzzle',
          completedCount,
          10,
          50
        );
        trackChallenge.streakUpdate(completedCount);
      }
    } catch (e) {
      console.warn('Analytics trackChallenge.complete failed:', e);
    }

    setProgress(updated);
    setSandboxItem(null); // Return
  };

  // Failure handler (heart dock)
  const handleDayChallengeFailure = (dayIndex: number) => {
    const updated = { ...progress };
    const current = updated[dayIndex];
    if (current.attemptsLeft > 0) {
      updated[dayIndex] = {
        ...current,
        attemptsLeft: current.attemptsLeft - 1,
      };
      
      try {
        const chal = challenges.find(c => c.day === dayIndex) || defaultChallenges.find(c => c.day === dayIndex);
        if (chal) {
          trackChallenge.failed(chal.day.toString(), chal.title, chal.category || 'Logic Puzzle');
        }
      } catch (e) {
        console.warn('Analytics trackChallenge.failed failed:', e);
      }

      setProgress(updated);
    }
  };

  // DEV OVERRIDES FOR TESTING
  const devCompleteDay = (dayIndex: number) => {
    handleDayChallengeSuccess(dayIndex);
  };

  const devSkip24H = (dayIndex: number) => {
    const updated = { ...progress };
    const prevDayIndex = dayIndex - 1;
    if (updated[prevDayIndex]) {
      updated[prevDayIndex] = {
        ...updated[prevDayIndex],
        status: 'completed',
        // Set completedAt to exactly 24.1 hours ago to instantly fulfill criteria
        completedAt: Date.now() - (24.1 * 60 * 60 * 1000),
      };
      // Next day unlocks immediately via interval tracker
      updated[dayIndex] = {
        ...updated[dayIndex],
        status: 'unlocked',
        attemptsLeft: 3,
      };
      setProgress(updated);
    }
  };

  const devUnlockAll = () => {
    const updated = { ...progress };
    const maxDay = challenges.length > 0 ? Math.max(...challenges.map(c => c.day)) : 14;
    for (let d = 1; d <= maxDay; d++) {
      updated[d] = {
        status: 'unlocked',
        attemptsLeft: 3,
      };
    }
    setProgress(updated);
  };

  const devResetAll = () => {
    const init: ChallengeProgress = {};
    const maxDay = challenges.length > 0 ? Math.max(...challenges.map(c => c.day)) : 14;
    for (let d = 1; d <= maxDay; d++) {
      init[d] = {
        status: d === 1 ? 'unlocked' : 'locked',
        attemptsLeft: 3,
      };
    }
    setProgress(init);
    setSelectedDay(1);
    setSandboxItem(null);
  };

  const startCustomUrlEditing = (dayIndex: number) => {
    const chap = challenges.find(c => c.day === dayIndex) || defaultChallenges.find(c => c.day === dayIndex);
    if (!chap) return;
    setEditingUrlDay(dayIndex);
    setTempUrlValue(chap.src || '');
    setTempImageValue(chap.image || '');
    setTempTitleValue(chap.title || '');
    setTempDescValue(chap.description || '');
    setTempCategoryValue(chap.category || '');
    setTempDifficultyValue(chap.difficulty || 'Medium');
    setTempCodenameValue(chap.codename || 'custom');
    setTempSolutionKeyValue(chap.solutionKey || '');
    setTempRulesValue(chap.rules || '');
  };

  const saveCustomUrl = async (dayIndex: number) => {
    try {
      const docId = `day-${dayIndex}`;
      await setDoc(doc(db, 'challenges', docId), {
        day: dayIndex,
        title: tempTitleValue || 'Untitled Challenge',
        codename: tempCodenameValue || 'custom',
        description: tempDescValue || '',
        src: tempUrlValue || '',
        image: tempImageValue || '',
        category: tempCategoryValue || 'Custom',
        difficulty: tempDifficultyValue || 'Medium',
        solutionKey: tempSolutionKeyValue || '',
        rules: tempRulesValue || ''
      });
      setEditingUrlDay(null);
    } catch (err: any) {
      console.error(err);
      alert("Error saving challenge details: " + err.message);
      handleFirestoreError(err, 'write', `challenges/day-${dayIndex}`);
    }
  };

  const handleAddNewDayChallenge = async () => {
    try {
      const nextDayNum = challenges.length > 0 ? Math.max(...challenges.map(c => c.day)) + 1 : 15;
      const docId = `day-${nextDayNum}`;
      const generatedCode = generateSecretCode();
      await setDoc(doc(db, 'challenges', docId), {
        day: nextDayNum,
        title: `Dynamic Challenge Day ${nextDayNum}`,
        codename: `custom_day_${nextDayNum}`,
        description: 'Configure and describe this awesome custom task here!',
        src: '',
        image: 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&w=800&q=80',
        category: 'Logic',
        difficulty: 'Medium',
        solutionKey: generatedCode
      });
      setSelectedDay(nextDayNum);
      showNotice(`Added Day ${nextDayNum} Challenge successfully with Secret Code: ${generatedCode}!`, 'success');
    } catch (err: any) {
      console.error(err);
      showNotice("Error adding new challenge day: " + err.message, 'error');
      handleFirestoreError(err, 'write', 'challenges');
    }
  };

  const handleRegenerateSecretCode = async (dayIndex: number) => {
    try {
      const chal = challenges.find(c => c.day === dayIndex) || defaultChallenges.find(c => c.day === dayIndex);
      if (!chal) return;
      const newCode = generateSecretCode();
      const docId = `day-${dayIndex}`;
      await setDoc(doc(db, 'challenges', docId), {
        ...chal,
        solutionKey: newCode
      });
      showNotice(`Successfully regenerated Secret Code for Day ${dayIndex} to: ${newCode}!`, 'success');
    } catch (err: any) {
      console.error(err);
      showNotice("Error regenerating secret code: " + err.message, 'error');
      handleFirestoreError(err, 'write', `challenges/day-${dayIndex}`);
    }
  };

  const handleDeleteDayChallenge = async (dayIndex: number) => {
    try {
      // 1. Delete standard doc ID day-X
      const docId = `day-${dayIndex}`;
      await deleteDoc(doc(db, 'challenges', docId));
      
      // 2. Query any other docs that might have "day === dayIndex" (in case they have a different doc ID)
      const q = collection(db, 'challenges');
      const querySnapshot = await getDocs(q);
      const promises: Promise<void>[] = [];
      querySnapshot.forEach((docSnap) => {
        if (docSnap.data().day === dayIndex) {
          promises.push(deleteDoc(doc(db, 'challenges', docSnap.id)));
        }
      });
      await Promise.all(promises);
      
      const remaining = challenges.filter(c => c.day !== dayIndex);
      setChallenges(remaining); // instant state sync
      
      if (remaining.some(c => c.day === dayIndex - 1)) {
        setSelectedDay(dayIndex - 1);
      } else if (remaining.length > 0) {
        setSelectedDay(remaining[0].day);
      } else {
        setSelectedDay(1);
      }
      showNotice(`Successfully deleted Day ${dayIndex} Challenge!`, 'success');
    } catch (err: any) {
      console.error(err);
      showNotice("Error deleting challenge day: " + err.message, 'error');
      handleFirestoreError(err, 'delete', `challenges/day-${dayIndex}`);
    }
  };

  const activeChallenge = challenges.find(c => c.day === selectedDay) || defaultChallenges.find(c => c.day === selectedDay) || challenges[0] || defaultChallenges[0];
  const activeDayProgress = progress[selectedDay] || { status: 'locked', attemptsLeft: 3 };

  // Calculate overall Completed Days percentage
  const completedCount = Object.values(progress).filter(p => p.status === 'completed').length;
  const totalDaysCount = challenges.length > 0 ? challenges.length : 14;
  const completionPercentage = Math.round((completedCount / totalDaysCount) * 100);

  // Calculate week-specific Completed Days out of 7
  const selectedWeekNum = Math.ceil(selectedDay / 7);
  const weekStartDay = (selectedWeekNum - 1) * 7 + 1;
  const weekEndDay = selectedWeekNum * 7;
  const weekCompletedCount = Object.keys(progress).filter(dayNumStr => {
    const dNum = parseInt(dayNumStr);
    return dNum >= weekStartDay && dNum <= weekEndDay && progress[dNum]?.status === 'completed';
  }).length;
  const weekCompletionPercentage = Math.round((weekCompletedCount / 7) * 100);

  // Format countdown string for a locked day target
  const getCooldownString = (dayIndex: number): string => {
    const prevDay = progress[dayIndex - 1];
    if (!prevDay || prevDay.status !== 'completed' || !prevDay.completedAt) return '24:00:00';
    
    const unlockTime = prevDay.completedAt + (24 * 60 * 60 * 1000);
    const diff = unlockTime - nowTime;
    
    if (diff <= 0) return '00:00:00';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = (num: number) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  // Auth guard: Require user to be signed in to play games & track progress
  if (!user) {
    return (
      <div className="min-h-screen pt-32 pb-24 px-4 sm:px-10 bg-[#070a13] flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-blue/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="max-w-md w-full bg-[#0b101f] border border-white/10 p-8 rounded-2xl shadow-2xl text-center space-y-6 relative z-10">
          <div className="w-16 h-16 bg-brand-blue/10 border border-brand-blue/30 rounded-2xl flex items-center justify-center text-brand-blue mx-auto shadow-xl shadow-brand-blue/20">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-serif font-bold text-white uppercase tracking-wider">
              Authentication Required
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Please sign in to access interactive arcade games, track your daily challenges progress, and save your progress securely.
            </p>
          </div>
          <div className="space-y-3 pt-2">
            <Link
              to="/auth"
              state={{ from: '/games' }}
              className="w-full py-3.5 bg-brand-blue hover:bg-blue-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-brand-blue/20 flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In or Register</span>
            </Link>
            <Link
              to="/"
              className="w-full py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4 text-brand-blue" />
              <span>Return to Home</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Fullscreen Iframe handler
  if (activeArcadeGame && activeArcadeGame.src) {
    return (
      <div className="fixed inset-0 w-screen h-screen z-50 bg-[#03060d] flex flex-col overflow-hidden select-none animate-fade-in">
        <div className="absolute top-5 left-5 z-50">
          <button
            onClick={() => setActiveGameId(null)}
            className="flex items-center gap-2.5 px-6 py-3.5 bg-brand-blue hover:bg-blue-600 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-2xl border border-white/10 transition-all cursor-pointer"
          >
            ← Return to Games
          </button>
        </div>
        <div className="w-full h-full flex-1 bg-black">
          <iframe 
            src={activeArcadeGame.src}
            className="w-full h-full border-none outline-none"
            allow="autoplay; fullscreen; keyboard; gamepad"
            title={activeArcadeGame.title}
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    );
  }

  // Fullscreen sandbox handler for weekly challenges (Supports Built-in local and Custom iframe puzzles)
  if (sandboxItem) {
    const isIframe = sandboxItem.type === 'iframe';
    const matchedChallenge = challenges.find(c => c.day === sandboxItem.day) || defaultChallenges.find(c => c.day === sandboxItem.day);
    const challengeUrl = matchedChallenge?.src || '';
    const activeDayProgress = progress[sandboxItem.day] || { status: 'locked', attemptsLeft: 3 };

    return (
      <div className="fixed inset-0 w-screen h-screen z-50 bg-[#03060d] flex flex-col overflow-hidden select-none animate-fade-in text-white">
        <div className="absolute top-4 left-4 z-50 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 max-w-[calc(100%-32px)] flex-wrap">
          <button
            onClick={() => setSandboxItem(null)}
            className="flex items-center gap-2.5 px-5 py-3 bg-neutral-900/90 hover:bg-neutral-850 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-2xl border border-white/10 transition-all cursor-pointer shrink-0"
          >
            ← Close Sandbox Game
          </button>

          {/* Fallback solving verification ONLY inside iframe sandbox for external CORS cross-origin games */}
          {isIframe && (
            matchedChallenge?.solutionKey ? (
              <div className="flex items-center gap-1.5 p-1 bg-neutral-900/90 border border-white/10 rounded-xl">
                <input
                  type="text"
                  value={verificationPasscode}
                  onChange={(e) => setVerificationPasscode(e.target.value)}
                  placeholder="Enter Passcode..."
                  className="bg-black/80 border border-white/5 px-2.5 py-1.5 text-[10px] rounded text-white font-mono outline-none w-28 focus:border-brand-blue"
                />
                <button
                  onClick={() => handleVerifyPasscodeAttempt(sandboxItem.day, matchedChallenge.solutionKey || '')}
                  className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[9px] uppercase tracking-wider rounded transition cursor-pointer"
                >
                  Verify Key
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleLaunchRiddleVerification(sandboxItem.day)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-wider rounded-xl transition cursor-pointer"
              >
                🧠 Prove Logic to Solve
              </button>
            )
          )}
          
          {isAdminUser && (
            <button
              onClick={() => handleDayChallengeSuccess(sandboxItem.day)}
              className="flex items-center gap-2.5 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-2xl border border-white/10 transition-all cursor-pointer animate-pulse"
            >
              ✓ Solve & Claim Day Success Key (Admin Bypass)
            </button>
          )}
        </div>
        
        <div className="w-full h-full flex-1 bg-[#03060d] overflow-y-auto">
          {isIframe ? (
            challengeUrl ? (
              <iframe 
                src={challengeUrl}
                className="w-full h-full border-none outline-none"
                allow="autoplay; fullscreen; keyboard; gamepad"
                title={`Challenge Day ${sandboxItem.day}`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 bg-slate-950">
                <AlertTriangle className="w-16 h-16 text-yellow-500 mb-4" />
                <h3 className="text-xl font-bold text-white uppercase tracking-wider mb-2">Challenge Link Not Configured</h3>
                <p className="text-slate-400 text-xs max-w-sm mb-6">
                  An administrator has not loaded a live puzzle link for Day {sandboxItem.day} yet. If you are the admin, use the "Configure" button under Custom Play Configurations on this Day's card to add your own puzzle web link and custom cover image!
                </p>
              </div>
            )
          ) : (
            // Local built-in puzzle
            <div className="w-full min-h-full flex items-center justify-center p-6 pt-24 pb-12 bg-[#040816]">
              <div className="w-full max-w-4xl bg-[#0b101f] border border-white/10 p-6 md:p-8 rounded-2xl shadow-2xl">
                <MiniGamePlayer
                  day={sandboxItem.day}
                  title={matchedChallenge?.title || `Challenge Day ${sandboxItem.day}`}
                  description={matchedChallenge?.description || `Logics Challenge Sector Day ${sandboxItem.day}`}
                  attemptsLeft={activeDayProgress.attemptsLeft}
                  onSuccess={() => handleDayChallengeSuccess(sandboxItem.day)}
                  onFailure={() => handleDayChallengeFailure(sandboxItem.day)}
                  rules={matchedChallenge?.rules}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 pb-24 px-4 sm:px-10 bg-[#070a13] relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-brand-blue/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        
        {/* Page title header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-blue/10 border border-brand-blue/20 rounded-full text-brand-blue text-[10px] font-black uppercase tracking-[0.2em] mb-4"
          >
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>Interactive Node Arcades</span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="max-[480px]:text-[26px] text-3xl sm:text-5xl md:text-6xl font-serif font-bold text-white uppercase tracking-wider mb-4 leading-[1.15] sm:leading-tight"
          >
            Gravity<span className="text-brand-blue">Verse</span> <span className="text-brand-blue">Play</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-slate-400 text-xs sm:text-sm leading-relaxed max-[480px]:max-w-[91%] mx-auto"
          >
            Welcome to <span className="text-white">Gravity</span><span className="text-brand-blue font-semibold">Verse</span>! Complete the Daily Challenges and check back for upcoming games.
          </motion.p>
        </div>

        {/* Dynamic Category Selector Menu */}
        <div className="flex justify-center mb-10 px-4">
          <div className="flex flex-col sm:flex-row bg-slate-900/60 p-1.5 sm:p-1 rounded-2xl border border-white/5 shadow-2xl w-full sm:w-auto gap-1 sm:gap-0">
            <button
              onClick={() => setActiveTab('challenge')}
              className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer w-full sm:w-auto ${
                activeTab === 'challenge' 
                  ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Award className="w-4 h-4 shrink-0" />
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate">Daily Challenges</span>
                <span className="px-1.5 py-0.5 bg-brand-blue/20 rounded text-[9px] text-brand-blue-light font-mono shrink-0">
                  {completionPercentage}%
                </span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('arcade')}
              className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer w-full sm:w-auto ${
                activeTab === 'arcade' 
                  ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Gamepad2 className="w-4 h-4 shrink-0" /> <span className="truncate">Games</span>
            </button>
          </div>
        </div>

        {/* ----------------- TAB: GAMES / ARCADE ----------------- */}
        <AnimatePresence mode="wait">
          {activeTab === 'arcade' && (
            <motion.div
              key="arcade"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-8"
            >
              {/* If authorized games exist in the registry, render their playable cards */}
              {authorizedGames.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {authorizedGames.map((game) => (
                    <div 
                      key={game.id}
                      className="bg-[#0b101f] border border-white/10 rounded-2xl overflow-hidden shadow-xl hover:border-brand-blue/40 transition-all flex flex-col group relative"
                    >
                      <div className="w-full h-[260px] relative bg-[#03060d] border-b border-white/5 overflow-hidden flex items-center justify-center">
                        {game.image ? (
                          <>
                            <img 
                              src={game.image} 
                              alt={game.title} 
                              className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-85 group-hover:scale-105 transition-all duration-500"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0b101f] via-black/30 to-black/10" />
                          </>
                        ) : (
                          <div className="absolute inset-0 bg-[radial-gradient(#151b2e_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />
                        )}

                        <div className="absolute top-4 left-4 px-2.5 py-1 bg-brand-blue/20 border border-brand-blue/30 backdrop-blur-sm rounded-lg text-[9px] font-black uppercase text-brand-blue tracking-wider">
                          {game.category}
                        </div>
                        {game.badge && (
                          <div className="absolute top-4 right-4 px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/30 backdrop-blur-sm rounded-lg text-[9px] font-black uppercase text-emerald-400 tracking-wider">
                            {game.badge}
                          </div>
                        )}
                        
                        <div className="relative z-10 text-center p-6 mt-auto">
                          <h4 className="text-lg font-serif font-black text-white uppercase tracking-wider mb-1.5 drop-shadow-md">
                            {game.title}
                          </h4>
                          <p className="text-xs text-slate-300 line-clamp-2 drop-shadow">
                            {game.description}
                          </p>
                        </div>
                      </div>
                      
                      <div className="p-5 flex items-center justify-between mt-auto bg-[#070b16] border-t border-white/5">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                          Authorized Partner Title
                        </span>
                        <button
                          onClick={() => handleArcadePlay(game.id)}
                          className="px-5 py-2.5 bg-brand-blue hover:bg-blue-600 active:scale-95 text-white shadow-lg shadow-brand-blue/20 text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" /> Play Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Polished "Games Coming Soon" Section */}
              <div className="relative rounded-3xl bg-gradient-to-b from-[#0b101f] to-[#060a14] border border-white/10 p-8 sm:p-12 md:p-16 text-center shadow-2xl overflow-hidden">
                {/* Subtle cosmic background glow */}
                <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-blue/10 rounded-full blur-[100px] pointer-events-none" />
                <div className="absolute -bottom-24 right-1/4 w-72 h-72 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
                <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-20 pointer-events-none" />

                <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
                  {/* Subtle Glowing Game Controller Illustration */}
                  <div className="relative mb-6">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-br from-brand-blue/20 via-brand-blue/10 to-purple-600/10 border border-brand-blue/30 flex items-center justify-center text-brand-blue shadow-2xl shadow-brand-blue/20 backdrop-blur-sm">
                      <Gamepad2 className="w-10 h-10 sm:w-12 sm:h-12 text-brand-blue drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#0b101f] border border-brand-blue/40 flex items-center justify-center text-brand-blue shadow-lg">
                      <Sparkles className="w-3.5 h-3.5 text-brand-blue" />
                    </div>
                  </div>

                  {/* Heading */}
                  <h3 className="text-2xl sm:text-3xl md:text-4xl font-serif font-black text-white uppercase tracking-wider mb-4 leading-tight">
                    Games Coming Soon
                  </h3>

                  {/* Body Copy */}
                  <p className="text-sm sm:text-base font-semibold text-slate-200 leading-relaxed mb-3 max-w-xl">
                    No games are currently available.
                  </p>

                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-lg">
                    We're working on bringing authorized games to Gravityverse. Playable games will appear here when they become available through authorized/licensed partnerships.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ----------------- TAB: DAILY CHALLENGES ----------------- */}
          {activeTab === 'challenge' && (
            <motion.div
              key="challenge"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-10"
            >
              {/* Overall Progress Board Card */}
              <div className="bg-[#0b101f] border border-white/10 p-6 sm:p-8 rounded-2xl shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="absolute top-0 right-0 w-80 h-80 bg-brand-blue/5 rounded-full blur-[100px] pointer-events-none" />
                            <div className="text-left space-y-2">
                  <h2 className="text-2xl font-serif font-black text-white uppercase tracking-wider">
                    🏆 Your Daily Challenges Progress
                  </h2>
                  <p className="text-slate-400 text-xs sm:text-sm max-w-xl">
                    Clear one puzzle each day to unlock subsequent days sequentially. In order to preserve standard security and test real problem-solving, a 24-hour ticker countdown will start immediately after solving a challenge!
                  </p>
                </div>

                <div className="flex items-center gap-4 bg-slate-900/60 border border-white/5 p-4 rounded-xl">
                  <div className="text-center">
                    <span className="text-3xl font-black text-brand-blue block">
                      {weekCompletedCount} <span className="text-sm font-normal text-slate-400">/ 7</span>
                    </span>
                    <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-widest block font-sans">Week {selectedWeekNum} Progress</span>
                  </div>
                  
                  {/* Circular/Line visual loading bar */}
                  <div className="w-24 bg-neutral-800 rounded-full h-3 overflow-hidden border border-white/10 relative">
                    <div 
                      style={{ width: `${weekCompletionPercentage}%` }} 
                      className="bg-brand-blue h-full transition-all duration-500 shadow-md shadow-brand-blue" 
                    />
                  </div>
                  <span className="text-xs font-black text-white font-mono">{weekCompletionPercentage}%</span>
                </div>
              </div>

              {isAdminUser && (
                <div className="bg-[#0c1224] border border-brand-blue/30 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl text-left bg-gradient-to-br from-neutral-950 via-[#0e1426] to-[#0b101f] relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-brand-blue/5 rounded-full blur-3xl pointer-events-none" />
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4 relative z-10 font-sans">
                    <div>
                      <h3 className="text-lg font-serif font-black text-white uppercase tracking-wider flex items-center gap-2">
                        <Award className="w-5 h-5 text-brand-blue" />
                        🛡️ Admin Master Secret Keys Registry
                      </h3>
                      <p className="text-xs text-slate-400">
                        Monitor, verify, and regenerate difficult-to-predict completion codes for all active challenge days. Only admins can see this registry.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 relative z-10 font-sans">
                    {challenges.map((c) => (
                      <div key={c.day} className="bg-neutral-900/60 hover:bg-neutral-900 border border-white/10 rounded-xl p-4 flex flex-col justify-between space-y-4 hover:border-brand-blue/40 transition-all duration-300">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 bg-brand-blue/15 text-brand-blue border border-brand-blue/20 rounded text-[9px] font-black uppercase tracking-wider font-mono">
                              Day {c.day}
                            </span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                              {c.category}
                            </span>
                          </div>
                          <h4 className="text-xs font-serif font-semibold text-white uppercase tracking-wide truncate" title={c.title}>
                            {c.title}
                          </h4>
                        </div>

                        <div className="space-y-1 bg-black/40 px-3 py-2 rounded-lg border border-white/5">
                          <span className="text-[8px] uppercase tracking-wider text-slate-500 font-black font-mono">Secret Code:</span>
                          <div className="text-sm font-black font-mono tracking-widest text-emerald-400 select-all">
                            {c.solutionKey || 'None (riddle bypass)'}
                          </div>
                        </div>

                        <button
                          onClick={() => handleRegenerateSecretCode(c.day)}
                          className="w-full py-1.5 bg-[#152e4f] hover:bg-blue-600 border border-white/10 text-white rounded text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition duration-200 cursor-pointer active:scale-95"
                          title="Generate a new custom secret code"
                        >
                          <RotateCcw className="w-3 h-3" /> Regenerate Secret Code
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Day Calendar Bento Slider Map */}
              <div className="w-full overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 text-left flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-brand-blue" />
                    <span>Interactive Bento Calendar Grid Track</span>
                  </h3>
                  
                  {/* Floating Forward & Backward Navigation Symbols */}
                  <div className="flex items-center gap-1.5 shrink-0 select-none">
                    <button
                      onClick={() => handleScrollAndSelectDay('prev')}
                      className="w-10 h-10 bg-[#0e1426] hover:bg-[#141b34] text-white rounded-xl border border-white/10 hover:border-brand-blue/50 flex items-center justify-center transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                      title="View Previous Day Challenge"
                      disabled={selectedDay === (challenges[0]?.day || 1)}
                    >
                      <ChevronLeft className="w-5 h-5 text-slate-200" />
                    </button>
                    <button
                      onClick={() => handleScrollAndSelectDay('next')}
                      className="w-10 h-10 bg-[#0e1426] hover:bg-[#141b34] text-white rounded-xl border border-white/10 hover:border-brand-blue/50 flex items-center justify-center transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                      title="View Next Day Challenge"
                      disabled={selectedDay === (challenges[challenges.length - 1]?.day || 14)}
                    >
                      <ChevronRight className="w-5 h-5 text-slate-200" />
                    </button>
                  </div>
                </div>
                
                <div 
                  ref={bentoScrollRef}
                  className="flex overflow-x-auto gap-4 pb-4 pt-1 scroll-smooth w-full md:[&::-webkit-scrollbar]:hidden md:[-ms-overflow-style:none] md:[scrollbar-width:none] scrollbar-thin scrollbar-thumb-white/10"
                >
                  {challenges.map((challenge) => {
                    const prog = progress[challenge.day] || { status: 'locked', attemptsLeft: 3 };
                    const isCompleted = prog.status === 'completed';
                    const isUnlocked = prog.status === 'unlocked' || isCompleted;
                    const isSelected = selectedDay === challenge.day;
                    
                    // Determine if the previous day was completed and if this one is locked (waiting for 24h)
                    const prevProg = progress[challenge.day - 1];
                    const isWaitingCooldown = challenge.day > 1 && prevProg?.status === 'completed' && prog.status === 'locked';

                    return (
                      <button
                        key={challenge.day}
                        data-day={challenge.day}
                        onClick={() => setSelectedDay(challenge.day)}
                        className={`p-4 rounded-xl border transition-all text-left flex flex-col justify-between h-28 shrink-0 w-36 sm:w-40 md:w-[152px] relative overflow-hidden cursor-pointer ${
                          isSelected 
                            ? 'bg-brand-blue/15 border-brand-blue ring-2 ring-brand-blue/25 scale-[1.02] shadow-xl' 
                            : isCompleted 
                            ? 'bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/30' 
                            : isWaitingCooldown 
                            ? 'bg-yellow-500/5 border-yellow-500/20 shadow-md hover:border-yellow-500/40'
                            : isUnlocked 
                            ? 'bg-[#0f152a] hover:bg-[#151c38] border-white/10' 
                            : 'bg-neutral-900/40 border-white/5 opacity-55 cursor-not-allowed'
                        }`}
                      >
                        {/* Day Index banner */}
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[10px] font-black font-mono uppercase tracking-widest text-slate-500">
                            Day {challenge.day}
                          </span>
                          {isCompleted ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-500/20" />
                          ) : isWaitingCooldown ? (
                            <Clock className="w-4 h-4 text-yellow-500 animate-spin" style={{ animationDuration: '4s' }} />
                          ) : isUnlocked ? (
                            <span className="w-2 h-2 rounded-full bg-brand-blue animate-pulse" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-slate-600" />
                          )}
                        </div>

                        {/* Codename */}
                        <div className="mt-2 text-xs font-serif font-black text-white uppercase tracking-wider truncate max-w-[95%]">
                          {challenge.title.split(' ')[0]}...
                        </div>

                        {/* Cooldown Timer or attempts badge */}
                        <div className="mt-auto pt-1 w-full text-left">
                          {isWaitingCooldown ? (
                            <span className="text-[10px] font-mono font-bold text-yellow-400 block bg-yellow-400/10 px-1.5 py-0.5 rounded text-center">
                              ⏳ {getCooldownString(challenge.day)}
                            </span>
                          ) : isCompleted ? (
                            <span className="text-[8px] uppercase tracking-widest font-black text-emerald-400 block font-mono">
                              SOLVED
                            </span>
                          ) : isUnlocked ? (
                            <span className="text-[8px] uppercase tracking-widest font-black text-brand-blue block font-mono">
                              READY!
                            </span>
                          ) : (
                            <span className="text-[8px] uppercase tracking-widest font-black text-slate-600 block font-mono">
                              LOCKED
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {isAdminUser && (
                    <button
                      onClick={handleAddNewDayChallenge}
                      className="p-4 rounded-xl border border-dashed border-brand-blue/40 bg-brand-blue/5 hover:bg-brand-blue/10 transition-all text-center flex flex-col items-center justify-center h-28 shrink-0 w-36 sm:w-40 md:w-[152px] cursor-pointer group"
                    >
                      <Plus className="w-6 h-6 text-brand-blue group-hover:scale-110 transition-transform mb-1" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                        Add Day {challenges.length > 0 ? Math.max(...challenges.map(c => c.day)) + 1 : 15}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Active Day detailed panel */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Visual poster card & instructions details */}
                <div className="lg:col-span-4 bg-[#0b101f] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                  <div className="p-6 text-left space-y-4">
                    <div>
                      <span className="text-[10px] text-brand-blue uppercase tracking-widest font-black">
                        Category: {activeChallenge.category}
                      </span>
                      <h3 className="text-xl font-serif font-black text-white uppercase tracking-wider mt-1 flex items-center justify-between gap-3 flex-wrap">
                        <span>{activeChallenge.title}</span>
                        {isAdminUser && activeChallenge.day > 14 && (
                          <button
                            onClick={() => setConfirmDeleteDay(activeChallenge.day)}
                            className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all duration-200 cursor-pointer active:scale-95"
                            title="Delete this custom challenge"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete Day {activeChallenge.day}
                          </button>
                        )}
                      </h3>
                      <div className="mt-2 inline-block px-2.5 py-0.5 bg-neutral-900 border border-white/15 rounded text-[9px] font-bold uppercase tracking-wider text-slate-300">
                        Difficulty: <span className={
                          activeChallenge.difficulty === 'Easy' ? 'text-emerald-400' :
                          activeChallenge.difficulty === 'Medium' ? 'text-brand-blue' :
                          activeChallenge.difficulty === 'Hard' ? 'text-yellow-500' : 'text-red-500'
                        }>{activeChallenge.difficulty}</span>
                      </div>
                    </div>

                    <p className="text-slate-400 text-xs sm:text-sm leading-relaxed border-t border-white/5 pt-4">
                      {activeChallenge.description?.startsWith('Please configure') 
                        ? `Access this day's challenge puzzle on the live app portal, find the correct 9-character secret code (e.g. 21MAD201T), and verify it here to log your solve and unlock the next sequence day!`
                        : activeChallenge.description}
                    </p>

                    {activeChallenge.rules && (
                      <div className="bg-[#10b981]/5 border border-[#10b981]/25 rounded-xl p-4 text-xs space-y-1.5 text-slate-300 text-left">
                        <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest block font-mono">
                          📋 Custom Puzzle Rules & Instructions
                        </span>
                        <p className="whitespace-pre-line leading-relaxed text-slate-300 font-medium">
                          {activeChallenge.rules}
                        </p>
                      </div>
                    )}

                    {/* Custom Play Link Sandbox block */}
                    {isAdminUser ? (
                      <div className="bg-neutral-950/40 p-4 border border-white/5 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider flex items-center gap-1">
                            <Laptop className="w-3.5 h-3.5" /> Custom Play Configurations (Admin)
                          </span>
                          
                          <button
                            onClick={() => startCustomUrlEditing(activeChallenge.day)}
                            className="text-[9px] text-brand-blue uppercase font-black hover:underline tracking-wider"
                          >
                            Configure
                          </button>
                        </div>

                        {editingUrlDay === activeChallenge.day ? (
                          <div className="space-y-3 border-y border-white/5 py-3">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Title</label>
                                <input
                                  type="text"
                                  value={tempTitleValue}
                                  onChange={(e) => setTempTitleValue(e.target.value)}
                                  className="w-full bg-neutral-900 border border-white/15 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-brand-blue"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Codename</label>
                                <input
                                  type="text"
                                  value={tempCodenameValue}
                                  onChange={(e) => setTempCodenameValue(e.target.value)}
                                  className="w-full bg-neutral-900 border border-white/15 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-brand-blue"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Description</label>
                              <textarea
                                value={tempDescValue}
                                onChange={(e) => setTempDescValue(e.target.value)}
                                rows={2}
                                className="w-full bg-neutral-900 border border-white/15 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-brand-blue resize-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Rules & Instructions (Optional, shown inside Rules guide)</label>
                              <textarea
                                value={tempRulesValue}
                                onChange={(e) => setTempRulesValue(e.target.value)}
                                rows={3}
                                placeholder="Type any custom rules or step-by-step instructions for solving this puzzle here..."
                                className="w-full bg-neutral-900 border border-white/15 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-brand-blue resize-y"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Category</label>
                                <input
                                  type="text"
                                  value={tempCategoryValue}
                                  onChange={(e) => setTempCategoryValue(e.target.value)}
                                  className="w-full bg-neutral-900 border border-white/15 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-brand-blue"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Difficulty</label>
                                <select
                                  value={tempDifficultyValue}
                                  onChange={(e) => setTempDifficultyValue(e.target.value as any)}
                                  className="w-full bg-neutral-900 border border-white/15 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-brand-blue"
                                >
                                  <option value="Easy">Easy</option>
                                  <option value="Medium">Medium</option>
                                  <option value="Hard">Hard</option>
                                  <option value="Expert">Expert</option>
                                </select>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Custom Game Link URL</label>
                              <input
                                type="text"
                                value={tempUrlValue}
                                onChange={(e) => setTempUrlValue(e.target.value)}
                                placeholder="e.g. https://my-custom-puzzle.com"
                                className="w-full bg-neutral-900 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-brand-blue"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Custom Cover Image URL</label>
                              <input
                                type="text"
                                value={tempImageValue}
                                onChange={(e) => setTempImageValue(e.target.value)}
                                placeholder="e.g. https://images.unsplash.com/photo-xxx"
                                className="w-full bg-[#151a2e]/60 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-brand-blue"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Optional Completion Passcode (solutionKey)</label>
                              <input
                                type="text"
                                value={tempSolutionKeyValue}
                                onChange={(e) => setTempSolutionKeyValue(e.target.value)}
                                placeholder="e.g. SOLVED123 (leave blank for logic verification riddles)"
                                className="w-full bg-neutral-900 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-brand-blue"
                              />
                            </div>

                            <div className="flex gap-1.5 justify-end pt-1">
                              <button
                                onClick={() => setEditingUrlDay(null)}
                                className="px-2.5 py-1 bg-neutral-800 text-slate-300 text-[10px] font-black uppercase tracking-wider rounded border border-white/5"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveCustomUrl(activeChallenge.day)}
                                className="px-2.5 py-1 bg-brand-blue text-white text-[10px] font-black uppercase tracking-wider rounded flex items-center gap-1"
                              >
                                <Save className="w-3 h-3" /> Save Changes
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <span className="text-[8px] uppercase tracking-wider text-slate-600 font-black block">Play Redirect:</span>
                              <div className="text-xs truncate text-slate-400 bg-neutral-900/80 px-2.5 py-2 font-mono rounded border border-white/5">
                                {activeChallenge.src || 'No custom URL loaded yet'}
                              </div>
                            </div>
                            
                            <div className="space-y-1 block">
                              <span className="text-[8px] uppercase tracking-wider text-slate-600 font-black block">Custom Cover Image:</span>
                              <div className="text-xs truncate text-slate-400 bg-neutral-900/80 px-2.5 py-2 font-mono rounded border border-white/5">
                                {activeChallenge.image || 'Default Challenge Poster active'}
                              </div>
                            </div>

                            {activeChallenge.day > 14 && (
                              <button
                                onClick={() => setConfirmDeleteDay(activeChallenge.day)}
                                className="w-full py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete Day {activeChallenge.day} Challenge
                              </button>
                            )}
                          </div>
                        )}

                        {activeChallenge.src ? (
                          <div className="space-y-2 pt-1.5">
                            <button
                              disabled={!activeDayProgress.status || activeDayProgress.status === 'locked'}
                              onClick={() => handleOpenSandbox(activeChallenge.day, 'local')}
                              className="w-full py-2 bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 border border-emerald-500/20 transition disabled:opacity-35 cursor-pointer active:scale-95"
                            >
                              <Play className="w-3 h-3 fill-current" /> Test Local Puzzle
                            </button>
                            <button
                              disabled={!activeDayProgress.status || activeDayProgress.status === 'locked'}
                              onClick={() => handleOpenSandbox(activeChallenge.day, 'iframe')}
                              className="w-full py-2 bg-[#152e4f] hover:bg-blue-600/90 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 border border-white/10 transition disabled:opacity-35 cursor-pointer active:scale-95"
                            >
                              <Eye className="w-4 h-4" /> Preview Custom URL Iframe
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2 pt-1.5">
                            <button
                              disabled={!activeDayProgress.status || activeDayProgress.status === 'locked'}
                              onClick={() => handleOpenSandbox(activeChallenge.day, 'local')}
                              className="w-full py-2 bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 border border-emerald-500/20 transition disabled:opacity-35 cursor-pointer active:scale-95"
                            >
                              <Play className="w-3 h-3 fill-current" /> Test Local Puzzle
                            </button>
                            <div className="text-[10px] text-slate-500 font-mono text-center pt-2">
                              ⚠️ Paste custom puzzle URL above to enable interactive iframe embedding.
                            </div>
                          </div>
                        )}


                      </div>
                    ) : (
                      // Regular Users Display
                      <div className="space-y-3">
                        {activeChallenge.src ? (
                          <div className="bg-[#152e4f]/10 p-4 border border-blue-500/20 rounded-xl space-y-3 text-left">
                            <span className="text-[10px] text-brand-blue-light font-extrabold uppercase tracking-wider flex items-center gap-1 font-mono">
                              🚀 Custom Web Link
                            </span>
                            <p className="text-slate-300 text-[11px] leading-relaxed">
                              Play the customized external game link for this session.
                            </p>
                            <button
                              disabled={!activeDayProgress.status || activeDayProgress.status === 'locked'}
                              onClick={() => handleOpenSandbox(activeChallenge.day, 'iframe')}
                              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 border border-white/10 transition disabled:opacity-35 cursor-pointer shadow-md"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" /> Solve Puzzle
                            </button>
                          </div>
                        ) : (
                          <div className="bg-[#0b101f]/35 p-4 border border-white/5 rounded-xl text-center">
                            <span className="text-[9px] uppercase tracking-wider text-slate-500 font-black font-mono block">Custom Puzzle Location</span>
                            <span className="text-xs text-slate-400 font-medium font-sans block pt-1">Runs on separately hosted environment</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Main Interactive Solving Simulator Panel */}
                <div className="lg:col-span-8">
                  {activeDayProgress.status === 'locked' ? (
                    // Display COOLDOWN COUNTDOWN or standard LOCKED screen
                    <div className="bg-[#0b101f] border border-white/10 p-10 rounded-2xl shadow-2xl text-center space-y-6">
                      <div className="w-16 h-16 bg-neutral-900 rounded-full border border-white/10 flex items-center justify-center mx-auto">
                        <Lock className="w-6 h-6 text-slate-500 animate-pulse" />
                      </div>
                      
                      {/* Check if is in actual 24h countdown screen */}
                      {activeChallenge.day > 1 && progress[activeChallenge.day - 1]?.status === 'completed' ? (
                        <div className="space-y-3">
                          <span className="text-[10px] text-yellow-500 font-extrabold uppercase tracking-[0.2em] block">
                            ⌛ Day Challenge Lock Activated
                          </span>
                          <h4 className="text-2xl font-serif font-black text-white uppercase tracking-wider">
                            Countdown to Next Day Unlock
                          </h4>
                          <p className="text-slate-400 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
                            Outstanding job on Day {activeChallenge.day - 1}! To promote consistent coding & logic recall practices, Day {activeChallenge.day} unlocks in exactly:
                          </p>
                          <div className="text-5xl sm:text-6xl font-black text-yellow-400 tracking-wider font-mono bg-neutral-950 p-6 rounded-2xl max-w-xs mx-auto border border-white/5 shadow-2xl relative overflow-hidden">
                            <span className="relative z-10">{getCooldownString(activeChallenge.day)}</span>
                            <div className="absolute inset-0 bg-yellow-400/5 blur-3xl rounded-full" />
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono italic block pt-2">
                            * Use the developer override console below to bypass this countdown instantly for demonstration review!
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-[0.2em] block">
                            🔒 Sequential Lock Ingress
                          </span>
                          <h4 className="text-xl font-serif font-black text-white uppercase tracking-wider">
                            Day Locked Prior Task Incomplete
                          </h4>
                          <p className="text-slate-400 text-xs sm:text-sm max-w-sm mx-auto leading-relaxed">
                            This sector challenge is locked. Complete the prior Day {activeChallenge.day - 1} challenge first to access this zone.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Play Arena is active (Day is unlocked or completed)
                    <div className="space-y-6">
                      {/* Player Completion Code Verification Panel */}
                      <div className="bg-[#0b101f] border border-blue-500/20 rounded-2xl p-6 space-y-4 shadow-2xl relative overflow-hidden text-left">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
                        
                        <div className="flex items-start gap-4 relative z-10">
                          <div className="p-3 bg-brand-blue/15 border border-brand-blue/30 rounded-xl text-brand-blue-light">
                            <Lock className="w-5 h-5 text-brand-blue" />
                          </div>
                          <div className="text-left flex-1 space-y-1">
                            <h4 className="text-sm font-serif font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                              <span>🔑 Day {activeChallenge.day} Secret Code Verification</span>
                            </h4>
                            <p className="text-[11px] text-slate-400 leading-normal font-sans">
                              Beat the challenge puzzle on your active website portal, find the 9-character secret code, and enter it below to mark this day completed!
                            </p>
                          </div>
                        </div>

                        {activeDayProgress.status === 'completed' ? (
                          <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl flex items-center justify-between relative z-10">
                            <div className="text-left">
                              <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-extrabold font-mono block">Day Solved Successfully</span>
                              <span className="text-xs text-slate-200 font-medium font-sans">Challenge completion code verified and authenticated!</span>
                              {activeDayProgress.completedAt && (
                                <span className="text-[9px] text-slate-500 font-mono block pt-0.5">
                                  Cleared at: {new Date(activeDayProgress.completedAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                            <CheckCircle2 className="w-6 h-6 text-emerald-400 fill-emerald-500/10 animate-bounce" />
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row items-stretch gap-3 sm:gap-2 relative z-10">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                value={verificationPasscode}
                                onChange={(e) => setVerificationPasscode(e.target.value)}
                                placeholder="Enter Secret Code (e.g. 21MAD201T)"
                                className="w-full bg-black/40 border border-white/15 hover:border-white/20 focus:border-brand-blue rounded-xl px-4 py-2.5 text-xs text-white font-mono uppercase tracking-wider sm:tracking-widest outline-none transition"
                              />
                            </div>
                            <button
                              onClick={() => handleVerifyPasscodeAttempt(activeChallenge.day, activeChallenge.solutionKey || '')}
                              className="px-6 py-3 sm:py-2.5 bg-[#152e4f] hover:bg-blue-600 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl transition duration-200 cursor-pointer flex items-center justify-center gap-1.5 shrink-0 w-full sm:w-auto"
                            >
                              Verify Secret Code
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Play mode switcher if a custom live URL actually exists */}
                      {activeChallenge.src && (
                        <div className="flex items-center gap-1.5 p-1 bg-[#0b101f] border border-white/10 rounded-xl max-w-xs">
                          <button
                            onClick={() => setPlayMode('local')}
                            className={`flex-1 py-1.5 px-3 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                              playMode === 'local' 
                                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30' 
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            🧩 Local Puzzle
                          </button>
                          <button
                            onClick={() => setPlayMode('iframe')}
                            className={`flex-1 py-1.5 px-3 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                              playMode === 'iframe' 
                                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' 
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            🚀 Custom URL
                          </button>
                        </div>
                      )}

                      {playMode === 'iframe' && activeChallenge.src ? (
                        <div className="bg-[#0b101f] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                          {/* Top Iframe Bar */}
                          <div className="px-5 py-3.5 bg-[#0e1426] border-b border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2">
                              {activeDayProgress.status === 'completed' ? (
                                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-[10px] font-black uppercase tracking-wider font-mono">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Challenge Solved
                                </span>
                              ) : (
                                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-brand-blue/10 border border-brand-blue/20 text-brand-blue-light rounded-lg text-[10px] font-black uppercase tracking-wider font-mono animate-pulse">
                                  <Play className="w-3.5 h-3.5 fill-current" /> Play Live Session
                                </span>
                              )}
                              <span className="text-slate-400 font-medium">
                                Hosted at: <code className="text-[10px] bg-neutral-900 px-1.5 py-0.5 rounded text-brand-blue font-mono">
                                  {(() => {
                                    try {
                                      return new URL(activeChallenge.src).hostname;
                                    } catch (e) {
                                      return 'External Provider';
                                    }
                                  })()}
                                </code>
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {isAdminUser && activeDayProgress.status !== 'completed' && (
                                <button
                                  onClick={() => handleDayChallengeSuccess(activeChallenge.day)}
                                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition active:scale-95 cursor-pointer flex items-center gap-1"
                                >
                                  Claim Day Victory Key (Admin Override)
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Embed Frame */}
                          <div className="w-full h-[280px] xs:h-[350px] sm:h-[450px] md:h-[550px] bg-black relative">
                            <iframe 
                              src={activeChallenge.src}
                              className="w-full h-full border-none outline-none"
                              allow="autoplay; fullscreen; keyboard; gamepad"
                              title={`Challenge Day ${activeChallenge.day}`}
                              referrerPolicy="no-referrer"
                            />
                          </div>

                          {/* Help / Completion Footer Banner */}
                          {activeDayProgress.status === 'completed' ? (
                            <div className="p-4 bg-emerald-500/5 border-t border-emerald-500/20 text-emerald-400 font-bold text-xs text-center uppercase tracking-wider font-mono flex items-center justify-center gap-2">
                              <Sparkles className="w-4 h-4 animate-bounce" />
                              <span>Congratulations! Success key logged. The subsequent Day's challenge has been unlocked in series.</span>
                            </div>
                          ) : activeChallenge.solutionKey ? (
                            <div className="p-4 bg-neutral-950 border-t border-white/5 flex flex-col md:flex-row items-center gap-4 justify-between">
                              <div className="text-left max-w-md">
                                <h5 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider font-mono">🔐 Solution Verification Key Required</h5>
                                <p className="text-[10px] text-slate-400 leading-normal font-sans">
                                  This special customized challenge is passcode-protected. Enter the correct completion code from the victory screen or the creator to unlock!
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 w-full md:w-auto">
                                <input
                                  type="text"
                                  value={verificationPasscode}
                                  onChange={(e) => setVerificationPasscode(e.target.value)}
                                  placeholder="Enter Passcode..."
                                  className="bg-black/60 border border-white/10 px-2.5 py-1.5 text-xs rounded-lg text-white font-mono outline-none focus:border-brand-blue"
                                />
                                <button
                                  onClick={() => handleVerifyPasscodeAttempt(activeChallenge.day, activeChallenge.solutionKey || '')}
                                  className="px-3.5 py-1.5 bg-[#152e4f] text-white font-bold text-[10px] uppercase tracking-wider rounded-lg hover:bg-blue-600 transition cursor-pointer"
                                >
                                  Verify Passcode
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="p-4 bg-neutral-950 border-t border-white/5 flex flex-col md:flex-row items-center gap-4 justify-between">
                              <div className="text-left max-w-md">
                                <h5 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider font-mono">🧩 Browser Cross-Origin Play Session</h5>
                                <p className="text-[10px] text-slate-400 leading-normal font-sans">
                                  Since third-party games run inside secure standard cross-origin frames, let's verify your logical solve state with a quick 10-second proof of logic answer!
                                </p>
                              </div>
                              <button
                                onClick={() => handleLaunchRiddleVerification(activeChallenge.day)}
                                className="px-4 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/20 text-emerald-300 font-bold text-[10px] tracking-wider uppercase rounded-lg transition active:scale-95 cursor-pointer flex items-center gap-1 w-full md:w-auto justify-center"
                              >
                                🧠 Verify Logic Solve & Unlock
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        // Helpful Instruction Block for External Puzzles (Replacing local fallback)
                        <div className="bg-[#0b101f]/60 border border-white/5 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl text-left bg-gradient-to-br from-neutral-950 via-[#0a0f1d] to-[#080d19] relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-blue/5 rounded-full blur-3xl pointer-events-none" />
                          <div className="relative z-10 font-sans space-y-3">
                            <h4 className="text-sm font-serif font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                              🚀 Separately Hosted Challenge Puzzle
                            </h4>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              This day's puzzle is hosted on our separate web portal. Navigate to the challenge portal, solve the challenge logic or puzzle to reveal your 9-character secret code (e.g. 21MAD201T), then come back and input it in the verification panel above to register your solve status and start the sequential unlock countdown timer!
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                              <span>System Status:</span>
                              <span className="text-emerald-400 font-bold">● Standby (Awaiting Submission Key verification)</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating custom HTML Toast Notification */}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl max-w-sm"
              style={{
                backgroundColor: notification.type === 'error' ? '#1c1015' : notification.type === 'success' ? '#0d1c16' : '#0f172a',
                borderColor: notification.type === 'error' ? '#ef444430' : notification.type === 'success' ? '#10b98130' : '#3b82f630'
              }}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  notification.type === 'error' ? 'bg-red-500' : notification.type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
                }`}
              />
              <p className="text-xs font-semibold text-slate-100">
                {notification.message}
              </p>
              <button
                onClick={() => setNotification(null)}
                className="text-slate-400 hover:text-white text-xs ml-auto font-bold pl-2 cursor-pointer"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Custom Confirmation Dialog Modal Overlay (Doesn't use window.confirm) */}
        <AnimatePresence>
          {confirmDeleteDay !== null && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-[#0b0f19] border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative"
              >
                <div className="flex items-start gap-4 text-left">
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 flex items-center justify-center">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className="text-lg font-serif font-black text-white uppercase tracking-wider">
                      Delete Challenge Day {confirmDeleteDay}?
                    </h3>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      Are you absolutely sure you want to delete Challenge Day {confirmDeleteDay}? This action is permanent and cannot be undone. All players' progress data on this day will be detached.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-6">
                  <button
                    onClick={() => setConfirmDeleteDay(null)}
                    className="px-4 py-2 bg-neutral-950 hover:bg-neutral-900 border border-white/10 text-slate-300 hover:text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition duration-200 cursor-pointer active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      handleDeleteDayChallenge(confirmDeleteDay);
                      setConfirmDeleteDay(null);
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition duration-200 cursor-pointer active:scale-95"
                  >
                    Yes, Permanent Delete
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Riddle Modal Dialog Overlay */}
        <AnimatePresence>
          {showRiddleModal && currentRiddle && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-[#0b0f19] border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-brand-blue/10 border border-brand-blue/20 rounded-xl text-brand-blue flex items-center justify-center">
                    <Sparkles className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className="text-lg font-serif font-black text-white uppercase tracking-wider">
                      Proof of Logic Solve
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-normal">
                      Provide a correct answer to this logical problem to prove you successfully solved this day's task!
                    </p>
                  </div>
                </div>

                <div className="mt-5 p-4 bg-black/40 border border-white/5 rounded-xl text-left">
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block mb-1">LOGICAL QUESTION:</span>
                  <p className="text-slate-100 text-xs font-semibold leading-relaxed">
                    {currentRiddle.question}
                  </p>
                </div>

                <div className="mt-4 space-y-1.5 text-left">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Your logical guess:</label>
                  <input
                    type="text"
                    value={riddleAnswerInput}
                    onChange={(e) => setRiddleAnswerInput(e.target.value)}
                    placeholder={currentRiddle.placeholder}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleVerifyRiddleAnswer();
                    }}
                    className="w-full bg-[#03060d] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-brand-blue font-mono"
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-end gap-3 mt-6">
                  <button
                    onClick={() => {
                      setShowRiddleModal(false);
                      setCurrentRiddle(null);
                      setRiddleTargetDay(null);
                    }}
                    className="px-4 py-2 bg-neutral-950 hover:bg-neutral-900 border border-white/10 text-slate-300 hover:text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition duration-200 cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleVerifyRiddleAnswer}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition duration-200 cursor-pointer"
                  >
                    Submit Proof
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>


      </div>
    </div>
  );
}
