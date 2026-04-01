export const getTierTextColor = (tier: Number) => {
  const genericGradient = `font-medium transition-colors
    bg-clip-text text-transparent
    bg-[length:200%_auto] animate-[gradient-x_6s_ease_infinite]`;

  switch (tier) {
    case 1: return `bg-gradient-to-r from-[#e23513] via-[#ff7e3f] to-[#e23513] ${genericGradient}`;
    case 2: return `bg-gradient-to-r from-[#5fd3b0] via-[#3a6fe4] to-[#5fd3b0] ${genericGradient}`;
    case 3: return `bg-gradient-to-r from-[#b43939] via-[#5ea4cf] to-[#b43939] ${genericGradient}`;
    case 4: return `bg-gradient-to-r from-[#19d166] via-[#9f22f8] to-[#19d166] ${genericGradient}`;
    default: return `bg-gradient-to-r from-[#000000] via-[#000000] to-[#000000] ${genericGradient}`;
  }
}

export const getTierColor = (tier: number) => {
  switch (tier) {
    case 1: return 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-200 dark:border-orange-800';
    case 2: return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800';
    case 3: return 'bg-stone-200 dark:bg-stone-600 text-stone-800 dark:text-stone-200 border-stone-300 dark:border-stone-800';
    case 4: return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800';
    default: return 'bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border-stone-200 dark:border-stone-700';
  }
};

export const getTierTextColorDark = (tier: number) => {
  switch (tier) {
    case 1: return 'text-orange-400';
    case 2: return 'text-blue-400';
    case 3: return 'text-stone-400';
    case 4: return 'text-green-400';
    default: return 'text-stone-500';
  }
};

export const getTierHighlightClass = (tier: number) => {
  switch (tier) {
    case 1: return 'bg-orange-500/10 text-orange-500';
    case 2: return 'bg-blue-500/10 text-blue-500';
    case 3: return 'bg-stone-500/10 text-stone-400';
    case 4: return 'bg-green-500/10 text-green-500';
    default: return 'bg-stone-500/10 text-stone-400';
  }
};

export const getTierHoverClass = (tier: number) => {
  switch (tier) {
    case 1: return 'hover:bg-orange-500/10 hover:text-orange-400';
    case 2: return 'hover:bg-blue-500/10 hover:text-blue-400';
    case 3: return 'hover:bg-stone-500/10 hover:text-stone-300';
    case 4: return 'hover:bg-green-500/10 hover:text-green-400';
    default: return 'hover:bg-stone-800 hover:text-white';
  }
};

export const getTierBorderHoverClass = (tier: number) => {
  switch (tier) {
    case 1: return 'hover:border-orange-400 hover:bg-orange-50/30 dark:hover:bg-orange-900/20';
    case 2: return 'hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-900/20';
    case 3: return 'hover:border-stone-400 hover:bg-stone-50/30 dark:hover:bg-stone-700/30';
    case 4: return 'hover:border-green-400 hover:bg-green-50/30 dark:hover:bg-green-900/20';
    default: return 'hover:border-amber-300 hover:bg-stone-100 dark:hover:bg-stone-800';
  }
};

export const getTierTextHoverClass = (tier: number) => {
  switch (tier) {
    case 1: return 'group-hover:text-orange-600 dark:group-hover:text-orange-400';
    case 2: return 'group-hover:text-blue-600 dark:group-hover:text-blue-400';
    case 3: return 'group-hover:text-stone-600 dark:group-hover:text-stone-400';
    case 4: return 'group-hover:text-green-600 dark:group-hover:text-green-400';
    default: return 'group-hover:text-amber-700 dark:group-hover:text-amber-400';
  }
};

export const truncateName = (name: string, maxLength: number = 10) => {
  let currentLength = 0;
  let truncated = '';
  for (let i = 0; i < name.length; i++) {
    const char = name[i];
    // Check if character is full-width (approximate check)
    const isFullWidth = /[^\x00-\xff]/.test(char);
    currentLength += isFullWidth ? 2 : 1;
    if (currentLength > maxLength) {
      return truncated + '...';
    }
    truncated += char;
  }
  return name;
};

export const getImageUrl = (imageName: string | undefined | null) => {
  if (!imageName) return '/costumes/default.png';
  // Strip extension if present, then append .webp
  const baseName = imageName.replace(/\.[^/.]+$/, "");
  return `https://image-bd2db.souseha.com/characters/${baseName}.webp`;
};

export const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
};

export const cn = (...cnArr: String[]) => {
  return cnArr.join(" ");
}