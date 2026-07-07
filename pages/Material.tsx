import React, { useState, useEffect, useMemo } from 'react';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import { db, ApiError } from '../services/dataService';
import { Equipment, EquipmentBooking, Site, ServiceType, BrandType, ActivityLog } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Calendar, Package, Trash2, Edit, ChevronLeft, ChevronRight, Search, Filter, X, AlertCircle } from 'lucide-react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isSameDay, startOfMonth, endOfMonth, addMonths, subMonths, isWithinInterval, parseISO, getDay, getDate } from 'date-fns';
import { fr } from 'date-fns/locale';
import { SITES, SERVICES, BRANDS, SERVICE_COLORS, PLAQUES_STRUCTURE } from '../constants';
import Select from '../components/Select';
import DatePicker from '../components/DatePicker';
import CalendarGrid, { EventRenderMeta } from '../components/calendar/CalendarGrid';
import EventBar from '../components/calendar/EventBar';
import { serviceAccent } from '../components/calendar/calendarShared';

// --- HELPERS ---

const normalizeDate = (d: Date | string) => {
    const date = new Date(d);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const getStartOfWeekDate = (date: Date) => {
  const d = normalizeDate(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const getMonthDays = (year: number, month: number) => {
  const date = new Date(year, month, 1);
  const days = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

// NB : le packing en lanes (mois/semaine) est désormais mutualisé dans
// components/calendar/CalendarGrid.tsx — source unique partagée avec Agenda.

// --- COMPONENTS ---

/** Contenu du tooltip réservation (affiché au survol par EventBar). */
const BookingTooltipContent: React.FC<{ booking: EquipmentBooking; equipmentName: string }> = ({ booking, equipmentName }) => (
    <>
        <div className="font-bold text-bony-text text-sm mb-1">{equipmentName}</div>
        <div className="text-xs text-slate-500 mb-2">{booking.description}</div>
        <div className="flex flex-wrap gap-1 mb-2">
            <span className="text-[9px] bg-slate-700 px-1.5 py-0.5 rounded text-white">{booking.site}</span>
            <span className="text-[9px] bg-slate-700 px-1.5 py-0.5 rounded text-white">{booking.service}</span>
        </div>
        <div className="mt-2 pt-2 border-t border-bony-border text-[10px] text-slate-500">
            {format(new Date(booking.startDate), 'dd MMM')} - {format(new Date(booking.endDate), 'dd MMM yyyy')}
        </div>
    </>
);

const Material: React.FC = () => {
    const { user } = useAuth();
    // Gestion du catalogue réservée Master/Administrator (aligné sur
    // MANAGE_ROLES de routes/equipment.ts) ; les réservations restent
    // ouvertes à tout utilisateur authentifié (routes/equipmentBookings.ts).
    const canManageCatalog = user?.role === 'Master' || user?.role === 'Administrator';
    const [activeTab, setActiveTab] = useSessionState<'planning' | 'inventory'>('material_activeTab', 'planning');
    const [equipment, setEquipment] = useState<Equipment[]>([]);
    const [bookings, setBookings] = useState<EquipmentBooking[]>([]);
    const [loading, setLoading] = useState(true);

    // Planning State
    const [viewMode, setViewMode] = useSessionState<'week' | 'month'>('material_viewMode', 'week');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedEquipmentId, setSelectedEquipmentId] = useSessionState<string | 'All'>('material_selectedEquipmentId', 'All');

    const scrollRef = useScrollRestore('material', !loading);

    // Modal State
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
    const [currentBooking, setCurrentBooking] = useState<Partial<EquipmentBooking>>({});
    const [currentEquipment, setCurrentEquipment] = useState<Partial<Equipment>>({});
    const [isEditing, setIsEditing] = useState(false);
    const [availableQuantity, setAvailableQuantity] = useState<number | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    // Calculate availability whenever booking details change
    useEffect(() => {
        if (isBookingModalOpen && currentBooking.equipmentId && currentBooking.startDate && currentBooking.endDate) {
            const eq = equipment.find(e => e.id === currentBooking.equipmentId);
            if (eq) {
                const { maxUsed } = getAvailability(
                    currentBooking.equipmentId, 
                    currentBooking.startDate, 
                    currentBooking.endDate, 
                    currentBooking.id
                );
                setAvailableQuantity(Math.max(0, eq.totalQuantity - maxUsed));
            }
        } else {
            setAvailableQuantity(null);
        }
    }, [currentBooking.equipmentId, currentBooking.startDate, currentBooking.endDate, isBookingModalOpen, bookings]);

    const loadData = async () => {
        setLoading(true);
        const eq = await db.getEquipment();
        const bk = await db.getEquipmentBookings();
        setEquipment(eq);
        setBookings(bk);
        setLoading(false);
    };

    const getAvailability = (equipmentId: string, startDateStr: string, endDateStr: string, excludeBookingId?: string) => {
        const start = normalizeDate(startDateStr);
        const end = normalizeDate(endDateStr);
        
        // Filter relevant bookings
        const relevantBookings = bookings.filter(b => {
            if (b.equipmentId !== equipmentId) return false;
            if (excludeBookingId && b.id === excludeBookingId) return false;
            
            const bStart = normalizeDate(b.startDate);
            const bEnd = normalizeDate(b.endDate);
            
            return (start <= bEnd && end >= bStart);
        });

        let maxUsed = 0;
        const days = eachDayOfInterval({ start, end });
        
        for (const day of days) {
            let usedOnDay = 0;
            relevantBookings.forEach(b => {
                const bStart = normalizeDate(b.startDate);
                const bEnd = normalizeDate(b.endDate);
                if (isWithinInterval(day, { start: bStart, end: bEnd })) {
                    usedOnDay += b.quantity;
                }
            });
            if (usedOnDay > maxUsed) maxUsed = usedOnDay;
        }

        return { maxUsed };
    };

    // --- INVENTORY LOGIC ---
    const handleSaveEquipment = async () => {
        if (!currentEquipment.name || !currentEquipment.totalQuantity) {
            alert("Veuillez remplir le nom et la quantité.");
            return;
        }

        try {
            if (isEditing && currentEquipment.id) {
                const saved = await db.updateEquipment({ ...currentEquipment, totalQuantity: Number(currentEquipment.totalQuantity) } as Equipment);
                setEquipment(equipment.map(e => e.id === saved.id ? saved : e));
            } else {
                // L'id est généré par le backend.
                const created = await db.createEquipment({
                    name: currentEquipment.name,
                    totalQuantity: Number(currentEquipment.totalQuantity),
                    category: currentEquipment.category
                } as Omit<Equipment, 'id'>);
                setEquipment([...equipment, created]);
            }
            if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: isEditing ? 'a modifié le matériel' : 'a ajouté le matériel', entity: 'equipment', entityName: currentEquipment.name || 'Matériel', timestamp: new Date().toISOString() });
            setIsInventoryModalOpen(false);
            setCurrentEquipment({});
        } catch (e) {
            alert(e instanceof ApiError ? e.message : "Échec de l'enregistrement (serveur injoignable ?).");
        }
    };

    const handleDeleteEquipment = async (id: string) => {
        if (confirm("Êtes-vous sûr de vouloir supprimer ce matériel ? Les réservations liées seront aussi supprimées.")) {
            const toDelete = equipment.find(e => e.id === id);
            try {
                await db.deleteEquipment(id);
                setEquipment(equipment.filter(e => e.id !== id));
                // La cascade FK côté backend supprime aussi les réservations liées.
                setBookings(bookings.filter(b => b.equipmentId !== id));
                if (user && toDelete) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a supprimé le matériel', entity: 'equipment', entityName: toDelete.name, timestamp: new Date().toISOString() });
            } catch (e) {
                alert(e instanceof ApiError ? e.message : 'Échec de la suppression (serveur injoignable ?).');
            }
        }
    };

    const openInventoryModal = (eq?: Equipment) => {
        if (eq) {
            setCurrentEquipment({ ...eq });
            setIsEditing(true);
        } else {
            setCurrentEquipment({ totalQuantity: 1, category: 'Autre' });
            setIsEditing(false);
        }
        setIsInventoryModalOpen(true);
    };

    // --- BOOKING LOGIC ---
    const handleSaveBooking = async () => {
        if (!currentBooking.equipmentId || !currentBooking.startDate || !currentBooking.endDate || !currentBooking.quantity) {
            alert("Veuillez remplir tous les champs obligatoires.");
            return;
        }

        const eq = equipment.find(e => e.id === currentBooking.equipmentId);
        if (!eq) return;

        const { maxUsed } = getAvailability(
            currentBooking.equipmentId, 
            currentBooking.startDate, 
            currentBooking.endDate, 
            currentBooking.id
        );

        if (maxUsed + currentBooking.quantity > eq.totalQuantity) {
            alert(`Stock insuffisant ! Disponible : ${eq.totalQuantity - maxUsed} / ${eq.totalQuantity}`);
            return;
        }

        try {
            const payload = { ...currentBooking, quantity: Number(currentBooking.quantity) };
            if (isEditing && currentBooking.id) {
                const saved = await db.updateEquipmentBooking(payload as EquipmentBooking);
                setBookings(bookings.map(b => b.id === saved.id ? saved : b));
            } else {
                // L'id est généré par le backend.
                const created = await db.createEquipmentBooking(payload as Omit<EquipmentBooking, 'id'>);
                setBookings([...bookings, created]);
            }
            if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: isEditing ? 'a modifié une réservation matériel' : 'a créé une réservation matériel', entity: 'booking', entityName: eq.name, timestamp: new Date().toISOString() });
            setIsBookingModalOpen(false);
            setCurrentBooking({});
        } catch (e) {
            alert(e instanceof ApiError ? e.message : "Échec de l'enregistrement (serveur injoignable ?).");
        }
    };

    const handleDeleteBooking = async (id: string) => {
        try {
            const toDelete = bookings.find(b => b.id === id);
            const eqName = toDelete ? (equipment.find(e => e.id === toDelete.equipmentId)?.name || 'Matériel') : 'Matériel';
            await db.deleteEquipmentBooking(id);
            setBookings(bookings.filter(b => b.id !== id));
            if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a supprimé une réservation matériel', entity: 'booking', entityName: eqName, timestamp: new Date().toISOString() });
        } catch (e) {
            alert(e instanceof ApiError ? e.message : 'Échec de la suppression (serveur injoignable ?).');
        }
    };

    const openBookingModal = (booking?: EquipmentBooking, startDate?: Date, equipmentId?: string) => {
        setShowDeleteConfirm(false);
        if (booking) {
            setCurrentBooking({ ...booking });
            setIsEditing(true);
        } else {
            setCurrentBooking({
                startDate: startDate ? format(startDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
                endDate: startDate ? format(startDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
                quantity: 1,
                equipmentId: equipmentId || (selectedEquipmentId !== 'All' ? selectedEquipmentId : (equipment.length > 0 ? equipment[0].id : '')),
                site: 'GROUPE BONY',
                service: 'Tous Services',
                brand: 'Groupe'
            });
            setIsEditing(false);
        }
        setIsBookingModalOpen(true);
    };

    // --- PLANNING NAVIGATION ---
    const navigateDate = (direction: 'prev' | 'next') => {
        if (viewMode === 'week') {
            setCurrentDate(direction === 'prev' ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
        } else {
            setCurrentDate(direction === 'prev' ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
        }
    };

    const handleToday = () => setCurrentDate(new Date());

    // --- RENDERERS ---

    // Réservations filtrées par le sélecteur de matériel (logique métier conservée)
    const filteredBookings = bookings.filter(b => selectedEquipmentId === 'All' || b.equipmentId === selectedEquipmentId);

    // --- ÉVÉNEMENT RÉSERVATION (rendu partagé via EventBar, style Digital) ---
    const renderBookingEvent = (booking: EquipmentBooking, meta: EventRenderMeta) => {
        const eqName = equipment.find(e => e.id === booking.equipmentId)?.name || 'Inconnu';
        return (
            <EventBar
                accentClass={serviceAccent(booking.service)}
                onClick={(e) => { e.stopPropagation(); openBookingModal(booking); }}
                tooltip={<BookingTooltipContent booking={booking} equipmentName={eqName} />}
                clipLeft={meta.clipLeft}
                clipRight={meta.clipRight}
            >
                {meta.view === 'week' ? (
                    <div className="w-full overflow-hidden">
                        <div className="flex items-center gap-1 overflow-hidden">
                            <span className="font-bold text-[11px] shrink-0">{booking.quantity}x</span>
                            <span className="font-bold truncate text-[11px] leading-tight">{eqName}</span>
                        </div>
                        <div className="text-[9px] opacity-70 truncate mt-0.5">{booking.site} · {booking.service}</div>
                    </div>
                ) : (
                    <div className="flex items-center gap-1 overflow-hidden">
                        <span className="font-bold text-[10px] shrink-0">{booking.quantity}x</span>
                        <span className="font-bold truncate text-[10px] leading-tight">{eqName}</span>
                        <span className="opacity-60 text-[9px] truncate">- {booking.site}</span>
                    </div>
                )}
            </EventBar>
        );
    };

    // --- VUE MOIS (grille partagée) ---
    const renderMonthView = () => (
        <CalendarGrid
            view="month"
            currentDate={currentDate}
            items={filteredBookings}
            renderEvent={renderBookingEvent}
            onDayClick={(date) => openBookingModal(undefined, date)}
            scrollRef={scrollRef}
        />
    );

    // --- VUE SEMAINE (grille partagée) ---
    const renderWeekView = () => (
        <CalendarGrid
            view="week"
            currentDate={currentDate}
            items={filteredBookings}
            renderEvent={renderBookingEvent}
            onDayClick={(date) => openBookingModal(undefined, date)}
        />
    );

    return (
        <div className="flex h-screen overflow-hidden relative">
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                
                {/* Header */}
                <div className="h-16 border-b border-bony-border flex items-center justify-between px-3 md:px-6 glass-strong shrink-0">
                    <h2 className="text-base md:text-xl font-title text-bony-text flex items-center gap-2">
                        <div className="p-2 bg-bony-orange/10 rounded-lg">
                            <Package size={24} className="text-bony-orange"/>
                        </div>
                        Gestion Matériel
                    </h2>
                    <div className="flex items-center gap-2 md:gap-4">
                        <div className="flex bg-bony-dark rounded-lg p-1 border border-bony-border">
                            <button 
                                onClick={() => setActiveTab('planning')}
                                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${activeTab === 'planning' ? 'bg-bony-panel text-bony-text shadow-sm' : 'text-slate-500 hover:text-bony-text'}`}
                            >
                                Planning
                            </button>
                            <button 
                                onClick={() => setActiveTab('inventory')}
                                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${activeTab === 'inventory' ? 'bg-bony-panel text-bony-text shadow-sm' : 'text-slate-500 hover:text-bony-text'}`}
                            >
                                Inventaire
                            </button>
                        </div>
                        {activeTab === 'planning' ? (
                            <button
                                onClick={() => openBookingModal()}
                                className="flex items-center gap-2 bg-bony-gradient text-white px-4 py-2 min-h-[44px] rounded-lg font-bold text-sm hover:opacity-90 transition shadow-lg shadow-bony-orange/20"
                            >
                                <Plus size={18} />
                                RÉSERVER
                            </button>
                        ) : canManageCatalog ? (
                            <button
                                onClick={() => openInventoryModal()}
                                className="flex items-center gap-2 bg-bony-gradient text-white px-4 py-2 min-h-[44px] rounded-lg font-bold text-sm hover:opacity-90 transition shadow-lg shadow-bony-orange/20"
                            >
                                <Plus size={18} />
                                AJOUTER MATÉRIEL
                            </button>
                        ) : null}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {activeTab === 'planning' && (
                        <>
                            {/* Planning Controls */}
                            <div className="p-3 md:p-4 border-b border-bony-border glass-strong flex flex-wrap items-center gap-3 md:justify-between">
                                <div className="flex flex-wrap items-center gap-2 md:gap-4">
                                    <div className="flex items-center bg-bony-dark rounded-lg border border-bony-border">
                                        <button onClick={() => navigateDate('prev')} className="p-2 hover:bg-bony-panel text-slate-400 hover:text-bony-text rounded-l-lg"><ChevronLeft size={18}/></button>
                                        <button onClick={handleToday} className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-bony-text border-x border-bony-border">AUJOURD'HUI</button>
                                        <div className="px-4 py-2 font-bold text-bony-text min-w-[150px] text-center">
                                            {format(currentDate, viewMode === 'week' ? 'MMMM yyyy' : 'MMMM yyyy', { locale: fr }).toUpperCase()}
                                        </div>
                                        <button onClick={() => navigateDate('next')} className="p-2 hover:bg-bony-panel text-slate-400 hover:text-bony-text rounded-r-lg"><ChevronRight size={18}/></button>
                                    </div>
                                    <div className="flex bg-bony-dark rounded-lg p-1 border border-bony-border">
                                        <button 
                                            onClick={() => setViewMode('week')}
                                            className={`px-3 py-1 rounded text-xs font-bold ${viewMode === 'week' ? 'bg-bony-panel text-bony-text shadow-sm' : 'text-slate-500 hover:text-bony-text'}`}
                                        >
                                            SEMAINE
                                        </button>
                                        <button 
                                            onClick={() => setViewMode('month')}
                                            className={`px-3 py-1 rounded text-xs font-bold ${viewMode === 'month' ? 'bg-bony-panel text-bony-text shadow-sm' : 'text-slate-500 hover:text-bony-text'}`}
                                        >
                                            MOIS
                                        </button>
                                    </div>
                                </div>
                                
                                {/* Filter by Equipment */}
                                <div className="flex items-center gap-2">
                                    <Filter size={16} className="text-slate-500"/>
                                    <div className="min-w-[200px]">
                                        <Select
                                            size="sm"
                                            value={selectedEquipmentId}
                                            onChange={(v) => setSelectedEquipmentId(v)}
                                            options={[
                                                { value: 'All', label: 'TOUT LE MATÉRIEL' },
                                                ...equipment.map(e => ({ value: e.id, label: e.name })),
                                            ]}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Planning Grid */}
                            <div className="flex-1 overflow-hidden p-4 overflow-x-auto md:overflow-hidden">
                                <div className="min-w-[600px] md:min-w-0 h-full">
                                    {viewMode === 'week' ? renderWeekView() : renderMonthView()}
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === 'inventory' && (
                        <div className="p-6 overflow-y-auto custom-scrollbar">
                            <div className="gx-card overflow-hidden max-w-5xl mx-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-100 dark:bg-black/20 text-[10px] uppercase font-bold text-slate-500">
                                        <tr>
                                            <th className="p-4">Nom du matériel</th>
                                            <th className="p-4">Catégorie</th>
                                            <th className="p-4 text-center">Quantité Totale</th>
                                            <th className="p-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-bony-border">
                                        {equipment.map(eq => (
                                            <tr key={eq.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                                <td className="p-4 font-bold text-bony-text">{eq.name}</td>
                                                <td className="p-4 text-sm text-slate-400">
                                                    <span className="px-2 py-1 bg-slate-800 rounded text-xs">{eq.category}</span>
                                                </td>
                                                <td className="p-4 text-center font-mono font-bold text-bony-orange text-lg">{eq.totalQuantity}</td>
                                                <td className="p-4 text-right">
                                                    {canManageCatalog && (
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => openInventoryModal(eq)}
                                                                className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg text-slate-500 hover:text-bony-text transition-colors"
                                                            >
                                                                <Edit size={16}/>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteEquipment(eq.id)}
                                                                className="p-2 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-500 transition-colors"
                                                            >
                                                                <Trash2 size={16}/>
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Booking Modal */}
            {isBookingModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="glass-strong glass-sheen relative rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-bony-border flex items-center justify-between bg-slate-50 dark:bg-white/5">
                            <h3 className="text-xl font-title text-bony-text flex items-center gap-2">
                                {isEditing ? 'Modifier la réservation' : 'Nouvelle réservation'}
                            </h3>
                            <button onClick={() => setIsBookingModalOpen(false)} className="text-slate-400 hover:text-bony-text transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Matériel</label>
                                <Select
                                    size="md"
                                    value={currentBooking.equipmentId || ''}
                                    onChange={(v) => setCurrentBooking({...currentBooking, equipmentId: v})}
                                    options={equipment.map(e => ({ value: e.id, label: `${e.name} (Total: ${e.totalQuantity})` }))}
                                    disabled={isEditing}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date de début</label>
                                    <DatePicker
                                        size="md"
                                        value={currentBooking.startDate || ''}
                                        onChange={(v) => setCurrentBooking({...currentBooking, startDate: v})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date de fin</label>
                                    <DatePicker
                                        size="md"
                                        value={currentBooking.endDate || ''}
                                        onChange={(v) => setCurrentBooking({...currentBooking, endDate: v})}
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase">Quantité</label>
                                    {availableQuantity !== null && (
                                        <span className={`text-xs font-bold ${availableQuantity === 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                            Disponible : {availableQuantity}
                                        </span>
                                    )}
                                </div>
                                <input 
                                    type="number" 
                                    min="1"
                                    max={availableQuantity !== null ? availableQuantity : undefined}
                                    value={currentBooking.quantity || ''}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        if (availableQuantity !== null && val > availableQuantity) return;
                                        setCurrentBooking({...currentBooking, quantity: val});
                                    }}
                                    className="w-full bg-bony-dark border border-bony-border rounded-lg px-3 py-2 text-sm text-bony-text outline-none focus:border-bony-orange"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Site</label>
                                    <Select
                                        size="md"
                                        value={currentBooking.site || ''}
                                        onChange={(v) => setCurrentBooking({...currentBooking, site: v as any})}
                                        options={[
                                            { value: 'GROUPE BONY', label: 'GROUPE BONY' },
                                            ...Object.entries(PLAQUES_STRUCTURE).flatMap(([plaque, sites]) =>
                                                sites.map(s => ({ value: s, label: s }))
                                            ),
                                            { value: 'Alpine', label: 'Alpine' },
                                            { value: 'Nissan', label: 'Nissan' },
                                        ]}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Service</label>
                                    <Select
                                        size="md"
                                        value={currentBooking.service || ''}
                                        onChange={(v) => setCurrentBooking({...currentBooking, service: v as any})}
                                        options={SERVICES.map(s => ({ value: s, label: s }))}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description / Détail OP</label>
                                <textarea 
                                    value={currentBooking.description || ''}
                                    onChange={(e) => setCurrentBooking({...currentBooking, description: e.target.value})}
                                    className="w-full bg-bony-dark border border-bony-border rounded-lg px-3 py-2 text-sm text-bony-text outline-none focus:border-bony-orange h-24 resize-none"
                                    placeholder="Détails de l'événement..."
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-bony-border bg-slate-50 dark:bg-white/5 flex justify-end gap-3">
                            {isEditing && (
                                !showDeleteConfirm ? (
                                    <button 
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="px-4 py-2 rounded-lg font-bold text-sm text-red-500 hover:bg-red-500/10 transition-colors mr-auto"
                                    >
                                        Supprimer
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2 mr-auto">
                                        <span className="text-xs font-bold text-bony-text">Confirmer ?</span>
                                        <button 
                                            onClick={async () => {
                                                if (currentBooking.id) {
                                                    await handleDeleteBooking(currentBooking.id);
                                                    setIsBookingModalOpen(false);
                                                } else {
                                                    console.error("Booking ID missing");
                                                    setIsBookingModalOpen(false);
                                                }
                                            }}
                                            className="px-3 py-1.5 rounded-lg font-bold text-xs text-white bg-red-500 hover:bg-red-600 transition-colors shadow-sm"
                                        >
                                            OUI
                                        </button>
                                        <button 
                                            onClick={() => setShowDeleteConfirm(false)}
                                            className="px-3 py-1.5 rounded-lg font-bold text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                                        >
                                            NON
                                        </button>
                                    </div>
                                )
                            )}
                            <button 
                                onClick={() => setIsBookingModalOpen(false)}
                                className="px-4 py-2 rounded-lg font-bold text-sm text-slate-500 hover:text-bony-text hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                            >
                                Annuler
                            </button>
                            <button 
                                onClick={handleSaveBooking}
                                className="px-6 py-2 rounded-lg font-bold text-sm text-white bg-bony-gradient hover:opacity-90 transition-opacity shadow-lg shadow-bony-orange/20"
                            >
                                Enregistrer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Inventory Modal */}
            {isInventoryModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="glass-strong glass-sheen relative rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-bony-border flex items-center justify-between bg-slate-50 dark:bg-white/5">
                            <h3 className="text-xl font-title text-bony-text flex items-center gap-2">
                                {isEditing ? 'Modifier le matériel' : 'Nouveau matériel'}
                            </h3>
                            <button onClick={() => setIsInventoryModalOpen(false)} className="text-slate-400 hover:text-bony-text transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nom du matériel</label>
                                <input 
                                    type="text" 
                                    value={currentEquipment.name || ''}
                                    onChange={(e) => setCurrentEquipment({...currentEquipment, name: e.target.value})}
                                    className="w-full bg-bony-dark border border-bony-border rounded-lg px-3 py-2 text-sm text-bony-text outline-none focus:border-bony-orange"
                                    placeholder="Ex: Enceinte JBL"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Catégorie</label>
                                <input 
                                    type="text" 
                                    value={currentEquipment.category || ''}
                                    onChange={(e) => setCurrentEquipment({...currentEquipment, category: e.target.value})}
                                    className="w-full bg-bony-dark border border-bony-border rounded-lg px-3 py-2 text-sm text-bony-text outline-none focus:border-bony-orange"
                                    placeholder="Ex: Son, Mobilier, PLV..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quantité Totale</label>
                                <input 
                                    type="number" 
                                    min="1"
                                    value={currentEquipment.totalQuantity}
                                    onChange={(e) => setCurrentEquipment({...currentEquipment, totalQuantity: parseInt(e.target.value)})}
                                    className="w-full bg-bony-dark border border-bony-border rounded-lg px-3 py-2 text-sm text-bony-text outline-none focus:border-bony-orange"
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-bony-border bg-slate-50 dark:bg-white/5 flex justify-end gap-3">
                            <button 
                                onClick={() => setIsInventoryModalOpen(false)}
                                className="px-4 py-2 rounded-lg font-bold text-sm text-slate-500 hover:text-bony-text hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                            >
                                Annuler
                            </button>
                            <button 
                                onClick={handleSaveEquipment}
                                className="px-6 py-2 rounded-lg font-bold text-sm text-white bg-bony-gradient hover:opacity-90 transition-opacity shadow-lg shadow-bony-orange/20"
                            >
                                Enregistrer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Material;
