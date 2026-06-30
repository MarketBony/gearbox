import React, { useState, useEffect } from 'react';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import { OneOffExpense, ServiceType, Site, PlaqueName } from '../types';
import { db } from '../services/dataService';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Edit, Save, X, Filter, Calendar, CreditCard, Search } from 'lucide-react';
import { SITES, SERVICES, PLAQUES_STRUCTURE } from '../constants';

const Expenses: React.FC = () => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<OneOffExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<OneOffExpense | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<OneOffExpense>>({
    date: new Date().toISOString().split('T')[0],
    service: 'VN',
    site: 'Clermont',
    amount: 0,
    comment: ''
  });

  // Filters
  const [filterSite, setFilterSite] = useSessionState<string>('expenses_filterSite', 'All');
  const [filterService, setFilterService] = useSessionState<string>('expenses_filterService', 'All');
  const [searchTerm, setSearchTerm] = useSessionState<string>('expenses_searchTerm', '');

  const scrollRef = useScrollRestore('expenses', !loading);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await db.getExpenses();
      setExpenses(data);
    } catch (error) {
      console.error("Failed to load expenses", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (expense?: OneOffExpense) => {
    if (expense) {
      setEditingExpense(expense);
      setFormData({
        date: expense.date.split('T')[0],
        service: expense.service,
        site: expense.site,
        amount: expense.amount,
        comment: expense.comment
      });
    } else {
      setEditingExpense(null);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        service: 'VN',
        site: 'Clermont',
        amount: 0,
        comment: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingExpense(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.date || !formData.service || !formData.site || formData.amount === undefined) return;

    const payload: OneOffExpense = {
      id: editingExpense ? editingExpense.id : `temp-${Date.now()}`,
      date: new Date(formData.date).toISOString(),
      service: formData.service as ServiceType,
      site: formData.site as Site | PlaqueName | 'GROUPE BONY',
      amount: Number(formData.amount),
      comment: formData.comment
    };

    try {
      await db.saveExpense(payload);
      await loadData();
      handleCloseModal();
    } catch (error) {
      console.error("Failed to save expense", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette dépense ?')) return;
    try {
      await db.deleteExpense(id);
      await loadData();
    } catch (error) {
      console.error("Failed to delete expense", error);
    }
  };

  // Filter Logic
  const filteredExpenses = expenses.filter(exp => {
    const matchesSite = filterSite === 'All' || exp.site === filterSite;
    const matchesService = filterService === 'All' || exp.service === filterService;
    const matchesSearch = !searchTerm || 
      (exp.comment && exp.comment.toLowerCase().includes(searchTerm.toLowerCase())) ||
      exp.site.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSite && matchesService && matchesSearch;
  });

  const totalAmount = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  // Group options for Site Select
  const renderSiteOptions = () => (
    <>
      <option value="GROUPE BONY">GROUPE BONY</option>
      {Object.entries(PLAQUES_STRUCTURE).map(([plaque, sites]) => (
        <optgroup key={plaque} label={plaque}>
          <option value={plaque}>{plaque}</option>
          {sites.map(s => <option key={s} value={s}>{s}</option>)}
        </optgroup>
      ))}
      <option value="Alpine">Alpine</option>
      <option value="Nissan">Nissan</option>
    </>
  );

  return (
    <div className="p-3 md:p-6 h-screen flex flex-col overflow-hidden animate-fade-in bg-bony-dark">
      {/* Header */}
      <div className="flex justify-between items-end mb-6 border-b border-bony-border pb-4 shrink-0">
        <div>
          <h2 className="text-3xl text-slate-900 dark:text-white mb-1 flex items-center gap-3">
            <CreditCard className="text-bony-orange" size={32} />
            Dépenses Ponctuelles
          </h2>
          <p className="text-xs text-slate-500 font-sans">GESTION DES DÉPENSES HORS PROJETS</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-bony-gradient text-white px-4 py-2 rounded-lg text-sm font-bold uppercase shadow-lg hover:shadow-bony-orange/20 transition-all flex items-center gap-2 min-h-[44px]"
        >
          <Plus size={18} /> Ajouter une dépense
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-4 items-center glass-strong p-3 rounded-xl shrink-0">
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-black/30 px-3 py-1.5 rounded-lg border border-bony-border flex-1 max-w-xs">
            <Search size={14} className="text-slate-400"/>
            <input 
                type="text" 
                placeholder="Rechercher..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent text-xs text-slate-900 dark:text-white outline-none w-full placeholder:text-slate-500"
            />
        </div>
        
        <div className="w-px h-6 bg-bony-border"></div>

        <div className="flex items-center gap-2">
            <Filter size={14} className="text-bony-orange"/>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Site :</span>
            <select 
                value={filterSite}
                onChange={(e) => setFilterSite(e.target.value)}
                className="bg-slate-100 dark:bg-black/30 border border-bony-border rounded px-2 py-1 text-xs text-slate-900 dark:text-white outline-none focus:border-bony-orange"
            >
                <option value="All">TOUS</option>
                {renderSiteOptions()}
            </select>
        </div>

        <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Service :</span>
            <select 
                value={filterService}
                onChange={(e) => setFilterService(e.target.value)}
                className="bg-slate-100 dark:bg-black/30 border border-bony-border rounded px-2 py-1 text-xs text-slate-900 dark:text-white outline-none focus:border-bony-orange"
            >
                <option value="All">TOUS</option>
                {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
        </div>

        <div className="ml-auto flex items-center gap-2 bg-slate-100 dark:bg-black/30 px-4 py-2 rounded-lg border border-bony-border">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total :</span>
            <span className="text-lg font-bold text-bony-orange font-mono">
                {totalAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
            </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 gx-card overflow-hidden flex flex-col">
        <div ref={scrollRef} className="overflow-y-auto custom-scrollbar flex-1">
          {/* Mobile card list */}
          <div className="md:hidden space-y-3 p-3">
            {loading ? (
              <p className="text-center text-slate-500 py-8">Chargement...</p>
            ) : filteredExpenses.length === 0 ? (
              <p className="text-center text-slate-500 py-8">Aucune dépense trouvée</p>
            ) : (
              filteredExpenses.map((exp) => (
                <div key={exp.id} className="gx-card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-bony-orange">
                      {new Date(exp.date).toLocaleDateString('fr-FR')}
                    </span>
                    <span className="font-bold text-bony-text">
                      {exp.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                    </span>
                  </div>
                  <div className="flex gap-2 text-xs text-slate-500">
                    <span>{exp.site}</span><span>·</span><span>{exp.service}</span>
                  </div>
                  {exp.comment && <p className="text-xs text-slate-400 truncate">{exp.comment}</p>}
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => handleOpenModal(exp)}
                      className="p-1.5 text-slate-400 hover:text-bony-orange hover:bg-bony-orange/10 rounded transition-colors"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(exp.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <table className="hidden md:table w-full text-left border-collapse">
            <thead className="bg-slate-100 dark:bg-black/20 text-[10px] uppercase font-bold text-slate-500 sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th className="p-4 border-b border-bony-border w-32">Date</th>
                <th className="p-4 border-b border-bony-border w-48">Site / Plaque</th>
                <th className="p-4 border-b border-bony-border w-32">Service</th>
                <th className="p-4 border-b border-bony-border">Commentaire</th>
                <th className="p-4 border-b border-bony-border text-right w-40">Montant</th>
                <th className="p-4 border-b border-bony-border text-center w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-sm">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500">Chargement...</td></tr>
              ) : filteredExpenses.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500">Aucune dépense trouvée</td></tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                    <td className="p-4 text-slate-500 font-mono text-xs">
                      {new Date(exp.date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="p-4 font-bold text-slate-700 dark:text-slate-200">
                      {exp.site}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${
                        exp.service === 'VN' ? 'text-blue-500 border-blue-500/30 bg-blue-500/10' :
                        exp.service === 'VO' ? 'text-orange-500 border-orange-500/30 bg-orange-500/10' :
                        exp.service === 'APV' ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10' :
                        exp.service === 'PR' ? 'text-cyan-500 border-cyan-500/30 bg-cyan-500/10' :
                        'text-slate-500 border-slate-500/30 bg-slate-500/10'
                      }`}>
                        {exp.service}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600 dark:text-slate-400 italic">
                      {exp.comment || '-'}
                    </td>
                    <td className="p-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {exp.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleOpenModal(exp)}
                          className="p-1.5 text-slate-400 hover:text-bony-orange hover:bg-bony-orange/10 rounded transition-colors"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(exp.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-strong glass-sheen relative rounded-xl shadow-glass-lg w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-bony-border flex justify-between items-center bg-slate-100 dark:bg-white/5">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {editingExpense ? <Edit size={18} className="text-bony-orange"/> : <Plus size={18} className="text-bony-orange"/>}
                {editingExpense ? 'Modifier la dépense' : 'Nouvelle dépense'}
              </h3>
              <button onClick={handleCloseModal} className="text-slate-500 hover:text-red-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Date</label>
                  <input 
                    type="date" 
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-bony-border rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-bony-orange transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Montant (€)</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value)})}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-bony-border rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-bony-orange transition-colors font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Site / Plaque</label>
                  <select 
                    required
                    value={formData.site}
                    onChange={(e) => setFormData({...formData, site: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-bony-border rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-bony-orange transition-colors"
                  >
                    {renderSiteOptions()}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Service</label>
                  <select 
                    required
                    value={formData.service}
                    onChange={(e) => setFormData({...formData, service: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-bony-border rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-bony-orange transition-colors"
                  >
                    {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Commentaire</label>
                <textarea 
                  value={formData.comment || ''}
                  onChange={(e) => setFormData({...formData, comment: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-black/20 border border-bony-border rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-bony-orange transition-colors h-24 resize-none"
                  placeholder="Détails de la dépense..."
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-lg text-xs font-bold uppercase text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  className="bg-bony-gradient text-white px-6 py-2 rounded-lg text-xs font-bold uppercase shadow-lg hover:shadow-bony-orange/20 transition-all flex items-center gap-2"
                >
                  <Save size={16} /> Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
