import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, MotionConfig, animate } from 'motion/react';
import {
  Calendar, TrendingUp, TrendingDown, Wallet, Car as CarIcon,
  ChevronDown, Printer, Loader2, AlertCircle, Clock, CreditCard,
  Receipt, PiggyBank, Banknote, Gauge, Fuel, CalendarDays,
  Droplets, ShieldCheck, ClipboardCheck, Cog, Tag, BarChart3,
  ArrowUpRight, ArrowDownRight, Percent, Hourglass, FileText, StickyNote
} from 'lucide-react';
import { Language, Car, ReservationDetails, VehicleExpense, Payment } from '../types';
import { DatabaseService } from '../services/DatabaseService';
import { ReservationsService } from '../services/ReservationsService';
import { getVehicleExpenses } from '../services/expenseService';
import { generateReportHTML } from './ReportPrintTemplate';

interface CarGainsPageProps {
  lang: Language;
}

const T = (fr: string, ar: string, lang: Language) => lang === 'fr' ? fr : ar;
const fmt = (n: number) => Math.round(n || 0).toLocaleString('fr-DZ');
const fmtD = (d: string) => {
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return d || '';
  }
};
const dateKey = (d: string) => (d || '').substring(0, 10);

// Calculate paid amount
const calcPaid = (r: ReservationDetails): number => {
  const payments = (r.payments || []) as Payment[];
  if (payments.length > 0) {
    const total = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    if (total > 0) return total;
  }
  return Math.max(0, (Number(r.totalPrice) || 0) - (Number(r.remainingPayment) || 0));
};

// Check if [aStart, aEnd] overlaps the selected period
const overlapsPeriod = (depDate: string, retDate: string, startDate: string, endDate: string): boolean => {
  const dep = dateKey(depDate);
  if (!dep) return false;
  const ret = dateKey(retDate) || dep;
  return dep <= endDate && ret >= startDate;
};

const inRange = (dateStr: string, startDate: string, endDate: string): boolean => {
  if (!dateStr) return false;
  const d = dateKey(dateStr);
  return (!startDate || d >= startDate) && (!endDate || d <= endDate);
};

// ── UI config ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { fr: string; ar: string; cls: string; dot: string }> = {
  pending:    { fr: 'En attente', ar: 'قيد الانتظار', cls: 'bg-amber-50 text-amber-700 border-amber-200',     dot: 'bg-amber-500' },
  accepted:   { fr: 'Acceptée',   ar: 'مقبولة',       cls: 'bg-sky-50 text-sky-700 border-sky-200',           dot: 'bg-sky-500' },
  confirmed:  { fr: 'Confirmée',  ar: 'مؤكدة',        cls: 'bg-blue-50 text-blue-700 border-blue-200',        dot: 'bg-blue-500' },
  active:     { fr: 'Active',     ar: 'نشطة',         cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  completed:  { fr: 'Terminée',   ar: 'منتهية',       cls: 'bg-slate-100 text-slate-600 border-slate-200',    dot: 'bg-slate-400' },
  cancelled:  { fr: 'Annulée',    ar: 'ملغاة',        cls: 'bg-red-50 text-red-600 border-red-200',           dot: 'bg-red-500' },
  terminated: { fr: 'Clôturée',   ar: 'مغلقة',        cls: 'bg-violet-50 text-violet-700 border-violet-200',  dot: 'bg-violet-500' },
};

const EXPENSE_CFG: Record<string, { fr: string; ar: string; icon: React.ElementType; chip: string; bar: string }> = {
  vidange:   { fr: 'Vidange',           ar: 'تغيير الزيت',    icon: Droplets,       chip: 'bg-amber-50 text-amber-600 border-amber-200',   bar: 'bg-amber-500' },
  assurance: { fr: 'Assurance',         ar: 'التأمين',        icon: ShieldCheck,    chip: 'bg-blue-50 text-blue-600 border-blue-200',      bar: 'bg-blue-500' },
  controle:  { fr: 'Contrôle technique', ar: 'الفحص التقني',  icon: ClipboardCheck, chip: 'bg-violet-50 text-violet-600 border-violet-200', bar: 'bg-violet-500' },
  chaine:    { fr: 'Chaîne / Courroie', ar: 'السلسلة / السير', icon: Cog,           chip: 'bg-slate-100 text-slate-600 border-slate-200',  bar: 'bg-slate-500' },
  autre:     { fr: 'Autre',             ar: 'أخرى',           icon: Tag,            chip: 'bg-rose-50 text-rose-600 border-rose-200',      bar: 'bg-rose-500' },
};

const PAYMENT_METHOD: Record<string, { fr: string; ar: string }> = {
  cash:     { fr: 'Espèces',  ar: 'نقداً' },
  card:     { fr: 'Carte',    ar: 'بطاقة' },
  transfer: { fr: 'Virement', ar: 'تحويل' },
  check:    { fr: 'Chèque',   ar: 'شيك' },
};

const SPRING = { type: 'spring' as const, stiffness: 320, damping: 30 };

// Animated number that counts up when the value changes
const CountUp: React.FC<{ value: number; className?: string }> = ({ value, className }) => {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const controls = animate(0, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { node.textContent = fmt(v); },
    });
    return () => controls.stop();
  }, [value]);
  return <span ref={ref} className={`tabular-nums ${className || ''}`}>{fmt(value)}</span>;
};

const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse rounded-2xl bg-slate-200/70 ${className || ''}`} />
);

export const CarGainsPage: React.FC<CarGainsPageProps> = ({ lang }) => {
  const isRtl = lang === 'ar';

  const [cars, setCars] = useState<Car[]>([]);
  const [selectedCarId, setSelectedCarId] = useState<string>('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [reservations, setReservations] = useState<ReservationDetails[]>([]);
  const [expenses, setExpenses] = useState<VehicleExpense[]>([]);
  // Snapshot of the filters used at generation time so calculations stay
  // consistent even if the user changes inputs without regenerating.
  const [period, setPeriod] = useState<{ start: string; end: string; carId: string } | null>(null);
  const [expandedRes, setExpandedRes] = useState<string | null>(null);
  const [expandedExp, setExpandedExp] = useState<string | null>(null);

  useEffect(() => {
    const loadCars = async () => {
      try {
        const carsData = await DatabaseService.getCars();
        setCars(carsData);
        if (carsData.length > 0) {
          setSelectedCarId(carsData[0].id);
        }
      } catch (err) {
        console.error('Error loading cars:', err);
      }
    };
    loadCars();
  }, []);

  const handleGenerate = async () => {
    if (!selectedCarId || !startDate || !endDate) {
      alert(T('Veuillez sélectionner un véhicule et les dates.', 'يرجى تحديد المركبة والتواريخ.', lang));
      return;
    }

    setLoading(true);
    setExpandedRes(null);
    setExpandedExp(null);
    try {
      const [resList, expRes] = await Promise.all([
        ReservationsService.getReservations({ carId: selectedCarId }),
        getVehicleExpenses(),
      ]);
      const expList = expRes.expenses || [];

      // Every reservation of this car whose rental period touches the range
      const carRes = resList
        .filter(r =>
          (r.carId || r.car?.id) === selectedCarId &&
          overlapsPeriod(
            r.step1?.departureDate || r.createdAt || '',
            r.step1?.returnDate || r.step1?.departureDate || r.createdAt || '',
            startDate,
            endDate
          )
        )
        .sort((a, b) => dateKey(b.step1?.departureDate || b.createdAt || '')
          .localeCompare(dateKey(a.step1?.departureDate || a.createdAt || '')));

      const carExp = expList
        .filter(e => e.carId === selectedCarId && inRange(e.date, startDate, endDate))
        .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));

      setReservations(carRes);
      setExpenses(carExp);
      setPeriod({ start: startDate, end: endDate, carId: selectedCarId });
      setGenerated(true);
    } catch (err) {
      console.error('Error loading data:', err);
      alert(T('Erreur lors du chargement des données.', 'خطأ في تحميل البيانات.', lang));
    } finally {
      setLoading(false);
    }
  };

  const selectedCar = cars.find(c => c.id === (period?.carId || selectedCarId));

  // ── Metrics ────────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const nonCancelled = reservations.filter(r => r.status !== 'cancelled');
    const totalPaid = nonCancelled.reduce((s, r) => s + calcPaid(r), 0);
    const totalInvoiced = nonCancelled.reduce((s, r) => s + (Number(r.totalPrice) || 0), 0);
    const totalRemaining = nonCancelled.reduce((s, r) => s + Math.max(0, Number(r.remainingPayment) || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + (Number(e.cost) || 0), 0);
    const netBenefit = totalPaid - totalExpenses;
    const margin = totalPaid > 0 ? Math.round((netBenefit / totalPaid) * 100) : 0;

    const dayMs = 86400000;
    const periodDays = period
      ? Math.max(1, Math.round((new Date(period.end).getTime() - new Date(period.start).getTime()) / dayMs) + 1)
      : 1;

    // Days rented inside the period (each reservation clamped to the range)
    const rentedDays = period
      ? nonCancelled.reduce((s, r) => {
          const dep = dateKey(r.step1?.departureDate || r.createdAt || '');
          const ret = dateKey(r.step1?.returnDate || '') || dep;
          if (!dep) return s;
          const from = Math.max(new Date(dep).getTime(), new Date(period.start).getTime());
          const to = Math.min(new Date(ret).getTime(), new Date(period.end).getTime());
          return s + Math.max(0, Math.round((to - from) / dayMs) + 1);
        }, 0)
      : 0;

    const occupancy = Math.min(100, Math.round((rentedDays / periodDays) * 100));
    const avgPerDay = rentedDays > 0 ? Math.round(totalInvoiced / rentedDays) : 0;

    // Expense breakdown by type
    const byType: Record<string, number> = {};
    expenses.forEach(e => {
      byType[e.type] = (byType[e.type] || 0) + (Number(e.cost) || 0);
    });

    return {
      nonCancelledCount: nonCancelled.length,
      totalPaid, totalInvoiced, totalRemaining, totalExpenses, netBenefit,
      margin, periodDays, rentedDays, occupancy, avgPerDay, byType,
    };
  }, [reservations, expenses, period]);

  const handlePrint = async () => {
    if (!selectedCar) return;

    try {
      const agencySettings = await DatabaseService.getWebsiteSettings();

      const html = generateReportHTML(
        selectedCar,
        reservations,
        expenses,
        period?.start || startDate,
        period?.end || endDate,
        agencySettings,
        lang
      );

      // Use iframe for better print handling
      const iframe = document.createElement('iframe');
      iframe.id = '__print_iframe__';
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();

        setTimeout(() => {
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 100);
        }, 250);
      }
    } catch (err) {
      console.error('Error printing report:', err);
      alert(T('Erreur lors de l\'impression.', 'خطأ في الطباعة.', lang));
    }
  };

  const kpis = [
    {
      label: T('Total Facturé', 'الإجمالي المفوتر', lang),
      value: metrics.totalInvoiced,
      subtext: `${metrics.nonCancelledCount} ${T('location(s)', 'إيجار(ات)', lang)}`,
      icon: Receipt,
      chip: 'bg-blue-50 text-blue-600',
      accent: 'from-blue-500 to-indigo-500',
    },
    {
      label: T('Encaissé', 'المحصّل', lang),
      value: metrics.totalPaid,
      subtext: T('Paiements reçus', 'المدفوعات المستلمة', lang),
      icon: Wallet,
      chip: 'bg-emerald-50 text-emerald-600',
      accent: 'from-emerald-500 to-teal-500',
    },
    {
      label: T('Dépenses', 'المصاريف', lang),
      value: metrics.totalExpenses,
      subtext: `${expenses.length} ${T('dépense(s)', 'مصروف(ات)', lang)}`,
      icon: TrendingDown,
      chip: 'bg-rose-50 text-rose-600',
      accent: 'from-rose-500 to-red-500',
    },
    {
      label: T('Bénéfice Net', 'صافي الأرباح', lang),
      value: metrics.netBenefit,
      subtext: metrics.netBenefit >= 0
        ? `${T('Marge', 'الهامش', lang)} ${metrics.margin}%`
        : T('Perte sur la période', 'خسارة خلال الفترة', lang),
      icon: metrics.netBenefit >= 0 ? PiggyBank : AlertCircle,
      chip: metrics.netBenefit >= 0 ? 'bg-teal-50 text-teal-600' : 'bg-orange-50 text-orange-600',
      accent: metrics.netBenefit >= 0 ? 'from-teal-500 to-emerald-500' : 'from-orange-500 to-red-500',
    },
  ];

  const secondaryStats: { label: string; value: string; icon: React.ElementType; cls: string; progress?: number }[] = [
    {
      label: T('Jours loués', 'أيام الإيجار', lang),
      value: `${metrics.rentedDays} / ${metrics.periodDays}`,
      icon: CalendarDays,
      cls: 'text-indigo-600 bg-indigo-50',
    },
    {
      label: T('Taux d\'occupation', 'معدل الإشغال', lang),
      value: `${metrics.occupancy}%`,
      icon: Percent,
      cls: 'text-emerald-600 bg-emerald-50',
      progress: metrics.occupancy,
    },
    {
      label: T('Moyenne / jour loué', 'المعدل / يوم', lang),
      value: `${fmt(metrics.avgPerDay)} DZD`,
      icon: BarChart3,
      cls: 'text-blue-600 bg-blue-50',
    },
    {
      label: T('Créances (reste)', 'الديون (المتبقي)', lang),
      value: `${fmt(metrics.totalRemaining)} DZD`,
      icon: Hourglass,
      cls: 'text-amber-600 bg-amber-50',
    },
  ];

  const revExpMax = Math.max(metrics.totalPaid, metrics.totalExpenses, 1);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6 pb-10" dir={isRtl ? 'rtl' : 'ltr'}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          className="relative overflow-hidden rounded-3xl bg-slate-900 text-white shadow-2xl"
        >
          {/* Ambient glows */}
          <div className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 rounded-full bg-emerald-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 right-0 w-96 h-96 rounded-full bg-teal-400/15 blur-3xl" />
          <div className="pointer-events-none absolute top-0 right-1/4 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }}
          />

          <div className="relative p-6 sm:p-8">
            <div className="flex items-center gap-4 mb-7">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...SPRING, delay: 0.1 }}
                className="w-14 h-14 rounded-2xl bg-emerald-400/15 ring-1 ring-emerald-300/30 flex items-center justify-center text-emerald-300 shadow-lg shadow-emerald-500/10"
              >
                <Wallet size={26} />
              </motion.div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
                  {T('Bénéfice par Véhicule', 'الأرباح حسب المركبة', lang)}
                </h1>
                <p className="text-slate-300 text-sm mt-1 font-medium">
                  {T('Locations, dépenses et rentabilité détaillées par véhicule', 'الإيجارات والمصاريف والربحية بالتفصيل لكل مركبة', lang)}
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur-sm p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 mb-2 uppercase tracking-wider">
                    <CarIcon size={12} />
                    {T('Véhicule', 'المركبة', lang)}
                  </label>
                  <select
                    value={selectedCarId}
                    onChange={(e) => setSelectedCarId(e.target.value)}
                    className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-emerald-400/60 focus:border-emerald-400/40 outline-none text-sm font-semibold hover:bg-white/15 transition-colors cursor-pointer"
                  >
                    <option value="" className="bg-slate-800">
                      {T('-- Choisir une voiture --', '-- اختر سيارة --', lang)}
                    </option>
                    {cars.map(car => (
                      <option key={car.id} value={car.id} className="bg-slate-800">
                        {car.brand} {car.model} ({car.registration})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 mb-2 uppercase tracking-wider">
                    <Calendar size={12} />
                    {T('Date de début', 'تاريخ البداية', lang)}
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-emerald-400/60 focus:border-emerald-400/40 outline-none text-sm font-semibold hover:bg-white/15 transition-colors"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 mb-2 uppercase tracking-wider">
                    <Calendar size={12} />
                    {T('Date de fin', 'تاريخ النهاية', lang)}
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-emerald-400/60 focus:border-emerald-400/40 outline-none text-sm font-semibold hover:bg-white/15 transition-colors"
                  />
                </div>

                <div className="flex items-end">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    transition={SPRING}
                    onClick={handleGenerate}
                    disabled={loading || !selectedCarId}
                    className="w-full bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-900 font-black py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-500/25 hover:shadow-emerald-400/40 transition-shadow flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-wide cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        {T('Génération...', 'جاري الإنشاء...', lang)}
                      </>
                    ) : (
                      <>
                        <TrendingUp size={16} />
                        {T('Générer', 'إنشاء', lang)}
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Loading skeleton ───────────────────────────────────────────── */}
        {loading && (
          <div className="space-y-5">
            <Skeleton className="h-28" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Skeleton className="h-72" />
              <Skeleton className="h-72" />
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* ── Empty state (before generation) ─────────────────────────── */}
          {!generated && !loading && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={SPRING}
              className="flex items-center justify-center py-24"
            >
              <div className="text-center max-w-md">
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ ...SPRING, delay: 0.1 }}
                  className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-100 border border-emerald-100 flex items-center justify-center text-emerald-500 shadow-sm"
                >
                  <BarChart3 size={36} />
                </motion.div>
                <p className="text-lg font-bold text-slate-700 mb-2">
                  {T('Prêt à analyser vos gains ?', 'هل أنت مستعد لتحليل أرباحك؟', lang)}
                </p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {T('Sélectionnez un véhicule et une plage de dates, puis cliquez sur Générer pour voir toutes les locations, les dépenses et le bénéfice net.', 'اختر مركبة ونطاق تاريخ، ثم انقر على إنشاء لرؤية جميع الإيجارات والمصاريف وصافي الربح.', lang)}
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Results ─────────────────────────────────────────────────── */}
          {generated && !loading && selectedCar && (
            <motion.div
              key="results"
              initial="hidden"
              animate="show"
              exit={{ opacity: 0 }}
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
              className="space-y-5"
            >
              {/* Car identity card */}
              <motion.div
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: SPRING } }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row items-center gap-5 p-5 sm:p-6">
                  <div className="w-36 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 border border-slate-200 shadow-inner">
                    <img
                      src={selectedCar.images?.[0] || 'https://picsum.photos/seed/car/400/300'}
                      alt={`${selectedCar.brand} ${selectedCar.model}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 text-center sm:text-start">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                      {selectedCar.brand} {selectedCar.model}
                    </h2>
                    <p className="text-emerald-600 font-bold text-sm">{selectedCar.registration}</p>
                    <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1 rounded-full">
                        <Calendar size={12} /> {selectedCar.year}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-violet-50 text-violet-700 border border-violet-100 px-3 py-1 rounded-full">
                        <Fuel size={12} /> {selectedCar.energy}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1 rounded-full">
                        <Gauge size={12} /> {selectedCar.mileage.toLocaleString()} KM
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-full">
                        <CalendarDays size={12} />
                        {fmtD(period?.start || startDate)} → {fmtD(period?.end || endDate)}
                      </span>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    transition={SPRING}
                    onClick={handlePrint}
                    className="flex-shrink-0 inline-flex items-center gap-2 bg-slate-900 text-white font-bold text-sm py-2.5 px-5 rounded-xl shadow hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Printer size={16} />
                    {T('Imprimer', 'طباعة', lang)}
                  </motion.button>
                </div>
              </motion.div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {kpis.map((kpi, i) => (
                  <motion.div
                    key={i}
                    variants={{ hidden: { opacity: 0, y: 18, scale: 0.96 }, show: { opacity: 1, y: 0, scale: 1, transition: SPRING } }}
                    whileHover={{ y: -3 }}
                    className="relative bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-4 overflow-hidden"
                  >
                    <div className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-r ${kpi.accent}`} />
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">
                        {kpi.label}
                      </p>
                      <div className={`w-9 h-9 rounded-xl ${kpi.chip} flex items-center justify-center flex-shrink-0`}>
                        <kpi.icon size={17} />
                      </div>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                      <CountUp value={kpi.value} />
                      <span className="text-xs font-bold text-slate-400 ms-1">DZD</span>
                    </p>
                    <p className="text-slate-400 text-[11px] mt-1 font-semibold">{kpi.subtext}</p>
                  </motion.div>
                ))}
              </div>

              {/* Secondary stats */}
              <motion.div
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: SPRING } }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 grid grid-cols-2 lg:grid-cols-4 gap-4"
              >
                {secondaryStats.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${s.cls} flex items-center justify-center flex-shrink-0`}>
                      <s.icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{s.label}</p>
                      <p className="text-sm font-black text-slate-800 tabular-nums">{s.value}</p>
                      {typeof s.progress === 'number' && (
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <motion.div
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: s.progress / 100 }}
                            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                            className="h-full w-full origin-left rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </motion.div>

              {/* Lists: reservations + expenses */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
                {/* ── Reservations ───────────────────────────────────────── */}
                <motion.div
                  variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: SPRING } }}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 px-5 py-4 flex items-center justify-between gap-3">
                    <h3 className="text-base font-black text-emerald-800 uppercase tracking-tight flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                        <Calendar size={16} />
                      </span>
                      {T('Locations', 'الإيجارات', lang)}
                      <span className="text-xs font-black bg-emerald-600 text-white rounded-full px-2 py-0.5">
                        {reservations.length}
                      </span>
                    </h3>
                    <span className="inline-flex items-center gap-1 text-sm font-black text-emerald-600 tabular-nums">
                      <ArrowUpRight size={15} /> {fmt(metrics.totalPaid)} DZD
                    </span>
                  </div>

                  {reservations.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                      <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-400">
                        {T('Aucune location sur cette période', 'لا توجد إيجارات في هذه الفترة', lang)}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {reservations.map((res) => {
                        const paid = calcPaid(res);
                        const debt = Math.max(0, Number(res.remainingPayment) || 0);
                        const total = Number(res.totalPrice) || 0;
                        const discount = Number(res.discountAmount) || 0;
                        const isOpen = expandedRes === res.id;
                        const status = STATUS_CFG[res.status] || STATUS_CFG.pending;
                        const initials = `${(res.client?.firstName || '?')[0] || ''}${(res.client?.lastName || '')[0] || ''}`.toUpperCase();
                        const payments = (res.payments || []) as Payment[];

                        return (
                          <div key={res.id} className={res.status === 'cancelled' ? 'opacity-60' : ''}>
                            <button
                              onClick={() => setExpandedRes(isOpen ? null : res.id)}
                              className="w-full text-start px-5 py-4 hover:bg-slate-50 transition-colors flex items-center gap-3 cursor-pointer"
                            >
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs font-black flex items-center justify-center flex-shrink-0 shadow-sm">
                                {initials || '–'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-bold text-slate-800 truncate">
                                    {res.client?.firstName} {res.client?.lastName}
                                  </p>
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.cls}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                                    {T(status.fr, status.ar, lang)}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1 tabular-nums">
                                  <Clock size={12} className="flex-shrink-0" />
                                  {fmtD(res.step1?.departureDate || '')} → {fmtD(res.step1?.returnDate || '')}
                                  <span className="font-bold text-slate-600 bg-slate-100 rounded-md px-1.5 py-0.5">
                                    {res.totalDays}{T('j', 'ي', lang)}
                                  </span>
                                </p>
                              </div>
                              <div className="flex-shrink-0 text-end space-y-0.5">
                                <p className="font-black text-emerald-600 tabular-nums text-sm">+{fmt(paid)}</p>
                                {debt > 0 && (
                                  <p className="text-xs font-bold text-amber-500 tabular-nums flex items-center justify-end gap-1">
                                    <Hourglass size={11} /> {fmt(debt)}
                                  </p>
                                )}
                              </div>
                              <motion.span
                                animate={{ rotate: isOpen ? 180 : 0 }}
                                transition={SPRING}
                                className="text-slate-400 flex-shrink-0"
                              >
                                <ChevronDown size={18} />
                              </motion.span>
                            </button>

                            <AnimatePresence initial={false}>
                              {isOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                  className="overflow-hidden bg-emerald-50/40 border-t border-emerald-100"
                                >
                                  <div className="px-5 py-4 space-y-3">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                                      {[
                                        { label: T('Total', 'الإجمالي', lang), value: fmt(total), cls: 'text-slate-800' },
                                        { label: T('Avance', 'الدفعة الأولى', lang), value: fmt(Number(res.advancePayment) || 0), cls: 'text-blue-600' },
                                        { label: T('Payé', 'المدفوع', lang), value: fmt(paid), cls: 'text-emerald-600' },
                                        { label: T('Reste', 'المتبقي', lang), value: fmt(debt), cls: debt > 0 ? 'text-amber-600' : 'text-emerald-600' },
                                      ].map((cell, ci) => (
                                        <div key={ci} className="bg-white rounded-xl border border-slate-200 p-3">
                                          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{cell.label}</p>
                                          <p className={`font-black mt-1 tabular-nums ${cell.cls}`}>{cell.value} <span className="text-[10px] text-slate-400">DZD</span></p>
                                        </div>
                                      ))}
                                    </div>

                                    {discount > 0 && (
                                      <p className="text-xs font-semibold text-violet-600 flex items-center gap-1.5">
                                        <Tag size={12} />
                                        {T('Remise', 'تخفيض', lang)}: {res.discountType === 'percentage' ? `${discount}%` : `${fmt(discount)} DZD`}
                                      </p>
                                    )}

                                    {payments.length > 0 && (
                                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 pt-2.5 pb-1 flex items-center gap-1.5">
                                          <CreditCard size={12} />
                                          {T('Historique des paiements', 'سجل المدفوعات', lang)} ({payments.length})
                                        </p>
                                        <div className="divide-y divide-slate-100">
                                          {payments.map((p, pi) => (
                                            <div key={p.id || pi} className="flex items-center justify-between px-3 py-2 text-xs">
                                              <span className="flex items-center gap-2 text-slate-500">
                                                <Banknote size={13} className="text-emerald-500" />
                                                <span className="font-semibold">{fmtD(p.date || p.createdAt || '')}</span>
                                                <span className="bg-slate-100 text-slate-600 font-bold rounded-md px-1.5 py-0.5">
                                                  {T(PAYMENT_METHOD[p.method]?.fr || p.method || '—', PAYMENT_METHOD[p.method]?.ar || p.method || '—', lang)}
                                                </span>
                                              </span>
                                              <span className="font-black text-emerald-600 tabular-nums">+{fmt(Number(p.amount) || 0)} DZD</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {res.notes && (
                                      <p className="text-xs text-slate-500 flex items-start gap-1.5">
                                        <StickyNote size={12} className="mt-0.5 flex-shrink-0" />
                                        {res.notes}
                                      </p>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {reservations.length > 0 && (
                    <div className="bg-emerald-50/70 border-t border-emerald-100 px-5 py-3 flex items-center justify-between text-sm">
                      <span className="font-bold text-emerald-800">
                        {T('Total Facturé', 'إجمالي الفواتير', lang)}
                      </span>
                      <span className="font-black text-emerald-700 tabular-nums">{fmt(metrics.totalInvoiced)} DZD</span>
                    </div>
                  )}
                </motion.div>

                {/* ── Expenses ───────────────────────────────────────────── */}
                <motion.div
                  variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: SPRING } }}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  <div className="bg-gradient-to-r from-rose-50 to-red-50 border-b border-rose-100 px-5 py-4 flex items-center justify-between gap-3">
                    <h3 className="text-base font-black text-rose-800 uppercase tracking-tight flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
                        <Receipt size={16} />
                      </span>
                      {T('Dépenses', 'المصاريف', lang)}
                      <span className="text-xs font-black bg-rose-600 text-white rounded-full px-2 py-0.5">
                        {expenses.length}
                      </span>
                    </h3>
                    <span className="inline-flex items-center gap-1 text-sm font-black text-rose-600 tabular-nums">
                      <ArrowDownRight size={15} /> {fmt(metrics.totalExpenses)} DZD
                    </span>
                  </div>

                  {/* Breakdown by type */}
                  {Object.keys(metrics.byType).length > 0 && (
                    <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-2">
                      {Object.entries(metrics.byType).map(([type, amount]) => {
                        const cfg = EXPENSE_CFG[type] || EXPENSE_CFG.autre;
                        return (
                          <span key={type} className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${cfg.chip} tabular-nums`}>
                            <cfg.icon size={12} />
                            {T(cfg.fr, cfg.ar, lang)}: {fmt(amount)} DZD
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {expenses.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                      <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-400">
                        {T('Aucune dépense sur cette période', 'لا توجد مصاريف في هذه الفترة', lang)}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {expenses.map((exp) => {
                        const isOpen = expandedExp === exp.id;
                        const cfg = EXPENSE_CFG[exp.type] || EXPENSE_CFG.autre;

                        return (
                          <div key={exp.id}>
                            <button
                              onClick={() => setExpandedExp(isOpen ? null : exp.id)}
                              className="w-full text-start px-5 py-4 hover:bg-slate-50 transition-colors flex items-center gap-3 cursor-pointer"
                            >
                              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${cfg.chip}`}>
                                <cfg.icon size={17} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800 truncate">
                                  {exp.expenseName || T(cfg.fr, cfg.ar, lang)}
                                </p>
                                <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1 tabular-nums">
                                  <Calendar size={12} className="flex-shrink-0" />
                                  {fmtD(exp.date)}
                                  {exp.currentMileage ? (
                                    <span className="bg-slate-100 text-slate-600 font-bold rounded-md px-1.5 py-0.5 inline-flex items-center gap-1">
                                      <Gauge size={10} /> {Number(exp.currentMileage).toLocaleString()} KM
                                    </span>
                                  ) : null}
                                </p>
                              </div>
                              <p className="flex-shrink-0 font-black text-rose-600 tabular-nums text-sm">
                                -{fmt(Number(exp.cost) || 0)}
                              </p>
                              <motion.span
                                animate={{ rotate: isOpen ? 180 : 0 }}
                                transition={SPRING}
                                className="text-slate-400 flex-shrink-0"
                              >
                                <ChevronDown size={18} />
                              </motion.span>
                            </button>

                            <AnimatePresence initial={false}>
                              {isOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                  className="overflow-hidden bg-rose-50/40 border-t border-rose-100"
                                >
                                  <div className="px-5 py-4 grid grid-cols-2 gap-2 text-sm">
                                    <div className="bg-white rounded-xl border border-slate-200 p-3">
                                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{T('Type', 'النوع', lang)}</p>
                                      <p className="font-black text-slate-800 mt-1">{T(cfg.fr, cfg.ar, lang)}</p>
                                    </div>
                                    <div className="bg-white rounded-xl border border-slate-200 p-3">
                                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{T('Montant', 'المبلغ', lang)}</p>
                                      <p className="font-black text-rose-600 mt-1 tabular-nums">{fmt(Number(exp.cost) || 0)} <span className="text-[10px] text-slate-400">DZD</span></p>
                                    </div>
                                    {exp.nextVidangeKm ? (
                                      <div className="bg-white rounded-xl border border-slate-200 p-3">
                                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{T('Prochaine vidange', 'التغيير القادم', lang)}</p>
                                        <p className="font-black text-slate-800 mt-1 tabular-nums">{Number(exp.nextVidangeKm).toLocaleString()} KM</p>
                                      </div>
                                    ) : null}
                                    {exp.expirationDate ? (
                                      <div className="bg-white rounded-xl border border-slate-200 p-3">
                                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{T('Expiration', 'تاريخ الانتهاء', lang)}</p>
                                        <p className="font-black text-slate-800 mt-1 tabular-nums">{fmtD(exp.expirationDate)}</p>
                                      </div>
                                    ) : null}
                                    {exp.note && (
                                      <div className="bg-white rounded-xl border border-slate-200 p-3 col-span-2">
                                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                          <FileText size={11} /> {T('Note', 'ملاحظة', lang)}
                                        </p>
                                        <p className="text-slate-700 mt-1 text-xs leading-relaxed">{exp.note}</p>
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {expenses.length > 0 && (
                    <div className="bg-rose-50/70 border-t border-rose-100 px-5 py-3 flex items-center justify-between text-sm">
                      <span className="font-bold text-rose-800">
                        {T('Total Dépenses', 'إجمالي المصاريف', lang)}
                      </span>
                      <span className="font-black text-rose-700 tabular-nums">-{fmt(metrics.totalExpenses)} DZD</span>
                    </div>
                  )}
                </motion.div>
              </div>

              {/* ── Financial summary ──────────────────────────────────── */}
              <motion.div
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: SPRING } }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <div className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 px-6 py-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center">
                    <BarChart3 size={16} />
                  </span>
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">
                    {T('Résumé Financier', 'الملخص المالي', lang)}
                  </h3>
                </div>

                <div className="p-6 space-y-4">
                  {/* Revenue vs expense bars */}
                  {[
                    { label: T('Encaissé', 'المحصّل', lang), value: metrics.totalPaid, bar: 'from-emerald-400 to-teal-500', text: 'text-emerald-600' },
                    { label: T('Dépenses', 'المصاريف', lang), value: metrics.totalExpenses, bar: 'from-rose-400 to-red-500', text: 'text-rose-600' },
                  ].map((row, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="font-bold text-slate-600">{row.label}</span>
                        <span className={`font-black tabular-nums ${row.text}`}>{fmt(row.value)} DZD</span>
                      </div>
                      <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                        <motion.div
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: row.value / revExpMax }}
                          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 + i * 0.15 }}
                          className={`h-full w-full origin-left rounded-full bg-gradient-to-r ${row.bar}`}
                        />
                      </div>
                    </div>
                  ))}

                  {/* Detail cells */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                    {[
                      { label: T('Facturé', 'المفوتر', lang), value: metrics.totalInvoiced, color: 'text-blue-600' },
                      { label: T('Encaissé', 'المحصّل', lang), value: metrics.totalPaid, color: 'text-emerald-600' },
                      { label: T('Reste à payer', 'المتبقي للدفع', lang), value: metrics.totalRemaining, color: 'text-amber-600' },
                      { label: T('Dépenses', 'المصاريف', lang), value: metrics.totalExpenses, color: 'text-rose-600' },
                    ].map((item, i) => (
                      <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{item.label}</p>
                        <p className={`text-lg font-black tabular-nums ${item.color}`}>
                          <CountUp value={item.value} />
                        </p>
                        <p className="text-[10px] text-slate-400 font-semibold">DZD</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Net benefit banner */}
                <div className={`border-t px-6 py-5 ${metrics.netBenefit >= 0
                  ? 'border-emerald-100 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50'
                  : 'border-red-100 bg-gradient-to-r from-orange-50 via-red-50 to-orange-50'}`}
                >
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm ${metrics.netBenefit >= 0 ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                        {metrics.netBenefit >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                      </div>
                      <div>
                        <span className={`text-base font-black ${metrics.netBenefit >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                          {T('Bénéfice Net', 'صافي الأرباح', lang)}
                        </span>
                        <p className={`text-xs font-semibold ${metrics.netBenefit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {metrics.netBenefit >= 0
                            ? `${T('Marge de', 'هامش', lang)} ${metrics.margin}% ${T('sur les encaissements', 'من المحصّلات', lang)}`
                            : T('Les dépenses dépassent les encaissements', 'المصاريف تتجاوز المحصّلات', lang)}
                        </p>
                      </div>
                    </div>
                    <span className={`text-3xl font-black tabular-nums ${metrics.netBenefit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {metrics.netBenefit >= 0 ? '+' : ''}<CountUp value={metrics.netBenefit} /> <span className="text-sm">DZD</span>
                    </span>
                  </div>
                </div>
              </motion.div>

              {/* Nothing at all in the period */}
              {reservations.length === 0 && expenses.length === 0 && (
                <motion.div
                  variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
                  className="bg-blue-50 border border-blue-200 rounded-2xl p-8 text-center"
                >
                  <AlertCircle className="w-12 h-12 text-blue-500 mx-auto mb-3" />
                  <p className="text-blue-800 font-bold">
                    {T('Aucune donnée pour cette période', 'لا توجد بيانات لهذه الفترة', lang)}
                  </p>
                  <p className="text-blue-500 text-sm mt-1">
                    {T('Essayez d\'élargir la plage de dates.', 'حاول توسيع نطاق التواريخ.', lang)}
                  </p>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
};

export default CarGainsPage;
