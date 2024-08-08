// Wordle Golf Types

interface GameConfig {
  id: string; // game id based on message thread
  chatId?: number;
  threadId?: number;
  holes: number;
  mulligans: number;
  initiationDate: string;
  initialGameNumber: number;
}

interface RoundMetadata extends GameConfig {
  completedHoles: number;
  isComplete: boolean;
  isArchived: boolean;
}

interface Player {
  id: number;
  firstName: string;
  username?: string;
}

interface WordleScore {
  // TODO: use Player
  playerId: string;
  gameId: string;
  userId: number;
  username?: string;
  userFirstName: string;
  initialWord: string;
  puzzle: number;
  score: {
    label: string;
    value: number;
  };
  lines: string[];
}

interface RoundScorecard {
  metadata: RoundMetadata;
  scores: {
    [key: string]: {
      // player names? - maybe when improved id parsing (first name ish)
      total: number;
      holes: {
        numerical: number[];
        visual: string[];
      }
    };
  };
}

interface WordleGolfDataSource {
  newGame(config: WordleGameConfig): Promise<void>;
  addScore(score: WordleScore): Promise<void>;
  getScorecard(gameId: string): Promise<WordleScorecard>;
  finalizeRound(gameId: string): Promise<WordleScorecard>;
  getActiveRounds(): Promise<RoundMetadata[]>;
}
