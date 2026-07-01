import React, { useState, useEffect, useMemo } from 'react';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import { db } from '../services/dataService';
import { Equipment, EquipmentBooking, Site, ServiceType, BrandType, ActivityLog } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Calendar, Package, Trash2, Edit, ChevronLeft, ChevronRight, Search, Filter, X, AlertCircle } from 'lucide-react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isSameDay, startOfMonth, endOfMonth, addMonths, subMonths, isWithinInterval, parseISO, getDay, getDate } from 'date-fns';
import { fr } from 'date-fns/locale';
import { SITES, SERVICES, BRANDS, SERVICE_COLORS, PLAQUES_STRUCTURE } from '../constants';
import Select from '../components/Select';
import DatePicker from '../components/DatePicker';

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

// --- LAYOUT ENGINE ---

interface LayoutItem {
    booking: EquipmentBooking;
    startCol: number;
    span: number;
    lane: number;
}

const calculateLayout = (bookings: EquipmentBooking[], startDate: Date, endDate: Date, totalCols: number): LayoutItem[] => {
    const gridStart = normalizeDate(startDate);
    const gridEnd = normalizeDate(endDate);
    const msPerDay = 1000 * 60 * 60 * 24;

    const items = bookings.map(b => {
        const bStart = normalizeDate(b.startDate);
        const bEnd = normalizeDate(b.endDate);

        if (bEnd < gridStart || bStart > gridEnd) return null;

        const effectiveStart = bStart < gridStart ? gridStart : bStart;
        const effectiveEnd = bEnd > gridEnd ? gridEnd : bEnd;

        const startCol = Math.round((effectiveStart.getTime() - gridStart.getTime()) / msPerDay);
        // Span is at least 1 day
        const span = Math.max(1, Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / msPerDay) + 1);

        return { booking: b, startCol, span, lane: -1 };
    }).filter(Boolean) as LayoutItem[];

    items.sort((a, b) => {
        if (a.startCol !== b.startCol) return a.startCol - b.startCol;
        return b.span - a.span;
    });

    const lanes: number[] = [];
    items.forEach(item => {
        let placed = false;
        for (let i = 0; i < lanes.length; i++) {
            if (lanes[i] < item.startCol) {
                item.lane = i;
                lanes[i] = item.startCol + item.span - 1;
                placed = true;
                break;
            }
        }
        if (!placed) {
            item.lane = lanes.length;
            lanes.push(item.startCol + item.span - 1);
        }
    });

    return items;
};

// --- COMPONENTS ---

const BookingPill: React.FC<{ 
    booking: EquipmentBooking; 
    equipmentName: string;
    onClick: () => void;
    className?: string;
    style?: React.CSSProperties;
}> = ({ booking, equipmentName, onClick, className, style }) => {
    const [isHovered, setIsHovered] = useState(false);
    const colorClass = SERVICE_COLORS[booking.service] || 'bg-slate-500 text-white border-slate-600';

    return (
        <>
            <div 
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className={`
                    absolute border-l-[3px] rounded-r px-2 shadow-sm 
                    hover:brightness-110 hover:z-50 transition cursor-pointer overflow-hidden whitespace-nowrap
                    flex flex-col justify-center select-none z-10 text-[10px]
                    ${colorClass} ${className}
                `}
                style={style}
            >
                <div className="flex items-center gap-1 overflow-hidden">
                    <span className="font-bold">{booking.quantity}x</span>
                    <span className="font-bold truncate">{equipmentName}</span>
                    <span className="opacity-70 text-[9px]">- {booking.site}</span>
                </div>
            </div>

            {isHovered && (
                <div
                    className="absolute z-[100] w-64 glass-menu rounded-xl p-3 animate-in fade-in duration-200 pointer-events-none"
                    style={{ 
                        top: '100%', 
                        left: style?.left || 0,
                        marginTop: '4px' 
                    }}
                >
                    <div className="font-bold text-bony-text text-sm mb-1">{equipmentName}</div>
                    <div className="text-xs text-slate-500 mb-2">{booking.description}</div>
                    <div className="flex flex-wrap gap-1 mb-2">
                        <span className="text-[9px] bg-slate-700 px-1.5 py-0.5 rounded text-white">{booking.site}</span>
                        <span className="text-[9px] bg-slate-700 px-1.5 py-0.5 rounded text-white">{booking.service}</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-bony-border text-[10px] text-slate-500">
                        {format(new Date(booking.startDate), 'dd MMM')} - {format(new Date(booking.endDate), 'dd MMM yyyy')}
                    </div>
                </div>
            )}
        </>
    );
};

const Material: React.FC = () => {
    const { user } = useAuth();
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

        let updatedEquipment = [...equipment];
        if (isEditing && currentEquipment.id) {
            updatedEquipment = updatedEquipment.map(e => e.id === currentEquipment.id ? currentEquipment as Equipment : e);
        } else {
            const newEq: Equipment = {
                ...currentEquipment as Equipment,
                id: Math.random().toString(36).substr(2, 9)
            };
            updatedEquipment.push(newEq);
        }

        await db.saveEquipment(updatedEquipment);
        setEquipment(updatedEquipment);
        if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: isEditing ? 'a modifié le matériel' : 'a ajouté le matériel', entity: 'equipment', entityName: currentEquipment.name || 'Matériel', timestamp: new Date().toISOString() });
        setIsInventoryModalOpen(false);
        setCurrentEquipment({});
    };

    const handleDeleteEquipment = async (id: string) => {
        if (confirm("Êtes-vous sûr de vouloir supprimer ce matériel ?")) {
            const toDelete = equipment.find(e => e.id === id);
            const updatedEquipment = equipment.filter(e => e.id !== id);
            await db.saveEquipment(updatedEquipment);
            setEquipment(updatedEquipment);
            if (user && toDelete) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a supprimé le matériel', entity: 'equipment', entityName: toDelete.name, timestamp: new Date().toISOString() });
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

        let updatedBookings = [...bookings];
        if (isEditing && currentBooking.id) {
            updatedBookings = updatedBookings.map(b => b.id === currentBooking.id ? currentBooking as EquipmentBooking : b);
        } else {
            const newBooking: EquipmentBooking = {
                ...currentBooking as EquipmentBooking,
                id: Math.random().toString(36).substr(2, 9)
            };
            updatedBookings.push(newBooking);
        }

        await db.saveEquipmentBookings(updatedBookings);
        setBookings(updatedBookings);
        if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: isEditing ? 'a modifié une réservation matériel' : 'a créé une réservation matériel', entity: 'booking', entityName: eq.name, timestamp: new Date().toISOString() });
        setIsBookingModalOpen(false);
        setCurrentBooking({});
    };

    const handleDeleteBooking = async (id: string) => {
        try {
            // Fetch latest bookings to ensure we're working with current data
            const currentBookings = await db.getEquipmentBookings();
            const toDelete = currentBookings.find(b => b.id === id);
            const eqName = toDelete ? (equipment.find(e => e.id === toDelete.equipmentId)?.name || 'Matériel') : 'Matériel';
            const updatedBookings = currentBookings.filter(b => b.id !== id);
            await db.saveEquipmentBookings(updatedBookings);
            setBookings(updatedBookings);
            if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a supprimé une réservation matériel', entity: 'booking', entityName: eqName, timestamp: new Date().toISOString() });
        } catch (error) {
            console.error("Error deleting booking:", error);
            alert("Une erreur est survenue lors de la suppression.");
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

    const renderGridHeader = (days: Date[]) => {
        return (
            <div className="grid grid-cols-7 border-b border-bony-border bg-bony-panel shrink-0">
                {days.map(d => {
                    const isToday = isSameDay(d, new Date());
                    return (
                        <div key={d.toISOString()} className={`p-2 text-center border-r border-bony-border last:border-r-0 ${isToday ? 'bg-bony-orange/10' : ''}`}>
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{format(d, 'EEE', { locale: fr })}</div>
                            <div className={`text-sm font-bold ${isToday ? 'text-bony-orange' : 'text-bony-text'}`}>{d.getDate()}</div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderMonthView = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        const firstDayOfMonth = normalizeDate(new Date(year, month, 1));
        // Adjust start day to Monday (0=Sun -> 6, 1=Mon -> 0)
        const startDayIndex = (firstDayOfMonth.getDay() + 6) % 7;
        const daysInMonth = getMonthDays(year, month);
        
        // Build Cells
        const cells = [];
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for(let i = 0; i < startDayIndex; i++) {
            cells.push({ date: new Date(year, month - 1, prevMonthLastDay - startDayIndex + 1 + i), isCurrentMonth: false });
        }
        daysInMonth.forEach(d => cells.push({ date: d, isCurrentMonth: true }));
        const remaining = 7 - (cells.length % 7);
        if (remaining < 7) {
            for(let i = 1; i <= remaining; i++) {
                cells.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
            }
        }

        // Chunk into Weeks
        const weeks = [];
        for (let i = 0; i < cells.length; i += 7) {
            weeks.push(cells.slice(i, i + 7));
        }

        const daysHeader = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

        // Filter bookings
        const filteredBookings = bookings.filter(b => selectedEquipmentId === 'All' || b.equipmentId === selectedEquipmentId);

        return (
            <div className="flex flex-col h-full bg-bony-dark border border-bony-border rounded-b-xl overflow-hidden">
                <div className="grid grid-cols-7 border-b border-bony-border bg-bony-panel shrink-0">
                    {daysHeader.map(d => (
                        <div key={d} className="p-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest border-r border-bony-border last:border-r-0">
                            {d}
                        </div>
                    ))}
                </div>
                <div ref={scrollRef} className="flex-1 flex flex-col bg-bony-border gap-[1px] overflow-y-auto custom-scrollbar">
                    {weeks.map((week, weekIdx) => {
                        const weekStart = week[0].date;
                        const weekEnd = week[6].date;
                        
                        // Calculate Layout for this week row
                        const layoutItems = calculateLayout(filteredBookings, weekStart, weekEnd, 7);

                        // Determine Row Height dynamically
                        const maxLane = layoutItems.reduce((max, p) => Math.max(max, p.lane), -1);
                        const itemHeight = 24; 
                        const headerHeight = 28; 
                        const minHeight = 110; 
                        const contentHeight = Math.max(minHeight, headerHeight + (maxLane + 1) * itemHeight + 10);

                        return (
                            <div key={weekIdx} className="relative bg-bony-dark w-full" style={{ height: `${contentHeight}px` }}>
                                {/* Grid Background */}
                                <div className="absolute inset-0 grid grid-cols-7 divide-x divide-bony-border/30">
                                    {week.map((day, dIdx) => {
                                        const isToday = isSameDay(day.date, new Date());
                                        return (
                                            <div 
                                                key={dIdx} 
                                                className={`h-full ${!day.isCurrentMonth ? 'bg-slate-100 dark:bg-black/20' : 'bg-white dark:bg-transparent'} ${isToday ? 'bg-bony-blue/5' : ''} hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer`}
                                                onClick={() => openBookingModal(undefined, day.date)}
                                            >
                                                <div className={`text-right text-xs font-sans font-bold p-1 ${isToday ? 'text-bony-orange' : 'text-slate-500'}`}>
                                                    {day.date.getDate()}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Bookings Layer */}
                                <div className="absolute inset-0 top-7 px-1 grid grid-cols-7 pointer-events-none">
                                     {layoutItems.map((item, idx) => {
                                         const eqName = equipment.find(e => e.id === item.booking.equipmentId)?.name || 'Inconnu';
                                         return (
                                            <div 
                                                key={item.booking.id + weekIdx + idx}
                                                className="relative pointer-events-auto"
                                                style={{
                                                    gridColumnStart: item.startCol + 1,
                                                    gridColumnEnd: `span ${item.span}`,
                                                    marginTop: `${item.lane * itemHeight}px`
                                                }}
                                            >
                                                <BookingPill 
                                                    booking={item.booking}
                                                    equipmentName={eqName}
                                                    onClick={() => openBookingModal(item.booking)}
                                                    className={`
                                                        w-full h-[22px]
                                                        ${item.startCol === 0 && normalizeDate(item.booking.startDate) < normalizeDate(weekStart) ? 'rounded-l-none border-l-0 opacity-80' : ''}
                                                        ${(item.startCol + item.span) === 7 && normalizeDate(item.booking.endDate) > normalizeDate(weekEnd) ? 'rounded-r-none' : ''}
                                                    `}
                                                />
                                            </div>
                                         );
                                     })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderWeekView = () => {
        const startOfWeek = getStartOfWeekDate(currentDate);
        const endOfWeek = addDays(startOfWeek, 6);
        const days = Array.from({length: 7}, (_, i) => addDays(startOfWeek, i));

        // Filter bookings
        const filteredBookings = bookings.filter(b => selectedEquipmentId === 'All' || b.equipmentId === selectedEquipmentId);
        
        // Calculate Layout
        const layoutItems = calculateLayout(filteredBookings, startOfWeek, endOfWeek, 7);

        // Dynamic height
        const maxLane = layoutItems.reduce((max, p) => Math.max(max, p.lane), -1);
        const itemHeight = 44; 
        const totalHeight = Math.max(500, (maxLane + 1) * (itemHeight + 4) + 20);

        return (
            <div className="flex flex-col h-full bg-bony-dark border border-bony-border rounded-b-xl overflow-hidden">
                 {renderGridHeader(days)}
                 <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-bony-dark">
                     {/* Columns Background */}
                     <div className="absolute inset-0 grid grid-cols-7 divide-x divide-bony-border/30 h-full" style={{minHeight: totalHeight}}>
                          {days.map((day, i) => {
                              const isToday = isSameDay(day, new Date());
                              return (
                                  <div 
                                    key={i} 
                                    className={`h-full ${isToday ? 'bg-bony-blue/5' : ''} hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer`}
                                    onClick={() => openBookingModal(undefined, day)}
                                  ></div>
                              );
                          })}
                     </div>

                     {/* Bookings Layer */}
                     <div className="absolute inset-0 top-2 px-1 grid grid-cols-7 pointer-events-none" style={{height: totalHeight}}>
                         {layoutItems.map((item, idx) => {
                             const eqName = equipment.find(e => e.id === item.booking.equipmentId)?.name || 'Inconnu';
                             return (
                                 <div 
                                     key={item.booking.id + idx}
                                     className="relative pointer-events-auto"
                                     style={{
                                         gridColumnStart: item.startCol + 1,
                                         gridColumnEnd: `span ${item.span}`,
                                         marginTop: `${item.lane * (itemHeight + 4)}px`,
                                         height: `${itemHeight}px`
                                     }}
                                 >
                                      <BookingPill 
                                           booking={item.booking}
                                           equipmentName={eqName}
                                           onClick={() => openBookingModal(item.booking)}
                                           className={`
                                              w-full h-full
                                              ${item.startCol === 0 && normalizeDate(item.booking.startDate) < normalizeDate(startOfWeek) ? 'rounded-l-none border-l-0 opacity-80' : ''}
                                              ${(item.startCol + item.span) === 7 && normalizeDate(item.booking.endDate) > normalizeDate(endOfWeek) ? 'rounded-r-none' : ''}
                                           `}
                                       />
                                 </div>
                             );
                         })}
                     </div>
                 </div>
            </div>
        );
    };

    return (
        <div className="flex h-screen overflow-hidden bg-bony-dark relative">
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
                        ) : (
                            <button
                                onClick={() => openInventoryModal()}
                                className="flex items-center gap-2 bg-bony-gradient text-white px-4 py-2 min-h-[44px] rounded-lg font-bold text-sm hover:opacity-90 transition shadow-lg shadow-bony-orange/20"
                            >
                                <Plus size={18} />
                                AJOUTER MATÉRIEL
                            </button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {activeTab === 'planning' && (
                        <>
                            {/* Planning Controls */}
                            <div className="p-3 md:p-4 border-b border-bony-border bg-bony-panel/50 flex flex-wrap items-center gap-3 md:justify-between">
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
                            <div className="flex-1 overflow-hidden p-4 bg-bony-dark overflow-x-auto md:overflow-hidden">
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
