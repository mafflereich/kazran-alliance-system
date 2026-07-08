
export interface DeductionResult {
  level: number;
  turn: number;
  borrow: number;
  deduction?: number;
}

const LANCELOT_SCORE = 49;
const SEASON_7_MAX_DEDUCTION = 450;
const SEASON_7_DEDUCTION_STEP = 25;

function findCombinations(remaining: number, evenRounds: boolean): { level: number; turn: number; borrow: number }[] {
  const results: { level: number; turn: number; borrow: number }[] = [];
  if (remaining <= 0) return results;

  for (let level = 1; level <= 10; level++) {
    const diffScore = level * 500;
    if (diffScore > remaining) continue;

    for (let turn = 1; turn <= 28; turn++) {
      if (!evenRounds && turn % 2 === 0) continue;
      const turnScore = 80 - (turn - 1) * 3;
      if (turnScore <= 0) continue;

      const borrowScores = [4, 3, 0];
      for (let borrow = 0; borrow < borrowScores.length; borrow++) {
        const borrowScore = borrowScores[borrow];
        if (diffScore + turnScore + borrowScore === remaining) {
          results.push({ level, turn, borrow });
        }
      }
    }
  }
  return results;
}

function computeSeasonSeven(targetScore: number, evenRounds: boolean): DeductionResult[] {
  const foundResults: DeductionResult[] = [];

  for (let D = 0; D <= SEASON_7_MAX_DEDUCTION; D += SEASON_7_DEDUCTION_STEP) {
    const remaining = targetScore - D - LANCELOT_SCORE;
    const combos = findCombinations(remaining, evenRounds);
    for (const combo of combos) {
      foundResults.push({ ...combo, deduction: D });
    }
  }

  return foundResults;
}

export function deduceScore(targetScore: number, t: any, evenRounds: boolean = true, isSeasonSeven: boolean = false): string {
  if (targetScore === 0) return '';

  if (isSeasonSeven) {
    // 優先使用單數回合結果；若沒有符合的，再嘗試包含雙數回合
    let foundResults = computeSeasonSeven(targetScore, evenRounds);
    if (foundResults.length === 0 && !evenRounds) {
      foundResults = computeSeasonSeven(targetScore, true);
    }

    if (foundResults.length === 0) return t('raid.deduction_unknown', '不明');

    return foundResults
      .sort((a, b) => {
        if ((b.deduction ?? 0) !== (a.deduction ?? 0)) return (b.deduction ?? 0) - (a.deduction ?? 0);
        if (b.level !== a.level) return b.level - a.level;
        if (a.turn !== b.turn) return a.turn - b.turn;
        return a.borrow - b.borrow;
      })
      .map(res => `Lv${res.level} ${res.turn}T ${t('raid.deduction_borrow', '借')}${res.borrow} (${res.deduction})`)
      .join('\n');
  }

  // 優先使用單數回合結果；若沒有符合的，再嘗試包含雙數回合
  let foundResults = findCombinations(targetScore, evenRounds);
  if (foundResults.length === 0 && !evenRounds) {
    foundResults = findCombinations(targetScore, true);
  }

  if (foundResults.length === 0) return t('raid.deduction_unknown', '不明');

  return foundResults
    .sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      if (a.turn !== b.turn) return a.turn - b.turn;
      return a.borrow - b.borrow;
    })
    .map(res => `Lv${res.level} ${res.turn}T ${t('raid.deduction_borrow', '借')}${res.borrow}`)
    .join('\n');
}
