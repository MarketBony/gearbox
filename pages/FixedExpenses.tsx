import React, { useEffect, useState } from 'react';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import { FixedExpense, ServiceType, Site, PlaqueName, BrandType, ActivityLog } from '../types';
import { db } from '../services/dataService';
import { useAuth } from '../contexts/AuthContext';
import { SITES, PLAQUES_STRUCTURE, SERVICES, SERVICE_COLORS, BRANDS, BRAND_COLORS, ALPINE_SITES, NISSAN_SITES, DISTRIBUTION_GROUPE_BONY, DISTRIBUTION_GROUPE_BONY_RN } from '../constants';
import { Plus, Trash2, Edit2, Save, X, Search, Filter, Euro, Calendar, MapPin, MessageSquare, Briefcase, ArrowUp, ArrowDown, ChevronDown, Check, PieChart } from 'lucide-react';
import Select from '../components/Select';
import DatePicker from '../components/DatePicker';

const FixedExpenses: React.FC = () => {
    const { user } = useAuth();
    const [expenses, setExpenses] = useState<FixedExpense[]>([]);
    const [searchTerm, setSearchTerm] = useSessionState<string>('fixedexpenses_searchTerm', '');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentExpense, setCurrentExpense] = useState<Partial<FixedExpense>>({});
    const [isEditing, setIsEditing] = useState(false);
    const [showSiteDropdown, setShowSiteDropdown] = useState(false);

    // Filters
    const [filterSite, setFilterSite] = useSessionState<string>('fixedexpenses_filterSite', 'All');
    const [filterService, setFilterService] = useSessionState<ServiceType | 'All'>('fixedexpenses_filterService', 'All');
    const [filterStartDate, setFilterStartDate] = useSessionState<string>('fixedexpenses_filterStartDate', '');
    const [filterEndDate, setFilterEndDate] = useSessionState<string>('fixedexpenses_filterEndDate', '');

    // Sorting
    const [sortField, setSortField] = useSessionState<keyof FixedExpense>('fixedexpenses_sortField', 'date');
    const [sortOrder, setSortOrder] = useSessionState<'asc' | 'desc'>('fixedexpenses_sortOrder', 'desc');

    const scrollRef = useScrollRestore('fixedexpenses');

    useEffect(() => {
        loadExpenses();
    }, []);

    const loadExpenses = async () => {
        const data = await db.getFixedExpenses();
        setExpenses(data);
    };

    const handleSave = async () => {
        // Validation: Check required fields. Allow amount to be 0, but must be defined and a number.
        const isDateValid = !!currentExpense.date;
        // Check if amount is a number and not NaN. 
        // Note: Number('') is 0, so we need to be careful if we want to enforce non-empty input visually, 
        // but logically 0 is a valid amount.
        // However, if the user clears the input, currentExpense.amount might be 0 or NaN depending on browser/react.
        // Let's ensure it's treated as valid if it's a number.
        const isAmountValid = currentExpense.amount !== undefined && currentExpense.amount !== null && !isNaN(Number(currentExpense.amount));
        const isSiteValid = !!currentExpense.site;
        const isServiceValid = !!currentExpense.service;

        if (!isDateValid || !isAmountValid || !isSiteValid || !isServiceValid) {
            alert("Veuillez remplir tous les champs obligatoires (Date, Montant, Site, Service)");
            return;
        }

        let updatedExpenses = [...expenses];
        const expenseName = currentExpense.comment || currentExpense.site || 'Dépense fixe';
        const saveBrands = currentExpense.brands || [];
        const expenseData = { ...currentExpense, brands: saveBrands, brand: saveBrands[0] };
        if (isEditing && currentExpense.id) {
            updatedExpenses = updatedExpenses.map(e => e.id === currentExpense.id ? expenseData as FixedExpense : e);
        } else {
            const newExpense: FixedExpense = {
                ...expenseData as FixedExpense,
                id: Math.random().toString(36).substr(2, 9)
            };
            updatedExpenses = [newExpense, ...updatedExpenses];
        }

        setExpenses(updatedExpenses);
        await db.saveFixedExpenses(updatedExpenses);
        if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: isEditing ? 'a modifié une dépense fixe' : 'a créé une dépense fixe', entity: 'fixed-expense', entityName: expenseName, timestamp: new Date().toISOString() });
        closeModal();
    };

    const handleDelete = async (id: string) => {
        if (confirm('Êtes-vous sûr de vouloir supprimer cette dépense ?')) {
            const toDelete = expenses.find(e => e.id === id);
            const updated = expenses.filter(e => e.id !== id);
            setExpenses(updated);
            await db.saveFixedExpenses(updated);
            if (user && toDelete) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a supprimé une dépense fixe', entity: 'fixed-expense', entityName: toDelete.comment || toDelete.site || 'Dépense fixe', timestamp: new Date().toISOString() });
        }
    };

    // Marques disponibles selon les sites sélectionnés
    const getAvailableBrands = (sites: string[]): BrandType[] => {
        return BRANDS.filter(b => {
            if (b === 'Alpine') return sites.some(s => ALPINE_SITES.includes(s as Site));
            if (b === 'Nissan') return sites.some(s => NISSAN_SITES.includes(s as Site));
            return true;
        });
    };

    const openModal = (expense?: FixedExpense) => {
        if (expense) {
            setCurrentExpense({
                ...expense,
                brands: expense.brands || (expense.brand ? [expense.brand] : [])
            });
            setIsEditing(true);
        } else {
            setCurrentExpense({
                date: new Date().toISOString().split('T')[0],
                service: 'VN',
                site: 'Clermont',
                sites: ['Clermont'],
                budgetDistribution: { 'Clermont': 100 },
                amount: 0,
                comment: '',
                brand: undefined,
                brands: []
            });
            setIsEditing(false);
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setCurrentExpense({});
        setIsEditing(false);
    };

    const updateSiteSelection = (newSite: string) => {
        let newSites = [...(currentExpense.sites || [])];
        // If sites was undefined (legacy), init with current site
        if (!currentExpense.sites && currentExpense.site) {
            newSites = [currentExpense.site as string];
        }

        let newDistribution = { ...(currentExpense.budgetDistribution || {}) };
        let mainSite = currentExpense.site as string;

        const isGroupMode = (s: string) => s === 'GROUPE BONY' || s === 'GROUPE BONY (R/N)';

        if (newSite === 'GROUPE BONY') {
            newSites = Object.keys(DISTRIBUTION_GROUPE_BONY);
            newDistribution = { ...DISTRIBUTION_GROUPE_BONY };
            mainSite = 'GROUPE BONY';
        } else if (newSite === 'GROUPE BONY (R/N)') {
            newSites = Object.keys(DISTRIBUTION_GROUPE_BONY_RN);
            newDistribution = { ...DISTRIBUTION_GROUPE_BONY_RN };
            mainSite = 'GROUPE BONY (R/N)';
        } else {
            // If we were in a group mode, clear everything first
            if (isGroupMode(mainSite)) {
                newSites = [];
            }

            // Toggle site
            if (newSites.includes(newSite)) {
                newSites = newSites.filter(s => s !== newSite);
            } else {
                newSites.push(newSite);
            }

            // Update mainSite for display
            if (newSites.length === 0) mainSite = '';
            else if (newSites.length === 1) mainSite = newSites[0];
            else mainSite = newSites.join(', ');

            // Recalculate distribution for manual mode (Equal split by default)
            if (newSites.length > 0) {
                const equalShare = 100 / newSites.length;
                newDistribution = {};
                newSites.forEach(s => newDistribution[s] = equalShare);
            } else {
                newDistribution = {};
            }
        }

        setCurrentExpense({ 
            ...currentExpense, 
            site: mainSite as any, 
            sites: newSites, 
            budgetDistribution: newDistribution 
        });
    };

    const updateBudgetDistribution = (site: string, value: number) => {
        const newDistribution = { ...(currentExpense.budgetDistribution || {}) };
        newDistribution[site] = value;
        setCurrentExpense({ ...currentExpense, budgetDistribution: newDistribution });
    };

    const handleSort = (field: keyof FixedExpense) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc'); // Default to desc for new field
        }
    };

    const filteredExpenses = expenses.filter(e => {
        const matchesSearch = 
            e.comment.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.site.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.service.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesSite = filterSite === 'All' || e.site === filterSite;
        const matchesService = filterService === 'All' || e.service === filterService;

        // Date Range Filter
        let matchesDate = true;
        if (filterStartDate) {
            matchesDate = matchesDate && new Date(e.date) >= new Date(filterStartDate);
        }
        if (filterEndDate) {
            matchesDate = matchesDate && new Date(e.date) <= new Date(filterEndDate);
        }

        return matchesSearch && matchesSite && matchesService && matchesDate;
    }).sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (typeof valA === 'string' && typeof valB === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    const totalAmount = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    const SortIcon = ({ field }: { field: keyof FixedExpense }) => {
        if (sortField !== field) return null;
        return sortOrder === 'asc' ? <ArrowUp size={12} className="ml-1"/> : <ArrowDown size={12} className="ml-1"/>;
    };

    return (
        <div className="flex h-screen overflow-hidden bg-bony-dark relative">
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                
                {/* Header */}
                <div className="h-16 border-b border-bony-border flex items-center justify-between px-6 glass-strong shrink-0">
                    <h2 className="text-xl font-title text-bony-text flex items-center gap-2">
                        <div className="p-2 bg-bony-orange/10 rounded-lg">
                            <Euro size={24} className="text-bony-orange"/>
                        </div>
                        Dépenses Fixes
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="bg-bony-panel border border-bony-border px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Période</span>
                            <span className="text-bony-text text-lg font-bold font-sans">{totalAmount.toLocaleString()} €</span>
                        </div>
                        <button
                            onClick={() => openModal()}
                            className="flex items-center gap-2 bg-bony-gradient text-white px-4 py-2 rounded-lg font-bold text-sm hover:opacity-90 transition shadow-lg shadow-bony-orange/20 min-h-[44px]"
                        >
                            <Plus size={18} />
                            NOUVELLE DÉPENSE
                        </button>
                    </div>
                </div>

                {/* Filters & Search */}
                <div className="p-4 border-b border-bony-border glass-strong flex flex-wrap gap-4 items-center">
                    <div className="relative flex-1 min-w-[200px] max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input 
                            type="text" 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Rechercher..."
                            className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg pl-9 pr-3 py-2 text-sm text-bony-text outline-none focus:border-bony-orange transition-colors placeholder-slate-400"
                        />
                    </div>

                    <div className="h-8 w-px bg-bony-border mx-2 hidden md:block"></div>

                    <div className="flex items-center gap-2">
                        <Filter size={16} className="text-slate-500"/>
                        <Select
                            size="sm"
                            value={filterSite}
                            onChange={(v) => setFilterSite(v)}
                            options={[
                                { value: 'All', label: 'TOUS SITES' },
                                { value: 'GROUPE BONY', label: 'GROUPE BONY' },
                                ...Object.values(PLAQUES_STRUCTURE).flat().map(site => ({ value: site, label: site })),
                            ]}
                        />

                        <Select
                            size="sm"
                            value={filterService}
                            onChange={(v) => setFilterService(v as any)}
                            options={[
                                { value: 'All', label: 'TOUS SERVICES' },
                                ...SERVICES.map(s => ({ value: s, label: s })),
                            ]}
                        />

                        <div className="h-8 w-px bg-bony-border mx-2 hidden md:block"></div>

                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500 uppercase">Du</span>
                            <div className="w-40">
                                <DatePicker
                                    size="sm"
                                    value={filterStartDate}
                                    onChange={(v) => setFilterStartDate(v)}
                                />
                            </div>
                            <span className="text-xs font-bold text-slate-500 uppercase">Au</span>
                            <div className="w-40">
                                <DatePicker
                                    size="sm"
                                    value={filterEndDate}
                                    onChange={(v) => setFilterEndDate(v)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-6">
                    {/* Mobile card list */}
                    <div className="md:hidden space-y-3">
                        {filteredExpenses.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-12 text-slate-500 italic">
                                <Search size={32} className="opacity-20"/>
                                <p>Aucune dépense fixe trouvée.</p>
                            </div>
                        ) : (
                            filteredExpenses.map((expense) => (
                                <div key={expense.id} className="gx-card p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-bony-orange">
                                            {new Date(expense.date).toLocaleDateString()}
                                        </span>
                                        <span className="font-bold text-bony-text">
                                            {expense.amount.toLocaleString()} €
                                        </span>
                                    </div>
                                    <div className="flex gap-2 text-xs text-slate-500 items-center">
                                        <span>{expense.site}</span><span>·</span><span>{expense.service}</span>
                                        {expense.proPlus && <span className="ml-auto text-[8px] font-bold text-white bg-bony-gradient px-1.5 py-0.5 rounded uppercase tracking-wide">PRO+</span>}
                                    </div>
                                    {expense.comment && <p className="text-xs text-slate-400 truncate">{expense.comment}</p>}
                                    <div className="flex gap-2 justify-end">
                                        <button onClick={() => openModal(expense)} className="p-1.5 rounded-md hover:bg-bony-blue/10 text-slate-400 hover:text-bony-blue transition">
                                            <Edit2 size={16} />
                                        </button>
                                        <button onClick={() => handleDelete(expense.id)} className="p-1.5 rounded-md hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="hidden md:block gx-card overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-100 dark:bg-black/20 text-[10px] uppercase font-bold text-slate-500 sticky top-0 z-10 backdrop-blur-sm">
                                <tr>
                                    <th 
                                        className="p-4 w-32 cursor-pointer hover:text-bony-text transition-colors select-none"
                                        onClick={() => handleSort('date')}
                                    >
                                        <div className="flex items-center">Date <SortIcon field="date"/></div>
                                    </th>
                                    <th 
                                        className="p-4 w-40 cursor-pointer hover:text-bony-text transition-colors select-none"
                                        onClick={() => handleSort('site')}
                                    >
                                        <div className="flex items-center">Site / Plaque <SortIcon field="site"/></div>
                                    </th>
                                    <th 
                                        className="p-4 w-32 cursor-pointer hover:text-bony-text transition-colors select-none"
                                        onClick={() => handleSort('service')}
                                    >
                                        <div className="flex items-center">Service <SortIcon field="service"/></div>
                                    </th>
                                    <th 
                                        className="p-4 cursor-pointer hover:text-bony-text transition-colors select-none"
                                        onClick={() => handleSort('comment')}
                                    >
                                        <div className="flex items-center">Commentaire <SortIcon field="comment"/></div>
                                    </th>
                                    <th 
                                        className="p-4 w-32 text-right cursor-pointer hover:text-bony-text transition-colors select-none"
                                        onClick={() => handleSort('amount')}
                                    >
                                        <div className="flex items-center justify-end">Montant (€) <SortIcon field="amount"/></div>
                                    </th>
                                    <th className="p-4 w-24 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-bony-border">
                                {filteredExpenses.length > 0 ? filteredExpenses.map((expense) => (
                                    <tr key={expense.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition group">
                                        <td className="p-4 text-sm font-sans font-medium text-slate-600 dark:text-slate-300">
                                            {new Date(expense.date).toLocaleDateString()}
                                        </td>
                                        <td className="p-4">
                                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-100 dark:bg-black/30 px-2 py-1 rounded border border-bony-border block truncate max-w-[200px]" title={expense.site}>
                                                {expense.site}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border ${SERVICE_COLORS[expense.service]?.replace('bg-', 'bg-opacity-20 bg-') || 'border-slate-300 text-slate-500'}`}>
                                                {expense.service}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm text-bony-text font-medium">
                                            {expense.proPlus && <span className="mr-2 align-middle text-[8px] font-bold text-white bg-bony-gradient px-1.5 py-0.5 rounded uppercase tracking-wide">PRO+</span>}
                                            {expense.comment}
                                        </td>
                                        <td className="p-4 text-sm font-bold text-right text-bony-text font-sans">
                                            {expense.amount.toLocaleString()} €
                                        </td>
                                        <td className="p-4 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openModal(expense)} className="p-1.5 rounded-md hover:bg-bony-blue/10 text-slate-400 hover:text-bony-blue transition">
                                                <Edit2 size={16} />
                                            </button>
                                            <button onClick={() => handleDelete(expense.id)} className="p-1.5 rounded-md hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition">
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={6} className="p-12 text-center text-slate-500 italic">
                                            <div className="flex flex-col items-center gap-2">
                                                <Search size={32} className="opacity-20"/>
                                                <p>Aucune dépense fixe trouvée.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Modal */}
                {isModalOpen && (
                    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                        <div className="glass-strong glass-sheen relative rounded-xl w-full max-w-lg md:max-w-2xl shadow-glass-lg flex flex-col max-h-[90vh] overflow-hidden">
                            <div className="flex justify-between items-center border-b border-bony-border p-6 pb-4 shrink-0">
                                <h3 className="text-xl font-title text-bony-text flex items-center gap-2">
                                    {isEditing ? <Edit2 size={20} className="text-bony-blue"/> : <Plus size={20} className="text-bony-orange"/>}
                                    {isEditing ? 'Modifier la dépense' : 'Nouvelle dépense fixe'}
                                </h3>
                                <button onClick={closeModal} className="text-slate-500 hover:text-bony-text">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-4 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                            <Calendar size={12}/> Date
                                        </label>
                                        <DatePicker
                                            size="md"
                                            value={currentExpense.date || ''}
                                            onChange={(v) => setCurrentExpense({...currentExpense, date: v})}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                            <Euro size={12}/> Montant
                                        </label>
                                        <input 
                                            type="number" 
                                            value={currentExpense.amount}
                                            onChange={(e) => setCurrentExpense({...currentExpense, amount: Number(e.target.value)})}
                                            className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg p-2.5 text-bony-text outline-none focus:border-bony-blue text-sm font-bold"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                            <MapPin size={12}/> Site / Plaque
                                        </label>
                                        <div className="relative">
                                            <button 
                                                onClick={() => setShowSiteDropdown(!showSiteDropdown)}
                                                className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg p-2.5 text-bony-text outline-none focus:border-bony-blue text-sm font-bold flex justify-between items-center hover:bg-slate-200 dark:hover:bg-black/30 transition-colors"
                                            >
                                                <span className="truncate">{currentExpense.site || 'Sélectionner...'}</span>
                                                <ChevronDown size={16} className="text-slate-500"/>
                                            </button>
                                            
                                            {showSiteDropdown && (
                                                <div className="absolute top-full left-0 right-0 mt-1 glass-menu rounded-lg z-50 max-h-60 overflow-y-auto custom-scrollbar p-1">
                                                    <button
                                                        onClick={() => { updateSiteSelection('GROUPE BONY'); setShowSiteDropdown(false); }}
                                                        className={`w-full text-left px-3 py-2 text-xs font-bold rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between ${currentExpense.site === 'GROUPE BONY' ? 'text-bony-orange bg-orange-50 dark:bg-orange-900/20' : 'text-slate-700 dark:text-slate-300'}`}
                                                    >
                                                        <span className="truncate min-w-0">GROUPE BONY (GLOBAL)</span>
                                                        {currentExpense.site === 'GROUPE BONY' && <Check size={14} className="shrink-0"/>}
                                                    </button>
                                                    <button
                                                        onClick={() => { updateSiteSelection('GROUPE BONY (R/N)'); setShowSiteDropdown(false); }}
                                                        className={`w-full text-left px-3 py-2 text-xs font-bold rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between ${currentExpense.site === 'GROUPE BONY (R/N)' ? 'text-bony-orange bg-orange-50 dark:bg-orange-900/20' : 'text-slate-700 dark:text-slate-300'}`}
                                                    >
                                                        <span className="truncate min-w-0">GROUPE BONY (R/N)</span>
                                                        {currentExpense.site === 'GROUPE BONY (R/N)' && <Check size={14} className="shrink-0"/>}
                                                    </button>
                                                    
                                                    <div className="h-px bg-slate-100 dark:bg-white/10 my-1"></div>

                                                    {Object.entries(PLAQUES_STRUCTURE).map(([plaqueName, sites]) => (
                                                        <div key={plaqueName} className="mb-1">
                                                            <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-400">{plaqueName}</div>
                                                            {sites.map(site => {
                                                                const isSelected = (currentExpense.sites || []).includes(site);
                                                                return (
                                                                    <button
                                                                        key={site}
                                                                        onClick={() => updateSiteSelection(site)}
                                                                        className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between ${isSelected ? 'text-bony-blue font-bold bg-blue-50 dark:bg-blue-900/20' : 'text-slate-600 dark:text-slate-400'}`}
                                                                    >
                                                                        <span className="truncate min-w-0">{site}</span>
                                                                        {isSelected && <Check size={14} className="shrink-0"/>}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    ))}
                                                    <div className="mb-1">
                                                        <div className="px-3 py-1 text-[10px] uppercase font-bold text-red-400/70">SITES NISSAN</div>
                                                        {(['Montluçon', 'Saint-Etienne'] as Site[]).map(site => {
                                                            const isSelected = (currentExpense.sites || []).includes(site);
                                                            return (
                                                                <button
                                                                    key={site}
                                                                    onClick={() => updateSiteSelection(site)}
                                                                    className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between ${isSelected ? 'text-bony-blue font-bold bg-blue-50 dark:bg-blue-900/20' : 'text-slate-600 dark:text-slate-400'}`}
                                                                >
                                                                    {site}
                                                                    {isSelected && <Check size={14}/>}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                            <Briefcase size={12}/> Service
                                        </label>
                                        <Select
                                            size="md"
                                            value={currentExpense.service || ''}
                                            onChange={(v) => setCurrentExpense({...currentExpense, service: v as any})}
                                            options={SERVICES.map(s => ({ value: s, label: s }))}
                                        />
                                    </div>
                                </div>

                                {/* BRAND SECTION - Multi-select chips */}
                                {(() => {
                                    const selectedSites = currentExpense.sites || [];
                                    const alpineOk = selectedSites.some(s => ALPINE_SITES.includes(s as Site));
                                    const nissanOk = selectedSites.some(s => NISSAN_SITES.includes(s as Site));
                                    const currentBrands = currentExpense.brands || [];
                                    return (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                                Marque(s) — routage budgétaire
                                            </label>
                                            <div className="flex flex-wrap gap-2">
                                                {BRANDS.map(b => {
                                                    const isAvailable = b === 'Alpine' ? alpineOk : b === 'Nissan' ? nissanOk : true;
                                                    const isSelected = currentBrands.includes(b);
                                                    return (
                                                        <button
                                                            key={b}
                                                            disabled={!isAvailable}
                                                            onClick={() => {
                                                                const next = isSelected
                                                                    ? currentBrands.filter(x => x !== b)
                                                                    : [...currentBrands, b];
                                                                setCurrentExpense({ ...currentExpense, brands: next, brand: next[0] });
                                                            }}
                                                            className={`px-3 py-1.5 rounded text-xs font-bold border transition-all ${
                                                                isSelected
                                                                    ? `${BRAND_COLORS[b]} shadow scale-105`
                                                                    : isAvailable
                                                                    ? 'bg-slate-100 dark:bg-black/20 border-bony-border text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                                                    : 'bg-slate-100 dark:bg-black/20 border-bony-border text-slate-400 opacity-40 cursor-not-allowed'
                                                            }`}
                                                        >
                                                            {b}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            {!alpineOk && !nissanOk && (
                                                <p className="text-[10px] text-slate-400 italic mt-1">
                                                    Sélectionnez un site Alpine ou Nissan pour activer ces marques.
                                                </p>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* ALPINE SHARE — visible si marques mixtes Alpine + RDM */}
                                {(() => {
                                    const expBrands = currentExpense.brands || [];
                                    const hasAlpine = expBrands.includes('Alpine');
                                    const hasRDM = expBrands.some(b => ['Renault', 'Dacia', 'Mobilize'].includes(b));
                                    if (!hasAlpine || !hasRDM) return null;
                                    const share = currentExpense.alpineShare ?? 50;
                                    return (
                                        <div className="space-y-1 pt-3 border-t border-bony-border animate-in fade-in">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase">Part Alpine (%)</label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={share}
                                                    onChange={(e) => setCurrentExpense({...currentExpense, alpineShare: Number(e.target.value)})}
                                                    className="flex-1 accent-[#0055a4]"
                                                />
                                                <span className="text-sm font-bold text-bony-text w-10 text-right">{share}%</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400">{share}% → Alpine · {100 - share}% → compte RDM</p>
                                        </div>
                                    );
                                })()}

                                {/* BUDGET ALLOCATION SECTION */}
                                {(currentExpense.sites && currentExpense.sites.length > 1) && (
                                    <div className="mt-4 pt-4 border-t border-bony-border animate-in fade-in">
                                        <h4 className="text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-4 flex items-center gap-2">
                                            <PieChart size={14} className="text-bony-orange"/> Répartition Budgétaire
                                        </h4>
                                        
                                        <div className="grid grid-cols-2 gap-4">
                                            {(currentExpense.sites || []).map(site => {
                                                const pct = (currentExpense.budgetDistribution || {})[site] || 0;
                                                const isFixed = currentExpense.site === 'GROUPE BONY' || currentExpense.site === 'GROUPE BONY (R/N)';
                                                
                                                return (
                                                    <div key={site} className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 w-24 truncate">{site}</span>
                                                        <div className="flex-1 flex items-center gap-2">
                                                            <input 
                                                                type="number" 
                                                                min="0" 
                                                                max="100"
                                                                disabled={isFixed}
                                                                value={pct}
                                                                onChange={(e) => updateBudgetDistribution(site, Number(e.target.value))}
                                                                className={`w-16 bg-slate-100 dark:bg-black/20 border border-bony-border rounded px-2 py-1 text-xs font-bold text-center outline-none focus:border-bony-blue ${isFixed ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            />
                                                            <span className="text-xs text-slate-400">%</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        
                                        <div className="mt-2 flex justify-end">
                                            <span className={`text-xs font-bold ${
                                                Object.values(currentExpense.budgetDistribution || {}).reduce((a, b) => a + b, 0) === 100 
                                                ? 'text-emerald-500' 
                                                : 'text-red-500'
                                            }`}>
                                                Total: {Math.round(Object.values(currentExpense.budgetDistribution || {}).reduce((a, b) => a + b, 0))}%
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1 mt-4">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                        <MessageSquare size={12}/> Commentaire
                                    </label>
                                    <textarea
                                        value={currentExpense.comment}
                                        onChange={(e) => setCurrentExpense({...currentExpense, comment: e.target.value})}
                                        className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg p-2.5 text-bony-text outline-none focus:border-bony-blue text-sm min-h-[100px]"
                                        placeholder="Description de la dépense..."
                                    />
                                </div>

                                <div className="space-y-1 mt-4">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                        <Briefcase size={12}/> Type client
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentExpense({ ...currentExpense, proPlus: !currentExpense.proPlus })}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold uppercase tracking-wide transition-all ${
                                            currentExpense.proPlus
                                                ? 'bg-bony-gradient text-white border-transparent shadow'
                                                : 'bg-slate-100 dark:bg-black/20 text-slate-500 border-bony-border hover:text-bony-text'
                                        }`}
                                        title="Marquer cette dépense comme PRO+ (B2B)"
                                    >
                                        <span className={`flex items-center justify-center w-4 h-4 rounded border transition-colors ${
                                            currentExpense.proPlus ? 'bg-white/25 border-white/60' : 'border-slate-400 dark:border-slate-500'
                                        }`}>
                                            {currentExpense.proPlus && <Check size={11} strokeWidth={3} />}
                                        </span>
                                        PRO+ (B2B)
                                    </button>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 p-6 pt-4 border-t border-bony-border shrink-0">
                                <button
                                    onClick={closeModal}
                                    className="px-4 py-2 rounded-lg text-sm font-bold text-slate-500 hover:text-bony-text transition"
                                >
                                    ANNULER
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="px-4 py-2 rounded-lg text-sm font-bold bg-bony-gradient text-white hover:opacity-90 transition shadow-lg"
                                >
                                    ENREGISTRER
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default FixedExpenses;
