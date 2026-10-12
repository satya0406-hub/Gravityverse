export interface DayProgress {
  status: 'locked' | 'unlocked' | 'completed' | 'failed';
  completedAt?: number; // timestamp of completion
  attemptsLeft: number; // starts at 3
}

export type ChallengeProgress = Record<number, DayProgress>;

export interface Challenge {
  day: number;
  title: string;
  codename: string;
  description: string;
  src: string; // The customizable iframe/redirect URL
  image: string;
  category: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  solutionKey?: string;
  rules?: string;
}
