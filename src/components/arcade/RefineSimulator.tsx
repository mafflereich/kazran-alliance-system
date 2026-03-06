import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Part, Weapon, WEAPONS } from './assets/RefineSimulatorEquipments.ts';

// --- Types & Constants ---
type Grade = 'C' | 'B' | 'A' | 'S';
type RecordEntry = { maxScore: number; maxLog: string };
type Records = Record<string, RecordEntry>;
type SuccessInfo = { times: number; powder: number; score: number };

const PROBABILITIES: Record<Grade, number> = { C: 0.48, B: 0.49, A: 0.025, S: 0.005 };
const VALUES: Record<Grade, [number, number, number]> = { C: [1, 2, 3], B: [2, 4, 6], A: [3, 6, 9], S: [4, 8, 12] };
const GRADE_IMAGES: Record<Grade, string> = {
    C: 'https://image-bd2db.souseha.com/common/pngs/icon_C.webp',
    B: 'https://image-bd2db.souseha.com/common/pngs/icon_B.webp',
    A: 'https://image-bd2db.souseha.com/common/pngs/icon_A.webp',
    S: 'https://image-bd2db.souseha.com/common/pngs/icon_S.webp',
};
const RANK_BGS = {
    UR: 'https://image-bd2db.souseha.com/common/pngs/UR_rank.webp',
    SR: 'https://image-bd2db.souseha.com/common/pngs/SR_rank.webp',
    R: 'https://image-bd2db.souseha.com/common/pngs/R_rank.webp',
    N: 'https://image-bd2db.souseha.com/common/pngs/N_rank.webp',
};

// --- Helper Functions ---
const getBackground = (value: number) => {
    if (value >= 21) return RANK_BGS.UR;
    if (value >= 17) return RANK_BGS.SR;
    if (value >= 12) return RANK_BGS.R;
    return RANK_BGS.N;
};

const getRandomGrade = (): Grade => {
    const r = Math.random();
    if (r < PROBABILITIES.C) return 'C';
    if (r < PROBABILITIES.C + PROBABILITIES.B) return 'B';
    if (r < PROBABILITIES.C + PROBABILITIES.B + PROBABILITIES.A) return 'A';
    return 'S';
};

// --- Sub-components ---
const GradeIcons = ({ grades }: { grades: string }) => (
    <div className="flex gap-2 flex-wrap justify-center">
        {grades.split('').map((g, i) => (
            <img key={i} src={GRADE_IMAGES[g as Grade]} alt={g} className="w-8 h-8 object-contain drop-shadow-[0_0_6px_rgba(180,140,70,0.6)]" />
        ))}
    </div>
);

const ValueDisplay = ({ value }: { value: number }) => (
    <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-600/15 via-red-900/25 to-transparent blur-lg" />
        <div
            className="relative w-16 h-16 rounded-2xl flex items-center justify-center border-3 border-[#5c4631] shadow-[inset_0_3px_8px_rgba(0,0,0,0.8)]"
            style={{ backgroundImage: `url(${getBackground(value)})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        >
            <span className="text-2xl font-black text-[#d4b38a] drop-shadow-[2px_2px_4px_rgba(0,0,0,0.9)]">{value}</span>
        </div>
    </div>
);

// --- Main Component ---
export default function RefineSimulator() {
    const { t } = useTranslation('arcade');
    // --- State ---
    const [total, setTotal] = useState(0);
    const [history, setHistory] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [count, setCount] = useState(1);
    const [simulatedCount, setSimulatedCount] = useState(() => Number(localStorage.getItem('simulatedCount')) || 0);
    const [autoMode, setAutoMode] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showWeaponModal, setShowWeaponModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
    const [searchText, setSearchText] = useState("");
    const [partFilter, setPartFilter] = useState<Part | "全部">("全部");
    const [selectedWeapon, setSelectedWeapon] = useState<Weapon>(() => WEAPONS.find(w => w.name === "毒蛇之手") || WEAPONS[0]);
    const [records, setRecords] = useState<Records>(() => JSON.parse(localStorage.getItem('enchantRecords') || '{}'));

    const modalContentRef = useRef<HTMLDivElement>(null);

    // Derived State
    const filteredWeapons = useMemo(() => WEAPONS.filter(w => {
        const translatedName = t(`refineSimulator.equipments.${w.name}`, w.name);
        return (translatedName.toLowerCase().includes(searchText.toLowerCase()) || w.name.toLowerCase().includes(searchText.toLowerCase())) && (partFilter === "全部" || w.part === partFilter);
    }), [searchText, partFilter, t]);

    const currentRecord = records[selectedWeapon.name] || { maxScore: 6, maxLog: 'CCC (1+2+3=6)' };

    // Effects
    useEffect(() => {
        setTotal(records[selectedWeapon.name]?.maxScore || 6);
    }, [selectedWeapon.name, records]);

    useEffect(() => {
        localStorage.setItem('enchantRecords', JSON.stringify(records));
    }, [records]);

    useEffect(() => {
        localStorage.setItem('simulatedCount', simulatedCount.toString());
    }, [simulatedCount]);

    // Confetti Logic
    const createConfetti = useCallback(() => {
        if (!modalContentRef.current) return;
        const container = modalContentRef.current;
        const colors = ['#d4b38a', '#ffdd88', '#c9a04d', '#ffffff', '#f5e8c7', '#ffd700', '#fffacd'];
        const centerX = container.offsetWidth / 2;
        const centerY = container.offsetHeight / 2;

        for (let i = 0; i < 150; i++) {
            const confetti = document.createElement('div');
            const size = Math.random() * 8 + 4;
            const color = colors[Math.floor(Math.random() * colors.length)];
            Object.assign(confetti.style, {
                position: 'absolute', left: `${centerX}px`, top: `${centerY}px`, width: `${size}px`, height: `${size}px`,
                backgroundColor: color, borderRadius: Math.random() > 0.5 ? '50%' : '2px', opacity: '0', pointerEvents: 'none', zIndex: '50',
                boxShadow: Math.random() > 0.8 ? `0 0 ${size}px ${color}` : 'none'
            });
            container.appendChild(confetti);

            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * 300 + 100;
            const targetX = Math.cos(angle) * distance;
            const targetY = Math.sin(angle) * distance;
            const duration = Math.random() * 1500 + 1000;
            const rotation = Math.random() * 720 - 360;

            confetti.animate([
                { transform: `translate(-50%, -50%) translate(0, 0) rotate(0deg) scale(0)`, opacity: 1 },
                { transform: `translate(-50%, -50%) translate(${targetX * 0.4}px, ${targetY * 0.4}px) rotate(${rotation * 0.3}deg) scale(1.2)`, opacity: 1, offset: 0.2 },
                { transform: `translate(-50%, -50%) translate(${targetX}px, ${targetY + 100}px) rotate(${rotation}deg) scale(0)`, opacity: 0 }
            ], { duration, easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)', fill: 'forwards' });
            setTimeout(() => confetti.remove(), duration);
        }
    }, []);

    useEffect(() => {
        if (showSuccessModal) setTimeout(createConfetti, 180);
    }, [showSuccessModal, createConfetti]);

    // --- Handlers ---
    const startSimulation = async () => {
        setIsRunning(true);
        const startTotal = total;
        const startSimCount = simulatedCount;

        let localMaxScore = startTotal;
        let localMaxLog = '';
        let successAtCount = 0;
        const newLogs: string[] = [];

        for (let i = 1; i <= count; i++) {
            const grades = Array(3).fill(0).map(getRandomGrade) as Grade[];
            const [l, m, r] = grades.map((g, idx) => VALUES[g][idx]);
            const added = l + m + r;
            const log = `${grades.join('')} (${l}+${m}+${r}=${added})`;

            newLogs.unshift(log);

            if (added > localMaxScore) {
                localMaxScore = added;
                localMaxLog = log;
                successAtCount = startSimCount + i;
            }

            const isLastStep = i === count;
            const isAutoStop = autoMode && added > startTotal;

            if (isAutoStop || isLastStep) {
                const finalSimCount = startSimCount + i;
                setSimulatedCount(finalSimCount);
                setHistory(prev => [...newLogs, ...prev].slice(0, 20));

                if (localMaxScore > startTotal) {
                    setRecords(prev => ({
                        ...prev,
                        [selectedWeapon.name]: { maxScore: localMaxScore, maxLog: localMaxLog }
                    }));
                    setTotal(localMaxScore);
                    setSuccessInfo({
                        times: successAtCount,
                        powder: successAtCount * 30,
                        score: localMaxScore
                    });
                    setShowSuccessModal(true);
                }
                break;
            }

            if (i % 100 === 0) {
                setSimulatedCount(startSimCount + i);
                await new Promise(r => setTimeout(r, 0));
            }
        }
        setIsRunning(false);
    };

    const reset = () => {
        setRecords(prev => { const n = { ...prev }; delete n[selectedWeapon.name]; return n; });
        setTotal(6); setHistory([]); setSimulatedCount(0); setShowSuccessModal(false);
    };

    return (
        <div className="min-h-screen bg-[#0f0a05] text-[#d4b38a] font-serif overflow-x-hidden">
            <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(at_30%_20%,rgba(180,100,40,0.08),transparent_50%)] bg-[radial-gradient(at_70%_80%,rgba(140,40,30,0.08),transparent_60%)]" />

            <div className="relative max-w-7xl mx-auto px-4 py-6">
                <h1 className="text-3xl md:text-4xl font-black text-center mb-6 tracking-widest drop-shadow-[0_3px_8px_rgba(140,40,30,0.5)]">
                    {t('refineSimulator.title', 'Refine Level Simulator')}
                </h1>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Equipment Display */}
                    <div className="bg-[#1f1812] border-2 border-[#5c4631] rounded-2xl p-6 shadow-2xl">
                        <div className="text-center mb-6">
                            <img src={selectedWeapon.thumbUrl} alt={t(`refineSimulator.equipments.${selectedWeapon.name}`, selectedWeapon.name)} className="mx-auto w-40 object-contain drop-shadow-[0_6px_20px_rgba(140,40,30,0.6)]" />
                            <div className="mt-4 text-6xl font-black tracking-tighter drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">+9</div>
                            <div className="mt-2 text-xl font-bold truncate">{t(`refineSimulator.equipments.${selectedWeapon.name}`, selectedWeapon.name)}</div>
                            <div className="text-sm text-[#8c6f4e]">{t(`refineSimulator.parts.${selectedWeapon.part}`, selectedWeapon.part)}・UR</div>
                        </div>
                        <button onClick={() => setShowWeaponModal(true)} className="w-full py-4 bg-[#2b2118] hover:bg-[#3a2f23] border border-[#5c4631] rounded-xl font-bold flex justify-between px-6 transition-colors">
                            <span>{t('refineSimulator.selectEquipment', { name: t(`refineSimulator.equipments.${selectedWeapon.name}`, selectedWeapon.name) })}</span><span>→</span>
                        </button>
                        <div className="mt-8 pt-6 border-t border-[#5c4631] text-center">
                            <h3 className="text-[#b38b4d] font-bold mb-4">{t('refineSimulator.historyHighest', 'History Highest')}</h3>
                            <div className="flex flex-col items-center gap-4">
                                <GradeIcons grades={currentRecord.maxLog.split(' ')[0]} />
                                <ValueDisplay value={currentRecord.maxScore} />
                                <div className="font-mono text-xs bg-[#2b2118] border border-[#5c4631] px-6 py-2 rounded-full">{currentRecord.maxLog}</div>
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="bg-[#1f1812] border-2 border-[#5c4631] rounded-2xl p-6 shadow-2xl">
                        <h2 className="text-2xl font-bold text-center mb-6">{t('refineSimulator.continuousRefining', 'Continuous Refining')}</h2>
                        <div className="space-y-6">
                            <div className="text-center">
                                <label className="text-sm text-[#b38b4d] mb-4 block">{t('refineSimulator.simulatedTimes', 'Simulated Times (1-1000)')}</label>
                                <div className="flex items-center justify-center gap-3 mb-4">
                                    <button onClick={() => setCount(1)} disabled={isRunning} className="px-3 py-2 bg-[#2b2118] rounded-lg text-xs font-bold border border-[#5c4631]">{t('refineSimulator.min', 'MIN')}</button>
                                    <button onClick={() => setCount(Math.max(1, count - 1))} disabled={isRunning} className="w-10 h-10 bg-[#2b2118] rounded-xl text-2xl border border-[#5c4631]">−</button>
                                    <input type="number" value={count} onChange={e => setCount(Math.max(1, Math.min(1000, Number(e.target.value))))} disabled={isRunning} className="w-24 text-center bg-[#2b2118] border-2 border-[#5c4631] rounded-xl py-2 text-3xl font-black" />
                                    <button onClick={() => setCount(Math.min(1000, count + 1))} disabled={isRunning} className="w-10 h-10 bg-[#2b2118] rounded-xl text-2xl border border-[#5c4631]">+</button>
                                    <button onClick={() => setCount(1000)} disabled={isRunning} className="px-3 py-2 bg-[#2b2118] rounded-lg text-xs font-bold border border-[#5c4631]">{t('refineSimulator.max', 'MAX')}</button>
                                </div>
                                <input type="range" min="1" max="1000" value={count} onChange={e => setCount(Number(e.target.value))} disabled={isRunning} className="w-full h-2 bg-[#2b2118] rounded-lg appearance-none cursor-pointer accent-[#b38b4d]" />
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-center">
                                <div><div className="text-sm text-[#8c6f4e]">{t('refineSimulator.refined', 'Refined')}</div><div className="text-4xl font-black">{simulatedCount}</div></div>
                                <div><div className="text-sm text-[#8c6f4e]">{t('refineSimulator.powderConsumed', 'Powder Consumed')}</div><div className="text-4xl font-black">{simulatedCount * 30}</div></div>
                            </div>

                            <div className="flex items-center justify-center gap-4">
                                <span className="text-sm">{t('refineSimulator.stopOnSuccess', 'Stop on Success')}</span>
                                <button onClick={() => setAutoMode(!autoMode)} disabled={isRunning} className={`relative h-8 w-14 rounded-full border border-[#5c4631] transition-colors ${autoMode ? 'bg-[#8c2f2f]' : 'bg-[#2b2118]'}`}>
                                    <div className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-[#d4b38a] transition-transform ${autoMode ? 'translate-x-6' : ''}`} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={reset} disabled={isRunning} className="py-4 bg-[#2b2118] hover:bg-[#3a2f23] border border-[#5c4631] rounded-xl font-bold transition-colors">{t('refineSimulator.resetRecords', 'Reset Records')}</button>
                                <button onClick={startSimulation} disabled={isRunning} className={`py-4 rounded-xl font-bold border border-[#5c4631] transition-all ${isRunning ? 'bg-[#3a2f23]' : 'bg-gradient-to-r from-[#8c2f2f] to-[#b38b4d] hover:brightness-110 active:scale-95'}`}>
                                    {isRunning ? t('refineSimulator.refining', 'Refining...') : t('refineSimulator.startRefining', 'Start Refining')}
                                </button>
                            </div>

                            <div className="text-center">
                                <button onClick={() => setShowHistory(!showHistory)} className="text-[#b38b4d] hover:text-[#d4b38a] text-sm flex items-center gap-2 mx-auto">
                                    {showHistory ? t('refineSimulator.hideRecent', 'Hide Recent Records') : t('refineSimulator.showRecent', 'Show Recent Records')} {showHistory ? '▲' : '▼'}
                                </button>
                                {showHistory && (
                                    <div className="mt-4 max-h-48 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-[#8c2f2f]">
                                        {history.map((log, i) => (
                                            <div key={i} className="flex items-center gap-4 bg-[#2b2118] border border-[#5c4631] rounded-xl p-3 text-sm">
                                                <GradeIcons grades={log.split(' ')[0]} /><span className="font-mono">{log}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Weapon Modal */}
            {showWeaponModal && (
                <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setShowWeaponModal(false)}>
                    <div className="bg-[#1f1812] border-4 border-[#5c4631] rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-[#5c4631] flex justify-between items-center">
                            <h3 className="text-2xl font-bold">{t('refineSimulator.selectEquipmentTitle', 'Select Equipment')}</h3>
                            <button onClick={() => setShowWeaponModal(false)} className="text-4xl text-[#8c6f4e] hover:text-[#d4b38a]">×</button>
                        </div>
                        <div className="p-6 flex-1 overflow-hidden flex flex-col">
                            <div className="flex gap-4 mb-6">
                                <input type="text" placeholder={t('refineSimulator.searchEquipment', 'Search Equipment...')} value={searchText} onChange={e => setSearchText(e.target.value)} className="flex-1 bg-[#2b2118] border border-[#5c4631] rounded-xl px-6 py-3 focus:border-[#b38b4d] outline-none" />
                                <select value={partFilter} onChange={e => setPartFilter(e.target.value as any)} className="bg-[#2b2118] border border-[#5c4631] rounded-xl px-6 py-3 outline-none">
                                    {["全部", "武器", "盔甲", "頭盔", "手套", "飾品"].map(p => (
                                        <option key={p} value={p}>{t(`refineSimulator.parts.${p}`, p)}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 pr-2 scrollbar-thin scrollbar-thumb-[#8c2f2f]">
                                {filteredWeapons.map(w => (
                                    <button key={w.name} onClick={() => { setSelectedWeapon(w); setShowWeaponModal(false); }} className={`group relative aspect-square rounded-2xl border-2 transition-all ${selectedWeapon.name === w.name ? 'border-[#d4b38a] bg-[#3a2f23]' : 'border-[#2b2118] hover:border-[#b38b4d] bg-[#1f1812]'}`}>
                                        <img src={w.thumbUrl} alt={t(`refineSimulator.equipments.${w.name}`, w.name)} className="w-full h-full object-contain p-4 group-hover:scale-110 transition-transform" />
                                        <div className="absolute bottom-0 inset-x-0 bg-black/60 p-2 text-[10px] text-center truncate">{t(`refineSimulator.equipments.${w.name}`, w.name)}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccessModal && successInfo && (
                <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4 overflow-hidden">
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <div className="absolute w-[150%] aspect-square bg-[radial-gradient(circle,rgba(212,179,138,0.2)_0%,transparent_70%)] animate-pulse" />
                        <div className="absolute w-[200%] aspect-square opacity-10 animate-[rotate-slow_30s_linear_infinite]" style={{ backgroundImage: 'conic-gradient(transparent 0deg, rgba(212,179,138,0.3) 10deg, transparent 20deg, rgba(212,179,138,0.3) 30deg, transparent 40deg, rgba(212,179,138,0.3) 50deg, transparent 60deg, rgba(212,179,138,0.3) 70deg, transparent 80deg, rgba(212,179,138,0.3) 90deg, transparent 100deg, rgba(212,179,138,0.3) 110deg, transparent 120deg, rgba(212,179,138,0.3) 130deg, transparent 140deg, rgba(212,179,138,0.3) 150deg, transparent 160deg, rgba(212,179,138,0.3) 170deg, transparent 180deg, rgba(212,179,138,0.3) 190deg, transparent 200deg, rgba(212,179,138,0.3) 210deg, transparent 220deg, rgba(212,179,138,0.3) 230deg, transparent 240deg, rgba(212,179,138,0.3) 250deg, transparent 260deg, rgba(212,179,138,0.3) 270deg, transparent 280deg, rgba(212,179,138,0.3) 290deg, transparent 300deg, rgba(212,179,138,0.3) 310deg, transparent 320deg, rgba(212,179,138,0.3) 330deg, transparent 340deg, rgba(212,179,138,0.3) 350deg, transparent 360deg)' }} />
                    </div>
                    <div ref={modalContentRef} className="relative w-full max-w-md bg-[#1f1812] border-4 border-[#d4b38a] rounded-[2rem] p-10 text-center shadow-2xl animate-[in_0.4s_ease-out]">
                        <div className="text-7xl mb-6 animate-bounce">🎉</div>
                        <h2 className="text-4xl font-black text-[#ffdd88] tracking-widest mb-2">{t('refineSimulator.breakthrough', 'Refining Breakthrough!')}</h2>
                        <p className="text-[#b38b4d] text-lg mb-8">{t('refineSimulator.legendaryRecord', 'Legendary New Record')}</p>
                        <div className="bg-black/40 rounded-3xl border border-[#d4b38a]/30 py-6 mb-10">
                            <span className="text-8xl font-black text-[#ffdd88] drop-shadow-[0_0_30px_#ffcc66]">{successInfo.score}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-6 bg-[#1a120b] rounded-2xl p-6 mb-10 border border-[#5c4631]">
                            <div><div className="text-xs text-[#8c6f4e] mb-1 uppercase tracking-tighter">{t('refineSimulator.totalRefinedTimes', 'Total Refined Times')}</div><div className="text-3xl font-bold">{successInfo.times}</div></div>
                            <div className="border-l border-[#5c4631]"><div className="text-xs text-[#8c6f4e] mb-1 uppercase tracking-tighter">{t('refineSimulator.powderConsumed', 'Powder Consumed')}</div><div className="text-3xl font-bold">{successInfo.powder}</div></div>
                        </div>
                        <button onClick={() => setShowSuccessModal(false)} className="w-full py-5 bg-gradient-to-r from-[#d4b38a] to-[#ffdd88] text-[#1f1812] font-black rounded-2xl shadow-lg active:scale-95 transition-transform">{t('refineSimulator.continueSprinting', 'Continue Sprinting!')}</button>
                    </div>
                </div>
            )}
        </div>
    );
}
