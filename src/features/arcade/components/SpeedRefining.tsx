import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import { Gamepad2, AlertTriangle, Medal, ArrowLeft, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logEvent } from '@/analytics';

// Types
interface LeaderboardEntry {
  id: string;
  player_name: string;
  total_time: number;
  created_at: string;
}

// Constants
const GRID_SIZE = 5;
const TOTAL_NUMBERS = GRID_SIZE * GRID_SIZE;
const PENALTY_TIME = 1; // seconds

// Background Images
const BG_UR = 'https://image-bd2db.souseha.com/common/pngs/UR_rank.webp';
const BG_SR = 'https://image-bd2db.souseha.com/common/pngs/SR_rank.webp';
const BG_R = 'https://image-bd2db.souseha.com/common/pngs/R_rank.webp';
const BG_N = 'https://image-bd2db.souseha.com/common/pngs/N_rank.webp';

// Helper to get background based on number
const getBackground = (num: number) => {
  if (num >= 21) return BG_UR;
  if (num >= 17) return BG_SR;
  if (num >= 12) return BG_R;
  return BG_N;
};

// Probability Logic
const BASE_PROBABILITIES: Record<number, number> = {
  16: 50.10, 17: 25.05, 18: 12.52, 19: 6.26, 20: 3.13,
  21: 1.57, 22: 0.78, 23: 0.39, 24: 0.20
};

const getRefiningPrediction = (isPerfect: boolean) => {
  let probabilities = { ...BASE_PROBABILITIES };

  if (isPerfect) {
    // Boost UR probabilities by 10x
    probabilities[22] *= 10;
    probabilities[23] *= 10;
    probabilities[24] *= 10;

    // Normalize others to keep sum 100%
    const boostedSum = probabilities[22] + probabilities[23] + probabilities[24];
    const remainingSum = 100 - boostedSum;

    // Sum of non-boosted items (16-21)
    let originalRemainingSum = 0;
    for (let i = 16; i <= 21; i++) originalRemainingSum += BASE_PROBABILITIES[i];

    // Scale down non-boosted items
    for (let i = 16; i <= 21; i++) {
      probabilities[i] = (BASE_PROBABILITIES[i] / originalRemainingSum) * remainingSum;
    }
  }

  // Weighted Random Selection
  const rand = Math.random() * 100;
  let cumulative = 0;
  let selectedNum = 16;

  for (const numStr in probabilities) {
    const num = parseInt(numStr);
    cumulative += probabilities[num];
    if (rand <= cumulative) {
      selectedNum = num;
      break;
    }
  }

  // Generate random percentage boost (0.01 - 5.00)
  const boostPercent = (Math.random() * 4.99 + 0.01).toFixed(2);

  return { selectedNum, boostPercent };
};

export default function SpeedRefining() {
  const { t } = useTranslation('arcade');
  const { showToast } = useAppContext();

  // State
  const [playerName, setPlayerName] = useState('');
  const [gameState, setGameState] = useState<'start' | 'playing' | 'end'>('start');
  const [gridNumbers, setGridNumbers] = useState<number[]>([]);
  const [nextNumber, setNextNumber] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [penaltyTime, setPenaltyTime] = useState(0);
  const [penaltyCount, setPenaltyCount] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [shake, setShake] = useState(false);
  const [prediction, setPrediction] = useState<{ selectedNum: number, boostPercent: string } | null>(null);
  const [showNameError, setShowNameError] = useState(false);

  const timerRef = useRef<number | null>(null);

  // Load player name
  useEffect(() => {
    const savedName = localStorage.getItem('speed_refining_player_name');
    if (savedName) setPlayerName(savedName);
    fetchLeaderboard();
  }, []);

  // Fetch Leaderboard
  const fetchLeaderboard = async () => {
    const { data, error } = await supabase
      .from('lb_speedrefining')
      .select('*')
      .order('total_time', { ascending: true })
      .limit(10);

    if (error) console.error('Error fetching leaderboard:', error);
    else setLeaderboard(data || []);
  };

  // Timer Logic
  useEffect(() => {
    if (gameState === 'playing' && startTime) {
      timerRef.current = window.setInterval(() => {
        setCurrentTime((Date.now() - startTime) / 1000);
      }, 10);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, startTime]);

  // Start Game
  const startGame = () => {
    if (!playerName.trim()) {
      setShowNameError(true);
      return;
    }
    setShowNameError(false);
    localStorage.setItem('speed_refining_player_name', playerName);

    logEvent('Arcade', 'Start SpeedRefining', playerName);

    // Shuffle numbers
    const nums = Array.from({ length: TOTAL_NUMBERS }, (_, i) => i);
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }

    setGridNumbers(nums);
    setNextNumber(0);
    setPenaltyTime(0);
    setPenaltyCount(0);
    setStartTime(Date.now());
    setCurrentTime(0);
    setGameState('playing');
  };

  // Handle Click
  const handleNumberClick = (num: number) => {
    if (gameState !== 'playing') return;

    if (num === nextNumber) {
      if (num === TOTAL_NUMBERS - 1) {
        endGame();
      } else {
        setNextNumber(prev => prev + 1);
      }
    } else {
      // Penalty
      setPenaltyTime(prev => prev + PENALTY_TIME);
      setPenaltyCount(prev => prev + 1);
      triggerShake();
    }
  };

  // Visual Feedback
  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  // End Game
  const endGame = async () => {
    setGameState('end');
    const finalTime = currentTime + penaltyTime; // Current time is roughly play time

    // Calculate prediction
    const pred = getRefiningPrediction(penaltyCount === 0);
    setPrediction(pred);

    // Save to DB
    const { data: { user } } = await supabase.auth.getUser();

    const insertData = {
      player_name: playerName,
      total_time: parseFloat((finalTime).toFixed(3)),
      user_id: user?.id
    };
    console.log('Attempting to save score:', insertData);

    const { data, error } = await supabase
      .from('lb_speedrefining')
      .insert([insertData])
      .select();

    if (error) {
      console.error('Error saving score:', error);
      showToast(t('speedRefining.save_failed', { error: error.message }), 'error');
    } else {
      console.log('Score saved successfully:', data);
    }

    fetchLeaderboard();
  };

  // Render Helpers
  const formatTime = (time: number) => time.toFixed(3);

  return (
    <div className="flex flex-col items-center justify-center min-h-[600px] w-full bg-stone-900 text-stone-100 p-4 rounded-xl font-mono relative overflow-hidden">

      {/* Header / Stats */}
      <div className="w-full flex justify-between items-start mb-6 px-4">
        <div className="flex flex-col">
          <h2 className="text-2xl font-bold text-amber-500 flex items-center gap-2">
            <Gamepad2 className="w-6 h-6" /> {t('speedRefining.title')}
          </h2>
          {gameState === 'playing' && (
            <div className="text-xl mt-2 font-mono">
              <span className="text-stone-400">{t('speedRefining.time')}: </span>
              <span className="text-white">{(currentTime + penaltyTime).toFixed(3)}s</span>
              {penaltyTime > 0 && (
                <span className="text-red-500 text-sm ml-2 animate-pulse">
                  (+{penaltyTime.toFixed(1)}s)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Game Area */}
      {gameState === 'start' && (
        <div className="flex flex-col items-center gap-6 z-10">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold text-white mb-2">{t('speedRefining.readyToRefine')}</h1>
            <p className="text-stone-400">{t('speedRefining.instructions')}</p>
          </div>

          <div className="flex flex-col gap-2 w-64">
            <label className="text-sm text-stone-400">{t('speedRefining.playerNameLabel')}</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => {
                setPlayerName(e.target.value);
                if (e.target.value.trim()) setShowNameError(false);
              }}
              className={`bg-stone-800 border ${showNameError ? 'border-red-500' : 'border-stone-600'} rounded px-3 py-2 text-white focus:border-amber-500 outline-none transition-colors`}
              placeholder={t('speedRefining.enterNamePlaceholder')}
            />
            {showNameError && (
              <span className="text-red-500 text-xs flex items-center gap-1 animate-fade-in">
                <AlertTriangle className="w-3 h-3" /> {t('speedRefining.nameRequired')}
              </span>
            )}
          </div>

          <button
            onClick={startGame}
            className="flex items-center gap-1 bg-stone-300 hover:bg-stone-400 text-stone-900 px-8 py-3 rounded-full font-bold text-lg transition-all transform hover:scale-105 shadow-lg shadow-black/20"
          >
            <span>{t('speedRefining.start_prefix')}</span>
            <img
              src="https://bybjhpiusfnjlbhiesrp.supabase.co/storage/v1/object/public/arcade/refinepowder.webp"
              alt="powder"
              className="w-9 h-9 object-contain"
              referrerPolicy="no-referrer"
            />
            <span>{t('speedRefining.start_suffix')}</span>
          </button>
        </div>
      )}

      {gameState === 'playing' && (
        <div className="relative">
          <button
            onClick={() => setGameState('start')}
            className="absolute -top-12 -right-4 p-2 text-stone-400 hover:text-white transition-colors"
            title={t('speedRefining.back')}
          >
            <X className="w-6 h-6" />
          </button>
          <div className={`grid grid-cols-5 gap-2 md:gap-3 p-4 bg-stone-800 rounded-xl border-2 border-stone-700 shadow-2xl ${shake ? 'animate-shake' : ''}`}>
            {gridNumbers.map((num) => {
              const isClicked = num < nextNumber;
              const isNext = num === nextNumber;

              return (
                <button
                  key={num}
                  onClick={() => handleNumberClick(num)}
                  disabled={isClicked}
                  className={`
                  relative w-12 h-12 md:w-16 md:h-16 rounded-lg flex items-center justify-center text-xl md:text-2xl font-bold transition-all duration-100
                  ${isClicked ? 'opacity-50 grayscale pointer-events-none' : 'opacity-100 hover:scale-105 active:scale-95'}
                `}
                  style={{
                    backgroundImage: `url(${getBackground(num)})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  <span className="text-stroke select-none">{num}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {gameState === 'end' && (
        <div className="flex flex-col items-center gap-6 z-10 animate-fade-in max-w-md w-full">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white mb-1">{t('speedRefining.complete')}</h2>
            <p className="text-stone-400 text-sm">{t('speedRefining.greatJob', { name: playerName })}</p>
          </div>

          <div className="grid grid-cols-3 gap-4 w-full">
            <div className="bg-stone-800 p-3 rounded-lg text-center border border-stone-700">
              <div className="text-xs text-stone-500 uppercase">{t('speedRefining.totalTime')}</div>
              <div className="text-xl font-bold text-amber-400">{(currentTime + penaltyTime).toFixed(3)}s</div>
            </div>
            <div className="bg-stone-800 p-3 rounded-lg text-center border border-stone-700">
              <div className="text-xs text-stone-500 uppercase">{t('speedRefining.playTime')}</div>
              <div className="text-xl font-bold text-white">{currentTime.toFixed(3)}s</div>
            </div>
            <div className="bg-stone-800 p-3 rounded-lg text-center border border-stone-700">
              <div className="text-xs text-stone-500 uppercase">{t('speedRefining.penalty')}</div>
              <div className="text-xl font-bold text-red-400">+{penaltyTime.toFixed(1)}s</div>
            </div>
          </div>

          {prediction && (
            <div className="bg-stone-800/80 p-4 rounded-xl border border-amber-500/30 w-full text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-50"></div>
              <p className="text-stone-300 text-sm mb-2">{t('speedRefining.forecast')}</p>
              <div className="flex items-center justify-center gap-2 text-lg font-medium text-white flex-wrap">
                <span>{t('speedRefining.nextRefining')}</span>
                <div
                  className="relative w-10 h-10 rounded flex items-center justify-center text-lg font-bold border border-stone-500 shadow-sm"
                  style={{
                    backgroundImage: `url(${getBackground(prediction.selectedNum)})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  <span className="text-stroke select-none text-white">{prediction.selectedNum}</span>
                </div>
                <span>{t('speedRefining.probabilityBoost')}</span>
                <span className="text-green-400 font-bold">{prediction.boostPercent}%</span>
              </div>
              {penaltyCount === 0 && (
                <div className="mt-2 text-xs text-amber-300 font-bold animate-pulse">
                  {t('speedRefining.perfectRun')}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setGameState('start')}
            className="flex items-center gap-2 bg-stone-700 hover:bg-stone-600 text-white px-6 py-2 rounded-lg transition-colors mt-2"
          >
            <ArrowLeft className="w-4 h-4" /> {t('speedRefining.back')}
          </button>
        </div>
      )}

      {/* Leaderboard (Bottom Center) */}
      {(gameState === 'start' || gameState === 'end') && (
        <div className="mt-8 w-full max-w-md bg-stone-800/50 p-4 rounded-xl border border-stone-700/50 backdrop-blur-sm animate-fade-in">
          <h3 className="text-lg font-bold text-amber-400 mb-3 flex items-center justify-center gap-2">
            <Medal className="w-5 h-5" /> {t('speedRefining.topRefiners')}
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {leaderboard.length > 0 ? (
              leaderboard.map((entry, idx) => (
                <div
                  key={entry.id}
                  className={`flex justify-between items-center p-2 rounded ${idx === 0 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-stone-900/30'}`}
                >
                  <div className="flex items-center gap-3">
                    {idx < 3 ? (
                      <div className={`w-7 h-7 flex items-center justify-center rounded-full shadow-inner ${idx === 0 ? 'bg-amber-500 text-stone-900' :
                        idx === 1 ? 'bg-stone-300 text-stone-900' :
                          'bg-amber-700 text-stone-100'
                        }`}>
                        <Gamepad2 className="w-4 h-4" />
                      </div>
                    ) : (
                      <span className="w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold bg-stone-700 text-stone-300">
                        {idx + 1}
                      </span>
                    )}
                    <span className="text-stone-200 font-medium">{entry.player_name}</span>
                  </div>
                  <span className="text-amber-400 font-mono font-bold">{entry.total_time.toFixed(3)}s</span>
                </div>
              ))
            ) : (
              <div className="text-center text-stone-500 py-4 italic">{t('speedRefining.no_records', 'No records yet')}</div>
            )}
          </div>
        </div>
      )}

      {/* Shake Animation Style */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out;
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
