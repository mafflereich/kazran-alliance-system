
export interface DeductionResult {
  level: number;
  turn: number;
  borrow: number;
}

export function deduceScore(targetScore: number, t: any, evenRounds: boolean = true): string {
  if (targetScore === 0) return '';

  /* 
  賽季7限定，先扣450分。賽季7完結後刪此段
  const SEASON_7_DEDUCTION = 450;
  const LANCELOT_SCORE = 49;
  const adjustedTargetScore = targetScore - SEASON_7_DEDUCTION;
  const remainingScore = adjustedTargetScore - LANCELOT_SCORE;
  */
  
  const foundResults: DeductionResult[] = [];

  // Difficulty: Lv 1 to 10
  for (let level = 1; level <= 10; level++) {
    const diffScore = level * 500;
    if (diffScore > targetScore) continue;

    // Turns: 1 to 28
    for (let turn = 1; turn <= 28; turn++) {
      if (!evenRounds && turn % 2 === 0) continue;
      const turnScore = 80 - (turn - 1) * 3;
      if (turnScore <= 0) continue;

      // Borrow: 0, 1, 2
      const borrowScores = [4, 3, 0];
      for (let borrow = 0; borrow < borrowScores.length; borrow++) {
        const borrowScore = borrowScores[borrow];

        if (diffScore + turnScore + borrowScore === targetScore) {
          foundResults.push({
            level,
            turn,
            borrow
          });
        }
      }
    }
  }

  if (foundResults.length === 0) return t('raid.deduction_unknown', '不明');

  // Sort results by level (desc) then turn (asc) then borrow (asc)
  return foundResults
    .sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      if (a.turn !== b.turn) return a.turn - b.turn;
      return a.borrow - b.borrow;
    })
    .map(res => `Lv${res.level} ${res.turn}T ${t('raid.deduction_borrow', '借')}${res.borrow}`)
    .join('\n');
}
