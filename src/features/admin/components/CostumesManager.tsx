import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '@/store';
import { Plus, Trash2, Save, ArrowUp, Check, GripVertical } from 'lucide-react';
import ConfirmModal from '@shared/ui/ConfirmModal';
import InputModal from '@shared/ui/InputModal';
import { getImageUrl } from '@/shared/lib/utils';
import { Reorder } from "motion/react";
import { Character, Costume } from '@/entities/member/types';
import { useTranslation } from 'react-i18next';

export default function CostumesManager() {
  const { t, i18n } = useTranslation(['admin', 'translation']);
  const { db, addCharacter, updateCharacter, deleteCharacter, addCostume, updateCostume, deleteCostume, updateCharactersOrder, updateCostumesOrder, showToast } = useAppContext();
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedCostumeId, setSelectedCostumeId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    isDanger: false
  });

  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  const characters = useMemo(() =>
    Object.values(db.characters).sort((a, b) => a.orderNum - b.orderNum),
    [db.characters]);

  const costumes = useMemo(() =>
    Object.values(db.costumes)
      .filter(c => c.characterId === selectedCharacterId)
      .sort((a, b) => (a.orderNum ?? 999) - (b.orderNum ?? 999)),
    [db.costumes, selectedCharacterId]);

  const selectedCharacter = selectedCharacterId ? db.characters[selectedCharacterId] : null;
  const selectedCostume = selectedCostumeId ? db.costumes[selectedCostumeId] : null;

  // Edit states
  const [editCharacterName, setEditCharacterName] = useState('');
  const [editCharacterNameE, setEditCharacterNameE] = useState('');
  const [editCharacterOrder, setEditCharacterOrder] = useState(0);
  const [editCostumeName, setEditCostumeName] = useState('');
  const [editCostumeNameE, setEditCostumeNameE] = useState('');
  const [editCostumeOrder, setEditCostumeOrder] = useState(0);
  const [editCostumeImageName, setEditCostumeImageName] = useState('');
  const [editCostumeIsNew, setEditCostumeIsNew] = useState(false);

  // Reorder & Input Modal State
  const [isReorderingCharacters, setIsReorderingCharacters] = useState(false);
  const [orderedCharacters, setOrderedCharacters] = useState<Character[]>([]);
  const [isReorderingCostumes, setIsReorderingCostumes] = useState(false);
  const [orderedCostumes, setOrderedCostumes] = useState<Costume[]>([]);
  const [saveSuccess, setSaveSuccess] = useState<'character' | 'costume' | null>(null);

  const [inputModal, setInputModal] = useState<{
    isOpen: boolean;
    title: string;
    message?: string;
    onConfirm: (value: string) => void;
  }>({ isOpen: false, title: '', onConfirm: () => { } });

  const closeInputModal = () => setInputModal(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    if (!isReorderingCharacters) {
      setOrderedCharacters(characters);
    }
  }, [characters, isReorderingCharacters]);

  useEffect(() => {
    if (!isReorderingCostumes) {
      setOrderedCostumes(costumes);
    }
  }, [costumes, isReorderingCostumes]);

  const handleSaveCharacterOrder = async () => {
    setIsReorderingCharacters(false);
    setSaveSuccess('character');
    setTimeout(() => setSaveSuccess(null), 2000);
    try {
      await updateCharactersOrder(orderedCharacters);
    } catch (error: any) {
      showToast(`${t('costumes.reorder_failed')}: ${error.message}`, 'error');
    }
  };

  const handleSaveCostumeOrder = async () => {
    setIsReorderingCostumes(false);
    setSaveSuccess('costume');
    setTimeout(() => setSaveSuccess(null), 2000);
    try {
      await updateCostumesOrder(orderedCostumes);
    } catch (error: any) {
      showToast(`${t('costumes.reorder_failed')}: ${error.message}`, 'error');
    }
  };

  useEffect(() => {
    if (selectedCharacter) {
      setEditCharacterName(selectedCharacter.name);
      setEditCharacterNameE(selectedCharacter.nameE ?? '');
      setEditCharacterOrder(selectedCharacter.orderNum);
    } else {
      setSelectedCharacterId(null);
    }
  }, [selectedCharacter]);

  useEffect(() => {
    if (selectedCostume) {
      setEditCostumeName(selectedCostume.name);
      setEditCostumeNameE(selectedCostume.nameE ?? '');
      setEditCostumeOrder(selectedCostume.orderNum ?? 0);
      setEditCostumeImageName(selectedCostume.imageName ?? '');
      setEditCostumeIsNew(selectedCostume.isNew ?? false);
    } else {
      setSelectedCostumeId(null);
    }
  }, [selectedCostume]);

  const handleSelectCharacter = (id: string) => {
    setSelectedCharacterId(id);
    setSelectedCostumeId(null);
  };

  const handleAddCharacter = () => {
    setInputModal({
      isOpen: true,
      title: t('costumes.add_character'),
      message: `${t('costumes.add_character')}:`,
      onConfirm: async (name) => {
        try {
          await addCharacter(name, characters.length + 1);
          closeInputModal();
          showToast(t('costumes.add_character_success'), 'success');
        } catch (error: any) {
          showToast(`${t('costumes.add_character_failed')}: ${error.message}`, 'error');
        }
      }
    });
  };

  const handleDeleteCharacter = async () => {
    if (!selectedCharacterId) return;

    setConfirmModal({
      isOpen: true,
      title: t('costumes.delete_character'),
      message: t('costumes.confirm_delete_character'),
      isDanger: true,
      onConfirm: async () => {
        try {
          // Cascade delete costumes
          const characterCostumes = Object.values(db.costumes).filter(c => c.characterId === selectedCharacterId);
          for (const costume of characterCostumes) {
            await deleteCostume(costume.id);
          }

          await deleteCharacter(selectedCharacterId);
          setSelectedCharacterId(null);
          setSelectedCostumeId(null);
          closeConfirmModal();
          showToast(t('costumes.delete_character_success'), 'success');
        } catch (error: any) {
          console.error("Error deleting character:", error);
          showToast(`${t('costumes.delete_character_failed')}: ${error.message}`, 'error');
          closeConfirmModal();
        }
      }
    });
  };

  const handleUpdateCharacter = async () => {
    if (!selectedCharacterId) return;
    await updateCharacter(selectedCharacterId, {
      name: editCharacterName,
      nameE: editCharacterNameE,
      orderNum: editCharacterOrder
    });
    showToast(t('costumes.update_character_success'), 'success');
  };

  const handleAddCostume = () => {
    if (!selectedCharacterId) return;
    setInputModal({
      isOpen: true,
      title: t('costumes.add_costume'),
      message: `${t('costumes.add_costume')}:`,
      onConfirm: async (name) => {
        try {
          await addCostume(selectedCharacterId, name, costumes.length + 1);
          closeInputModal();
          showToast(t('costumes.add_costume_success'), 'success');
        } catch (error: any) {
          showToast(`${t('costumes.add_costume_failed')}: ${error.message}`, 'error');
        }
      }
    });
  };

  const handleDeleteCostume = async () => {
    if (!selectedCostumeId) return;

    setConfirmModal({
      isOpen: true,
      title: t('costumes.delete_costume'),
      message: t('costumes.confirm_delete_costume'),
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteCostume(selectedCostumeId);
          setSelectedCostumeId(null);
          closeConfirmModal();
          showToast(t('costumes.delete_costume_success'), 'success');
        } catch (error: any) {
          showToast(`${t('costumes.delete_costume_failed')}: ${error.message}`, 'error');
          closeConfirmModal();
        }
      }
    });
  };

  const [isCostumeSaved, setIsCostumeSaved] = useState(false);

  const handleUpdateCostume = async () => {
    if (!selectedCostumeId) return;
    await updateCostume(selectedCostumeId, {
      name: editCostumeName,
      nameE: editCostumeNameE,
      orderNum: editCostumeOrder,
      imageName: editCostumeImageName,
      isNew: editCostumeIsNew
    });
    setIsCostumeSaved(true);
    setTimeout(() => setIsCostumeSaved(false), 2000);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 text-stone-800 dark:text-stone-200">{t('nav.costume_db')}</h2>
      <div className="grid grid-cols-12 gap-6 h-[600px]">
        {/* Characters Column */}
        <div className="col-span-3 bg-stone-50 dark:bg-stone-700 rounded-xl border border-stone-200 dark:border-stone-600 p-4 overflow-y-auto flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">{t('costumes.character')}</h3>
            <div className="flex gap-1">
              {saveSuccess === 'character' && (
                <div className="p-1.5 text-emerald-600 flex items-center justify-center" title={t('common.save_success')}>
                  <Check className="w-4 h-4" />
                </div>
              )}
              <button
                onClick={() => isReorderingCharacters ? handleSaveCharacterOrder() : setIsReorderingCharacters(true)}
                className={`p-1.5 rounded-lg transition-colors ${isReorderingCharacters ? 'bg-amber-200 text-amber-800' : 'bg-stone-200 dark:bg-stone-600 hover:bg-stone-300 dark:hover:bg-stone-500 text-stone-700 dark:text-stone-300'}`}
                title={isReorderingCharacters ? t('costumes.save_order') : t('costumes.reorder_character')}
              >
                {isReorderingCharacters ? <Save className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
              </button>
              <button onClick={handleAddCharacter} className="p-1.5 bg-stone-200 dark:bg-stone-600 hover:bg-stone-300 dark:hover:bg-stone-500 rounded-lg transition-colors" title={t('costumes.add_character')}>
                <Plus className="w-4 h-4 text-stone-700 dark:text-stone-300" />
              </button>
            </div>
          </div>

          {isReorderingCharacters ? (
            <div className="flex-1 overflow-y-auto flex flex-col">
              <Reorder.Group axis="y" values={orderedCharacters} onReorder={setOrderedCharacters} className="space-y-2 flex-1">
                {orderedCharacters.map(char => (
                  <Reorder.Item key={char.id} value={char} className="bg-white dark:bg-stone-800 p-2 rounded-lg shadow-sm border border-stone-200 dark:border-stone-600 flex items-center gap-3 cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-4 h-4 text-stone-400 dark:text-stone-500" />
                    <img src={getImageUrl(Object.values(db.costumes).find(c => c.characterId === char.id)?.imageName)} alt={char.name} className="w-8 h-8 rounded-md object-cover" />
                    <span>{i18n.language === 'en' ? (char.nameE || char.name) : char.name}</span>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
              <div className="mt-4 flex gap-2 sticky bottom-0 bg-stone-50 dark:bg-stone-700 pt-2">
                <button onClick={handleSaveCharacterOrder} className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700">{t('common.save')}</button>
                <button onClick={() => setIsReorderingCharacters(false)} className="flex-1 py-2 bg-stone-200 dark:bg-stone-600 text-stone-600 dark:text-stone-300 rounded-lg text-sm hover:bg-stone-300 dark:hover:bg-stone-500">{t('common.cancel')}</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 flex-1 overflow-y-auto">
              {characters.map(char => (
                <button
                  key={char.id}
                  onClick={() => handleSelectCharacter(char.id)}
                  className={`w-full text-left p-2 rounded-lg flex items-center gap-3 ${selectedCharacterId === char.id ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300' : 'hover:bg-stone-200 dark:hover:bg-stone-600'}`}>
                  <img src={getImageUrl(Object.values(db.costumes).find(c => c.characterId === char.id)?.imageName)} alt={char.name} className="w-10 h-10 rounded-md object-cover" />
                  <span>{i18n.language === 'en' ? (char.nameE || char.name) : char.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Costumes Column */}
        <div className="col-span-4 bg-stone-50 dark:bg-stone-700 rounded-xl border border-stone-200 dark:border-stone-600 p-4 overflow-y-auto flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">{selectedCharacter ? (i18n.language === 'en' ? (selectedCharacter.nameE || selectedCharacter.name) : selectedCharacter.name) : t('costumes.costume')}</h3>
            {selectedCharacterId && (
              <div className="flex gap-1">
                {saveSuccess === 'costume' && (
                  <div className="p-1.5 text-emerald-600 flex items-center justify-center" title={t('common.save_success')}>
                    <Check className="w-4 h-4" />
                  </div>
                )}
                <button
                  onClick={() => isReorderingCostumes ? handleSaveCostumeOrder() : setIsReorderingCostumes(true)}
                  className={`p-1.5 rounded-lg transition-colors ${isReorderingCostumes ? 'bg-amber-200 text-amber-800' : 'bg-stone-200 dark:bg-stone-600 hover:bg-stone-300 dark:hover:bg-stone-500 text-stone-700 dark:text-stone-300'}`}
                  title={isReorderingCostumes ? t('costumes.save_order') : t('costumes.reorder_costume')}
                >
                  {isReorderingCostumes ? <Save className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                </button>
                <button onClick={handleAddCostume} className="p-1.5 bg-stone-200 dark:bg-stone-600 hover:bg-stone-300 dark:hover:bg-stone-500 rounded-lg transition-colors" title={t('costumes.add_costume')}>
                  <Plus className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                </button>
              </div>
            )}
          </div>
          {selectedCharacterId && (
            isReorderingCostumes ? (
              <div className="flex-1 overflow-y-auto flex flex-col">
                <Reorder.Group axis="y" values={orderedCostumes} onReorder={setOrderedCostumes} className="space-y-2 flex-1">
                  {orderedCostumes.map(costume => (
                    <Reorder.Item key={costume.id} value={costume} className="bg-white dark:bg-stone-800 p-2 rounded-lg shadow-sm border border-stone-200 dark:border-stone-600 flex items-center gap-3 cursor-grab active:cursor-grabbing">
                      <GripVertical className="w-4 h-4 text-stone-400 dark:text-stone-500" />
                      <img src={getImageUrl(costume.imageName)} alt={costume.name} className="w-8 h-8 rounded-md object-cover" />
                      <span>{i18n.language === 'en' ? (costume.nameE || costume.name) : costume.name}</span>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
                <div className="mt-4 flex gap-2 sticky bottom-0 bg-stone-50 dark:bg-stone-700 pt-2">
                  <button onClick={handleSaveCostumeOrder} className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700">{t('common.save')}</button>
                  <button onClick={() => setIsReorderingCostumes(false)} className="flex-1 py-2 bg-stone-200 dark:bg-stone-600 text-stone-600 dark:text-stone-300 rounded-lg text-sm hover:bg-stone-300 dark:hover:bg-stone-500">{t('common.cancel')}</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 flex-1 overflow-y-auto">
                {costumes.map(costume => (
                  <button
                    key={costume.id}
                    onClick={() => setSelectedCostumeId(costume.id)}
                    className={`w-full text-left p-2 rounded-lg flex items-center gap-3 ${selectedCostumeId === costume.id ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300' : 'hover:bg-stone-200 dark:hover:bg-stone-600'}`}>
                    <img src={getImageUrl(costume.imageName)} alt={costume.name} className="w-10 h-10 rounded-md object-cover" />
                    <span>{i18n.language === 'en' ? (costume.nameE || costume.name) : costume.name}</span>
                    {costume.isNew && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">NEW</span>}
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        {/* Edit Column */}
        <div className="col-span-5 bg-stone-50 dark:bg-stone-700 rounded-xl border border-stone-200 dark:border-stone-600 p-4 overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4">{t('common.edit')}</h3>
          {selectedCostume && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">{t('costumes.costume_name')}</label>
                <input type="text" value={editCostumeName} onChange={e => setEditCostumeName(e.target.value)} className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">{t('costumes.costume_name')} (EN)</label>
                <input type="text" value={editCostumeNameE} onChange={e => setEditCostumeNameE(e.target.value)} className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">{t('costumes.order')}</label>
                <input type="number" value={editCostumeOrder} onChange={e => setEditCostumeOrder(Number(e.target.value))} className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">{t('costumes.image_name')}</label>
                <input type="text" value={editCostumeImageName} onChange={e => setEditCostumeImageName(e.target.value)} className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100" />
              </div>
              <div className="flex items-center">
                <input type="checkbox" id="isNew" checked={editCostumeIsNew} onChange={e => setEditCostumeIsNew(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                <label htmlFor="isNew" className="ml-2 block text-sm text-stone-900 dark:text-stone-200">{t('costumes.mark_new')}</label>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleUpdateCostume}
                  className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors flex items-center justify-center gap-2 ${isCostumeSaved ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                >
                  {isCostumeSaved ? <><Check className="w-4 h-4" /> {t('common.save_success')}</> : t('costumes.save_costume')}
                </button>
                <button onClick={handleDeleteCostume} className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200" title={t('costumes.delete_costume')}>
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
          {selectedCharacter && !selectedCostume && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">{t('costumes.character_name')}</label>
                <input type="text" value={editCharacterName} onChange={e => setEditCharacterName(e.target.value)} className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">{t('costumes.character_name')} (EN)</label>
                <input type="text" value={editCharacterNameE} onChange={e => setEditCharacterNameE(e.target.value)} className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">{t('costumes.order')}</label>
                <input type="number" value={editCharacterOrder} onChange={e => setEditCharacterOrder(Number(e.target.value))} className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleUpdateCharacter} className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700">{t('costumes.save_character')}</button>
                <button onClick={handleDeleteCharacter} className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200" title={t('costumes.delete_character')}>
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmModal}
        isDanger={confirmModal.isDanger}
      />
      <InputModal
        isOpen={inputModal.isOpen}
        title={inputModal.title}
        message={inputModal.message}
        onConfirm={inputModal.onConfirm}
        onCancel={closeInputModal}
      />
    </div>
  );
}
