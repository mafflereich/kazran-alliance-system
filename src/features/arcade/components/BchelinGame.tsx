// src/games/BchelinGame.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactGA from 'react-ga4';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/shared/api/supabase';
import { 
  Timer, 
  Trophy, 
  ChefHat, 
  Info, 
  ArrowRight, 
  User, 
  Flame, 
  CheckCircle2, 
  XCircle,
  ShoppingBag,
  UtensilsCrossed
} from 'lucide-react';
import {
  characters,
  badIngredients,
  recipes,
  ingredients as ingredientsList,
  difficultySettings,
  getWeightedRandomDrop,
  Difficulty,
  Recipe
} from '../assets/BchelinGameData';

// ────────────────────────────────────────────────
// UI Components
// ────────────────────────────────────────────────

const GlassCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl ${className}`}>
    {children}
  </div>
);

const Modal: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => (
  <motion.div 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
  >
    <motion.div 
      initial={{ scale: 0.9, y: 20 }}
      animate={{ scale: 1, y: 0 }}
      exit={{ scale: 0.9, y: 20 }}
      className="bg-stone-900 border border-stone-800 p-8 rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-y-auto text-stone-100 shadow-2xl"
    >
      {children}
      <button
        onClick={onClose}
        className="mt-8 w-full py-4 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-500 transition-colors shadow-lg shadow-orange-900/20"
      >
        我明白了
      </button>
    </motion.div>
  </motion.div>
);

// ────────────────────────────────────────────────
// Lobby Component
// ────────────────────────────────────────────────

const Lobby: React.FC<{
  onStart: (name: string, char: string, diff: Difficulty) => void;
}> = ({ onStart }) => {
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('bchelin_player_name') || '');
  const [selectedChar, setSelectedChar] = useState(characters[0].id);
  const [selectedDiff, setSelectedDiff] = useState<Difficulty>('Normal');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchLeaderboard(selectedDiff);
  }, [selectedDiff]);

  const fetchLeaderboard = async (diff: Difficulty) => {
    const { data } = await supabase
      .from('lb_bchelindishes')
      .select('*')
      .eq('difficulty', diff)
      .order('score', { ascending: false })
      .limit(5);
    setLeaderboard(data || []);
  };

  const handleStart = () => {
    if (playerName.trim() && selectedChar) {
      localStorage.setItem('bchelin_player_name', playerName.trim());
      onStart(playerName.trim(), selectedChar, selectedDiff);
    }
  };

  return (
    <div className="relative flex flex-col items-center min-h-[600px] w-full max-w-7xl mx-auto bg-stone-950 text-stone-100 p-6 overflow-x-hidden rounded-3xl border border-white/5 shadow-2xl">
      {/* Background Decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/10 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 text-center mt-8 mb-12"
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-bold uppercase tracking-widest mb-4">
          <ChefHat className="w-4 h-4" />
          Arcade Special
        </div>
        <h1 className="text-6xl md:text-8xl font-black tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-b from-white to-stone-500">
          B-CHELIN
        </h1>
        <p className="text-stone-500 font-mono text-sm mt-2 tracking-[0.3em] uppercase">Culinary Challenge</p>
      </motion.div>

      <div className="z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Setup */}
        <div className="lg:col-span-7 space-y-8">
          <GlassCard className="p-8">
            <h3 className="text-sm font-bold uppercase tracking-widest text-stone-500 mb-6 flex items-center gap-2">
              <User className="w-4 h-4" /> 01. Player Identity
            </h3>
            <input
              type="text"
              placeholder="ENTER YOUR NAME..."
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-stone-900/50 border-b-2 border-stone-800 p-4 text-2xl font-bold focus:outline-none focus:border-orange-500 transition-colors placeholder:text-stone-700"
            />

            <h3 className="text-sm font-bold uppercase tracking-widest text-stone-500 mt-10 mb-6 flex items-center gap-2">
              <ChefHat className="w-4 h-4" /> 02. Select Chef
            </h3>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
              {characters.map((char) => (
                <motion.div
                  key={char.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedChar(char.id)}
                  className={`relative cursor-pointer aspect-[3/4] rounded-2xl overflow-hidden border-2 transition-all ${
                    selectedChar === char.id 
                      ? 'border-orange-500 ring-4 ring-orange-500/20' 
                      : 'border-stone-800 grayscale hover:grayscale-0 opacity-50 hover:opacity-100'
                  }`}
                >
                  <img src={char.image} alt={char.name} className="w-full h-full object-cover" />
                  <div className={`absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-2 transition-opacity ${selectedChar === char.id ? 'opacity-100' : 'opacity-0'}`}>
                    <p className="text-[10px] font-bold uppercase truncate">{char.name}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <h3 className="text-sm font-bold uppercase tracking-widest text-stone-500 mt-10 mb-6 flex items-center gap-2">
              <Flame className="w-4 h-4" /> 03. Difficulty
            </h3>
            <div className="flex p-1 bg-stone-900/80 rounded-xl border border-stone-800">
              {(['Easy', 'Normal', 'Hard'] as const).map((diff) => (
                <button
                  key={diff}
                  onClick={() => setSelectedDiff(diff)}
                  className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${
                    selectedDiff === diff
                      ? 'bg-orange-600 text-white shadow-lg'
                      : 'text-stone-500 hover:text-stone-300'
                  }`}
                >
                  {diff.toUpperCase()}
                </button>
              ))}
            </div>
          </GlassCard>

          <div className="flex gap-4">
            <button
              onClick={() => setShowModal(true)}
              className="flex-1 py-5 bg-stone-900 border border-stone-800 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-stone-800 transition-colors"
            >
              <Info className="w-5 h-5" /> HOW TO PLAY
            </button>
            <button
              onClick={handleStart}
              disabled={!playerName.trim() || !selectedChar}
              className={`flex-[2] py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all shadow-2xl ${
                playerName.trim() && selectedChar
                  ? 'bg-orange-600 text-white hover:bg-orange-500 shadow-orange-900/20'
                  : 'bg-stone-800 text-stone-600 cursor-not-allowed'
              }`}
            >
              START CHALLENGE <ArrowRight className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Right Column: Leaderboard */}
        <div className="lg:col-span-5">
          <GlassCard className="p-8 h-full">
            <h3 className="text-sm font-bold uppercase tracking-widest text-stone-500 mb-8 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" /> Hall of Fame ({selectedDiff})
            </h3>
            
            <div className="space-y-4">
              {leaderboard.map((entry, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={i} 
                  className="flex items-center justify-between p-4 rounded-xl bg-stone-900/50 border border-stone-800/50"
                >
                  <div className="flex items-center gap-4">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-xs ${
                      i === 0 ? 'bg-amber-500 text-black' : 
                      i === 1 ? 'bg-stone-300 text-black' : 
                      i === 2 ? 'bg-orange-800 text-white' : 'bg-stone-800 text-stone-500'
                    }`}>
                      0{i + 1}
                    </span>
                    <span className="font-bold tracking-tight">{entry.player_name}</span>
                  </div>
                  <span className="font-mono text-orange-500 font-bold">{entry.score.toLocaleString()}</span>
                </motion.div>
              ))}
              {leaderboard.length === 0 && (
                <div className="py-20 text-center text-stone-600 italic font-mono text-sm">
                  No records found for this difficulty.
                </div>
              )}
            </div>

            <div className="mt-12 p-6 rounded-2xl bg-orange-500/5 border border-orange-500/10">
              <p className="text-xs text-orange-400/60 font-mono leading-relaxed">
                SYSTEM_NOTICE: HIGH SCORES ARE RECORDED IN REAL-TIME. CHEATING WILL RESULT IN DISQUALIFICATION FROM THE B-CHELIN GUIDE.
              </p>
            </div>
          </GlassCard>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <Modal onClose={() => setShowModal(false)}>
            <div className="text-center mb-8">
              <ChefHat className="w-12 h-12 text-orange-500 mx-auto mb-4" />
              <h2 className="text-4xl font-black tracking-tighter italic">KITCHEN RULES</h2>
            </div>
            
            <div className="space-y-6 text-stone-400 font-medium">
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-lg bg-stone-800 flex items-center justify-center text-orange-500 font-bold shrink-0">1</div>
                <p>限時 <span className="text-white font-bold">60 秒</span>，左右移動接取掉落的食材。</p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-lg bg-stone-800 flex items-center justify-center text-orange-500 font-bold shrink-0">2</div>
                <p>收集上方顯示的 <span className="text-white font-bold">目標食材</span> 來完成料理，獲得巨額加分。</p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-lg bg-stone-800 flex items-center justify-center text-orange-500 font-bold shrink-0">3</div>
                <p><span className="text-red-500 font-bold">壞食材</span> 會導致扣分，請務必閃避！</p>
              </div>
            </div>

            <h3 className="text-sm font-bold uppercase tracking-widest text-stone-500 mt-12 mb-6">危險食材 (DANGER)</h3>
            <div className="grid grid-cols-3 gap-4">
              {badIngredients.map((bad) => (
                <div key={bad.name} className="p-4 rounded-2xl bg-stone-800/50 border border-red-900/20 flex flex-col items-center text-center">
                  <img src={bad.image} alt={bad.name} className="w-12 h-12 object-contain mb-2" />
                  <p className="text-[10px] font-bold uppercase text-stone-300">{bad.name}</p>
                  <p className="text-xs font-mono text-red-500 mt-1">{bad.penalty} PTS</p>
                </div>
              ))}
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
};

// ────────────────────────────────────────────────
// PlayArea Component
// ────────────────────────────────────────────────
interface DropItem {
  id: string;
  x: number;
  y: number;
  item: any;
  grounded?: boolean;
  groundedTime?: number;
}

const PlayArea: React.FC<{
  playerName: string;
  selectedChar: string;
  difficulty: Difficulty;
  onGameOver: (score: number, completed: string[]) => void;
}> = ({ playerName, selectedChar, difficulty, onGameOver }) => {
  const [timeLeft, setTimeLeft] = useState(60);
  const [score, setScore] = useState(0);
  const [backpack, setBackpack] = useState<Record<string, number>>({});
  const [currentRecipeIndex, setCurrentRecipeIndex] = useState(0);
  const currentRecipe = recipes[difficulty][currentRecipeIndex];
  const [completedRecipes, setCompletedRecipes] = useState<string[]>([]);
  const [drops, setDrops] = useState<DropItem[]>([]);
  const [playerX, setPlayerX] = useState(50);
  const [flashRed, setFlashRed] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const charImage = characters.find(c => c.id === selectedChar)?.image || '';

  // 計時器
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 遊戲結束觸發
  useEffect(() => {
    if (timeLeft === 0) {
      onGameOver(score, completedRecipes);
    }
  }, [timeLeft, score, completedRecipes, onGameOver]);

  // 主遊戲迴圈
  useEffect(() => {
    const gameLoop = () => {
      const now = Date.now();
      const settings = difficultySettings[difficulty];

      // 生成掉落物
      // 提升當前料理所需食材的出現率
      const neededIngredients = currentRecipe.ingredients;
      const isNeeded = (item: any) => neededIngredients.includes(item.id);
      
      // 基礎機率 + 額外加權
      const dropChance = settings.density / 60;
      
      if (Math.random() < dropChance) {
        let item = getWeightedRandomDrop(difficulty);
        
        // 如果隨機到的不是目標食材，有 50% 機率強制換成目標食材之一
        if (!isNeeded(item) && Math.random() < 0.5) {
          const neededId = neededIngredients[Math.floor(Math.random() * neededIngredients.length)];
          item = getIngredientInfo(neededId) || item;
        }

        setDrops(prev => [...prev, {
          id: now.toString() + Math.random(),
          x: Math.random() * 90 + 5,
          y: -15,
          item,
        }]);
      }

      setDrops(prev => {
        const nextDrops: DropItem[] = [];
        
        // 玩家判定區域 (百分比)
        // 調整判定框位置與大小，使其更貼近玩家手部/腰部區域
        const playerHitbox = {
          xMin: playerX - 8.5,
          xMax: playerX + 8.5,
          yMin: 88,
          yMax: 96
        };

        for (const drop of prev) {
          let updatedDrop = { ...drop };
          
          if (drop.grounded) {
            // 已落地的物品在 1.2 秒後消失
            if (now - (drop.groundedTime ?? 0) > 1200) continue;
            nextDrops.push(updatedDrop);
            continue;
          }

          // 更新位置
          const newY = drop.y + settings.dropSpeed;
          if (newY >= 92) {
            updatedDrop = { ...drop, y: 92, grounded: true, groundedTime: now };
          } else {
            updatedDrop = { ...drop, y: newY };
          }

          // 過濾：食材頂部到 88% 以下才開始檢查碰撞
          if (updatedDrop.y < 88) {
            nextDrops.push(updatedDrop);
            continue;
          }

          // 食材 hitbox：偏移減小到 +6（用下 60% 左右判定）
          const itemHitbox = {
            xMin: updatedDrop.x - 7,
            xMax: updatedDrop.x + 7,
            yMin: updatedDrop.y + 6,
            yMax: updatedDrop.y + 14.5
          };

          // 保險：食材有效底部必須至少到玩家框上緣
          if (itemHitbox.yMax < playerHitbox.yMin) {
            nextDrops.push(updatedDrop);
            continue;
          }

          // AABB 碰撞偵測
          const isColliding = !(
            itemHitbox.xMax < playerHitbox.xMin ||
            itemHitbox.xMin > playerHitbox.xMax ||
            itemHitbox.yMax < playerHitbox.yMin ||
            itemHitbox.yMin > playerHitbox.yMax
          );

          if (isColliding) {
            handleCatch(updatedDrop.item);
            // 被接住後不加入 nextDrops
          } else {
            nextDrops.push(updatedDrop);
          }
        }
        return nextDrops;
      });

      rafRef.current = requestAnimationFrame(gameLoop);
    };

    rafRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playerX, difficulty]);

  const handleCatch = (item: any) => {
    if ('penalty' in item) {
      setScore(prev => prev + item.penalty);
      setFlashRed(true);
      setTimeout(() => setFlashRed(false), 400);
    } else {
      setBackpack(prev => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }));
      setScore(prev => prev + 2);
    }
  };

  const [isTransitioning, setIsTransitioning] = useState(false);

  // 檢查食譜完成
  useEffect(() => {
    const needed = currentRecipe.ingredients;
    if (!isTransitioning && needed.every(ing => (backpack[ing] ?? 0) >= 1)) {
      setIsTransitioning(true);
      
      setBackpack(prev => {
        const newBp = { ...prev };
        needed.forEach(ing => {
          newBp[ing] = (newBp[ing] ?? 0) - 1;
          if (newBp[ing] <= 0) delete newBp[ing];
        });
        return newBp;
      });
      
      setScore(prev => prev + 100);
      setCompletedRecipes(prev => [...prev, currentRecipe.name]);
      
      setTimeout(() => {
        setCurrentRecipeIndex(prev => (prev + 1) % recipes[difficulty].length);
        setIsTransitioning(false);
      }, 500); // 0.5秒過場
    }
  }, [backpack, currentRecipe, difficulty, isTransitioning]);

  // 輸入控制
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a')
        setPlayerX(p => Math.max(5, p - 6));
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd')
        setPlayerX(p => Math.min(95, p + 6));
    };

    const moveByPointer = (clientX: number) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const percent = ((clientX - rect.left) / rect.width) * 100;
      setPlayerX(Math.max(5, Math.min(95, percent)));
    };

    const onMouseMove = (e: MouseEvent) => moveByPointer(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) moveByPointer(e.touches[0].clientX);
    };

    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  // 獲取食材資訊
  const getIngredientInfo = (id: string) => {
    for (const cat in ingredientsList) {
      const found = ingredientsList[cat].find(i => i.id === id);
      if (found) return found;
    }
    return null;
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full max-w-7xl mx-auto p-4">
      {/* Left: Game Area */}
      <div ref={canvasRef} className="relative flex-1 h-[600px] bg-stone-950 overflow-hidden select-none font-sans rounded-3xl border border-white/5 shadow-2xl">
        {/* Background Layer */}
        <div className="absolute inset-0 bg-[url('https://image-bd2db.souseha.com/common/pngs/UR_rank.webp')] bg-cover bg-center opacity-10" />
        <div className="absolute inset-0 bg-gradient-to-b from-stone-950/80 via-transparent to-stone-950/80" />

        {/* Top HUD - Simplified */}
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-40">
          <GlassCard className="px-6 py-4 flex items-center gap-8">
            <div className="flex items-center gap-3">
              <Timer className={`w-6 h-6 ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-orange-500'}`} />
              <span className="text-2xl font-black italic font-mono">{timeLeft}s</span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="flex items-center gap-3">
              <Trophy className="w-6 h-6 text-amber-500" />
              <span className="text-2xl font-black italic font-mono">{score.toLocaleString()}</span>
            </div>
          </GlassCard>
        </div>

        {/* Game Elements */}
        <div className="absolute inset-0 pointer-events-none">
          {drops.map(drop => (
            <motion.div
              key={drop.id}
              initial={false}
              animate={{ 
                left: `${drop.x}%`, 
                top: `${drop.y}%`,
                opacity: drop.grounded ? 0.4 : 1,
                scale: drop.grounded ? 0.8 : 1
              }}
              className="absolute w-20 h-20 flex items-center justify-center"
              style={{ transform: 'translateX(-50%)', zIndex: drop.grounded ? 5 : 20 }}
            >
              <img
                src={drop.item.image}
                alt={drop.item.name}
                className="w-full h-full object-contain drop-shadow-2xl"
              />
              {'penalty' in drop.item && !drop.grounded && (
                <div className="absolute inset-0 rounded-full bg-red-500/10 animate-ping" />
              )}
            </motion.div>
          ))}

          {/* Player */}
          <motion.div
            animate={{ left: `${playerX}%` }}
            transition={{ type: 'tween', duration: 0 }}
            className={`absolute bottom-8 w-32 h-32 flex items-center justify-center pointer-events-none ${
              flashRed ? 'animate-shake' : ''
            }`}
            style={{ transform: 'translateX(-50%)', zIndex: 30 }}
          >
            <img
              src={charImage}
              alt="Chef"
              className={`w-full h-full object-contain transition-all duration-200 ${
                flashRed ? 'brightness-150 saturate-200 sepia-[0.5] hue-rotate-[-30deg]' : 'drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]'
              }`}
            />
            {flashRed && (
              <motion.div 
                initial={{ opacity: 0, y: 0 }}
                animate={{ opacity: 1, y: -50 }}
                className="absolute top-0 text-red-500 font-black text-2xl italic"
              >
                Ouch!
              </motion.div>
            )}
          </motion.div>

          {/* Debug Collision Area */}
          {playerName === 'TEST' && (
            <div 
              className="absolute border-4 border-green-500 bg-green-500/30 pointer-events-none z-50"
              style={{
                left: `${playerX - 8.5}%`,
                top: '88%',
                width: '17%',
                height: '8%',
              }}
            />
          )}
        </div>
      </div>

      {/* Right: Info Panel */}
      <div className="w-full lg:w-80 flex flex-col gap-6">
        {/* Target Recipe Card */}
        <motion.div 
          key={currentRecipe.name}
          initial={{ x: 50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
        >
          <GlassCard className="p-6 overflow-hidden border-orange-500/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                <UtensilsCrossed className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Current Order</p>
                <h4 className="font-bold text-lg truncate">{currentRecipe.name}</h4>
              </div>
            </div>
            
            <div className="relative aspect-video rounded-2xl overflow-hidden mb-6 border border-white/10 shadow-inner">
              <img src={currentRecipe.image} alt={currentRecipe.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">Required Ingredients</p>
              {currentRecipe.ingredients.map(ingId => {
                const info = getIngredientInfo(ingId);
                const count = backpack[ingId] ?? 0;
                return (
                  <div key={ingId} className={`flex items-center justify-between p-2 rounded-xl border transition-colors ${count > 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-stone-900/50 border-white/5'}`}>
                    <div className="flex items-center gap-3">
                      <img src={info?.image} alt={info?.name} className="w-6 h-6 object-contain" />
                      <span className={`text-sm font-medium ${count > 0 ? 'text-green-400' : 'text-stone-400'}`}>{info?.name}</span>
                    </div>
                    {count > 0 ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500 animate-bounce" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-stone-800" />
                    )}
                  </div>
                );
              })}
              {isTransitioning && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1.1 }}
                  className="absolute inset-0 flex items-center justify-center bg-green-900/80 rounded-2xl z-50"
                >
                  <span className="text-white font-black text-3xl italic tracking-widest">COMPLETED!</span>
                </motion.div>
              )}
            </div>
          </GlassCard>
        </motion.div>

        {/* Backpack Card */}
        <GlassCard className="p-6 flex-1">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
              <ShoppingBag className="w-5 h-5 text-blue-500" />
            </div>
            <h4 className="font-bold text-sm uppercase tracking-widest">Inventory</h4>
          </div>
          
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(backpack).length === 0 && (
              <div className="col-span-4 py-10 text-center">
                <p className="text-xs text-stone-600 font-mono italic">Backpack empty...</p>
              </div>
            )}
            {Object.entries(backpack).map(([id, count]) => {
              const info = getIngredientInfo(id);
              return (
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  key={id} 
                  className="relative aspect-square rounded-xl bg-stone-900/50 border border-white/5 flex items-center justify-center group"
                >
                  <img src={info?.image} alt={info?.name} className="w-8 h-8 object-contain group-hover:scale-110 transition-transform" />
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-600 text-[10px] font-bold flex items-center justify-center border border-stone-950">
                    {count}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </GlassCard>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(-50%) rotate(0deg); }
          25% { transform: translateX(-52%) rotate(-5deg); }
          75% { transform: translateX(-48%) rotate(5deg); }
        }
        .animate-shake {
          animation: shake 0.1s infinite;
        }
      `}</style>
    </div>
  );
};

// ────────────────────────────────────────────────
// GameOver Component
// ────────────────────────────────────────────────
const GameOver: React.FC<{
  score: number;
  completedRecipes: string[];
  hasUploaded: boolean;
  onBack: () => void;
}> = ({ score, completedRecipes, hasUploaded, onBack }) => {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[600px] w-full max-w-7xl mx-auto bg-stone-950 text-stone-100 p-6 overflow-hidden rounded-3xl border border-white/5 shadow-2xl">
      <div className="absolute inset-0 bg-gradient-to-b from-orange-900/20 to-transparent pointer-events-none" />
      
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="z-10 text-center"
      >
        <ChefHat className="w-20 h-20 text-orange-500 mx-auto mb-6" />
        <h1 className="text-7xl font-black tracking-tighter italic mb-4">SERVICE ENDED</h1>
        <p className="text-stone-500 font-mono tracking-[0.5em] uppercase mb-12">Final Evaluation</p>

        <div className="mb-12">
          <p className="text-stone-400 text-sm uppercase tracking-widest mb-2">Total Score</p>
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-8xl font-black italic text-orange-500 font-mono"
          >
            {score.toLocaleString()}
          </motion.div>
        </div>

        {completedRecipes.length > 0 && (
          <div className="mb-12 max-w-2xl mx-auto">
            <h2 className="text-sm font-bold uppercase tracking-widest text-stone-500 mb-6 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" /> Dishes Served
            </h2>
            <div className="flex flex-wrap justify-center gap-3">
              {Array.from(new Set(completedRecipes)).map((r, i) => (
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  key={i} 
                  className="px-6 py-3 bg-stone-900 border border-stone-800 rounded-2xl font-bold italic flex items-center gap-2"
                >
                  <UtensilsCrossed className="w-4 h-4 text-orange-500" />
                  {r}
                  <span className="ml-2 text-xs text-stone-600 font-mono">
                    x{completedRecipes.filter(name => name === r).length}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {!hasUploaded ? (
          <div className="flex items-center gap-3 text-stone-500 font-mono text-sm animate-pulse">
            <div className="w-4 h-4 border-2 border-stone-500 border-t-transparent rounded-full animate-spin" />
            SYNCHRONIZING_DATA...
          </div>
        ) : (
          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1 }}
            onClick={onBack}
            className="px-16 py-6 bg-orange-600 text-white text-xl font-black italic rounded-2xl shadow-2xl shadow-orange-900/40 hover:bg-orange-500 transition-all flex items-center gap-4"
          >
            RETURN TO LOBBY <ArrowRight className="w-6 h-6" />
          </motion.button>
        )}
      </motion.div>
    </div>
  );
};

// ────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────
const BchelinGame: React.FC = () => {
  const [screen, setScreen] = useState<'lobby' | 'play' | 'over'>('lobby');
  const [playerName, setPlayerName] = useState('');
  const [selectedChar, setSelectedChar] = useState('');
  const [selectedDiff, setSelectedDiff] = useState<Difficulty>('Normal');
  const [finalScore, setFinalScore] = useState(0);
  const [completedRecipes, setCompletedRecipes] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleStart = (name: string, char: string, diff: Difficulty) => {
    setPlayerName(name);
    setSelectedChar(char);
    setSelectedDiff(diff);
    ReactGA.event({ category: 'Game', action: 'Start', label: `${diff} - ${char}` });
    setScreen('play');
    
    // 考慮 header 高度 (假設 header 約 80px)
    setTimeout(() => {
      const headerOffset = 80;
      const elementPosition = containerRef.current?.getBoundingClientRect().top ?? 0;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }, 100);
  };

  const [hasUploadedScore, setHasUploadedScore] = useState(false);

  useEffect(() => {
    if (screen === 'over' && !hasUploadedScore) {
      const upload = async () => {
        if (finalScore === 0 && completedRecipes.length === 0) return;

        try {
          await supabase.from('lb_bchelindishes').insert({
            player_name: playerName,
            score: finalScore,
            difficulty: selectedDiff,
            character_used: selectedChar,
          });
        } catch (err) {
          console.error('上傳失敗', err);
        } finally {
          setHasUploadedScore(true);
        }
      };

      upload();
    }
  }, [screen, hasUploadedScore, finalScore, completedRecipes, playerName, selectedDiff, selectedChar]);

  const handleGameOver = (score: number, completed: string[]) => {
    setFinalScore(score);
    setCompletedRecipes(completed);
    setScreen('over');
  };

  const handleBack = () => {
    setScreen('lobby');
    setHasUploadedScore(false); // 重置上傳旗標
  };

  return (
    <div ref={containerRef} className="w-full h-full">
      <AnimatePresence mode="wait">
        {screen === 'lobby' && (
          <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Lobby onStart={handleStart} />
          </motion.div>
        )}
        {screen === 'play' && (
          <motion.div key="play" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <PlayArea
              playerName={playerName}
              selectedChar={selectedChar}
              difficulty={selectedDiff}
              onGameOver={handleGameOver}
            />
          </motion.div>
        )}
        {screen === 'over' && (
          <motion.div key="over" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <GameOver
              score={finalScore}
              completedRecipes={completedRecipes}
              hasUploaded={hasUploadedScore}
              onBack={handleBack}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BchelinGame;
