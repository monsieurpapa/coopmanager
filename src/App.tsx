import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  Cell, LineChart, Line
} from 'recharts';
import { 
  Coffee, Users, MapPin, Calendar, Award, 
  TrendingUp, Leaf, Scale, ChevronRight, X,
  ArrowLeftRight, Info, DollarSign, Globe, Languages,
  Plus, Upload, LogIn, LogOut, Shield, User as UserIcon, Loader2, Check, Search, Filter, Download, Edit, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MOCK_COOPERATIVES, CoffeeCooperative } from './types';
import { cn } from './lib/utils';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User as FirebaseUser } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, getDoc, updateDoc, addDoc, query, where, serverTimestamp, deleteDoc, getDocs, getDocFromServer } from 'firebase/firestore';
import { useDropzone } from 'react-dropzone';
import { parseCooperativeProfile } from './services/geminiService';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Markdown from 'react-markdown';
import toast, { Toaster } from 'react-hot-toast';
import { handleFirestoreError, OperationType } from './lib/firestore-utils';
import { CooperativeSchema, type CooperativeFormData } from './schemas';
import { LanguageContext, useTranslation, LanguageSwitcher, translations, type Language } from './contexts/language';
import { LOGO_FALLBACK, IMAGE_FALLBACK, onLogoError, onImageError } from './lib/image-utils';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let message = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error) message = `Database Error: ${parsed.error}`;
      } catch (e) {
        message = this.state.error?.message || message;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
          <div className="bg-white p-8 rounded-3xl shadow-xl border border-stone-200 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Shield size={32} />
            </div>
            <h2 className="text-2xl font-black text-stone-900 mb-4">Application Error</h2>
            <p className="text-stone-600 mb-8">{message}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Components ---

const StatCard = ({ icon: Icon, label, value, unit = "" }: { icon: any, label: string, value: string | number, unit?: string }) => (
  <div className="bg-white p-4 rounded-xl border border-stone-100 shadow-sm flex items-center gap-4">
    <div className="p-3 bg-amber-50 rounded-lg text-amber-700">
      <Icon size={20} />
    </div>
    <div>
      <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold text-stone-900">{value}<span className="text-sm font-normal text-stone-400 ml-1">{unit}</span></p>
    </div>
  </div>
);

const HoverSummary = ({ coop, onCompare, isComparing }: { coop: CoffeeCooperative, onCompare: (e: React.MouseEvent) => void, isComparing: boolean }) => {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="absolute z-50 left-full ml-4 top-0 w-64 bg-white p-4 rounded-2xl shadow-2xl border border-stone-200"
    >
      <div className="flex items-center gap-3 mb-3">
        <img src={coop.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-stone-100" referrerPolicy="no-referrer" onError={onLogoError} />
        <div>
          <h4 className="font-bold text-stone-900 text-sm leading-tight">{coop.name}</h4>
          <p className="text-[10px] text-stone-500">{coop.region}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-stone-50 p-2 rounded-lg">
          <p className="text-[8px] text-stone-400 uppercase font-black">{t('members')}</p>
          <p className="text-xs font-bold">{coop.members.toLocaleString()}</p>
        </div>
        <div className="bg-stone-50 p-2 rounded-lg">
          <p className="text-[8px] text-stone-400 uppercase font-black">{t('score')}</p>
          <p className="text-xs font-bold text-amber-600">{coop.selfReportedCuppingScore}</p>
        </div>
      </div>
      <p className="text-[10px] text-stone-600 line-clamp-2 italic mb-3">"{coop.description}"</p>
      <button 
        onClick={onCompare}
        className={cn(
          "w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
          isComparing 
            ? "bg-red-50 text-red-600 hover:bg-red-100" 
            : "bg-amber-900 text-white hover:bg-amber-800"
        )}
      >
        {isComparing ? t('removeFromComparison') : t('addToComparison')}
      </button>
    </motion.div>
  );
};

const SensoryRadar = ({ profile, name }: { profile: any, name: string }) => {
  const { t } = useTranslation();
  const data = [
    { subject: t('aroma'), A: profile.aroma, fullMark: 10 },
    { subject: t('acidity'), A: profile.acidity, fullMark: 10 },
    { subject: t('body'), A: profile.body, fullMark: 10 },
    { subject: t('sweetness'), A: profile.sweetness, fullMark: 10 },
    { subject: t('aftertaste'), A: profile.aftertaste, fullMark: 10 },
  ];

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 12 }} />
          <Radar
            name={name}
            dataKey="A"
            stroke="#92400e"
            fill="#d97706"
            fillOpacity={0.6}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

const ComparisonView = ({ selectedIds, onRemove, onAdd, cooperatives }: { selectedIds: string[], onRemove: (id: string) => void, onAdd: (id: string) => void, cooperatives: CoffeeCooperative[] }) => {
  const { t } = useTranslation();
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['selfReportedCuppingScore', 'annualProduction']);
  const [isCoopDropdownOpen, setIsCoopDropdownOpen] = useState(false);
  const [isMetricDropdownOpen, setIsMetricDropdownOpen] = useState(false);
  const [coopSearch, setCoopSearch] = useState('');
  
  const coopDropdownRef = useRef<HTMLDivElement>(null);
  const metricDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (coopDropdownRef.current && !coopDropdownRef.current.contains(event.target as Node)) {
        setIsCoopDropdownOpen(false);
      }
      if (metricDropdownRef.current && !metricDropdownRef.current.contains(event.target as Node)) {
        setIsMetricDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedCoops = useMemo(() =>
    cooperatives.filter(c => selectedIds.includes(c.id)),
    [selectedIds, cooperatives]
  );

  const availableMetrics = [
    { id: 'selfReportedCuppingScore', label: t('cuppingScore'), unit: 'pts', color: '#d97706' },
    { id: 'annualProduction', label: t('production'), unit: 'Tons', color: '#059669' },
    { id: 'members', label: t('members'), unit: '', color: '#2563eb' },
    { id: 'womenMembers', label: t('womenMembers'), unit: '', color: '#db2777' },
    { id: 'youthMembers', label: t('youthMembers'), unit: '', color: '#7c3aed' },
    { id: 'areaHa', label: t('totalArea'), unit: 'HA', color: '#16a34a' },
    { id: 'treeCount', label: t('treeCount'), unit: '', color: '#4b5563' },
    { id: 'households', label: t('households'), unit: '', color: '#0891b2' },
  ];

  const colors = ['#d97706', '#059669', '#2563eb', '#7c3aed', '#db2777', '#16a34a', '#4b5563', '#0891b2'];

  const [metricSearch, setMetricSearch] = useState('');

  const filteredMetrics = availableMetrics.filter(m => 
    m.label.toLowerCase().includes(metricSearch.toLowerCase())
  );

  const toggleMetric = (id: string) => {
    setSelectedMetrics(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const filteredCoops = cooperatives.filter(c =>
    c.name.toLowerCase().includes(coopSearch.toLowerCase())
  );

  const handleExportCSV = () => {
    if (selectedCoops.length === 0) return;

    const headers = ['Metric', ...selectedCoops.map(c => c.name)];
    const rows = [
      ...availableMetrics.map(m => [
        m.label,
        ...selectedCoops.map(c => (c[m.id as keyof CoffeeCooperative] as number || 0).toString())
      ]),
      ['Region', ...selectedCoops.map(c => c.region)],
      ['Established', ...selectedCoops.map(c => c.established.toString())],
      ['Country', ...selectedCoops.map(c => c.country)]
    ];

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `cooperative_comparison_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      {/* Controls Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cooperative Multi-select */}
        <div className="relative" ref={coopDropdownRef}>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('selectCooperatives')}</label>
            <div className="flex gap-4">
              <button 
                onClick={() => cooperatives.slice(0, 4).forEach(c => onAdd(c.id))}
                className="text-[10px] font-bold text-amber-600 hover:text-amber-700 uppercase tracking-widest"
              >
                {t('selectTop4')}
              </button>
              {selectedIds.length > 0 && (
                <button 
                  onClick={() => selectedIds.forEach(id => onRemove(id))}
                  className="text-[10px] font-bold text-red-500 hover:text-red-600 uppercase tracking-widest"
                >
                  {t('clearAll')}
                </button>
              )}
            </div>
          </div>
          <div 
            className="w-full bg-white border border-stone-200 rounded-2xl p-2 min-h-[52px] flex flex-wrap gap-2 shadow-sm hover:border-amber-500 transition-all cursor-pointer"
            onClick={() => setIsCoopDropdownOpen(!isCoopDropdownOpen)}
          >
            {selectedCoops.length > 0 ? (
              selectedCoops.map(c => (
                <div key={c.id} className="relative group/tag">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-stone-100 text-stone-900 text-xs font-bold rounded-lg border border-stone-200 hover:bg-stone-200 transition-colors">
                    <img src={c.logoUrl} alt="" className="w-4 h-4 rounded-sm object-cover" onError={onLogoError} />
                    {c.name}
                    <button 
                      onClick={(e) => { e.stopPropagation(); onRemove(c.id); }}
                      className="hover:text-red-500"
                    >
                      <X size={12} />
                    </button>
                  </span>
                  {/* Hover Summary for Tag */}
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover/tag:block z-50">
                    <HoverSummary 
                      coop={c} 
                      onCompare={(e) => { e.stopPropagation(); onRemove(c.id); }}
                      isComparing={true}
                    />
                  </div>
                </div>
              ))
            ) : (
              <span className="text-stone-400 text-sm font-medium px-2 py-1">{t('selectCooperatives')}...</span>
            )}
            <div className="ml-auto flex items-center px-2">
              <ChevronRight size={16} className={cn("text-stone-400 transition-transform", isCoopDropdownOpen && "rotate-90")} />
            </div>
          </div>
          
          <AnimatePresence>
            {isCoopDropdownOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute z-[60] top-full left-0 right-0 mt-2 bg-white border border-stone-200 rounded-2xl shadow-2xl overflow-hidden"
              >
                <div className="p-3 border-b border-stone-100">
                  <input 
                    type="text"
                    placeholder={t('searchPlaceholder')}
                    value={coopSearch}
                    onChange={(e) => setCoopSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {filteredCoops.map(coop => (
                    <div 
                      key={coop.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectedIds.includes(coop.id) ? onRemove(coop.id) : onAdd(coop.id);
                      }}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 cursor-pointer transition-colors border-b border-stone-50 last:border-none"
                    >
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center transition-all",
                        selectedIds.includes(coop.id) ? "bg-amber-600 border-amber-600" : "border-stone-300"
                      )}>
                        {selectedIds.includes(coop.id) && <X size={10} className="text-white" />}
                      </div>
                      <img src={coop.logoUrl} alt="" className="w-6 h-6 rounded object-cover" onError={onLogoError} />
                      <span className="text-sm font-bold text-stone-900">{coop.name}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Metrics Multi-select */}
        <div className="relative" ref={metricDropdownRef}>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Select Metrics to Compare</label>
            <div className="flex gap-4">
              <button 
                onClick={() => setSelectedMetrics(availableMetrics.map(m => m.id))}
                className="text-[10px] font-bold text-amber-600 hover:text-amber-700 uppercase tracking-widest"
              >
                Select All
              </button>
              <button 
                onClick={() => setSelectedMetrics([])}
                className="text-[10px] font-bold text-red-500 hover:text-red-600 uppercase tracking-widest"
              >
                Clear All
              </button>
            </div>
          </div>
          <div 
            className="w-full bg-white border border-stone-200 rounded-2xl p-2 min-h-[52px] flex flex-wrap gap-2 shadow-sm hover:border-amber-500 transition-all cursor-pointer"
            onClick={() => setIsMetricDropdownOpen(!isMetricDropdownOpen)}
          >
            {selectedMetrics.length > 0 ? (
              selectedMetrics.map(mId => {
                const metric = availableMetrics.find(m => m.id === mId)!;
                return (
                  <span key={mId} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-stone-100 text-stone-900 text-xs font-bold rounded-lg border border-stone-200">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: metric.color }} />
                    {metric.label}
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleMetric(mId); }}
                      className="hover:text-red-500"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })
            ) : (
              <span className="text-stone-400 text-sm font-medium px-2 py-1">{t('selectMetrics')}...</span>
            )}
            <div className="ml-auto flex items-center px-2">
              <ChevronRight size={16} className={cn("text-stone-400 transition-transform", isMetricDropdownOpen && "rotate-90")} />
            </div>
          </div>
          
          <AnimatePresence>
            {isMetricDropdownOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute z-[60] top-full left-0 right-0 mt-2 bg-white border border-stone-200 rounded-2xl shadow-2xl overflow-hidden"
              >
                <div className="p-3 border-b border-stone-100">
                  <input 
                    type="text"
                    placeholder={t('searchMetrics')}
                    value={metricSearch}
                    onChange={(e) => setMetricSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {filteredMetrics.map(metric => (
                  <div 
                    key={metric.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMetric(metric.id);
                    }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 cursor-pointer transition-colors border-b border-stone-50 last:border-none"
                  >
                    <div className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center transition-all",
                      selectedMetrics.includes(metric.id) ? "bg-amber-600 border-amber-600" : "border-stone-300"
                    )}>
                      {selectedMetrics.includes(metric.id) && <X size={10} className="text-white" />}
                    </div>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: metric.color }} />
                    <span className="text-sm font-bold text-stone-900">{metric.label}</span>
                  </div>
                ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Performance Summary Section */}
      {selectedCoops.length > 1 && selectedMetrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {selectedMetrics.slice(0, 4).map(mId => {
            const metric = availableMetrics.find(m => m.id === mId)!;
            const topCoop = [...selectedCoops].sort((a, b) => 
              ((b[mId as keyof CoffeeCooperative] as number) || 0) - ((a[mId as keyof CoffeeCooperative] as number) || 0)
            )[0];
            
            return (
              <div key={mId} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl overflow-hidden border border-stone-100 shrink-0">
                  <img src={topCoop.logoUrl} alt="" className="w-full h-full object-cover" onError={onLogoError} />
                </div>
                <div>
                  <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest leading-none mb-1">Top {metric.label}</p>
                  <p className="text-sm font-black text-stone-900 leading-tight">{topCoop.name}</p>
                  <p className="text-xs font-bold text-amber-600">{(topCoop[mId as keyof CoffeeCooperative] as number || 0).toLocaleString()} {metric.unit}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {selectedMetrics.map(metricId => {
          const metric = availableMetrics.find(m => m.id === metricId)!;
          const chartData = selectedCoops.map(c => ({
            name: c.name,
            value: c[metricId as keyof CoffeeCooperative] as number || 0
          }));

          return (
            <motion.div 
              key={metricId}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm group"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black text-stone-400 uppercase tracking-widest">
                  {metric.label} {metric.unit && `(${metric.unit})`}
                </h3>
                <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: metric.color }} />
              </div>
              
              <div className="h-[250px]">
                {selectedCoops.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-stone-300 gap-2">
                    <Scale size={28} />
                    <p className="text-xs font-bold text-stone-400">Select cooperatives above to compare</p>
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#78716c' }} 
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: '#a8a29e' }} 
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f9fafb' }}
                      contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)' }}
                      itemStyle={{ fontWeight: 800, color: '#1c1917' }}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]} animationDuration={1000}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Detailed Comparison Table */}
      {selectedCoops.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden"
        >
          <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
            <div className="flex items-center gap-2">
              <Scale size={20} className="text-amber-600" />
              <h3 className="text-lg font-black text-stone-900">Detailed Comparison Matrix</h3>
            </div>
            <button 
              onClick={handleExportCSV}
              className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold hover:border-amber-500 transition-all flex items-center gap-2 shadow-sm"
            >
              <DollarSign size={14} /> Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50/30">
                  <th className="px-8 py-4 text-[10px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-100">Metric</th>
                  {selectedCoops.map(c => (
                    <th key={c.id} className="px-8 py-4 border-b border-stone-100">
                      <div className="flex items-center gap-2">
                        <img src={c.logoUrl} alt="" className="w-6 h-6 rounded object-cover border border-stone-200" onError={onLogoError} />
                        <span className="text-sm font-black text-stone-900">{c.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {availableMetrics.map(metric => (
                  <tr key={metric.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="px-8 py-4 text-sm font-bold text-stone-500 border-b border-stone-50">{metric.label}</td>
                    {selectedCoops.map(c => (
                      <td key={c.id} className="px-8 py-4 border-b border-stone-50">
                        <span className="text-sm font-black text-stone-900">
                          {(c[metric.id as keyof CoffeeCooperative] as number || 0).toLocaleString()}
                          <span className="text-[10px] font-medium text-stone-400 ml-1 uppercase">{metric.unit}</span>
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="hover:bg-stone-50/50 transition-colors">
                  <td className="px-8 py-4 text-sm font-bold text-stone-500 border-b border-stone-50">Region</td>
                  {selectedCoops.map(c => (
                    <td key={c.id} className="px-8 py-4 border-b border-stone-50">
                      <span className="text-sm font-bold text-stone-900">{c.region}</span>
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-stone-50/50 transition-colors">
                  <td className="px-8 py-4 text-sm font-bold text-stone-500 border-b border-stone-50">Established</td>
                  {selectedCoops.map(c => (
                    <td key={c.id} className="px-8 py-4 border-b border-stone-50">
                      <span className="text-sm font-bold text-stone-900">{c.established}</span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Radar Comparison (Always visible if coops selected) */}
      {selectedCoops.length > 0 && (
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <Coffee size={20} className="text-amber-600" />
              <h3 className="text-lg font-black text-stone-900">Sensory Fingerprint Comparison</h3>
            </div>
            <div className="flex gap-2">
              {selectedCoops.map((c, idx) => (
                <div key={c.id} className="flex items-center gap-1.5 px-2 py-1 bg-stone-50 rounded-lg border border-stone-100">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }} />
                  <span className="text-[10px] font-bold text-stone-600">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
                { subject: 'Aroma' },
                { subject: 'Acidity' },
                { subject: 'Body' },
                { subject: 'Sweetness' },
                { subject: 'Aftertaste' },
              ].map(item => {
                const newItem: any = { ...item };
                selectedCoops.forEach(c => {
                  newItem[c.name] = c.sensoryProfile[item.subject.toLowerCase() as keyof typeof c.sensoryProfile];
                });
                return newItem;
              })}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 700 }} />
                <Legend iconType="circle" />
                {selectedCoops.map((c, index) => (
                  <Radar
                    key={c.id}
                    name={c.name}
                    dataKey={c.name}
                    stroke={colors[index % colors.length]}
                    fill={colors[index % colors.length]}
                    fillOpacity={0.15}
                    strokeWidth={3}
                  />
                ))}
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Staging Area Component ---
function StagingArea() {
  const { t } = useTranslation();
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<Partial<CooperativeFormData> | null>(null);
  const [stagingList, setStagingList] = useState<any[]>([]);
  const [managerEmail, setManagerEmail] = useState('');

  useEffect(() => {
    const path = 'staging_cooperatives';
    const q = query(collection(db, 'staging_cooperatives'), where('status', '==', 'pending'));
    return onSnapshot(q, (snapshot) => {
      setStagingList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
  }, []);

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsParsing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const data = await parseCooperativeProfile(base64, file.type);
        setParsedData(data);
        setIsParsing(false);
      };
    } catch (error) {
      console.error("Error parsing document", error);
      setIsParsing(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.png', '.jpg', '.jpeg'] },
    multiple: false 
  });

  const handleSave = async () => {
    if (!parsedData) return;
    try {
      await addDoc(collection(db, 'staging_cooperatives'), {
        data: parsedData,
        managerEmail: managerEmail,
        status: 'pending',
        uploadedBy: auth.currentUser?.uid,
        createdAt: serverTimestamp()
      });
      setParsedData(null);
      setManagerEmail('');
    } catch (error) {
      console.error("Error saving to staging", error);
    }
  };

  const handleApprove = async (stagingId: string, data: any, email?: string) => {
    try {
      await addDoc(collection(db, 'cooperatives'), {
        ...data,
        managerEmail: email || '',
        lastUpdated: serverTimestamp()
      });
      await updateDoc(doc(db, 'staging_cooperatives', stagingId), { status: 'approved' });
    } catch (error) {
      console.error("Error approving", error);
    }
  };

  const handleReject = async (stagingId: string) => {
    try {
      await updateDoc(doc(db, 'staging_cooperatives', stagingId), { status: 'rejected' });
    } catch (error) {
      console.error("Error rejecting", error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-stone-900">{t('stagingArea')}</h2>
          <p className="text-stone-500 text-sm">{t('analyzingMetrics')}</p>
        </div>
        <div className="p-3 bg-amber-100 rounded-2xl text-amber-900">
          <Shield size={24} />
        </div>
      </div>

      <div 
        {...getRootProps()} 
        className={cn(
          "border-2 border-dashed rounded-3xl p-12 text-center transition-all cursor-pointer",
          isDragActive ? "border-amber-500 bg-amber-50" : "border-stone-200 hover:border-stone-300 bg-white"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center text-stone-400">
            {isParsing ? <Loader2 className="animate-spin" size={32} /> : <Upload size={32} />}
          </div>
          <div>
            <p className="text-lg font-bold text-stone-900">{isParsing ? t('parsingData') : t('dropFiles')}</p>
            <p className="text-stone-500 text-sm">{t('supportedFormats')}</p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {parsedData && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white p-8 rounded-3xl border border-stone-200 shadow-xl space-y-6"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <h3 className="text-xl font-bold text-stone-900">{t('reviewData')}</h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => setParsedData(null)}
                  className="px-4 py-2 text-stone-500 font-bold hover:text-stone-900"
                >
                  {t('discard')}
                </button>
                <button 
                  onClick={handleSave}
                  className="px-6 py-2 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all"
                >
                  {t('confirmAndSave')}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Name</p>
                <p className="font-bold text-stone-900">{parsedData.name || '---'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Location</p>
                <p className="font-bold text-stone-900">{parsedData.region}, {parsedData.country}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Members</p>
                <p className="font-bold text-stone-900">{parsedData.members?.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Cupping Score</p>
                <p className="font-bold text-amber-600">{parsedData.selfReportedCuppingScore}</p>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Description</p>
              <p className="text-sm text-stone-600 leading-relaxed line-clamp-3">{parsedData.description}</p>
            </div>

            <div className="pt-4 border-t border-stone-100">
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">
                {t('managerEmail')}
              </label>
              <div className="flex gap-2">
                <input 
                  type="email"
                  value={managerEmail}
                  onChange={(e) => setManagerEmail(e.target.value)}
                  placeholder="manager@cooperative.com"
                  className="flex-1 px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <p className="text-[10px] text-stone-400 mt-2 italic">{t('inviteManager')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        <h3 className="text-sm font-bold text-stone-400 uppercase tracking-widest">{t('detailedMatrix')} (Pending Review)</h3>
        {stagingList.length === 0 ? (
          <div className="p-12 text-center bg-stone-50 rounded-3xl border border-stone-100">
            <p className="text-stone-400 font-medium">{t('noStagingData')}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {stagingList.map((item) => (
              <div key={item.id} className="bg-white p-6 rounded-2xl border border-stone-200 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                    <Coffee size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900">{item.data.name}</h4>
                    <p className="text-xs text-stone-500">{item.data.region}, {item.data.country}</p>
                    {item.managerEmail && (
                      <p className="text-[10px] text-amber-600 font-bold mt-1">
                        Invited: {item.managerEmail}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleReject(item.id)}
                    className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <X size={20} />
                  </button>
                  <button 
                    onClick={() => handleApprove(item.id, item.data, item.managerEmail)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-xl text-sm font-bold hover:bg-green-100 transition-all"
                  >
                    <Check size={18} /> {t('saveToDirectory')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Cooperative Portal Component ---
function CoopPortal({ coopId, isNew = false, onComplete }: { coopId?: string, isNew?: boolean, onComplete?: () => void }) {
  const { t } = useTranslation();
  const [coop, setCoop] = useState<any>(isNew ? {
    name: '',
    country: '',
    region: '',
    members: 0,
    annualProduction: 0,
    sensoryProfile: { aroma: 0, acidity: 0, body: 0, sweetness: 0, aftertaste: 0 },
    varieties: [],
    sustainabilityFocus: [],
    established: new Date().getFullYear()
  } : null);
  const [step, setStep] = useState(1);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CooperativeFormData>({
    resolver: zodResolver(CooperativeSchema),
    defaultValues: isNew ? {
      name: '',
      country: '',
      region: '',
      members: 0,
      annualProduction: 0,
      sensoryProfile: { aroma: 0, acidity: 0, body: 0, sweetness: 0, aftertaste: 0 },
      varieties: [],
      sustainabilityFocus: [],
      established: new Date().getFullYear()
    } : undefined
  });

  useEffect(() => {
    if (isNew) return;
    if (!coopId) {
      setCoop({ name: 'No ID Provided', country: '', region: '', members: 0 });
      return;
    }
    const path = `cooperatives/${coopId}`;
    return onSnapshot(doc(db, 'cooperatives', coopId), (doc) => {
      if (doc.exists()) {
        setCoop(doc.data());
        reset(doc.data() as any);
      } else {
        // If document doesn't exist, we should probably handle it
        console.warn(`Cooperative ${coopId} not found`);
        setCoop({ name: 'Not Found', country: '', region: '', members: 0 });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
  }, [coopId, reset, isNew]);

  const onSubmit = async (data: CooperativeFormData) => {
    try {
      if (isNew) {
        await addDoc(collection(db, 'cooperatives'), {
          ...data,
          lastUpdated: serverTimestamp()
        });
      } else if (coopId) {
        await updateDoc(doc(db, 'cooperatives', coopId), {
          ...data,
          lastUpdated: serverTimestamp()
        });
      }
      toast.success(t('success'));
      if (onComplete) onComplete();
    } catch (error) {
      console.error("Error saving coop", error);
      toast.error(t('error'));
    }
  };

  if (!coop) return <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto" /></div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-stone-900">{isNew ? t('newCooperative') : t('coopManagerPortal')}</h2>
          <p className="text-stone-500 text-sm">{coop.name || t('newCooperative')}</p>
        </div>
        <div className="p-3 bg-blue-100 rounded-2xl text-blue-900">
          <UserIcon size={24} />
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                  step === s ? "bg-stone-900 text-white" : step > s ? "bg-green-500 text-white" : "bg-stone-100 text-stone-400"
                )}>
                  {step > s ? <Check size={14} /> : s}
                </div>
                {s < 3 && <div className="w-8 h-px bg-stone-100" />}
              </div>
            ))}
          </div>
          <button 
            type="button"
            onClick={async () => {
              if (!coopId) return;
              if (window.confirm(t('confirmDelete'))) {
                try {
                  await deleteDoc(doc(db, 'cooperatives', coopId));
                  toast.success(t('success'));
                  window.location.reload();
                } catch (error) {
                  console.error("Error deleting coop", error);
                  toast.error(t('error'));
                }
              }
            }}
            className="flex items-center gap-2 px-4 py-2 text-red-500 hover:bg-red-50 rounded-xl text-xs font-bold transition-all"
          >
            <Trash2 size={14} /> {t('deleteCooperative')}
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {step === 1 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <h3 className="text-lg font-bold">{t('overview')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase">Cooperative Name</label>
                  <input {...register('name')} className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase">Country</label>
                  <input {...register('country')} className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Description</label>
                <textarea {...register('description')} rows={4} className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <h3 className="text-lg font-bold">{t('productionStats')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase">Total Members</label>
                  <input type="number" {...register('members', { valueAsNumber: true })} className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase">Annual Production (Tons)</label>
                  <input type="number" step="0.1" {...register('annualProduction', { valueAsNumber: true })} className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <h3 className="text-lg font-bold">{t('sensoryProfile')}</h3>
              <div className="grid grid-cols-5 gap-4">
                {['aroma', 'acidity', 'body', 'sweetness', 'aftertaste'].map((metric) => (
                  <div key={metric} className="space-y-1">
                    <label className="text-[10px] font-bold text-stone-400 uppercase">{metric}</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      {...register(`sensoryProfile.${metric}` as any, { valueAsNumber: true })} 
                      className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-center" 
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          <div className="flex justify-between pt-8 border-t border-stone-100">
            <button 
              type="button"
              disabled={step === 1}
              onClick={() => setStep(s => s - 1)}
              className="px-6 py-2 text-stone-500 font-bold disabled:opacity-30"
            >
              {t('previous')}
            </button>
            {step < 3 ? (
              <button 
                type="button"
                onClick={() => setStep(s => s + 1)}
                className="px-8 py-2 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all"
              >
                {t('next')}
              </button>
            ) : (
              <button 
                type="submit"
                className="px-8 py-2 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition-all"
              >
                {t('submit')}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

const ProductionTrendChart = ({ data }: { data: any[] }) => (
  <div className="h-[250px] w-full">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
        <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <Tooltip 
          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
        />
        <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
        <Line 
          yAxisId="left"
          type="monotone" 
          dataKey="quantity" 
          name="Qty (Tons)" 
          stroke="#d97706" 
          strokeWidth={3} 
          dot={{ r: 4, fill: '#d97706' }}
          activeDot={{ r: 6 }}
        />
        <Line 
          yAxisId="right"
          type="monotone" 
          dataKey="revenue" 
          name="Revenue (USD)" 
          stroke="#059669" 
          strokeWidth={3} 
          dot={{ r: 4, fill: '#059669' }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

export default function App() {
  const [lang, setLang] = useState<Language>('en');

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  const t = (key: keyof typeof translations.en) => {
    return translations[lang][key] || translations.en[key];
  };

  return (
    <ErrorBoundary>
      <LanguageContext.Provider value={{ lang, setLang, t }}>
        <AppContent />
      </LanguageContext.Provider>
    </ErrorBoundary>
  );
}

function UserProfileModal({ isOpen, onClose, profile, user }: { isOpen: boolean, onClose: () => void, profile: any, user: FirebaseUser }) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(profile?.displayName || user?.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phoneNumber || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const docRef = doc(db, 'users', user.uid);
      await updateDoc(docRef, {
        displayName,
        phoneNumber,
        bio
      });
      onClose();
      window.location.reload(); // Refresh to update profile state
    } catch (error) {
      console.error("Error updating profile", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <h3 className="text-xl font-black text-stone-900 tracking-tight">{t('userProfile')}</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="flex flex-col items-center mb-6">
            <img src={user.photoURL || ''} alt="" className="w-20 h-20 rounded-full border-4 border-stone-100 shadow-sm mb-2" />
            <p className="text-sm font-bold text-stone-900">{user.email}</p>
            <span className="text-[10px] font-black px-2 py-0.5 bg-amber-100 text-amber-700 rounded uppercase mt-1">
              {profile?.role}
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">{t('displayName')}</label>
              <input 
                type="text" 
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">{t('phoneNumber')}</label>
              <input 
                type="tel" 
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">{t('bio')}</label>
              <textarea 
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
              />
            </div>
          </div>
        </div>

        <div className="p-6 bg-stone-50 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2 text-stone-600 font-bold hover:bg-stone-200 rounded-xl transition-all"
          >
            {t('cancel')}
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-2 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all flex items-center justify-center gap-2"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
            {t('saveChanges')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function AppContent() {
  const { t } = useTranslation();
  const [selectedCoopId, setSelectedCoopId] = useState<string | null>(null);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'directory' | 'comparison' | 'staging' | 'portal'>('directory');
  const [hoveredCoopId, setHoveredCoopId] = useState<string | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [portalCoopId, setPortalCoopId] = useState<string | null>(null);
  const [cooperatives, setCooperatives] = useState<CoffeeCooperative[]>(
    import.meta.env.DEV ? MOCK_COOPERATIVES : []
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const docRef = doc(db, 'users', u.uid);
        const docSnap = await getDoc(docRef);
        let profile;
        if (docSnap.exists()) {
          profile = docSnap.data();
        } else {
          profile = { email: u.email, role: 'user', createdAt: serverTimestamp() };
          await setDoc(docRef, profile);
        }
        
        // Force admin role for the hardcoded admin email
        if (u.email === "dieudonneishara@gmail.com") {
          profile.role = 'admin';
        }

        // Check if user is an invited manager
        if (u.email && !profile.cooperativeId) {
          const coopsRef = collection(db, 'cooperatives');
          const q = query(coopsRef, where('managerEmail', '==', u.email));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const coopDoc = querySnapshot.docs[0];
            profile.cooperativeId = coopDoc.id;
            profile.role = 'coop_manager';
            // Update the user profile in DB
            await updateDoc(doc(db, 'users', u.uid), { 
              cooperativeId: coopDoc.id,
              role: 'coop_manager'
            });
          }
        }

        setUserProfile(profile);
        setIsProfileLoading(false);
      } else {
        setUserProfile(null);
        setIsProfileLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const path = 'cooperatives';
    const unsubscribe = onSnapshot(collection(db, 'cooperatives'), (snapshot) => {
      const dbCoops = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoffeeCooperative));
      if (import.meta.env.DEV) {
        setCooperatives([...MOCK_COOPERATIVES, ...dbCoops]);
      } else {
        setCooperatives(dbCoops);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentView('directory');
  };

  const selectedCoop = useMemo(() => 
    cooperatives.find(c => c.id === selectedCoopId),
    [selectedCoopId, cooperatives]
  );

  const toggleComparison = (id: string) => {
    setComparisonIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id].slice(-4)
    );
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] text-stone-900 font-sans selection:bg-amber-100">
      <Toaster position="bottom-right" toastOptions={{ duration: 4000 }} />
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('directory')}>
              <div className="w-8 h-8 bg-amber-900 rounded-lg flex items-center justify-center text-white">
                <Coffee size={18} />
              </div>
              <h1 className="text-xl font-black tracking-tighter text-stone-900">CongoFarmers</h1>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              <button 
                onClick={() => { setCurrentView('directory'); setPortalCoopId(null); }}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-bold transition-all",
                  currentView === 'directory' ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-900"
                )}
              >
                {t('directory')}
              </button>
              <button 
                onClick={() => { setCurrentView('comparison'); setPortalCoopId(null); }}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2",
                  currentView === 'comparison' ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-900"
                )}
              >
                {t('comparison')}
                {comparisonIds.length > 0 && (
                  <span className="w-5 h-5 bg-amber-600 text-white text-[10px] flex items-center justify-center rounded-full">
                    {comparisonIds.length}
                  </span>
                )}
              </button>
              {userProfile?.role === 'admin' && (
                <button 
                  onClick={() => { setCurrentView('staging'); setPortalCoopId(null); }}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2",
                    currentView === 'staging' ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-900"
                  )}
                >
                  <Shield size={14} />
                  {t('stagingArea')}
                </button>
              )}
              {userProfile?.cooperativeId && (
                <button 
                  onClick={() => { setCurrentView('portal'); setPortalCoopId(null); }}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2",
                    currentView === 'portal' ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-900"
                  )}
                >
                  <UserIcon size={14} />
                  {t('coopPortal')}
                </button>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            {user ? (
              <div className="flex items-center gap-3">
                <div 
                  className="text-right hidden sm:block cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setIsProfileModalOpen(true)}
                >
                  <p className="text-xs font-black text-stone-900 leading-none">{userProfile?.displayName || user.displayName}</p>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{userProfile?.role}</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-stone-400 hover:text-red-500 transition-colors"
                  title={t('logout')}
                >
                  <LogOut size={20} />
                </button>
                <img 
                  src={user.photoURL || ''} 
                  alt="" 
                  className="w-8 h-8 rounded-full border border-stone-200 cursor-pointer hover:ring-2 hover:ring-amber-500 transition-all" 
                  onClick={() => setIsProfileModalOpen(true)}
                />
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 transition-all"
              >
                <LogIn size={16} />
                {t('login')}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 min-h-[calc(100vh-128px)]">
        {currentView === 'comparison' ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-black text-stone-900 tracking-tight">{t('interactiveComparison')}</h2>
                <p className="text-stone-500">{t('analyzingMetrics')}</p>
              </div>
              <button 
                onClick={() => setCurrentView('directory')}
                className="flex items-center gap-2 text-sm font-bold text-amber-700 hover:text-amber-800"
              >
                <ArrowLeftRight size={16} />
                {t('backToDirectory')}
              </button>
            </div>
            
            <ComparisonView
              selectedIds={comparisonIds}
              onRemove={(id) => setComparisonIds(prev => prev.filter(i => i !== id))}
              onAdd={(id) => setComparisonIds(prev => [...prev, id].slice(-4))}
              cooperatives={cooperatives}
            />
          </motion.div>
        ) : currentView === 'staging' ? (
          <StagingArea />
        ) : currentView === 'portal' ? (
          isProfileLoading ? (
            <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-amber-600" /></div>
          ) : (
            <CoopPortal 
              coopId={portalCoopId || userProfile?.cooperativeId} 
              isNew={!portalCoopId && !userProfile?.cooperativeId}
              onComplete={() => {
                setCurrentView('directory');
                setPortalCoopId(null);
              }}
            />
          )
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Sidebar List */}
            <div className="lg:col-span-4 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-black text-stone-400 uppercase tracking-widest">{t('cooperatives')}</p>
                {userProfile?.role === 'admin' && (
                  <button 
                    onClick={() => {
                      setPortalCoopId(null);
                      setCurrentView('portal');
                    }}
                    className="p-1.5 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-all shadow-sm flex items-center gap-1 text-[10px] font-black uppercase tracking-widest"
                  >
                    <Plus size={12} />
                    {t('addCooperative')}
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {cooperatives.map((coop) => (
                  <motion.div
                    key={coop.id}
                    whileHover={{ x: 4 }}
                    onMouseEnter={() => setHoveredCoopId(coop.id)}
                    onMouseLeave={() => setHoveredCoopId(null)}
                    className={cn(
                      "group relative p-4 rounded-2xl border transition-all cursor-pointer",
                      selectedCoopId === coop.id 
                        ? "bg-white border-amber-500 shadow-md ring-1 ring-amber-500" 
                        : "bg-white/50 border-stone-200 hover:border-stone-300 hover:bg-white"
                    )}
                    onClick={() => setSelectedCoopId(coop.id)}
                  >
                    <div className="flex items-start gap-4">
                      <img
                        src={coop.logoUrl}
                        alt=""
                        className="w-12 h-12 rounded-xl object-cover border border-stone-100"
                        referrerPolicy="no-referrer"
                        onError={onLogoError}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-stone-100 text-stone-600 rounded uppercase">
                            {coop.country}
                          </span>
                          <span className="text-xs font-bold text-amber-600">{coop.selfReportedCuppingScore} pts</span>
                        </div>
                        <h3 className="font-bold text-stone-900 leading-tight group-hover:text-amber-900 transition-colors">
                          {coop.name}
                        </h3>
                        <p className="text-xs text-stone-500 mt-1 line-clamp-1">{coop.region}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleComparison(coop.id);
                        }}
                        className={cn(
                          "p-2 rounded-lg transition-all",
                          comparisonIds.includes(coop.id)
                            ? "bg-amber-100 text-amber-700"
                            : "bg-stone-50 text-stone-400 hover:bg-stone-100"
                        )}
                      >
                        <Scale size={16} />
                      </button>
                    </div>
                    
                    <AnimatePresence>
                      {hoveredCoopId === coop.id && (
                        <HoverSummary 
                          coop={coop} 
                          onCompare={(e) => {
                            e.stopPropagation();
                            toggleComparison(coop.id);
                          }}
                          isComparing={comparisonIds.includes(coop.id)}
                        />
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Main Detail View */}
            <div className="lg:col-span-8">
              <AnimatePresence mode="wait">
                {selectedCoop ? (
                  <motion.div
                    key={selectedCoop.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-8"
                  >
                    {/* Hero */}
                    <div className="relative h-64 rounded-3xl overflow-hidden group">
                      <img
                        src={selectedCoop.imageUrl}
                        alt={selectedCoop.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                        onError={onImageError}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 p-8 flex items-end justify-between w-full">
                        <div>
                          <h2 className="text-4xl font-black text-white tracking-tight mb-2">{selectedCoop.name}</h2>
                          <div className="flex items-center gap-4 text-white/80 text-sm font-medium">
                            <span className="flex items-center gap-1"><MapPin size={14} /> {selectedCoop.region}, {selectedCoop.country}</span>
                            <span className="flex items-center gap-1"><Calendar size={14} /> {t('established')} {selectedCoop.established}</span>
                          </div>
                          
                          {userProfile?.role === 'admin' && (
                            <div className="mt-4 flex flex-wrap gap-3">
                              <button 
                                onClick={() => {
                                  setPortalCoopId(selectedCoop.id);
                                  setCurrentView('portal');
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 transition-all shadow-lg"
                              >
                                <Edit size={14} />
                                {t('editCooperative')}
                              </button>
                              <button 
                                onClick={async () => {
                                  if (window.confirm(t('confirmDelete'))) {
                                    try {
                                      await deleteDoc(doc(db, 'cooperatives', selectedCoop.id));
                                      toast.success(t('success'));
                                      setSelectedCoopId(null);
                                    } catch (error) {
                                      console.error("Error deleting coop", error);
                                      toast.error(t('error'));
                                    }
                                  }
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-all shadow-lg"
                              >
                                <Trash2 size={14} />
                                {t('deleteCooperative')}
                              </button>
                              {!userProfile?.cooperativeId && (
                                <button 
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!user) return;
                                    const docRef = doc(db, 'users', user.uid);
                                    await updateDoc(docRef, { cooperativeId: selectedCoop.id });
                                    setUserProfile({ ...userProfile, cooperativeId: selectedCoop.id });
                                    toast.success(`You are now the manager of ${selectedCoop.name}. The Cooperative Portal is now accessible in the navigation bar.`);
                                  }}
                                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition-all shadow-lg"
                                >
                                  <Shield size={14} />
                                  Claim as Manager (Dev Mode)
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <button 
                          onClick={() => {
                            const csvContent = [
                              [t('metric'), 'Value'],
                              ['Name', selectedCoop.name],
                              ['Country', selectedCoop.country],
                              ['Region', selectedCoop.region],
                              [t('established'), selectedCoop.established],
                              [t('members'), selectedCoop.members],
                              [t('cuppingScore'), selectedCoop.selfReportedCuppingScore],
                              [t('production'), selectedCoop.annualProduction],
                              [t('description'), selectedCoop.description]
                            ].map(row => row.join(',')).join('\n');
                            
                            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                            const link = document.createElement('a');
                            const url = URL.createObjectURL(blob);
                            link.setAttribute('href', url);
                            link.setAttribute('download', `${selectedCoop.name.replace(/\s+/g, '_')}_report.csv`);
                            link.style.visibility = 'hidden';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          className="px-4 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-xs font-bold text-white hover:bg-white/20 transition-all flex items-center gap-2"
                        >
                          <Award size={14} /> {t('downloadReport')}
                        </button>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard icon={Users} label={t('members')} value={selectedCoop.members.toLocaleString()} />
                      <StatCard icon={TrendingUp} label={t('production')} value={selectedCoop.annualProduction} unit="Tons" />
                      <StatCard icon={Award} label={t('score')} value={selectedCoop.selfReportedCuppingScore} />
                      <StatCard icon={Scale} label="Altitude" value={`${selectedCoop.altitudeRange[0]}-${selectedCoop.altitudeRange[1]}`} unit="m" />
                    </div>

                    {/* Detailed Metrics (Real Data Additions) */}
                    {(selectedCoop.menMembers || selectedCoop.areaHa || selectedCoop.households) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {selectedCoop.menMembers && selectedCoop.womenMembers && (
                          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">{t('genderDistribution')}</h4>
                            <div className="flex items-center gap-4">
                              <div className="flex-1">
                                <div className="h-4 bg-stone-100 rounded-full overflow-hidden flex">
                                  <div 
                                    className="h-full bg-blue-500" 
                                    style={{ width: `${(selectedCoop.menMembers / selectedCoop.members) * 100}%` }} 
                                  />
                                  <div 
                                    className="h-full bg-pink-500" 
                                    style={{ width: `${(selectedCoop.womenMembers / selectedCoop.members) * 100}%` }} 
                                  />
                                </div>
                                <div className="flex justify-between mt-2 text-[10px] font-bold">
                                  <span className="text-blue-600">{selectedCoop.menMembers} {t('men')}</span>
                                  <span className="text-pink-600">{selectedCoop.womenMembers} {t('women')}</span>
                                </div>
                              </div>
                            </div>
                            {selectedCoop.youthMembers && (
                              <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between">
                                <span className="text-[10px] font-bold text-stone-400 uppercase">{t('youthRepresentation')}</span>
                                <span className="text-xs font-bold text-amber-600">{Math.round((selectedCoop.youthMembers / selectedCoop.members) * 100)}%</span>
                              </div>
                            )}
                          </div>
                        )}
                        {selectedCoop.households && (
                          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">{t('socialImpact')}</h4>
                            <div className="flex items-center gap-4">
                              <div className="p-3 bg-blue-50 rounded-lg text-blue-700">
                                <Users size={20} />
                              </div>
                              <div>
                                <p className="text-lg font-bold text-stone-900">{selectedCoop.households}</p>
                                <p className="text-[10px] font-medium text-stone-500 uppercase tracking-wider">{t('beneficiaryHouseholds')}</p>
                              </div>
                            </div>
                          </div>
                        )}
                        {selectedCoop.areaHa && (
                          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">{t('productionCapacity')}</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-[10px] text-stone-400 uppercase">{t('totalArea')}</p>
                                <p className="text-lg font-bold">{selectedCoop.areaHa} <span className="text-xs font-normal">HA</span></p>
                              </div>
                              {selectedCoop.treeCount && (
                                <div>
                                  <p className="text-[10px] text-stone-400 uppercase">{t('coffeeTrees')}</p>
                                  <p className="text-lg font-bold">{selectedCoop.treeCount.toLocaleString()}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Production Trends */}
                    {selectedCoop.productionHistory && (
                      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                          <TrendingUp size={20} className="text-amber-600" />
                          {t('productionRevenueTrends')}
                        </h3>
                        <ProductionTrendChart data={selectedCoop.productionHistory} />
                      </div>
                    )}

                    {/* Content Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Left: Description & Details */}
                      <div className="space-y-6">
                        <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Info size={18} className="text-amber-600" />
                            {t('overview')}
                          </h3>
                          <p className="text-stone-600 leading-relaxed mb-6">
                            {selectedCoop.description}
                          </p>
                          
                          <div className="space-y-4">
                            <div>
                              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">{t('varieties')}</p>
                              <div className="flex flex-wrap gap-2">
                                {selectedCoop.varieties.map(v => (
                                  <span key={v} className="px-3 py-1 bg-stone-100 text-stone-700 text-xs font-medium rounded-lg">
                                    {v}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">{t('sustainabilityFocus')}</p>
                              <div className="flex flex-wrap gap-2">
                                {selectedCoop.sustainabilityFocus.map(s => (
                                  <span key={s} className="px-3 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-lg border border-green-100 flex items-center gap-1">
                                    <Leaf size={12} /> {s}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Sensory Radar */}
                      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                          <Coffee size={18} className="text-amber-600" />
                          {t('sensoryProfile')}
                        </h3>
                        <SensoryRadar profile={selectedCoop.sensoryProfile} name={selectedCoop.name} />
                        <div className="mt-4 grid grid-cols-5 gap-2 text-center">
                          {Object.entries(selectedCoop.sensoryProfile).map(([key, val]) => (
                            <div key={key}>
                              <p className="text-[8px] font-bold text-stone-400 uppercase">{t(key as any)}</p>
                              <p className="text-sm font-bold text-stone-900">{val}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-stone-200 rounded-3xl bg-white/30">
                    <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center text-stone-300 mb-4">
                      <Coffee size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-stone-900">{t('selectACooperative')}</h3>
                    <p className="text-stone-500 max-w-xs mt-2">
                      {t('selectACooperativeDesc')}
                    </p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-stone-200 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-amber-900 rounded-lg flex items-center justify-center text-white">
                  <Coffee size={18} />
                </div>
                <h1 className="text-xl font-black tracking-tighter text-stone-900">CongoFarmers</h1>
              </div>
              <p className="text-stone-500 text-sm max-w-sm leading-relaxed">
                {t('platformDesc')}
              </p>
            </div>
            <div>
              <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-4">{t('platform')}</h4>
              <ul className="space-y-2 text-sm font-bold text-stone-600">
                <li><button onClick={() => setCurrentView('directory')} className="hover:text-amber-700">{t('directory')}</button></li>
                <li><button onClick={() => setCurrentView('comparison')} className="hover:text-amber-700">{t('comparison')}</button></li>
                <li className="hover:text-amber-700 cursor-pointer">{t('marketplace')}</li>
                <li className="hover:text-amber-700 cursor-pointer">{t('impactReports')}</li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-4">{t('contact')}</h4>
              <ul className="space-y-2 text-sm font-bold text-stone-600">
                <li className="hover:text-amber-700 cursor-pointer">{t('support')}</li>
                <li className="hover:text-amber-700 cursor-pointer">{t('partnerships')}</li>
                <li className="hover:text-amber-700 cursor-pointer">{t('privacyPolicy')}</li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-stone-100 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-stone-400 font-medium">© 2026 CongoFarmers. {t('allRightsReserved')}</p>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-xs font-bold text-stone-400">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                {t('systemStatus')}: {t('operational')}
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Comparison Bar */}
      {currentView !== 'comparison' && comparisonIds.length > 0 && (
        <motion.div 
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="bg-stone-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-6 border border-white/10">
            <div className="flex items-center gap-2">
              <Scale size={18} className="text-amber-400" />
              <span className="text-sm font-bold">{comparisonIds.length} {t('coopsSelected')}</span>
            </div>
            <div className="h-4 w-px bg-white/20" />
            <button 
              onClick={() => setCurrentView('comparison')}
              className="text-sm font-bold hover:text-amber-400 transition-colors flex items-center gap-1"
            >
              {t('compareNow')} <ChevronRight size={16} />
            </button>
            <button 
              onClick={() => setComparisonIds([])}
              className="p-1 hover:bg-white/10 rounded-full transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}

      {user && (
        <UserProfileModal 
          isOpen={isProfileModalOpen} 
          onClose={() => setIsProfileModalOpen(false)} 
          profile={userProfile}
          user={user}
        />
      )}
    </div>
  );
}
