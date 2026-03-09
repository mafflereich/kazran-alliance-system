export type Difficulty = 'Easy' | 'Normal' | 'Hard';

export interface Character {
  id: string;
  name: string;
  image: string;
}

export interface Ingredient {
  id: string;
  name: string;
  image: string;
  weight: number;
  penalty?: number;
}

export interface Recipe {
  name: string;
  ingredients: string[];
  image: string;
}

export const characters: Character[] = [
  { id: 'justia', name: '悠絲緹亞', image: 'https://image-bd2db.souseha.com/characters/Justia_5_idle.webp' },
  { id: 'refithea', name: '芮彼泰雅', image: 'https://image-bd2db.souseha.com/characters/Refithea_2_idle.webp' },
  { id: 'darian', name: '達麗安', image: 'https://image-bd2db.souseha.com/characters/Darian_2_idle.webp' },
  { id: 'wilhelmina', name: '威廉明娜', image: 'https://image-bd2db.souseha.com/characters/Wilhelmina_2_idle.webp' },
  { id: 'nebris', name: '內布利斯', image: 'https://image-bd2db.souseha.com/characters/Nebris_3_idle.webp' },
];

export const badIngredients = [
  { name: '煤', image: 'https://image-bd2db.souseha.com/new_items/icon_resource214_35.webp', penalty: -10 },
  { name: '泥炭', image: 'https://image-bd2db.souseha.com/new_items/icon_resource204_30.webp', penalty: -15 },
  { name: '魅惑粉末', image: 'https://image-bd2db.souseha.com/new_items/icon_food1060_60.webp', penalty: -20 },
  // ... 添加更多壞食材圖鑑
];

export const recipes: Record<Difficulty, Recipe[]> = {
  Easy: [
    { name: '地獄火海苔飯捲', ingredients: ['rice', 'pepper', 'seasonedSeaweed'], image: 'https://image-bd2db.souseha.com/new_items/icon_food3014_14.webp' },
    { name: '透明化沙拉', ingredients: ['bean', 'onion', 'paprika'], image: 'https://image-bd2db.souseha.com/new_items/icon_food3004_4.webp' },
    { name: '閃耀西班牙蒜味蝦', ingredients: ['shrimp', 'mushroom', 'tomato'], image: 'https://image-bd2db.souseha.com/new_items/icon_food3003_3.webp' },
    { name: '煤炭餅乾', ingredients: ['butter', 'sugar', 'wheat'], image: 'https://image-bd2db.souseha.com/new_items/icon_food3002_2.webp' },
    { name: '盧戈烤山蔘串', ingredients: ['beastMeat', 'mushroom', 'paprika'], image: 'https://image-bd2db.souseha.com/new_items/icon_food3001_1.webp' },
  ],
  Normal: [
    { name: '地獄火海苔飯捲', ingredients: ['rice', 'pepper', 'seasonedSeaweed', 'capsaicin'], image: 'https://image-bd2db.souseha.com/new_items/icon_food3014_14.webp' },
    { name: '透明化沙拉', ingredients: ['bean', 'onion', 'paprika', 'oliveOil'], image: 'https://image-bd2db.souseha.com/new_items/icon_food3004_4.webp' },
    { name: '閃耀西班牙蒜味蝦', ingredients: ['shrimp', 'mushroom', 'tomato', 'oliveOil'], image: 'https://image-bd2db.souseha.com/new_items/icon_food3003_3.webp' },
    { name: '煤炭餅乾', ingredients: ['butter', 'sugar', 'wheat', 'egg'], image: 'https://image-bd2db.souseha.com/new_items/icon_food3002_2.webp' },
    { name: '盧戈烤山蔘串', ingredients: ['beastMeat', 'mushroom', 'paprika', 'chiliSauce'], image: 'https://image-bd2db.souseha.com/new_items/icon_food3001_1.webp' },
  ],
  Hard: [
    { name: '地獄火海苔飯捲', ingredients: ['rice', 'pepper', 'seasonedSeaweed', 'capsaicin', 'rare1'], image: 'https://image-bd2db.souseha.com/new_items/icon_food3014_14.webp' },
    { name: '透明化沙拉', ingredients: ['bean', 'onion', 'paprika', 'oliveOil', 'rare2'], image: 'https://image-bd2db.souseha.com/new_items/icon_food3004_4.webp' },
    { name: '閃耀西班牙蒜味蝦', ingredients: ['shrimp', 'mushroom', 'tomato', 'oliveOil', 'rare3'], image: 'https://image-bd2db.souseha.com/new_items/icon_food3003_3.webp' },
    { name: '煤炭餅乾', ingredients: ['butter', 'sugar', 'wheat', 'egg', 'rare4'], image: 'https://image-bd2db.souseha.com/new_items/icon_food3002_2.webp' },
    { name: '盧戈烤山蔘串', ingredients: ['beastMeat', 'mushroom', 'paprika', 'chiliSauce', 'rare5'], image: 'https://image-bd2db.souseha.com/new_items/icon_food3001_1.webp' },
  ],
};

export const ingredients: { [key: string]: Ingredient[] } = {
  rare: [
    { id: 'rare1', name: '地獄火醬汁', image: 'https://image-bd2db.souseha.com/new_items/icon_food1066_66.webp', weight: 5 },
    { id: 'rare2', name: '透明的蘑菇', image: 'https://image-bd2db.souseha.com/new_items/icon_food1056_56.webp', weight: 5 },
    { id: 'rare3', name: '閃爍的粉末', image: 'https://image-bd2db.souseha.com/new_items/icon_food1055_55.webp', weight: 5 },
    { id: 'rare4', name: '生命的木炭', image: 'https://image-bd2db.souseha.com/new_items/icon_food1054_54.webp', weight: 5 },
    { id: 'rare5', name: '盧戈山參', image: 'https://image-bd2db.souseha.com/new_items/icon_food1053_53.webp', weight: 5 },
  ],
  commonSpecific: [
    { id: 'rice', name: '米', image: 'https://image-bd2db.souseha.com/new_items/icon_food1010_10.webp', weight: 15 },
    { id: 'pepper', name: '辣椒', image: 'https://image-bd2db.souseha.com/new_items/icon_food1037_37.webp', weight: 15 },
    { id: 'seasonedSeaweed', name: '包裝好的海苔', image: 'https://image-bd2db.souseha.com/new_items/icon_food1042_42.webp', weight: 15 },
    { id: 'capsaicin', name: '辣椒素', image: 'https://image-bd2db.souseha.com/new_items/icon_food1050_50.webp', weight: 15 },
    { id: 'bean', name: '豆子', image: 'https://image-bd2db.souseha.com/new_items/icon_food1007_7.webp', weight: 15 },
    { id: 'onion', name: '洋蔥', image: 'https://image-bd2db.souseha.com/new_items/icon_food1016_16.webp', weight: 15 },
    { id: 'shrimp', name: '淡水蝦', image: 'https://image-bd2db.souseha.com/new_items/icon_food1003_3.webp', weight: 15 },
    { id: 'tomato', name: '蕃茄', image: 'https://image-bd2db.souseha.com/new_items/icon_food1020_20.webp', weight: 15 },
    { id: 'butter', name: '奶油', image: 'https://image-bd2db.souseha.com/new_items/icon_food1026_26.webp', weight: 15 },
    { id: 'sugar', name: '糖', image: 'https://image-bd2db.souseha.com/new_items/icon_food1023_23.webp', weight: 15 },
    { id: 'wheat', name: '小麥', image: 'https://image-bd2db.souseha.com/new_items/icon_food1004_4.webp', weight: 15 },
    { id: 'egg', name: '雞蛋', image: 'https://image-bd2db.souseha.com/new_items/icon_food1025_25.webp', weight: 15 },
    { id: 'beastMeat', name: '獸肉', image: 'https://image-bd2db.souseha.com/new_items/icon_food1001_1.webp', weight: 15 },
    { id: 'chiliSauce', name: '辣醬', image: 'https://image-bd2db.souseha.com/new_items/icon_food1033_33.webp', weight: 15 },
  ],
  commonVersatile: [
    { id: 'paprika', name: '甜椒', image: 'https://image-bd2db.souseha.com/new_items/icon_food1017_17.webp', weight: 25 },
    { id: 'oliveOil', name: '橄欖油', image: 'https://image-bd2db.souseha.com/new_items/icon_food1032_32.webp', weight: 25 },
    { id: 'mushroom', name: '蘑菇', image: 'https://image-bd2db.souseha.com/new_items/icon_food1013_13.webp', weight: 25 },
  ],
  uselessDecoy: [
    { id: 'herb', name: '草藥', image: 'https://image-bd2db.souseha.com/new_items/icon_food1005_5.webp', weight: 20 },
    { id: 'eaglesFeather', name: '禿鷲的羽毛', image: 'https://image-bd2db.souseha.com/new_items/icon_food1059_59.webp', weight: 20 },
    { id: 'pangolinScale', name: '穿山甲的鱗片', image: 'https://image-bd2db.souseha.com/new_items/icon_food1057_57.webp', weight: 20 },
  ],
  bad: badIngredients.map(b => ({ ...b, id: b.name.toLowerCase().replace(/\s/g, '-'), weight: 10 })),
};

// 加權隨機掉落函數
export function getWeightedRandomDrop(difficulty: Difficulty | string) {
  const allDrops = [
    ...ingredients.rare,
    ...ingredients.commonSpecific,
    ...ingredients.commonVersatile,
    ...ingredients.uselessDecoy,
    ...ingredients.bad,
  ];
  const totalWeight = allDrops.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of allDrops) {
    random -= item.weight;
    if (random <= 0) return item;
  }
  return allDrops[0]; // 預防邊界
}

// 難度參數
export const difficultySettings: Record<Difficulty, { dropSpeed: number; density: number; recipeSize: number; badRatio: number }> = {
  Easy: { dropSpeed: 1.2, density: 1.5, recipeSize: 3, badRatio: 0.1 },
  Normal: { dropSpeed: 1.8, density: 2.5, recipeSize: 4, badRatio: 0.2 },
  Hard: { dropSpeed: 2.5, density: 4, recipeSize: 5, badRatio: 0.3 },
};