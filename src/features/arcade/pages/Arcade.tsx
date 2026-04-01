import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Gamepad2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/store';
import SpeedRefining from '../components/SpeedRefining';
import RefineSimulator from '../components/RefineSimulator';
import BchelinGame from '../components/BchelinGame';

export default function Arcade() {
  const { t } = useTranslation('arcade');
  const navigate = useNavigate();
  const { userRole } = useAppContext();
  const [activeGame, setActiveGame] = useState<string | null>(null);

  const isCreator = userRole === 'creator';

  switch (activeGame) {
    case 'speed-refining':
      return (
        <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col items-center p-4">
          <div className="w-full max-w-4xl">
            <button
              onClick={() => setActiveGame(null)}
              className="flex items-center gap-2 text-stone-400 hover:text-white mb-6 transition-colors self-start"
            >
              <ArrowLeft className="w-5 h-5" />
              {t('back_to_arcade', 'Back to Arcade Games')}
            </button>
            <SpeedRefining />
          </div>
        </div>
      );
    case 'refine-simulator':
      return (
        <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col items-center p-4">
          <div className="w-full max-w-4xl">
            <button
              onClick={() => setActiveGame(null)}
              className="flex items-center gap-2 text-stone-400 hover:text-white mb-6 transition-colors self-start"
            >
              <ArrowLeft className="w-5 h-5" />
              {t('back_to_arcade', 'Back to Arcade Games')}
            </button>
            <RefineSimulator />
          </div>
        </div>
      );
    case 'bchelin-game':
      if (!isCreator) {
        return (
          <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center p-4">
            <div className="text-center">
              <Gamepad2 className="w-20 h-20 text-stone-600 mx-auto mb-4 animate-pulse" />
              <h2 className="text-2xl font-bold mb-2">開發中...</h2>
              <p className="text-stone-400 mb-6">此遊戲目前僅限開發者進入測試。</p>
              <button
                onClick={() => setActiveGame(null)}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
              >
                返回遊戲大廳
              </button>
            </div>
          </div>
        );
      }
      return (
        <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col items-center p-4">
          <div className="w-full max-w-6xl">
            <button
              onClick={() => setActiveGame(null)}
              className="flex items-center gap-2 text-stone-400 hover:text-white mb-6 transition-colors self-start"
            >
              <ArrowLeft className="w-5 h-5" />
              {t('back_to_arcade', 'Back to Arcade Games')}
            </button>
            <BchelinGame />
          </div>
        </div>
      );
  }





  return (
    <div className="p-6 max-w-6xl mx-auto">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 mb-6 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        {t('back_to_homepage', 'Back to Homepage')}
      </button>

      <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100 mb-6 flex items-center gap-2">
        <Gamepad2 className="w-8 h-8 text-amber-500" />
        {t('title', 'Arcade Games')}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Speed Refining Game Card */}
        <div
          onClick={() => setActiveGame('speed-refining')}
          className="group bg-white dark:bg-stone-800 rounded-xl shadow-md border border-stone-200 dark:border-stone-700 overflow-hidden cursor-pointer hover:shadow-xl hover:border-amber-500 transition-all transform hover:-translate-y-1"
        >
          <div className="h-40 bg-stone-900 relative flex items-center justify-center overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-20 bg-[url('https://image-bd2db.souseha.com/common/pngs/UR_rank.webp')] bg-cover bg-center"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-stone-900 to-transparent"></div>
            <Gamepad2 className="w-16 h-16 text-amber-500 drop-shadow-lg group-hover:scale-110 transition-transform duration-300" />
          </div>
          <div className="p-6">
            <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100 mb-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
              {t('refining_race', 'Speed Refining')}
            </h2>
            <p className="text-stone-600 dark:text-stone-400 text-sm line-clamp-2">
              {t('refining_race_desc', 'Test your reflexes! Click numbers 0-24 in order as fast as you can. Watch out for penalties!')}
            </p>
            <div className="mt-4 flex items-center text-xs font-medium text-amber-600 dark:text-amber-400">
              <span>{t('play_now', 'Play Now')}</span>
              <ArrowLeft className="w-3 h-3 ml-1 rotate-180" />
            </div>
          </div>
        </div>
        <div
          onClick={() => setActiveGame('refine-simulator')}
          className="group bg-white dark:bg-stone-800 rounded-xl shadow-md border border-stone-200 dark:border-stone-700 overflow-hidden cursor-pointer hover:shadow-xl hover:border-amber-500 transition-all transform hover:-translate-y-1"
        >
          <div className="h-40 bg-stone-900 relative flex items-center justify-center overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-40 bg-[url('https://image-bd2db.souseha.com/weapons_new/thumbs/icon_equipment4504_88_thumb.webp')] bg-cover bg-center"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-stone-900 to-transparent"></div>
            <Gamepad2 className="w-16 h-16 text-amber-500 drop-shadow-lg group-hover:scale-110 transition-transform duration-300" />
          </div>
          <div className="p-6">
            <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100 mb-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
              {t('refine_simulator', 'Refine Simulator')}
            </h2>
            <p className="text-stone-600 dark:text-stone-400 text-sm">
              {t('refine_simulator_desc', 'Good Luck')}
            </p>
            <div className="mt-4 flex items-center text-xs font-medium text-amber-600 dark:text-amber-400">
              <span>{t('play_now', 'Play Now')}</span>
              <ArrowLeft className="w-3 h-3 ml-1 rotate-180" />
            </div>
          </div>
        </div>

        {/* Bchelin Game Card */}
        <div
          onClick={() => setActiveGame('bchelin-game')}
          className="group bg-white dark:bg-stone-800 rounded-xl shadow-md border border-stone-200 dark:border-stone-700 overflow-hidden cursor-pointer hover:shadow-xl hover:border-amber-500 transition-all transform hover:-translate-y-1"
        >
          <div className="h-40 bg-stone-900 relative flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 opacity-40 bg-[url('https://image-bd2db.souseha.com/characters/Justia_5_idle.webp')] bg-cover bg-center"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-stone-900 to-transparent"></div>
            <div className="absolute top-2 right-2 px-2 py-1 bg-amber-600 text-white text-[10px] font-bold rounded uppercase tracking-wider">
              Under Dev
            </div>
            <Gamepad2 className="w-16 h-16 text-amber-500 drop-shadow-lg group-hover:scale-110 transition-transform duration-300" />
          </div>
          <div className="p-6">
            <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100 mb-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
              {isCreator ? 'B其林料理 (B-chelin)' : '開發中小遊戲'}
            </h2>
            <p className="text-stone-600 dark:text-stone-400 text-sm line-clamp-2">
              {isCreator ? '採集食材，完成傳說中的料理！目前開發中，僅限創作者進入測試。' : '此遊戲目前正在開發中，敬請期待。'}
            </p>
            <div className="mt-4 flex items-center text-xs font-medium text-amber-600 dark:text-amber-400">
              <span>{isCreator ? t('play_now', 'Play Now') : '開發中'}</span>
              <ArrowLeft className="w-3 h-3 ml-1 rotate-180" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
