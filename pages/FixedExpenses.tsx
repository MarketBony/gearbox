import React, { useEffect, useState } from 'react';
import { FixedExpense, ServiceType, Site, PlaqueName } from '../types';
import { db } from '../services/dataService';
import { SITES, PLAQUES_STRUCTURE, SERVICES, SERVICE_COLORS, DISTRIBUTION_GROUPE_BONY, DISTRIBUTION_GROUPE_BONY_RN } from '../constants';
import { Plus, Trash2, Edit2, Save, X, Search, Filter, Euro, Calendar, MapPin, MessageSquare, Briefcase, ArrowUp, ArrowDown, ChevronDown, Check, PieChart } from 'lucide-react';

const FixedExpenses: React.FC = () => {
    const [expenses, setExpenses] = useState<FixedExpense[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentExpense, setCurrentExpense] = useState<Partial<FixedExpense>>({});
    const [isEditing, setIsEditing] = useState(false);
    const [showSiteDropdown, setShowSiteDropdown] = useState(false);

    // Filters
    const [filterSite, setFilterSite] = useState<string>('All');
    const [filterService, setFilterService] = useState<ServiceType | 'All'>('All');
    const [filterStartDate, setFilterStartDate] = useState<string>('');
    const [filterEndDate, setFilterEndDate] = useState<string>('');

    // Sorting
    const [sortField, setSortField] = useState<keyof FixedExpense>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

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
        if (isEditing && currentExpense.id) {
            updatedExpenses = updatedExpenses.map(e => e.id === currentExpense.id ? currentExpense as FixedExpense : e);
        } else {
            const newExpense: FixedExpense = {
                ...currentExpense as FixedExpense,
                id: Math.random().toString(36).substr(2, 9)
            };
            updatedExpenses = [newExpense, ...updatedExpenses];
        }

        setExpenses(updatedExpenses);
        await db.saveFixedExpenses(updatedExpenses);
        closeModal();
    };

    const handleDelete = async (id: string) => {
        if (confirm('Êtes-vous sûr de vouloir supprimer cette dépense ?')) {
            const updated = expenses.filter(e => e.id !== id);
            setExpenses(updated);
            await db.saveFixedExpenses(updated);
        }
    };

    const openModal = (expense?: FixedExpense) => {
        if (expense) {
            setCurrentExpense({ ...expense });
            setIsEditing(true);
        } else {
            setCurrentExpense({
                date: new Date().toISOString().split('T')[0],
                service: 'VN',
                site: 'Clermont',
                sites: ['Clermont'],
                budgetDistribution: { 'Clermont': 100 },
                amount: 0,
                comment: ''
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
                <div className="h-16 border-b border-bony-border flex items-center justify-between px-6 bg-bony-panel shrink-0">
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
                            className="flex items-center gap-2 bg-bony-gradient text-white px-4 py-2 rounded-lg font-bold text-sm hover:opacity-90 transition shadow-lg shadow-bony-orange/20"
                        >
                            <Plus size={18} />
                            NOUVELLE DÉPENSE
                        </button>
                    </div>
                </div>

                {/* Filters & Search */}
                <div className="p-4 border-b border-bony-border bg-bony-panel/50 flex flex-wrap gap-4 items-center">
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
                        <select 
                            value={filterSite}
                            onChange={(e) => setFilterSite(e.target.value)}
                            className="bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg px-3 py-2 text-xs font-bold text-bony-text outline-none focus:border-bony-orange cursor-pointer"
                        >
                            <option value="All">TOUS SITES</option>
                            <option value="GROUPE BONY">GROUPE BONY</option>
                            {Object.entries(PLAQUES_STRUCTURE).map(([plaqueName, sites]) => (
                                <optgroup key={plaqueName} label={plaqueName}>
                                    {sites.map(site => (
                                        <option key={site} value={site}>{site}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>

                        <select 
                            value={filterService}
                            onChange={(e) => setFilterService(e.target.value as any)}
                            className="bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg px-3 py-2 text-xs font-bold text-bony-text outline-none focus:border-bony-orange cursor-pointer"
                        >
                            <option value="All">TOUS SERVICES</option>
                            {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>

                        <div className="h-8 w-px bg-bony-border mx-2 hidden md:block"></div>

                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500 uppercase">Du</span>
                            <input 
                                type="date" 
                                value={filterStartDate}
                                onChange={(e) => setFilterStartDate(e.target.value)}
                                className="bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg px-3 py-2 text-xs font-bold text-bony-text outline-none focus:border-bony-orange cursor-pointer"
                            />
                            <span className="text-xs font-bold text-slate-500 uppercase">Au</span>
                            <input 
                                type="date" 
                                value={filterEndDate}
                                onChange={(e) => setFilterEndDate(e.target.value)}
                                className="bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg px-3 py-2 text-xs font-bold text-bony-text outline-none focus:border-bony-orange cursor-pointer"
                            />
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div className="bg-bony-panel rounded-xl border border-bony-border overflow-hidden shadow-sm">
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
                        <div className="bg-bony-panel border border-bony-border rounded-xl p-6 max-w-lg w-full shadow-2xl space-y-6">
                            <div className="flex justify-between items-center border-b border-bony-border pb-4">
                                <h3 className="text-xl font-title text-bony-text flex items-center gap-2">
                                    {isEditing ? <Edit2 size={20} className="text-bony-blue"/> : <Plus size={20} className="text-bony-orange"/>}
                                    {isEditing ? 'Modifier la dépense' : 'Nouvelle dépense fixe'}
                                </h3>
                                <button onClick={closeModal} className="text-slate-500 hover:text-bony-text">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                            <Calendar size={12}/> Date
                                        </label>
                                        <input 
                                            type="date" 
                                            value={currentExpense.date}
                                            onChange={(e) => setCurrentExpense({...currentExpense, date: e.target.value})}
                                            className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg p-2.5 text-bony-text outline-none focus:border-bony-blue text-sm font-bold"
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
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-bony-panel border border-bony-border rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar p-1">
                                                    <button
                                                        onClick={() => { updateSiteSelection('GROUPE BONY'); setShowSiteDropdown(false); }}
                                                        className={`w-full text-left px-3 py-2 text-xs font-bold rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between ${currentExpense.site === 'GROUPE BONY' ? 'text-bony-orange bg-orange-50 dark:bg-orange-900/20' : 'text-slate-700 dark:text-slate-300'}`}
                                                    >
                                                        GROUPE BONY (GLOBAL)
                                                        {currentExpense.site === 'GROUPE BONY' && <Check size={14}/>}
                                                    </button>
                                                    <button
                                                        onClick={() => { updateSiteSelection('GROUPE BONY (R/N)'); setShowSiteDropdown(false); }}
                                                        className={`w-full text-left px-3 py-2 text-xs font-bold rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between ${currentExpense.site === 'GROUPE BONY (R/N)' ? 'text-bony-orange bg-orange-50 dark:bg-orange-900/20' : 'text-slate-700 dark:text-slate-300'}`}
                                                    >
                                                        GROUPE BONY (R/N)
                                                        {currentExpense.site === 'GROUPE BONY (R/N)' && <Check size={14}/>}
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
                                                                        {site}
                                                                        {isSelected && <Check size={14}/>}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                            <Briefcase size={12}/> Service
                                        </label>
                                        <select 
                                            value={currentExpense.service}
                                            onChange={(e) => setCurrentExpense({...currentExpense, service: e.target.value as any})}
                                            className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg p-2.5 text-bony-text outline-none focus:border-bony-blue text-sm font-bold appearance-none cursor-pointer"
                                        >
                                            {SERVICES.map(s => <option key={s} value={s} className="bg-white dark:bg-bony-panel">{s}</option>)}
                                        </select>
                                    </div>
                                </div>

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
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-bony-border">
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
