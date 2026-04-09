import React from 'react';
import { useTranslation } from 'react-i18next';
import ScoreCalculator from '../components/ScoreCalculator';
import { FiendHunterBoard } from '../components/FiendHunterBoard';
import { Wrench } from 'lucide-react';

const Toolbox: React.FC = () => {
  const { t } = useTranslation(['toolbox', 'translation']);

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-900 flex flex-col font-sans">
      <main className="flex-1 container mx-auto px-4 sm:px-8 py-4 max-w-5xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
            <Wrench className="w-8 h-8 text-amber-600 dark:text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-stone-800 dark:text-stone-100">
              {t('toolbox:title', '小工具')}
            </h1>
            <p className="text-stone-500 dark:text-stone-400 mt-1">
              {t('toolbox:subtitle', '各種實用的輔助工具')}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Fiend Hunter Board */}
          <section className="w-full">
            <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100 mb-3">{t('toolbox:fiend_hunter.title')}</h2>
            <div className="flex justify-center">
              <FiendHunterBoard />
            </div>
          </section>

          {/* Score Calculators */}
          <section className="w-full">
            <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100 mb-3">{t('toolbox:score_calculator.title')}</h2>
            <div className="flex justify-center">
              <div className="w-full max-w-md">
                <ScoreCalculator />
              </div>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
};

export default Toolbox;
