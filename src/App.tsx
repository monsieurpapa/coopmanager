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
  Plus, Upload, LogIn, LogOut, Shield, User as UserIcon, Loader2, Check, Search, Filter, Download, Edit, Trash2, Mail, Share2, QrCode, Printer, AlertCircle,
  ShieldCheck, ShieldAlert
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { MOCK_COOPERATIVES, CoffeeCooperative, EditionParticipant, BestOfCongoEdition, EudrCompliance } from './types';
import { cn } from './lib/utils';
import { auth, db } from './firebase';
import { type User as FirebaseUser } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, getDoc, updateDoc, addDoc, query, where, serverTimestamp, deleteDoc, getDocs, getDocFromServer, writeBatch, collectionGroup } from 'firebase/firestore';
import { useDropzone } from 'react-dropzone';
import { parseCooperativeProfile } from './services/geminiService';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Markdown from 'react-markdown';
import toast, { Toaster } from 'react-hot-toast';
import * as z from 'zod';
import { handleFirestoreError, OperationType } from './lib/firestore-utils';
import { CooperativeSchema, EudrComplianceSchema, type CooperativeFormData } from './schemas';
import { sanitizeStagingData } from './lib/staging';
import { LanguageContext, useTranslation, LanguageSwitcher, translations, type Language } from './contexts/language';
import { AuthContext, useAuth, useAuthProvider } from './contexts/auth';
import { isAdmin, canAccessStaging, canAccessBocAdmin, canAccessPortal, canDeleteCooperative } from './lib/permissions';
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

// --- Constants ---

const CANONICAL_CERTIFICATIONS = ['Fairtrade', 'Bio-NOP', 'Bio-UE', 'Bio-BRA', 'RainForest Alliance', 'UTZ'];
const ADMIN_EMAIL = 'dieudonneishara@gmail.com';

// --- CSV helpers ---

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(rows: unknown[][], filename: string) {
  const content = rows.map(row => row.map(escapeCsvCell).join(',')).join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

    downloadCsv([headers, ...rows], `cooperative_comparison_${new Date().toISOString().split('T')[0]}.csv`);
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

// --- EUDR badge (public detail view) ---
// Three states by design: no field -> renders nothing at all (49+ coops have
// no data); complete -> "ready"; anything else -> honest "incomplete", never
// hidden. Wording is legally scoped: geolocation readiness only.
const EudrBadge = ({ eudr }: { eudr?: EudrCompliance }) => {
  const { t, lang } = useTranslation();
  if (!eudr) return null;
  const ready = eudr.scorePercent === 100 && !eudr.oversizedFarmsMissingPolygon;
  const computedDate = new Date(eudr.computedAt);
  const asOf = isNaN(computedDate.getTime())
    ? eudr.computedAt
    : computedDate.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB',
        { year: 'numeric', month: 'short', day: 'numeric' });
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5">
      <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-3">{t('eudrTitle')}</h3>
      <div className={cn(
        "flex items-center gap-3 rounded-xl border p-3",
        ready ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
      )}>
        {ready
          ? <ShieldCheck size={28} className="text-emerald-600 flex-shrink-0" />
          : <ShieldAlert size={28} className="text-amber-600 flex-shrink-0" />}
        <div>
          <p className={cn("text-sm font-black", ready ? "text-emerald-800" : "text-amber-800")}>
            {ready ? t('eudrReady') : t('eudrIncomplete')}
          </p>
          <p className="text-xs text-stone-600 mt-0.5">
            {eudr.scorePercent}% {t('eudrScoreLabel')} · {eudr.farmsWithGps}/{eudr.totalFarms} {t('eudrFarmsGps')}
          </p>
          <p className="text-[11px] text-stone-500 mt-0.5">
            {t('eudrAsOf')} {asOf} {t('eudrFromFile')} {eudr.sourceFileName}
          </p>
        </div>
      </div>
      <p className="text-[11px] text-stone-400 leading-snug mt-3">{t('eudrClaimScope')}</p>
    </div>
  );
};

// --- EUDR admin paste box ---
// The only write path for eudrCompliance: admin pastes tools/eudr output,
// Zod validates the shape (mirrors isValidEudrCompliance in firestore.rules),
// and the write runs under the admin's own auth — no service-account key.
const EudrAdminBox = ({ cooperatives }: { cooperatives: CoffeeCooperative[] }) => {
  const { t } = useTranslation();
  const [coopId, setCoopId] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const handlePublish = async () => {
    setStatus(null);
    if (!coopId) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      setStatus({ ok: false, msg: `${t('eudrInvalid')} ${(e as Error).message}` });
      return;
    }
    // Accept the full script output file or just its eudrCompliance object.
    const candidate = (parsed as any)?.eudrCompliance ?? parsed;
    // The script output names its cooperative; refuse to publish onto a
    // different coop (wrong-coop paste is silent and buyer-visible). Pasting
    // just the eudrCompliance object skips this check deliberately.
    const scriptCoop = (parsed as any)?.context?.cooperative;
    const selected = cooperatives.find(c => c.id === coopId);
    if (typeof scriptCoop === 'string' && scriptCoop.trim() && selected &&
        !selected.name.toLowerCase().includes(scriptCoop.trim().toLowerCase()) &&
        !scriptCoop.trim().toLowerCase().includes(selected.name.toLowerCase())) {
      setStatus({ ok: false, msg: `${t('eudrCoopMismatch')} "${scriptCoop}" ≠ "${selected.name}"` });
      return;
    }
    const result = EudrComplianceSchema.safeParse(candidate);
    if (!result.success) {
      const detail = result.error.issues
        .map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      setStatus({ ok: false, msg: `${t('eudrInvalid')} ${detail}` });
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'cooperatives', coopId), { eudrCompliance: result.data });
      setStatus({ ok: true, msg: t('eudrSaved') });
      setJsonText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cooperatives/${coopId}`);
      setStatus({ ok: false, msg: String(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-emerald-600" />
        <h3 className="text-lg font-black text-stone-900">{t('eudrAdminTitle')}</h3>
      </div>
      <p className="text-xs text-stone-500">{t('eudrAdminHelp')}</p>
      <select
        value={coopId}
        onChange={e => setCoopId(e.target.value)}
        className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white"
      >
        <option value="">{t('eudrSelectCoop')}</option>
        {cooperatives.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <textarea
        value={jsonText}
        onChange={e => setJsonText(e.target.value)}
        placeholder={t('eudrPaste')}
        rows={6}
        spellCheck={false}
        className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs font-mono"
      />
      {status && (
        <p className={cn("text-xs font-bold break-words",
          status.ok ? "text-emerald-700" : "text-red-600")}>
          {status.msg}
        </p>
      )}
      <button
        onClick={handlePublish}
        disabled={saving || !coopId || !jsonText.trim()}
        className="px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-bold disabled:opacity-40 flex items-center gap-2"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {t('eudrSave')}
      </button>
    </div>
  );
};

// --- Staging Area Component ---
function StagingArea({ cooperatives }: { cooperatives: CoffeeCooperative[] }) {
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
        ...sanitizeStagingData(data),
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

      <EudrAdminBox cooperatives={cooperatives} />
    </div>
  );
}

// --- Cooperative Portal Component ---
const TOTAL_STEPS = 4;

function CoopPortal({ coopId, isNew = false, onComplete, canDelete = false }: { coopId?: string, isNew?: boolean, onComplete?: () => void, canDelete?: boolean }) {
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

  // Comma-separated text state for array fields (Zod schema expects arrays)
  const [varietiesText, setVarietiesText] = useState('');
  const [processingsText, setProcessingsText] = useState('');
  const [certsText, setCertsText] = useState('');
  const [sustainabilityText, setSustainabilityText] = useState('');

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
      processingMethods: [],
      certifications: [],
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
    return onSnapshot(doc(db, 'cooperatives', coopId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCoop(data);
        reset(data as any);
        setVarietiesText((data.varieties ?? []).join(', '));
        setProcessingsText((data.processingMethods ?? []).join(', '));
        setCertsText((data.certifications ?? []).join(', '));
        setSustainabilityText((data.sustainabilityFocus ?? []).join(', '));
      } else {
        console.warn(`Cooperative ${coopId} not found`);
        setCoop({ name: 'Not Found', country: '', region: '', members: 0 });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
  }, [coopId, reset, isNew]);

  const parseCSV = (text: string) => text.split(',').map(s => s.trim()).filter(Boolean);

  const onSubmit = async (data: CooperativeFormData) => {
    try {
      const payload = {
        ...data,
        varieties: parseCSV(varietiesText),
        processingMethods: parseCSV(processingsText),
        certifications: parseCSV(certsText),
        sustainabilityFocus: parseCSV(sustainabilityText),
        lastUpdated: serverTimestamp(),
      };
      if (isNew) {
        await addDoc(collection(db, 'cooperatives'), payload);
      } else if (coopId) {
        await updateDoc(doc(db, 'cooperatives', coopId), payload);
      }
      toast.success(t('success'));
      if (onComplete) onComplete();
    } catch (error) {
      console.error("Error saving coop", error);
      toast.error(t('error'));
    }
  };

  const inputClass = "w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm";
  const labelClass = "text-xs font-bold text-stone-400 uppercase tracking-wide";

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
          <div className="flex items-center gap-3">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                  step === s ? "bg-stone-900 text-white" : step > s ? "bg-green-500 text-white" : "bg-stone-100 text-stone-400"
                )}>
                  {step > s ? <Check size={14} /> : s}
                </div>
                {s < TOTAL_STEPS && <div className="w-6 h-px bg-stone-100" />}
              </div>
            ))}
          </div>
          {!isNew && canDelete && (
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
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Step 1: Identity */}
          {step === 1 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <h3 className="text-lg font-bold">{t('overview')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={labelClass}>Cooperative Name *</label>
                  <input {...register('name')} className={inputClass} />
                  {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Country *</label>
                  <input {...register('country')} className={inputClass} />
                  {errors.country && <p className="text-red-500 text-xs">{errors.country.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={labelClass}>Region *</label>
                  <input {...register('region')} className={inputClass} placeholder="e.g. Sud-Kivu" />
                  {errors.region && <p className="text-red-500 text-xs">{errors.region.message}</p>}
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Year Established</label>
                  <input type="number" {...register('established', { valueAsNumber: true })} className={inputClass} placeholder="e.g. 2019" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={labelClass}>Commodity</label>
                  <select {...register('commodity')} className={inputClass}>
                    <option value="">-- select --</option>
                    <option value="coffee">Coffee</option>
                    <option value="cocoa">Cocoa</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Manager Email</label>
                  <input type="email" {...register('managerEmail')} className={inputClass} placeholder="manager@example.com" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={labelClass}>Image URL</label>
                  <input {...register('imageUrl')} className={inputClass} placeholder="https://..." />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Logo URL</label>
                  <input {...register('logoUrl')} className={inputClass} placeholder="https://..." />
                </div>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Description</label>
                <textarea {...register('description')} rows={4} className={inputClass} />
              </div>
            </motion.div>
          )}

          {/* Step 2: Members & Impact */}
          {step === 2 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <h3 className="text-lg font-bold">{t('memberDemographics')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={labelClass}>Total Members *</label>
                  <input type="number" {...register('members', { valueAsNumber: true })} className={inputClass} />
                  {errors.members && <p className="text-red-500 text-xs">{errors.members.message}</p>}
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Households</label>
                  <input type="number" {...register('households', { valueAsNumber: true })} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className={labelClass}>Men Members</label>
                  <input type="number" {...register('menMembers', { valueAsNumber: true })} className={inputClass} />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Women Members</label>
                  <input type="number" {...register('womenMembers', { valueAsNumber: true })} className={inputClass} />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Youth Members</label>
                  <input type="number" {...register('youthMembers', { valueAsNumber: true })} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={labelClass}>Area (ha)</label>
                  <input type="number" step="0.1" {...register('areaHa', { valueAsNumber: true })} className={inputClass} />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Tree Count</label>
                  <input type="number" {...register('treeCount', { valueAsNumber: true })} className={inputClass} />
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Production & Quality */}
          {step === 3 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <h3 className="text-lg font-bold">{t('productionStats')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={labelClass}>Annual Production (Tons)</label>
                  <input type="number" step="0.1" {...register('annualProduction', { valueAsNumber: true })} className={inputClass} />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Self-Reported Cupping Score</label>
                  <input type="number" step="0.1" min="0" max="100" {...register('selfReportedCuppingScore', { valueAsNumber: true })} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={labelClass}>Altitude Min (m)</label>
                  <input type="number" {...register('altitudeRange.0', { valueAsNumber: true })} className={inputClass} placeholder="e.g. 1450" />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Altitude Max (m)</label>
                  <input type="number" {...register('altitudeRange.1', { valueAsNumber: true })} className={inputClass} placeholder="e.g. 1800" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={labelClass}>Varieties (comma-separated)</label>
                  <input value={varietiesText} onChange={e => setVarietiesText(e.target.value)} className={inputClass} placeholder="Bourbon, Arabica" />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Processing Methods (comma-separated)</label>
                  <input value={processingsText} onChange={e => setProcessingsText(e.target.value)} className={inputClass} placeholder="Fully Washed, Natural" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={labelClass}>Certifications (comma-separated)</label>
                  <input value={certsText} onChange={e => setCertsText(e.target.value)} className={inputClass} placeholder="Fairtrade, Organic" />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Sustainability Focus (comma-separated)</label>
                  <input value={sustainabilityText} onChange={e => setSustainabilityText(e.target.value)} className={inputClass} placeholder="Agroforestry, Water management" />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <input type="checkbox" id="isBocParticipant" {...register('isBocParticipant')} className="w-4 h-4 accent-amber-600" />
                <label htmlFor="isBocParticipant" className="text-sm font-bold text-stone-700">Best of Congo Participant</label>
              </div>
            </motion.div>
          )}

          {/* Step 4: Sensory Profile */}
          {step === 4 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <h3 className="text-lg font-bold">{t('sensoryProfile')}</h3>
              <p className="text-stone-400 text-xs">Score each attribute 0–10 (e.g. 8.5)</p>
              <div className="grid grid-cols-5 gap-4">
                {(['aroma', 'acidity', 'body', 'sweetness', 'aftertaste'] as const).map((metric) => (
                  <div key={metric} className="space-y-1">
                    <label className="text-[10px] font-bold text-stone-400 uppercase">{t(metric)}</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      {...register(`sensoryProfile.${metric}` as any, { valueAsNumber: true })}
                      className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-center text-sm"
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
            {step < TOTAL_STEPS ? (
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

function QrCodeModal({ url, coopName, onClose }: { url: string; coopName: string; onClose: () => void }) {
  const handleDownload = () => {
    const svg = document.getElementById('coop-qr-svg');
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${coopName.replace(/[^a-zA-Z0-9]/g, '_')}_qrcode.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-8 max-w-xs w-full text-center shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-black text-stone-900 mb-1">{coopName}</h3>
        <p className="text-xs text-stone-400 mb-6 uppercase tracking-widest">Scan to view profile</p>
        <div className="flex justify-center mb-6 p-4 bg-stone-50 rounded-xl">
          <QRCodeSVG id="coop-qr-svg" value={url} size={180} bgColor="#fafaf9" fgColor="#1c1917" level="M" />
        </div>
        <p className="text-[10px] text-stone-400 mb-6 break-all font-mono">{url}</p>
        <div className="flex gap-3">
          <button onClick={handleDownload} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-amber-700 text-white rounded-xl text-xs font-bold hover:bg-amber-800 transition-all">
            <Download size={13} /> Download
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-200 transition-all">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const RequestSampleSchema = z.object({
  buyerName: z.string().min(1, 'Required').max(100),
  company: z.string().min(1, 'Required').max(200),
  country: z.string().min(1, 'Required').max(100),
  interest: z.enum(['sample', 'contract', 'info']),
  quantityKg: z.string().max(50).optional(),
  message: z.string().max(1000).optional(),
});
type RequestSampleData = z.infer<typeof RequestSampleSchema>;

function RequestSampleModal({ coop, onClose }: { coop: CoffeeCooperative; onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<RequestSampleData>({
    resolver: zodResolver(RequestSampleSchema),
    defaultValues: { interest: 'sample' },
  });

  const onSubmit = async (data: RequestSampleData) => {
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'leads'), {
        coopId: coop.id,
        coopName: coop.name,
        ...data,
        createdAt: serverTimestamp(),
        status: 'new',
      });
      setSubmitted(true);
    } catch {
      toast.error('Could not submit. Please use the Contact button to email directly.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={28} className="text-green-600" />
          </div>
          <h3 className="text-lg font-black text-stone-900 mb-2">Request sent!</h3>
          <p className="text-stone-500 text-sm mb-6">Congo Agri Platform will be in touch within 2 business days.</p>
          <button onClick={onClose} className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-black text-stone-900">Request Sample</h3>
            <p className="text-xs text-stone-400 mt-0.5">{coop.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1 block">Your Name *</label>
              <input {...register('buyerName')} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              {errors.buyerName && <p className="text-[10px] text-red-500 mt-0.5">{errors.buyerName.message}</p>}
            </div>
            <div>
              <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1 block">Company *</label>
              <input {...register('company')} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              {errors.company && <p className="text-[10px] text-red-500 mt-0.5">{errors.company.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1 block">Country *</label>
              <input {...register('country')} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              {errors.country && <p className="text-[10px] text-red-500 mt-0.5">{errors.country.message}</p>}
            </div>
            <div>
              <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1 block">Interest</label>
              <select {...register('interest')} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white">
                <option value="sample">Sample request</option>
                <option value="contract">Contract sourcing</option>
                <option value="info">More information</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1 block">Quantity (kg, approx.)</label>
            <input {...register('quantityKg')} placeholder="e.g. 300 kg" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <div>
            <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1 block">Message</label>
            <textarea {...register('message')} rows={3} placeholder="Specific requirements, questions, or context..." className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
          </div>
          <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 py-3 bg-amber-700 text-white rounded-xl font-bold hover:bg-amber-800 transition-all disabled:opacity-60">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
            {submitting ? 'Sending...' : 'Send Request'}
          </button>
        </form>
      </div>
    </div>
  );
}

function PublicCoopProfile({ coopId }: { coopId: string }) {
  const { t } = useTranslation();
  const [coop, setCoop] = useState<CoffeeCooperative | null>(
    import.meta.env.DEV ? (MOCK_COOPERATIVES.find(c => c.id === coopId) ?? null) : null
  );
  const [loading, setLoading] = useState(!import.meta.env.DEV);
  const [notFound, setNotFound] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isSampleOpen, setIsSampleOpen] = useState(false);

  // Inject print styles for clean PDF output
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'profile-print-styles';
    style.textContent = `
      @media print {
        .print-hide { display: none !important; }
        body { background: white !important; }
        @page { margin: 12mm; }
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV && coop) return;
    getDoc(doc(db, 'cooperatives', coopId))
      .then(snap => {
        if (snap.exists()) {
          setCoop({ id: snap.id, ...snap.data() } as CoffeeCooperative);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [coopId]);

  useEffect(() => {
    if (coop) document.title = `${coop.name} — CongoFarmers`;
    return () => { document.title = 'CongoFarmers'; };
  }, [coop]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf9f6] flex items-center justify-center">
        <Loader2 className="animate-spin text-amber-600" size={40} />
      </div>
    );
  }

  if (notFound || !coop) {
    return (
      <div className="min-h-screen bg-[#faf9f6] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <Coffee size={48} className="text-stone-300 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-stone-900 mb-2">Profile not found</h2>
          <p className="text-stone-500 mb-6">This cooperative profile doesn't exist or has been removed.</p>
          <a href={window.location.pathname} className="inline-flex items-center gap-2 px-6 py-3 bg-amber-900 text-white rounded-xl font-bold hover:bg-amber-800 transition-all">
            <Coffee size={16} /> View CongoFarmers
          </a>
        </div>
      </div>
    );
  }

  const appUrl = window.location.pathname + window.location.search;
  const profileUrl = `${window.location.origin}${window.location.pathname}#/coop/${encodeURIComponent(coop.id)}`;

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <Toaster position="bottom-right" toastOptions={{ duration: 4000 }} />

      {/* Modals */}
      {isQrOpen && <QrCodeModal url={profileUrl} coopName={coop.name} onClose={() => setIsQrOpen(false)} />}
      {isSampleOpen && <RequestSampleModal coop={coop} onClose={() => setIsSampleOpen(false)} />}

      {/* Minimal header — hidden on print */}
      <header className="print-hide bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between gap-3">
        <a href={appUrl} className="flex items-center gap-2 text-stone-900 hover:text-amber-700 transition-colors flex-shrink-0">
          <div className="w-7 h-7 bg-amber-900 rounded-lg flex items-center justify-center text-white">
            <Coffee size={15} />
          </div>
          <span className="text-base font-black tracking-tighter">CongoFarmers</span>
        </a>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <button
            onClick={() => setIsQrOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 text-stone-700 rounded-lg text-xs font-bold hover:bg-stone-200 transition-all"
          >
            <QrCode size={13} /> QR Code
          </button>
          <a href={appUrl} className="hidden sm:flex items-center gap-1 text-xs font-bold text-stone-400 hover:text-amber-700 transition-colors">
            Directory <ChevronRight size={13} />
          </a>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Hero */}
        <div className="relative h-56 rounded-2xl overflow-hidden">
          <img
            src={coop.imageUrl}
            alt={coop.name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={onImageError}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 p-6 flex items-end gap-4">
            <img
              src={coop.logoUrl}
              alt=""
              className="w-14 h-14 rounded-xl object-cover border-2 border-white/30 flex-shrink-0"
              onError={onLogoError}
            />
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight">{coop.name}</h1>
              <p className="text-white/80 text-sm font-medium flex items-center gap-1 mt-1">
                <MapPin size={13} /> {coop.region}, {coop.country}
              </p>
              {coop.established && (
                <p className="text-white/60 text-xs mt-0.5 flex items-center gap-1">
                  <Calendar size={12} /> {t('established')} {coop.established}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={Users} label={t('members')} value={coop.members.toLocaleString()} />
          <StatCard icon={Award} label={t('score')} value={coop.selfReportedCuppingScore} />
          <StatCard icon={Scale} label="Altitude" value={`${coop.altitudeRange[0]}–${coop.altitudeRange[1]}`} unit="m" />
          <StatCard icon={TrendingUp} label={t('production')} value={coop.annualProduction} unit="T" />
        </div>

        {/* Certifications */}
        {coop.certifications && coop.certifications.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-3">Certifications</h3>
            <div className="flex flex-wrap gap-2">
              {coop.certifications.map(cert => (
                <span key={cert} className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-xs font-bold">
                  {cert}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* EUDR geolocation readiness — renders nothing when no data */}
        <EudrBadge eudr={coop.eudrCompliance} />

        {/* Description */}
        {coop.description && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-3">About</h3>
            <p className="text-sm text-stone-600 leading-relaxed">{coop.description}</p>
          </div>
        )}

        {/* Sensory profile */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-2">Sensory Profile</h3>
          <SensoryRadar profile={coop.sensoryProfile} name={coop.name} />
        </div>

        {/* BoC history */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-4">Best of Congo History</h3>
          <BocHistoryTab coopId={coop.id} />
        </div>

        {/* CTA row — hidden on print */}
        <div className="print-hide grid grid-cols-2 sm:grid-cols-4 gap-3 pb-8">
          <button
            onClick={() => setIsSampleOpen(true)}
            className="col-span-2 flex items-center justify-center gap-2 py-3 bg-amber-700 text-white rounded-xl font-bold hover:bg-amber-800 transition-all"
          >
            <Mail size={16} /> Request Sample
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center justify-center gap-2 py-3 bg-stone-100 text-stone-700 rounded-xl font-bold hover:bg-stone-200 transition-all text-sm"
          >
            <Printer size={15} /> PDF
          </button>
          <a
            href={appUrl}
            className="flex items-center justify-center gap-2 py-3 bg-stone-100 text-stone-700 rounded-xl font-bold hover:bg-stone-200 transition-all text-sm"
          >
            <Globe size={15} /> Directory
          </a>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    const bl = navigator.language?.toLowerCase() ?? '';
    return bl.startsWith('fr') ? 'fr' : 'en';
  });
  const [hashCoopId] = useState<string | null>(() => {
    const m = window.location.hash.match(/^#\/coop\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  });

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

  const authValue = useAuthProvider();

  return (
    <ErrorBoundary>
      <AuthContext.Provider value={authValue}>
        <LanguageContext.Provider value={{ lang, setLang, t }}>
          {hashCoopId ? <PublicCoopProfile coopId={hashCoopId} /> : <AppContent />}
        </LanguageContext.Provider>
      </AuthContext.Provider>
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

// --- Best of Congo Admin ---

const BocSaleSchema = z.object({
  buyerName: z.string().optional().or(z.literal('')),
  buyerLogoUrl: z.string().optional().or(z.literal('')),
  bagsSold: z.number().min(0, 'Must be ≥ 0'),
  pricePerLb: z.number().min(0, 'Must be ≥ 0'), // Price in USD per lb
});

const BocParticipantSchema = z.object({
  coopId: z.string().min(1, 'Select a cooperative'),
  qtySubmitted: z.number().min(0, 'Must be ≥ 0'),
  cuppingScore: z.number().min(0, 'Must be ≥ 0').max(100, 'Max 100'),
  rank: z.number().int().min(0).optional(),
  sales: z.array(BocSaleSchema),
});

const BocEditionSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  theme: z.string().optional(),
  participants: z.array(BocParticipantSchema),
});

type BocEditionFormData = z.infer<typeof BocEditionSchema>;

function ParticipantSalesField({ control, register, participantIndex, errors }: {
  control: any;
  register: any;
  participantIndex: number;
  errors: any;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `participants.${participantIndex}.sales`,
  });

  return (
    <div className="mt-4 space-y-3 bg-stone-50 p-4 rounded-2xl border border-stone-200">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Detailed sales (60kg bags)</p>
        <button
          type="button"
          onClick={() => append({ buyerName: '', buyerLogoUrl: '', bagsSold: 0, pricePerLb: 0 })}
          className="flex items-center gap-1 text-[10px] font-black text-amber-700 hover:text-amber-900 uppercase tracking-wider transition-colors"
        >
          <Plus size={10} />
          Add Sale
        </button>
      </div>
      
      {fields.length > 0 ? (
        <div className="space-y-2">
          {fields.map((saleField, si) => (
            <div key={saleField.id} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4">
                <label className="block text-[8px] font-bold text-stone-400 uppercase mb-0.5 ml-1">Buyer</label>
                <input
                  {...register(`participants.${participantIndex}.sales.${si}.buyerName`)}
                  placeholder="Name"
                  className="w-full px-2 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-[8px] font-bold text-stone-400 uppercase mb-0.5 ml-1">Bags</label>
                <input
                  type="number"
                  {...register(`participants.${participantIndex}.sales.${si}.bagsSold`, { valueAsNumber: true })}
                  placeholder="Qty"
                  className="w-full px-2 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-[8px] font-bold text-stone-400 uppercase mb-0.5 ml-1">$/lb</label>
                <input
                  type="number"
                  step="0.01"
                  {...register(`participants.${participantIndex}.sales.${si}.pricePerLb`, { valueAsNumber: true })}
                  placeholder="Price"
                  className="w-full px-2 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                />
              </div>
              <div className="col-span-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => remove(si)}
                  className="p-1.5 text-stone-400 hover:text-red-500 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-stone-400 italic">No sales recorded yet.</p>
      )}
    </div>
  );
}

// --- BoC CSV Import ---

interface BocCsvRow {
  coopId: string;
  coopName: string;
  average: number;
  qtySubmitted: number;
  qtySold: number;
  buyers: string[];
  status: 'ok' | 'unknown_coop' | 'invalid_data';
  errors: string[];
}

function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let inQuote = false;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === ',' && !inQuote) {
      cells.push(current); current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

function parseBocCsv(text: string, cooperatives: CoffeeCooperative[]): BocCsvRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
  const col = (name: string) => header.indexOf(name);
  return lines.slice(1).map(line => {
    const cells = parseCSVLine(line);
    const rawCoopId = (cells[col('coopid')] ?? cells[col('coopname')] ?? '').trim();
    const rawAverage = cells[col('average')] ?? '';
    const rawQtySubmitted = cells[col('qtysubmitted')] ?? '';
    const rawQtySold = cells[col('qtysold')] ?? '';
    const rawBuyers = cells[col('buyers')] ?? '';
    const errors: string[] = [];
    const coop =
      cooperatives.find(c => c.id === rawCoopId) ||
      cooperatives.find(c => c.name.toLowerCase() === rawCoopId.toLowerCase());
    if (!coop) errors.push(`Unknown cooperative: "${rawCoopId}"`);
    const average = parseFloat(rawAverage);
    const qtySubmitted = parseFloat(rawQtySubmitted);
    const qtySold = parseFloat(rawQtySold);
    if (isNaN(average) || average < 0 || average > 100) errors.push(`Invalid score: "${rawAverage}"`);
    if (isNaN(qtySubmitted) || qtySubmitted < 0) errors.push('Invalid qtySubmitted');
    if (isNaN(qtySold) || qtySold < 0) errors.push('Invalid qtySold');
    const buyers = rawBuyers ? rawBuyers.split('|').map(b => b.trim()).filter(Boolean) : [];
    return {
      coopId: coop?.id ?? rawCoopId,
      coopName: coop?.name ?? rawCoopId,
      average: isNaN(average) ? 0 : average,
      qtySubmitted: isNaN(qtySubmitted) ? 0 : qtySubmitted,
      qtySold: isNaN(qtySold) ? 0 : qtySold,
      buyers,
      status: (errors.length > 0 ? (coop ? 'invalid_data' : 'unknown_coop') : 'ok') as BocCsvRow['status'],
      errors,
    };
  });
}

function BocCsvImportModal({
  cooperatives,
  onImport,
  onClose,
}: {
  cooperatives: CoffeeCooperative[];
  onImport: (rows: BocCsvRow[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<BocCsvRow[]>([]);
  const [fileName, setFileName] = useState('');

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt', '.csv'] },
    maxSize: 5 * 1024 * 1024,
    multiple: false,
    onDropAccepted: ([file]) => {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = e => {
        const text = e.target?.result as string;
        setRows(parseBocCsv(text, cooperatives));
      };
      reader.readAsText(file);
    },
    onDropRejected: () => toast.error('File rejected — must be a CSV under 5 MB'),
  });

  const handleDownloadTemplate = () => {
    downloadCsv(
      [['coopId', 'average', 'qtySubmitted', 'qtySold', 'buyers']],
      'boc_import_template.csv',
    );
  };

  const validRows = rows.filter(r => r.status === 'ok');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-100">
          <div>
            <h3 className="text-lg font-black text-stone-900">Import Participants from CSV</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Columns: <code className="bg-stone-100 px-1 rounded">coopId</code>,{' '}
              <code className="bg-stone-100 px-1 rounded">average</code>,{' '}
              <code className="bg-stone-100 px-1 rounded">qtySubmitted</code>,{' '}
              <code className="bg-stone-100 px-1 rounded">qtySold</code>,{' '}
              <code className="bg-stone-100 px-1 rounded">buyers</code> (pipe-separated)
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-xl transition-colors">
            <X size={18} className="text-stone-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Drop zone */}
          <div
            {...getRootProps()}
            className={cn(
              'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all',
              isDragActive ? 'border-amber-500 bg-amber-50' : 'border-stone-200 hover:border-amber-400 hover:bg-stone-50',
            )}
          >
            <input {...getInputProps()} />
            <Upload size={32} className="mx-auto mb-3 text-stone-400" />
            {fileName ? (
              <p className="font-bold text-stone-700">{fileName}</p>
            ) : (
              <>
                <p className="font-bold text-stone-700">Drop a CSV file here, or click to browse</p>
                <p className="text-xs text-stone-400 mt-1">Max 5 MB</p>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 text-xs font-bold text-amber-700 hover:text-amber-900 transition-colors"
          >
            <Download size={13} />
            Download template CSV
          </button>

          {/* Preview table */}
          {rows.length > 0 && (
            <div className="rounded-2xl border border-stone-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-stone-600">Coop</th>
                    <th className="px-3 py-2 text-right font-bold text-stone-600">Score</th>
                    <th className="px-3 py-2 text-right font-bold text-stone-600">Submitted (kg)</th>
                    <th className="px-3 py-2 text-right font-bold text-stone-600">Sold (kg)</th>
                    <th className="px-3 py-2 text-left font-bold text-stone-600">Buyers</th>
                    <th className="px-3 py-2 text-left font-bold text-stone-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={i}
                      className={cn(
                        'border-b border-stone-100 last:border-0',
                        row.status === 'ok' ? 'bg-green-50' : 'bg-red-50',
                      )}
                    >
                      <td className="px-3 py-2 font-medium text-stone-800">{row.coopName}</td>
                      <td className="px-3 py-2 text-right text-stone-700">{row.average}</td>
                      <td className="px-3 py-2 text-right text-stone-700">{row.qtySubmitted}</td>
                      <td className="px-3 py-2 text-right text-stone-700">{row.qtySold}</td>
                      <td className="px-3 py-2 text-stone-600">{row.buyers.join(', ') || '—'}</td>
                      <td className="px-3 py-2">
                        {row.status === 'ok' ? (
                          <span className="inline-flex items-center gap-1 text-green-700 font-bold">
                            <Check size={11} /> OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 font-bold" title={row.errors.join('; ')}>
                            <AlertCircle size={11} /> {row.status === 'unknown_coop' ? 'Unknown coop' : 'Invalid data'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-stone-100">
          <p className="text-xs text-stone-500">
            {rows.length > 0 && (
              <>
                <span className="text-green-700 font-bold">{validRows.length} valid</span>
                {rows.length - validRows.length > 0 && (
                  <>, <span className="text-red-600 font-bold">{rows.length - validRows.length} error{rows.length - validRows.length !== 1 ? 's' : ''}</span></>
                )}
              </>
            )}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={validRows.length === 0}
              onClick={() => { onImport(validRows); onClose(); }}
              className="flex items-center gap-2 px-5 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 transition-all disabled:opacity-40"
            >
              <Upload size={14} />
              Import {validRows.length > 0 ? `${validRows.length} row${validRows.length !== 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BocEditionAdmin({ cooperatives }: { cooperatives: CoffeeCooperative[] }) {
  const [loadingYear, setLoadingYear] = useState(false);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, control, reset, watch, setValue, formState: { errors } } = useForm<BocEditionFormData>({
    resolver: zodResolver(BocEditionSchema),
    defaultValues: { year: new Date().getFullYear(), theme: '', participants: [] },
  });

  const { fields: participantFields, append: appendParticipant, remove: removeParticipant } = useFieldArray({
    control,
    name: 'participants',
  });

  const watchedYear = watch('year');

  const loadEdition = async (year: number) => {
    if (!year || year < 2000 || year > 2100) return;
    setLoadingYear(true);
    try {
      const editionRef = doc(db, 'bestofcongo_editions', String(year));
      const editionSnap = await getDoc(editionRef);
      const participantsSnap = await getDocs(collection(db, 'bestofcongo_editions', String(year), 'participants'));

      if (editionSnap.exists()) {
        const editionData = editionSnap.data();
        const participants = participantsSnap.docs.map(d => d.data() as EditionParticipant);
        reset({
          year,
          theme: editionData.theme || '',
          participants: participants.map(p => ({
            coopId: p.coopId,
            qtySubmitted: p.qtySubmitted || 0,
            cuppingScore: p.cuppingScore || (p as any).scores?.average || 0,
            rank: p.rank || 0,
            sales: p.sales || [],
          })),
        });
        toast.success(`Edition ${year} loaded`);
      } else {
        reset({ year, theme: '', participants: [] });
        toast(`No existing edition for ${year} — starting fresh.`);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `bestofcongo_editions/${year}`);
    } finally {
      setLoadingYear(false);
    }
  };

  const onSubmit = async (data: BocEditionFormData) => {
    setSaving(true);
    const yearStr = String(data.year);
    const editionRef = doc(db, 'bestofcongo_editions', yearStr);

    try {
      // 1. Save edition doc
      await setDoc(editionRef, { year: data.year, theme: data.theme || '' }, { merge: true });

      // 2. Delete-then-write participants in a single WriteBatch
      const existingSnap = await getDocs(collection(db, 'bestofcongo_editions', yearStr, 'participants'));
      const batch = writeBatch(db);

      existingSnap.docs.forEach(d => batch.delete(d.ref));
      data.participants.forEach(p => {
        const ref = doc(db, 'bestofcongo_editions', yearStr, 'participants', p.coopId);
        const coop = cooperatives.find(c => c.id === p.coopId);
        batch.set(ref, {
          coopId: p.coopId,
          coopName: coop?.name || '',
          qtySubmitted: p.qtySubmitted,
          cuppingScore: p.cuppingScore,
          rank: p.rank || 0,
          sales: p.sales.filter(s => s.buyerName && s.buyerName.trim() !== ''),
        });
      });

      // Also set isBocParticipant: true on each cooperative doc
      data.participants.forEach(p => {
        const coopRef = doc(db, 'cooperatives', p.coopId);
        batch.update(coopRef, { isBocParticipant: true });
      });

      await batch.commit();
      toast.success(`Edition ${data.year} saved (${data.participants.length} participants)`);
    } catch (error) {
      console.error('Error saving edition:', error);
      toast.error('Save failed — check console');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-stone-900">Best of Congo — Admin</h2>
          <p className="text-stone-500 text-sm">Create or edit a competition edition and its participant results.</p>
        </div>
        <div className="p-3 bg-amber-100 rounded-2xl text-amber-900">
          <Award size={24} />
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Edition header */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-stone-400 uppercase tracking-widest">Edition</h3>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-xs font-bold text-stone-600 mb-1">Year *</label>
              <input
                type="number"
                {...register('year', { valueAsNumber: true })}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {errors.year && <p className="text-xs text-red-500 mt-1">{errors.year.message as string}</p>}
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-stone-600 mb-1">Theme (optional)</label>
              <input
                {...register('theme')}
                placeholder="e.g. Terroir & Traceability"
                className="w-full px-3 py-2 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <button
              type="button"
              onClick={() => loadEdition(watchedYear)}
              disabled={loadingYear}
              className="px-4 py-2 bg-stone-100 text-stone-700 rounded-xl text-sm font-bold hover:bg-stone-200 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {loadingYear ? <Loader2 size={14} className="animate-spin" /> : null}
              Load
            </button>
          </div>
        </div>

        {/* Participants */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-stone-400 uppercase tracking-widest">
              Participants ({participantFields.length})
            </h3>
            <button
              type="button"
              onClick={() => appendParticipant({ coopId: '', qtySubmitted: 0, cuppingScore: 0, rank: 0, sales: [] })}
              className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition-all"
            >
              <Plus size={14} />
              Add participant
            </button>
          </div>

          {participantFields.length === 0 && (
            <p className="text-stone-400 text-sm text-center py-8">No participants yet. Click "Add participant" or load an existing edition.</p>
          )}

          {participantFields.map((field, index) => (
            <div key={field.id} className="border border-stone-100 rounded-2xl p-4 space-y-3 bg-stone-50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-500">#{index + 1}</span>
                <button
                  type="button"
                  onClick={() => removeParticipant(index)}
                  className="p-1 text-stone-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-stone-600 mb-1">Cooperative *</label>
                  <select
                    {...register(`participants.${index}.coopId`)}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  >
                    <option value="">— select —</option>
                    {cooperatives.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {errors.participants?.[index]?.coopId && (
                    <p className="text-xs text-red-500 mt-1">{errors.participants[index]?.coopId?.message as string}</p>
                  )}
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-stone-600 mb-1">Rank</label>
                  <input
                    type="number"
                    {...register(`participants.${index}.rank`, { valueAsNumber: true })}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    placeholder="e.g. 1"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-stone-600 mb-1">Score *</label>
                  <input
                    type="number"
                    step="0.01"
                    {...register(`participants.${index}.cuppingScore`, { valueAsNumber: true })}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-stone-600 mb-1">Qty (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    {...register(`participants.${index}.qtySubmitted`, { valueAsNumber: true })}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>
              </div>

              <ParticipantSalesField
                control={control}
                register={register}
                participantIndex={index}
                errors={errors}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {saving ? 'Saving…' : 'Save edition'}
          </button>
        </div>
      </form>
    </div>
  );
}

// --- BoC Leaderboard ---

type RankedParticipant = EditionParticipant & { coopName: string; rank: number };

function BocLeaderboard({ onCoopSelect }: { onCoopSelect: (coopId: string) => void }) {
  const [editions, setEditions] = useState<BestOfCongoEdition[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [ranked, setRanked] = useState<RankedParticipant[]>([]);
  const [loadingEditions, setLoadingEditions] = useState(true);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  useEffect(() => {
    getDocs(collection(db, 'bestofcongo_editions'))
      .then(snap => {
        const eds = snap.docs
          .map(d => d.data() as BestOfCongoEdition)
          .sort((a, b) => b.year - a.year);
        setEditions(eds);
        if (eds.length > 0) setSelectedYear(eds[0].year);
      })
      .catch(err => handleFirestoreError(err, OperationType.LIST, 'bestofcongo_editions'))
      .finally(() => setLoadingEditions(false));
  }, []);

  useEffect(() => {
    if (!selectedYear) return;
    setLoadingParticipants(true);
    getDocs(collection(db, 'bestofcongo_editions', String(selectedYear), 'participants'))
      .then(snap => {
        const sorted = snap.docs
          .map(d => {
            const raw = d.data() as any;
            // Normalize old-model docs (scores.average → cuppingScore, buyers → sales)
            return {
              ...raw,
              cuppingScore: raw.cuppingScore ?? raw.scores?.average ?? 0,
              sales: raw.sales ?? [],
            } as EditionParticipant & { coopName: string };
          })
          .sort((a, b) =>
            b.cuppingScore - a.cuppingScore ||
            (a.coopName ?? '').localeCompare(b.coopName ?? '')
          )
          .map((p, i) => ({ ...p, rank: i + 1 }));
        setRanked(sorted);
      })
      .catch(err => handleFirestoreError(err, OperationType.LIST, `bestofcongo_editions/${selectedYear}/participants`))
      .finally(() => setLoadingParticipants(false));
  }, [selectedYear]);

  const handleExport = () => {
    if (!selectedYear || ranked.length === 0) return;
    downloadCsv(
      [
        ['Rank', 'Cooperative', 'Cupping Score', 'Qty Submitted (kg)', 'Qty Sold (bags)', 'Buyers'],
        ...ranked.map(p => [
          p.rank,
          p.coopName,
          p.cuppingScore,
          p.qtySubmitted,
          p.sales.reduce((sum, s) => sum + (s.bagsSold ?? 0), 0),
          p.sales.filter(s => s.buyerName).map(s => s.buyerName).join('; '),
        ]),
      ],
      `boc_leaderboard_${selectedYear}.csv`
    );
  };

  if (loadingEditions) {
    return <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-amber-600" /></div>;
  }

  if (editions.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
          <div className="w-14 h-14 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-300">
            <Award size={28} />
          </div>
          <p className="font-bold text-stone-900">No editions yet</p>
          <p className="text-stone-500 text-sm mt-1">An admin needs to create the first Best of Congo edition.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black text-stone-400 uppercase tracking-widest mb-1">Congo Agri Platform</p>
          <h2 className="text-3xl font-black text-stone-900 tracking-tight">Best of Congo</h2>
          <p className="text-stone-500 text-sm mt-1">Annual specialty coffee competition — verified jury scores</p>
        </div>
        <button
          onClick={handleExport}
          disabled={ranked.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 transition-all disabled:opacity-40"
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Edition selector — tabs for ≤5 editions */}
      {editions.length <= 5 ? (
        <div className="flex gap-1 border-b border-stone-200">
          {editions.map(e => (
            <button
              key={e.year}
              onClick={() => setSelectedYear(e.year)}
              className={cn(
                "px-5 py-2.5 text-sm font-bold border-b-2 -mb-px transition-all",
                selectedYear === e.year
                  ? "border-amber-600 text-amber-700"
                  : "border-transparent text-stone-400 hover:text-stone-700"
              )}
            >
              {e.year}
            </button>
          ))}
        </div>
      ) : (
        <select
          value={selectedYear ?? ''}
          onChange={e => setSelectedYear(Number(e.target.value))}
          className="px-4 py-2 border border-stone-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {editions.map(e => <option key={e.year} value={e.year}>{e.year}</option>)}
        </select>
      )}

      {/* Leaderboard */}
      {loadingParticipants ? (
        <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-amber-600" /></div>
      ) : ranked.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center text-stone-400 text-sm">
          No participants recorded for {selectedYear}.
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                <th className="px-4 py-3 text-left text-xs font-black text-stone-400 uppercase tracking-widest w-12">#</th>
                <th className="px-4 py-3 text-left text-xs font-black text-stone-400 uppercase tracking-widest">Cooperative</th>
                <th className="px-4 py-3 text-left text-xs font-black text-stone-400 uppercase tracking-widest">Avg Score</th>
                <th className="px-4 py-3 text-left text-xs font-black text-stone-400 uppercase tracking-widest">Submitted (kg)</th>
                <th className="px-4 py-3 text-left text-xs font-black text-stone-400 uppercase tracking-widest">Sold (kg)</th>
                <th className="px-4 py-3 text-left text-xs font-black text-stone-400 uppercase tracking-widest">Buyers</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(p => (
                <tr
                  key={p.coopId}
                  onClick={() => onCoopSelect(p.coopId)}
                  className="border-b border-stone-50 hover:bg-amber-50 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black",
                      p.rank === 1 ? "bg-amber-400 text-white" :
                      p.rank === 2 ? "bg-stone-300 text-stone-800" :
                      p.rank === 3 ? "bg-amber-700 text-white" :
                      "bg-stone-100 text-stone-500"
                    )}>
                      {p.rank}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-stone-900 group-hover:text-amber-700 transition-colors">
                    {p.coopName}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-amber-700 text-base">{p.cuppingScore}</span>
                    <span className="text-xs text-stone-400 ml-1">pts</span>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{p.qtySubmitted.toLocaleString()}</td>
                  <td className="px-4 py-3 text-stone-600">
                    {p.sales.reduce((sum, s) => sum + (s.bagsSold ?? 0), 0).toLocaleString()}
                    <span className="text-xs text-stone-400 ml-1">bags</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.sales.filter(s => s.buyerName).length === 0 ? (
                        <span className="text-stone-300">—</span>
                      ) : (
                        p.sales.filter(s => s.buyerName).map((s, i) => (
                          s.buyerLogoUrl ? (
                            <img
                              key={i}
                              src={s.buyerLogoUrl}
                              alt={s.buyerName}
                              title={s.buyerName}
                              className="h-6 w-auto max-w-[80px] object-contain rounded"
                              onError={onLogoError}
                            />
                          ) : (
                            <span key={i} className="px-2 py-0.5 bg-stone-100 text-stone-700 text-xs rounded-md">
                              {s.buyerName}
                            </span>
                          )
                        ))
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- BoC History Tab ---

function BocHistoryTab({ coopId }: { coopId: string }) {
  const [rows, setRows] = useState<{ year: number; participant: EditionParticipant }[]>([]);
  const [loading, setLoading] = useState(true);
  const [indexError, setIndexError] = useState(false);

  useEffect(() => {
    if (!coopId) return;
    setLoading(true);
    setIndexError(false);

    getDocs(
      query(collectionGroup(db, 'participants'), where('coopId', '==', coopId))
    )
      .then(snap => {
        const results = snap.docs.map(d => {
          const raw = d.data() as any;
          return {
            year: parseInt(d.ref.parent.parent?.id ?? '0', 10),
            participant: {
              ...raw,
              // Normalize old-model documents
              cuppingScore: raw.cuppingScore ?? raw.scores?.average ?? 0,
              sales: raw.sales ?? [],
            } as EditionParticipant,
          };
        });
        results.sort((a, b) => a.year - b.year);
        setRows(results);
      })
      .catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('index') || msg.includes('requires an index')) {
          setIndexError(true);
        } else {
          handleFirestoreError(err, OperationType.LIST, 'bestofcongo_editions/*/participants');
        }
      })
      .finally(() => setLoading(false));
  }, [coopId]);

  if (loading) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="animate-spin mx-auto text-amber-600" />
      </div>
    );
  }

  if (indexError) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-sm text-amber-900">
        <p className="font-bold mb-1">Firestore index required</p>
        <p>Create a collection group index for <code>participants.coopId</code> in the Firestore console, then reload.</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
        <div className="w-14 h-14 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-300">
          <Award size={28} />
        </div>
        <p className="font-bold text-stone-900">No competition history</p>
        <p className="text-stone-500 text-sm mt-1">This cooperative has not participated in the Best of Congo competition yet.</p>
      </div>
    );
  }

  const chartData = rows.map(r => ({ year: r.year, score: r.participant.cuppingScore }));

  return (
    <div className="space-y-6">
      {/* Score trend chart */}
      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
        <h3 className="text-sm font-black text-stone-400 uppercase tracking-widest mb-4">Score trend</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value) => [`${value ?? '—'} pts`, 'Avg Score']}
              labelFormatter={(label) => `${label}`}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#d97706"
              strokeWidth={2}
              dot={{ fill: '#d97706', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Year-by-year table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-100">
              <th className="px-4 py-3 text-left text-xs font-black text-stone-400 uppercase tracking-widest">Year</th>
              <th className="px-4 py-3 text-left text-xs font-black text-stone-400 uppercase tracking-widest">Score</th>
              <th className="px-4 py-3 text-left text-xs font-black text-stone-400 uppercase tracking-widest">Submitted (kg)</th>
              <th className="px-4 py-3 text-left text-xs font-black text-stone-400 uppercase tracking-widest">Sold (bags)</th>
              <th className="px-4 py-3 text-left text-xs font-black text-stone-400 uppercase tracking-widest">Buyers</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ year, participant }) => (
              <tr key={year} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
                <td className="px-4 py-3 font-bold text-stone-900">{year}</td>
                <td className="px-4 py-3">
                  <span className="font-bold text-amber-700">{participant.cuppingScore} pts</span>
                </td>
                <td className="px-4 py-3 text-stone-600">{participant.qtySubmitted.toLocaleString()}</td>
                <td className="px-4 py-3 text-stone-600">
                  {participant.sales.reduce((sum, s) => sum + (s.bagsSold ?? 0), 0).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {participant.sales.filter(s => s.buyerName).length === 0 ? (
                      <span className="text-stone-400">—</span>
                    ) : (
                      participant.sales.filter(s => s.buyerName).map((s, i) => (
                        <span key={i} className="px-2 py-0.5 bg-stone-100 text-stone-700 text-xs rounded-md">
                          {s.buyerName}
                        </span>
                      ))
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Faceted Filter Panel ---

interface FacetFilters {
  searchQuery: string;
  selectedCerts: string[];
  selectedProcessing: string[];
  altMin: string;
  altMax: string;
  minScore: string;
  bocOnly: boolean;
}

function FacetedFilterPanel({
  filters,
  onChange,
  processingOptions,
  totalCount,
  filteredCount,
}: {
  filters: FacetFilters;
  onChange: (f: Partial<FacetFilters>) => void;
  processingOptions: string[];
  totalCount: number;
  filteredCount: number;
}) {
  const [open, setOpen] = useState(false);
  const hasActiveFilters =
    filters.selectedCerts.length > 0 ||
    filters.selectedProcessing.length > 0 ||
    filters.altMin !== '' ||
    filters.altMax !== '' ||
    filters.minScore !== '' ||
    filters.bocOnly;

  const toggleCert = (c: string) =>
    onChange({ selectedCerts: filters.selectedCerts.includes(c) ? filters.selectedCerts.filter(x => x !== c) : [...filters.selectedCerts, c] });

  const toggleProcessing = (m: string) =>
    onChange({ selectedProcessing: filters.selectedProcessing.includes(m) ? filters.selectedProcessing.filter(x => x !== m) : [...filters.selectedProcessing, m] });

  const clearAll = () =>
    onChange({ selectedCerts: [], selectedProcessing: [], altMin: '', altMax: '', minScore: '', bocOnly: false });

  return (
    <div className="space-y-2">
      {/* Search + filter toggle row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
          <input
            value={filters.searchQuery}
            onChange={e => onChange({ searchQuery: e.target.value })}
            placeholder="Search cooperatives…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
          />
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          className={cn(
            "p-2 rounded-xl border transition-all flex items-center gap-1 text-xs font-bold",
            open || hasActiveFilters
              ? "bg-amber-600 text-white border-amber-600"
              : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"
          )}
        >
          <Filter size={14} />
          {hasActiveFilters && (
            <span className="w-4 h-4 bg-white text-amber-700 rounded-full text-[10px] flex items-center justify-center font-black">
              {[filters.selectedCerts.length > 0, filters.selectedProcessing.length > 0, filters.altMin !== '', filters.altMax !== '', filters.minScore !== '', filters.bocOnly].filter(Boolean).length}
            </span>
          )}
        </button>
      </div>

      {/* Result count */}
      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
        {filteredCount === totalCount
          ? `${totalCount} cooperatives`
          : `${filteredCount} of ${totalCount} cooperatives`}
      </p>

      {/* Filter panel */}
      {open && (
        <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-5 shadow-sm">
          {hasActiveFilters && (
            <button onClick={clearAll} className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1">
              <X size={12} /> Clear all filters
            </button>
          )}

          {/* Certifications */}
          <div>
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">Certifications</p>
            <div className="flex flex-wrap gap-1.5">
              {CANONICAL_CERTIFICATIONS.map(cert => (
                <button
                  key={cert}
                  onClick={() => toggleCert(cert)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-bold rounded-lg border transition-all",
                    filters.selectedCerts.includes(cert)
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-stone-50 text-stone-600 border-stone-200 hover:border-amber-400"
                  )}
                >
                  {cert}
                </button>
              ))}
            </div>
          </div>

          {/* Processing methods */}
          {processingOptions.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">Processing Method</p>
              <div className="flex flex-wrap gap-1.5">
                {processingOptions.map(m => (
                  <button
                    key={m}
                    onClick={() => toggleProcessing(m)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-bold rounded-lg border transition-all",
                      filters.selectedProcessing.includes(m)
                        ? "bg-stone-900 text-white border-stone-900"
                        : "bg-stone-50 text-stone-600 border-stone-200 hover:border-stone-400"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Altitude range */}
          <div>
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">Altitude (m)</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={filters.altMin}
                onChange={e => onChange({ altMin: e.target.value })}
                placeholder="Min"
                className="w-full px-3 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <span className="text-stone-400 text-xs">–</span>
              <input
                type="number"
                value={filters.altMax}
                onChange={e => onChange({ altMax: e.target.value })}
                placeholder="Max"
                className="w-full px-3 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Min cupping score */}
          <div>
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">Min Cupping Score</p>
            <input
              type="number"
              value={filters.minScore}
              onChange={e => onChange({ minScore: e.target.value })}
              placeholder="e.g. 84"
              min={0}
              max={100}
              className="w-full px-3 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* BoC participant toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-stone-700">Best of Congo participants only</p>
              <p className="text-[10px] text-stone-400">Filter to competition-verified coops</p>
            </div>
            <button
              onClick={() => onChange({ bocOnly: !filters.bocOnly })}
              className={cn(
                "relative w-10 h-6 rounded-full transition-colors",
                filters.bocOnly ? "bg-amber-600" : "bg-stone-200"
              )}
            >
              <span className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
                filters.bocOnly ? "translate-x-5" : "translate-x-1"
              )} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- How It Works Modal ---

function HowItWorksModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const steps = [
    { num: 1, icon: Upload, title: t('step1Title'), desc: t('step1Desc'), color: 'bg-amber-100 text-amber-700' },
    { num: 2, icon: Loader2, title: t('step2Title'), desc: t('step2Desc'), color: 'bg-blue-100 text-blue-700' },
    { num: 3, icon: Shield, title: t('step3Title'), desc: t('step3Desc'), color: 'bg-green-100 text-green-700' },
    { num: 4, icon: Globe, title: t('step4Title'), desc: t('step4Desc'), color: 'bg-stone-100 text-stone-700' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 relative"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-700 transition-colors rounded-lg hover:bg-stone-100"
            >
              <X size={18} />
            </button>

            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 bg-amber-900 rounded-lg flex items-center justify-center">
                  <Coffee size={18} className="text-white" />
                </div>
                <h2 className="text-2xl font-black text-stone-900">{t('howItWorksTitle')}</h2>
              </div>
              <p className="text-stone-500 text-sm leading-relaxed">{t('howItWorksSubtitle')}</p>
            </div>

            {/* Pipeline steps */}
            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div key={step.num} className="flex gap-4 items-start">
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', step.color)}>
                      <step.icon size={16} />
                    </div>
                    {idx < steps.length - 1 && (
                      <div className="w-px h-6 bg-stone-200" />
                    )}
                  </div>
                  <div className="pb-1">
                    <p className="text-xs font-black text-stone-400 uppercase tracking-widest mb-0.5">Step {step.num}</p>
                    <p className="font-bold text-stone-900 text-sm mb-1">{step.title}</p>
                    <p className="text-stone-500 text-xs leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-stone-100 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-amber-900 text-white rounded-xl text-sm font-bold hover:bg-amber-800 transition-colors"
              >
                {t('close')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AppContent() {
  const { t } = useTranslation();
  const [selectedCoopId, setSelectedCoopId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'boc-history'>('overview');
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'directory' | 'comparison' | 'staging' | 'portal' | 'boc-admin' | 'leaderboard'>('directory');
  const [hoveredCoopId, setHoveredCoopId] = useState<string | null>(null);
  const { user, profile: userProfile, isLoading: isProfileLoading, login: handleLogin, logout: handleLogoutBase } = useAuth();
  const [portalCoopId, setPortalCoopId] = useState<string | null>(null);
  const [cooperatives, setCooperatives] = useState<CoffeeCooperative[]>(
    import.meta.env.DEV ? MOCK_COOPERATIVES : []
  );

  const [facetFilters, setFacetFilters] = useState<FacetFilters>({
    searchQuery: '',
    selectedCerts: [],
    selectedProcessing: [],
    altMin: '',
    altMax: '',
    minScore: '',
    bocOnly: false,
  });

  const processingOptions = useMemo(() =>
    Array.from(new Set(cooperatives.flatMap(c => c.processingMethods ?? []))).sort(),
    [cooperatives]
  );

  const filteredCoops = useMemo(() => {
    const { searchQuery, selectedCerts, selectedProcessing, altMin, altMax, minScore, bocOnly } = facetFilters;
    const altMinN = altMin !== '' ? Number(altMin) : null;
    const altMaxN = altMax !== '' ? Number(altMax) : null;
    const minScoreN = minScore !== '' ? Number(minScore) : null;

    return cooperatives.filter(c => {
      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (selectedCerts.length > 0 && !selectedCerts.every(cert => c.certifications?.includes(cert))) return false;
      if (selectedProcessing.length > 0 && !selectedProcessing.some(m => c.processingMethods?.includes(m))) return false;
      if (altMinN !== null && c.altitudeRange && c.altitudeRange[1] < altMinN) return false;
      if (altMaxN !== null && c.altitudeRange && c.altitudeRange[0] > altMaxN) return false;
      if (minScoreN !== null && (c.selfReportedCuppingScore ?? 0) < minScoreN) return false;
      if (bocOnly && !c.isBocParticipant) return false;
      return true;
    });
  }, [cooperatives, facetFilters]);

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

  const handleLogout = async () => {
    await handleLogoutBase();
    setCurrentView('directory');
  };

  const selectedCoop = useMemo(() =>
    cooperatives.find(c => c.id === selectedCoopId),
    [selectedCoopId, cooperatives]
  );

  useEffect(() => { setDetailTab('overview'); }, [selectedCoopId]);

  useEffect(() => {
    if (selectedCoopId) {
      history.replaceState(null, '', `#/coop/${encodeURIComponent(selectedCoopId)}`);
    } else if (window.location.hash.startsWith('#/coop/')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [selectedCoopId]);

  const toggleComparison = (id: string) => {
    setComparisonIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id].slice(-4)
    );
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] text-stone-900 font-sans selection:bg-amber-100">
      <Toaster position="bottom-right" toastOptions={{ duration: 4000 }} />
      <HowItWorksModal open={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
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
              <button
                onClick={() => { setCurrentView('leaderboard'); setPortalCoopId(null); }}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2",
                  currentView === 'leaderboard' ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-900"
                )}
              >
                <Award size={14} />
                Best of Congo
              </button>
              <button
                onClick={() => setIsAboutOpen(true)}
                className="px-4 py-2 rounded-full text-sm font-bold transition-all text-stone-500 hover:text-stone-900 flex items-center gap-2"
              >
                <Info size={14} />
                {t('about')}
              </button>
              {canAccessStaging(userProfile) && (
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
              {canAccessBocAdmin(userProfile) && (
                <button
                  onClick={() => { setCurrentView('boc-admin'); setPortalCoopId(null); }}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2",
                    currentView === 'boc-admin' ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-900"
                  )}
                >
                  <Award size={14} />
                  BoC Admin
                </button>
              )}
              {canAccessPortal(userProfile) && (
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
          canAccessStaging(userProfile) ? <StagingArea cooperatives={cooperatives} /> : <p className="text-stone-500">{t('unauthorized')}</p>
        ) : currentView === 'leaderboard' ? (
          <BocLeaderboard
            onCoopSelect={(coopId) => {
              setSelectedCoopId(coopId);
              setCurrentView('directory');
            }}
          />
        ) : currentView === 'boc-admin' ? (
          canAccessBocAdmin(userProfile) ? <BocEditionAdmin cooperatives={cooperatives} /> : <p className="text-stone-500">{t('unauthorized')}</p>
        ) : currentView === 'portal' ? (
          isProfileLoading ? (
            <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-amber-600" /></div>
          ) : !isAdmin(userProfile) && !canAccessPortal(userProfile) ? (
            <p className="text-stone-500">{t('unauthorized')}</p>
          ) : (
            <CoopPortal
              coopId={portalCoopId || userProfile?.cooperativeId}
              isNew={!portalCoopId && !userProfile?.cooperativeId}
              canDelete={canDeleteCooperative(userProfile)}
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
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-black text-stone-400 uppercase tracking-widest">{t('cooperatives')}</p>
                {isAdmin(userProfile) && (
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

              <FacetedFilterPanel
                filters={facetFilters}
                onChange={partial => setFacetFilters(prev => ({ ...prev, ...partial }))}
                processingOptions={processingOptions}
                totalCount={cooperatives.length}
                filteredCount={filteredCoops.length}
              />

              <div className="space-y-3">
                {filteredCoops.length === 0 ? (
                  <div className="text-center py-8 text-stone-400 text-sm">
                    No cooperatives match the current filters.
                  </div>
                ) : null}
                {filteredCoops.map((coop) => (
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
                          
                          {isAdmin(userProfile) && (
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
                        <div className="flex flex-col gap-2 items-end">
                          <a
                            href={`mailto:${selectedCoop.managerEmail || ADMIN_EMAIL}?subject=${encodeURIComponent(`Inquiry about ${selectedCoop.name}`)}`}
                            className="px-4 py-2 bg-amber-500/90 backdrop-blur-md border border-amber-400/30 rounded-xl text-xs font-bold text-white hover:bg-amber-500 transition-all flex items-center gap-2"
                          >
                            <Mail size={14} /> Contact
                          </a>
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}${window.location.pathname}#/coop/${encodeURIComponent(selectedCoop.id)}`;
                              navigator.clipboard.writeText(url).then(() => toast.success('Profile link copied!')).catch(() => toast.error('Could not copy link'));
                            }}
                            className="px-4 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-xs font-bold text-white hover:bg-white/20 transition-all flex items-center gap-2"
                          >
                            <Share2 size={14} /> Share Profile
                          </button>
                          <button
                            onClick={() => {
                              const safeFilename = selectedCoop.name.replace(/[^a-zA-Z0-9_-]/g, '_');
                              downloadCsv(
                                [
                                  [t('metric'), 'Value'],
                                  ['Name', selectedCoop.name],
                                  ['Country', selectedCoop.country],
                                  ['Region', selectedCoop.region],
                                  [t('established'), selectedCoop.established],
                                  [t('members'), selectedCoop.members],
                                  [t('cuppingScore'), selectedCoop.selfReportedCuppingScore],
                                  [t('production'), selectedCoop.annualProduction],
                                  [t('description'), selectedCoop.description],
                                ],
                                `${safeFilename}_report.csv`
                              );
                            }}
                            className="px-4 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-xs font-bold text-white hover:bg-white/20 transition-all flex items-center gap-2"
                          >
                            <Award size={14} /> {t('downloadReport')}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* EUDR geolocation readiness — renders nothing when no data */}
                    <EudrBadge eudr={selectedCoop.eudrCompliance} />

                    {/* Tab bar */}
                    <div className="flex gap-1 border-b border-stone-200 -mb-2">
                      {(['overview', 'boc-history'] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setDetailTab(tab)}
                          className={cn(
                            "px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-all",
                            detailTab === tab
                              ? "border-amber-600 text-amber-700"
                              : "border-transparent text-stone-400 hover:text-stone-700"
                          )}
                        >
                          {tab === 'overview' ? 'Overview' : 'Best of Congo'}
                        </button>
                      ))}
                    </div>

                    {detailTab === 'overview' && (<>
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
                    </>)}

                    {detailTab === 'boc-history' && (
                      <BocHistoryTab coopId={selectedCoop.id} />
                    )}
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
