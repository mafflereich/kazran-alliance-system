import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, AlertCircle, Copy, Check } from 'lucide-react';
import { logEvent } from '@/analytics';

interface CalculationResult {
  difficulty: number;
  turn: number;
  borrow: number;
}

interface ScoreCalculatorProps {
  label?: string;
  enableDefenseScore?: boolean;
  noBorder?: boolean;
}

const ResultItem = ({ item, t }: { item: CalculationResult, t: any }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = `${item.turn}T 借${item.borrow}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    logEvent('Toolbox', 'Copy Result', text);
  };

  return (
    <li className="text-sm text-stone-700 dark:text-stone-300 flex items-center justify-between px-2 py-1 hover:bg-stone-100 dark:hover:bg-stone-800 rounded group">
      <div className="flex items-center gap-2">
        <span className="font-mono font-medium">{item.turn}T </span>
        <span className="text-stone-500 dark:text-stone-400 text-xs">
          {t('toolbox:score_calculator.borrow', '借 {{count}}', { count: item.borrow })}
        </span>
      </div>
      <button
        onClick={handleCopy}
        className="p-1 text-stone-400 hover:text-amber-500 transition-colors opacity-100"
        title={t('common.copy', 'Copy')}
      >
        {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      </button>
    </li>
  );
};

const ScoreCalculator: React.FC<ScoreCalculatorProps> = ({ label, enableDefenseScore = false, noBorder = false }) => {
  const { t } = useTranslation(['toolbox', 'translation']);
  const [targetScore, setTargetScore] = useState<number | ''>('');
  const [defenseScore, setDefenseScore] = useState<number | ''>(450);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (targetScore && typeof targetScore === 'number') {
        const calculatorType = label ? `Score Calculator ${label}` : 'Score Calculator';
        logEvent('Toolbox', 'Calculate', calculatorType, targetScore);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [targetScore, label]);

  const results = useMemo(() => {
    if (!targetScore || typeof targetScore !== 'number') return [];

    let currentTarget = targetScore;
    if (enableDefenseScore && typeof defenseScore === 'number') {
      currentTarget -= defenseScore;
    }

    const LANCELOT_SCORE = 49;
    const remainingScore = currentTarget - LANCELOT_SCORE;
    const foundResults: CalculationResult[] = [];

    // Difficulty: Lv 1 to 10
    // Score = Lv * 500
    for (let diff = 1; diff <= 10; diff++) {
      const diffScore = diff * 500;
      if (diffScore > remainingScore) continue;

      // Turns: 1 to 28 (Score > 0)
      // Score = 80 - (T - 1) * 3
      for (let turn = 1; turn <= 28; turn++) {
        const turnScore = 80 - (turn - 1) * 3;
        if (turnScore <= 0) continue; // Should not happen if turn <= 27, but safe check

        // Borrow: 0, 1, 2
        // Score = [4, 3, 0]
        const borrowScores = [4, 3, 0];
        for (let borrow = 0; borrow < borrowScores.length; borrow++) {
          const borrowScore = borrowScores[borrow];

          if (diffScore + turnScore + borrowScore === remainingScore) {
            foundResults.push({
              difficulty: diff,
              turn: turn,
              borrow: borrow
            });
          }
        }
      }
    }

    return foundResults;
  }, [targetScore]);

  const groupedResults = useMemo(() => {
    const groups: Record<number, CalculationResult[]> = {};
    results.forEach(res => {
      if (!groups[res.difficulty]) {
        groups[res.difficulty] = [];
      }
      groups[res.difficulty].push(res);
    });
    return groups;
  }, [results]);

  return (
    <div className={`${noBorder ? '' : 'bg-white dark:bg-stone-800 rounded-xl shadow-sm border border-stone-200 dark:border-stone-700'} overflow-hidden`}>
      {!noBorder && (
        <div className="p-4 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/50 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-amber-600" />
          <h2 className="font-bold text-stone-800 dark:text-stone-200">
            {t('toolbox:score_calculator.title', '戰鬥分數反推計算機')} {label}
          </h2>
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Input Section */}
        <div className="space-y-4">
          <div className={`grid ${enableDefenseScore ? 'grid-cols-2 gap-4' : 'grid-cols-1'}`}>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
                {t('toolbox:score_calculator.target_score', '目標總分')}
              </label>
              <input
                type="number"
                value={targetScore}
                onChange={(e) => setTargetScore(e.target.value ? parseInt(e.target.value) : '')}
                placeholder="e.g., 2500"
                className="w-full p-3 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white dark:bg-stone-700 dark:text-stone-100 text-lg font-mono"
              />
            </div>
            {enableDefenseScore && (
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
                  {t('toolbox:score_calculator.defense_score', '防禦戰分數')}
                </label>
                <input
                  type="number"
                  value={defenseScore}
                  onChange={(e) => setDefenseScore(e.target.value ? parseInt(e.target.value) : '')}
                  placeholder="450"
                  className="w-full p-3 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white dark:bg-stone-700 dark:text-stone-100 text-lg font-mono"
                />
              </div>
            )}
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {enableDefenseScore
              ? t('toolbox:score_calculator.formula_hint_old', '公式：防禦戰 + 難度 + 回合 + 借人 + 蘭斯洛特')
              : t('toolbox:score_calculator.formula_hint', '公式：難度 + 回合 + 借人 + 蘭斯洛特')}
          </p>
        </div>

        {/* Results Section */}
        {targetScore !== '' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            {Object.keys(groupedResults).length > 0 ? (
              <div className="flex flex-col gap-4">
                {Object.entries(groupedResults).sort((a, b) => Number(b[0]) - Number(a[0])).map(([diff, items]) => (
                  <div key={diff} className="bg-stone-50 dark:bg-stone-900/30 rounded-lg border border-stone-200 dark:border-stone-700 overflow-hidden w-full">
                    <div className="bg-amber-100 dark:bg-amber-900/20 px-4 py-2 border-b border-amber-200 dark:border-amber-800/30">
                      <h3 className="font-bold text-amber-800 dark:text-amber-200 text-sm">
                        {t('toolbox:score_calculator.difficulty', '難度 Lv {{level}}', { level: diff })}
                      </h3>
                    </div>
                    <div className="p-3 max-h-60 overflow-y-auto custom-scrollbar">
                      <ul className="space-y-1">
                        {items.sort((a, b) => a.turn - b.turn).map((item, idx) => (
                          <ResultItem key={idx} item={item} t={t} />
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-900/30 rounded-lg border border-stone-200 dark:border-stone-700 border-dashed">
                <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                <p>{t('toolbox:score_calculator.no_results', '找不到符合此分數的組合，請檢查輸入是否正確')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScoreCalculator;
