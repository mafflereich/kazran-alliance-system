import React from 'react';
import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="py-6 px-4 text-center text-[10px] text-stone-400 leading-relaxed">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="space-y-1">
          <p>{t('footer.copyright')}</p>
          <p>{t('footer.disclaimer')}</p>
        </div>
      </div>
    </footer>
  );
}
