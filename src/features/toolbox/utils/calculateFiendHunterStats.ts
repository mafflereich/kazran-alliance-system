export interface FiendHunterStatsResult {
  requiredDamage: number;
  strikesPerLevel: number[];
}

/**
 * 計算魔獸戰所需的最低一刀傷害與各關卡出刀數
 * 
 * @param hps 各關卡魔獸的血量陣列
 * @param fiendDays 限定的總天數
 * @returns 包含最低需求傷害 (精確到小數點後兩位) 與各關卡出刀數的物件
 */
export function calculateFiendHunterStats(hps: number[], fiendDays: number): FiendHunterStatsResult {
  if (!hps || hps.length === 0 || fiendDays <= 0) {
    return { requiredDamage: 0, strikesPerLevel: [] };
  }

  // 計算給定傷害下所需的總天數
  const calculateDays = (damage: number): number => {
    let totalStrikes = 0;
    for (const hp of hps) {
      totalStrikes += Math.ceil(hp / damage);
    }
    // 總花費天數 = (各關卡出刀數的總和) - (N - 1)
    return totalStrikes - (hps.length - 1);
  };

  // 為了精確到小數點後兩位，我們將搜尋範圍放大 100 倍以整數進行二元搜尋
  let low = 1; // 代表 0.01 傷害
  let high = Math.max(...hps) * 100; // 最大傷害只需等於最大血量 (一刀秒殺)
  let optimalDamageInt = high;

  // 如果連最大傷害 (每天一刀秒殺，總天數為 1) 都無法滿足條件，則直接回傳最大傷害
  if (calculateDays(high / 100) > fiendDays) {
    const requiredDamage = high / 100;
    return {
      requiredDamage,
      strikesPerLevel: hps.map(hp => Math.ceil(hp / requiredDamage))
    };
  }

  // 二元搜尋最低需求傷害
  while (low <= high) {
    const mid = Math.floor(low + (high - low) / 2);
    const damage = mid / 100;
    const days = calculateDays(damage);

    if (days <= fiendDays) {
      // 如果天數符合要求，記錄此傷害，並嘗試尋找更低的傷害
      optimalDamageInt = mid;
      high = mid - 1;
    } else {
      // 如果天數超過要求，代表傷害不夠，需要提高下界
      low = mid + 1;
    }
  }

  const requiredDamage = optimalDamageInt / 100;
  const strikesPerLevel = hps.map(hp => Math.ceil(hp / requiredDamage));

  return {
    requiredDamage,
    strikesPerLevel
  };
}
