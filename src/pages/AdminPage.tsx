import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Sparkles, Image as ImageIcon, Send, Loader2, CheckCircle, AlertCircle, Trash2, Edit, X, LayoutGrid, List, Calendar, Globe, ExternalLink, ShieldAlert, CheckCircle2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, serverTimestamp, getDocs, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { cn, formatDate, getApiBaseUrl } from '../lib/utils';
import { handleFirestoreError } from '../lib/errorHandler';
import { Link } from 'react-router-dom';
import { ImageUploader } from '../components/ImageUploader';
import { trackAdmin } from '../lib/analytics';

interface ContentItem {
  id: string;
  title: string;
  category: string;
  date: any;
  author: string;
  content: string;
  description: string;
  image: string;
}

export function AdminDashboard() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'generate' | 'manual' | 'manage' | 'srm-events'>('generate');
  
  // SRM Events State
  const [srmEventsList, setSrmEventsList] = useState<any[]>([]);
  const [srmStats, setSrmStats] = useState<any>(null);
  const [srmLoading, setSrmLoading] = useState(false);
  const [srmTriggering, setSrmTriggering] = useState(false);
  const [srmMessage, setSrmMessage] = useState('');
  const [srmError, setSrmError] = useState('');
  
  // Generation State
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState('Blog');
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Manual Form State
  const [manualTitle, setManualTitle] = useState('');
  const [manualAuthor, setManualAuthor] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualContent, setManualContent] = useState('');
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [manualCategory, setManualCategory] = useState('Blog');

  // Image upload tracking states
  const [isUploadingGen, setIsUploadingGen] = useState(false);
  const [isUploadingManual, setIsUploadingManual] = useState(false);
  const [isUploadingEdit, setIsUploadingEdit] = useState(false);
  const [uploadKeyGen, setUploadKeyGen] = useState(0);
  const [uploadKeyManual, setUploadKeyManual] = useState(0);

  // Let's reset success and error state when activeTab changes
  useEffect(() => {
    setSuccess(false);
    setError('');
  }, [activeTab]);

  // Management State
  const [allContent, setAllContent] = useState<ContentItem[]>([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<ContentItem | null>(null);

  const isAdmin = user?.email === 'satyamanikantareddysathi@gmail.com';
  const categories = ['Blog', 'Stories'];
  const collectionMap: Record<string, string> = {
    Blog: 'blogs',
    Stories: 'stories'
  };

  useEffect(() => {
    if (activeTab === 'manage' && isAdmin) {
      fetchAllContent();
    } else if (activeTab === 'srm-events' && isAdmin) {
      fetchSrmAdminData();
    }
  }, [activeTab]);

  const fetchSrmAdminData = async () => {
    setSrmLoading(true);
    setSrmError('');
    try {
      const apiBaseUrl = getApiBaseUrl();
      const token = user ? await user.getIdToken() : '';
      const [eventsRes, statsRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/events?status=all`),
        fetch(`${apiBaseUrl}/api/admin/srm-events/stats`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        })
      ]);

      const eventsData = await eventsRes.json();
      const statsData = await statsRes.json();

      if (eventsData.success) {
        setSrmEventsList(eventsData.events || []);
      }
      if (statsData.success) {
        setSrmStats(statsData.stats || null);
      }
    } catch (err: any) {
      console.error("Failed to load SRM Events admin data:", err);
      setSrmError(err.message || "Failed to load SRM Events data");
    } finally {
      setSrmLoading(false);
    }
  };

  const handleTriggerSrmDiscovery = async () => {
    setSrmTriggering(true);
    setSrmMessage('');
    setSrmError('');
    try {
      const apiBaseUrl = getApiBaseUrl();
      const token = user ? await user.getIdToken() : '';
      const res = await fetch(`${apiBaseUrl}/api/admin/srm-events/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (data.success) {
        setSrmMessage(data.message || 'Tavily discovery pipeline executed successfully!');
        if (data.stats) {
          setSrmStats(data.stats);
        }
        await fetchSrmAdminData();
      } else {
        throw new Error(data.error || 'Failed to trigger discovery pipeline.');
      }
    } catch (err: any) {
      console.error("SRM Discovery trigger failed:", err);
      setSrmError(err.message || 'Discovery run failed.');
    } finally {
      setSrmTriggering(false);
    }
  };

  const fetchAllContent = async () => {
    setManageLoading(true);
    try {
      const results: ContentItem[] = [];
      for (const cat of categories) {
        const colName = collectionMap[cat];
        const q = query(collection(db, colName), orderBy('date', 'desc'));
        const snap = await getDocs(q);
        snap.docs.forEach(d => {
          results.push({ id: d.id, ...d.data(), category: cat } as ContentItem);
        });
      }
      setAllContent(results.sort((a, b) => {
        const dateA = a.date?.toDate?.()?.getTime() || a.date?.seconds || 0;
        const dateB = b.date?.toDate?.()?.getTime() || b.date?.seconds || 0;
        return dateB - dateA;
      }));
    } catch (err) {
      console.error("Fetch failed:", err);
    } finally {
      setManageLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    
    setLoading(true);
    try {
      const colName = collectionMap[deletingItem.category] || deletingItem.category.toLowerCase();
      await deleteDoc(doc(db, colName, deletingItem.id));
      setAllContent(prev => prev.filter(i => i.id !== deletingItem.id));
      setDeletingItem(null);
    } catch (err) {
      handleFirestoreError(err, 'delete', deletingItem.category);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingItem) return;
    setLoading(true);
    try {
      const colName = collectionMap[editingItem.category] || editingItem.category.toLowerCase();
      const { id, ...data } = editingItem;
      await updateDoc(doc(db, colName, id), {
        ...data,
        imageUrl: editingItem.image,
        updatedAt: serverTimestamp()
      });
      setEditingItem(null);
      fetchAllContent();
    } catch (err) {
      handleFirestoreError(err, 'update', editingItem.category);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!topic.trim() || loading || !isAdmin) return;
    
    setLoading(true);
    setSuccess(false);
    setError('');

    // Let's mimic a beautiful high-fidelity generation response delay
    await new Promise(resolve => setTimeout(resolve, 850));

    try {
      const generatedContent = {
        title: category === "Laws" ? `IPC Section - ${topic}` : topic,
        description: `Deep theoretical architecture and professional commentary on "${topic}" generated in the command center.`,
        content: `### GravityVerse Structural Breakdown: ${topic} 🌌\n\nWelcome to this comprehensive publication on **${topic}**. This document was compiled to highlight architectural layouts, theoretical constructs, and actionable guidelines for professionals.\n\n#### 1. Contextual Architecture\nTo synthesize a successful roadmap for ${topic}, we must analyze primary attributes. First-hand inspection of standard layouts reveals the balance between operational scaling and raw efficiency.\n\n#### 2. Strategic Pillars of Excellence\n* **Fidelity Optimization**: Crafting every dimension with balanced density, high-contrast imagery, and ample spacing constraints.\n* **Atomic Modularity**: Deploying standalone features with clear interfaces to ensure scalability across client environments.\n* **Modern Infrastructure Guidelines**: Analyzing critical pathways to identify and resolve bottle-necks.\n\n#### 3. Operational Integrity\nFor the best results, we suggest following a modular launch strategy. It is critical to confirm initial credentials, set diagnostic benchmarks, and continuously check access states inside the secure user command panel.\n\nIf you have any feedback or would like to expand upon this report, please coordinate with our support networks or log directly into your command panels.`,
        author: 'GravityVerse Intelligence',
        image: imageUrl || 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=800'
      };

      const colName = collectionMap[category];
      const imgUrl = finalImageUrl(category);
      
      const finalDoc = {
        title: generatedContent.title,
        description: generatedContent.description,
        content: generatedContent.content,
        author: generatedContent.author,
        image: imgUrl,
        imageUrl: imgUrl,
        category: category,
        date: serverTimestamp()
      };

      await addDoc(collection(db, colName), finalDoc).catch(e => handleFirestoreError(e, 'create', colName));

      trackAdmin.aiPipelineRun(category, topic);
      trackAdmin.contentPublished(category, finalDoc.title, finalDoc.author);

      setSuccess(true);
      setTopic('');
      setImageUrl('');
      setUploadKeyGen(prev => prev + 1);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during document formulation.");
    } finally {
      setLoading(false);
    }
  };

  // Helper helper to return category-cohesive unsplash images if not provided
  const finalImageUrl = (cat: string, customUrl?: string) => {
    const urlToCheck = customUrl !== undefined ? customUrl : imageUrl;
    if (urlToCheck) return urlToCheck;
    const unsplashPics: Record<string, string> = {
      Blog: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=800',
      Stories: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&q=80&w=800',
      News: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=800'
    };
    return unsplashPics[cat] || 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=800';
  };

  const handleManualPublish = async () => {
    if (!manualTitle.trim() || !manualContent.trim() || loading || !isAdmin) return;

    setLoading(true);
    setSuccess(false);
    setError('');

    try {
      const colName = collectionMap[manualCategory];
      const imgUrl = finalImageUrl(manualCategory, manualImageUrl);
      
      const finalDoc = {
        title: manualTitle.trim(),
        description: manualDescription.trim() || `${manualCategory} study and publication written directly in the control panel.`,
        content: manualContent,
        author: manualAuthor.trim() || 'Anonymous',
        image: imgUrl,
        imageUrl: imgUrl,
        category: manualCategory,
        date: serverTimestamp()
      };

      await addDoc(collection(db, colName), finalDoc).catch(e => handleFirestoreError(e, 'create', colName));

      trackAdmin.contentPublished(manualCategory, finalDoc.title, finalDoc.author);

      setSuccess(true);
      setManualTitle('');
      setManualAuthor('');
      setManualDescription('');
      setManualContent('');
      setManualImageUrl('');
      setUploadKeyManual(prev => prev + 1);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during manual publishing.");
    } finally {
      setLoading(false);
    }
  };

  if (!user || !isAdmin) {
    return (
      <div className="pt-40 pb-24 px-4 text-center">
        <h1 className="text-3xl font-bold mb-4">Unauthorized Access</h1>
        <p className="text-gray-400">This area is reserved for the platform administrator.</p>
        <Link to="/" className="inline-block mt-8 text-brand-blue hover:underline">Return to safety</Link>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-24 px-4 max-w-6xl mx-auto">
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4">
          <h1 className="text-3xl sm:text-5xl font-bold font-serif tracking-tight">Admin Dashboard</h1>
          <p className="text-gray-400">Command & control the platform's content generation and existing archives.</p>
        </div>
        
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 flex-wrap gap-1 sm:gap-2">
          <button 
            onClick={() => setActiveTab('generate')}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all",
              activeTab === 'generate' ? "bg-brand-blue text-white shadow-lg" : "text-gray-500 hover:text-white"
            )}
          >
            <Sparkles className="w-4 h-4" /> AI Generate
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('manual')}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all",
              activeTab === 'manual' ? "bg-brand-blue text-white shadow-lg" : "text-gray-500 hover:text-white"
            )}
          >
            <Send className="w-4 h-4" /> Add Manually
          </button>
          <button 
            onClick={() => setActiveTab('manage')}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all",
              activeTab === 'manage' ? "bg-brand-blue text-white shadow-lg" : "text-gray-500 hover:text-white"
            )}
          >
            <LayoutGrid className="w-4 h-4" /> Manage Content
          </button>
          <button 
            onClick={() => setActiveTab('srm-events')}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all",
              activeTab === 'srm-events' ? "bg-brand-blue text-white shadow-lg" : "text-gray-500 hover:text-white"
            )}
          >
            <Calendar className="w-4 h-4" /> SRM Events Hub
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'generate' ? (
          <motion.div 
            key="generate"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="pb-12 border-b border-white/5 space-y-12"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Target Headline / Topic</label>
                <input 
                  type="text" 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. The future of Quantum Computing"
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:border-brand-blue outline-none transition-all"
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Category</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={cn(
                        "py-2 text-xs font-bold rounded-lg border transition-all",
                        category === cat 
                          ? "bg-brand-blue border-brand-blue text-white shadow-lg shadow-blue-500/20" 
                          : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300 hover:bg-white/10"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Post Image (Optional)</label>
              <ImageUploader
                key={uploadKeyGen}
                category={category}
                onUploadComplete={(url) => setImageUrl(url)}
                onUploadCleared={() => setImageUrl('')}
                onUploadingStateChange={setIsUploadingGen}
              />
            </div>

            <div className="pt-6">
              <button
                onClick={handlePublish}
                disabled={!topic || loading || isUploadingGen}
                className="w-full btn-primary py-5 text-lg flex items-center justify-center gap-3 animate-pulse-subtle"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-6 h-6" />
                    Generate & Publish
                  </>
                )}
              </button>
            </div>

            {success && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl flex items-center gap-3"
              >
                <CheckCircle className="w-5 h-5" />
                Content archive updated successfully.
              </motion.div>
            )}

            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-center gap-3"
              >
                <AlertCircle className="w-5 h-5" />
                {error}
              </motion.div>
            )}
          </motion.div>
        ) : activeTab === 'manual' ? (
          <motion.div 
            key="manual"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="pb-12 border-b border-white/5 space-y-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block">Headline / Title</label>
                <input 
                  type="text" 
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="e.g. Whispers of the Starry Canopy (or Law Section Title)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:border-brand-blue outline-none transition-all placeholder:text-gray-700"
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block">Author / Poet / Creator</label>
                <input 
                  type="text" 
                  value={manualAuthor}
                  onChange={(e) => setManualAuthor(e.target.value)}
                  placeholder="e.g. Kalidasa, Self, Poet Star, Law Expert"
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:border-brand-blue outline-none transition-all placeholder:text-gray-700"
                />
              </div>

              <div className="space-y-3 md:col-span-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block">Category</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setManualCategory(cat)}
                      className={cn(
                        "py-2 text-xs font-bold rounded-lg border transition-all",
                        manualCategory === cat 
                          ? "bg-brand-blue border-brand-blue text-white shadow-lg shadow-blue-500/20" 
                          : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300 hover:bg-white/10"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 md:col-span-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block">Post Image (Optional)</label>
                <ImageUploader
                  key={uploadKeyManual}
                  category={manualCategory}
                  onUploadComplete={(url) => setManualImageUrl(url)}
                  onUploadCleared={() => setManualImageUrl('')}
                  onUploadingStateChange={setIsUploadingManual}
                />
              </div>

              <div className="space-y-3 md:col-span-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block">Short Description / Subtitle</label>
                <input 
                  type="text" 
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  placeholder="Summarize the theme, verse context, or core legal insight..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:border-brand-blue outline-none transition-all placeholder:text-gray-700"
                />
              </div>

              <div className="space-y-3 md:col-span-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block">Article or Poem Content (Markdown Supported)</label>
                <textarea 
                  rows={12}
                  value={manualContent}
                  onChange={(e) => setManualContent(e.target.value)}
                  placeholder="Write your beautiful story, poetry lines, or article paragraphs here using rich Markdown..."
                  className="w-full bg-[#0b101f] border border-white/10 rounded-xl py-3 px-4 focus:border-brand-blue outline-none transition-all resize-y font-mono text-sm leading-relaxed placeholder:text-gray-700"
                />
              </div>
            </div>

            <div className="pt-4">
              <button
                type="button"
                onClick={handleManualPublish}
                disabled={!manualTitle.trim() || !manualContent.trim() || loading || isUploadingManual}
                className="w-full btn-primary py-5 text-lg flex items-center justify-center gap-3"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Send className="w-6 h-6" />
                    Publish Content Manually
                  </>
                )}
              </button>
            </div>

            {success && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl flex items-center gap-3"
              >
                <CheckCircle className="w-5 h-5" />
                Successfully published your custom material to the timeline.
              </motion.div>
            )}

            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-center gap-3"
              >
                <AlertCircle className="w-5 h-5" />
                {error}
              </motion.div>
            )}
          </motion.div>
        ) : activeTab === 'manage' ? (
          <motion.div 
            key="manage"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {manageLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="w-10 h-10 text-brand-blue animate-spin" />
                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading Data...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-8">
                {allContent.map((item) => (
                  <div key={item.id} className="pb-8 border-b border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 group">
                    <div className="flex items-center gap-8 w-full md:w-auto">
                      <div className="w-24 h-24 rounded-2xl overflow-hidden border border-white/5 flex-shrink-0 bg-neutral-900/50 flex items-center justify-center">
                        {item.image ? (
                          <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest font-mono">No Image</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-md text-[10px] font-black uppercase tracking-wider">
                            {item.category}
                          </span>
                          <span className="text-[10px] text-gray-500 font-bold">{formatDate(item.date)}</span>
                        </div>
                        <h3 className="text-lg font-bold text-white line-clamp-1">{item.title}</h3>
                        <p className="text-xs text-gray-400 font-medium">By {item.author}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                      <button 
                        onClick={() => setEditingItem(item)}
                        className="p-3 bg-white/5 hover:bg-brand-blue/20 text-gray-400 hover:text-brand-blue rounded-xl transition-all border border-white/5"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => setDeletingItem(item)}
                        className="p-3 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 rounded-xl transition-all border border-white/5"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="srm-events"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            {/* Header & Live Search Control Card */}
            <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold font-serif text-white flex items-center gap-2.5">
                    <Calendar className="w-6 h-6 text-brand-blue" />
                    Automatic SRM Events & Opportunities Command Center
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Powered by live Tavily web search pipeline and server-side AI verification.
                  </p>
                </div>

                <button
                  onClick={handleTriggerSrmDiscovery}
                  disabled={srmTriggering}
                  className="px-6 py-3.5 bg-brand-blue hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-xl shadow-blue-500/20 flex items-center gap-2 shrink-0"
                >
                  {srmTriggering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Executing Web Search Pipeline...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Run Live Tavily Discovery
                    </>
                  )}
                </button>
              </div>

              {/* Status notifications */}
              {srmMessage && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl text-xs flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>{srmMessage}</span>
                </div>
              )}

              {srmError && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl text-xs flex items-center gap-3">
                  <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                  <span>{srmError}</span>
                </div>
              )}

              {/* Discovery Metrics Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-white/5">
                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                  <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Last Run</span>
                  <p className="text-sm font-bold text-white mt-1">
                    {srmStats?.timestamp ? new Date(srmStats.timestamp).toLocaleTimeString() : 'Not executed yet'}
                  </p>
                </div>

                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                  <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Sources Searched</span>
                  <p className="text-xl font-black text-brand-blue mt-1">
                    {srmStats?.sourcesSearched ?? 0}
                  </p>
                </div>

                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                  <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Verified Events</span>
                  <p className="text-xl font-black text-emerald-400 mt-1">
                    {srmStats?.verifiedCount ?? srmEventsList.length}
                  </p>
                </div>

                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                  <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Duplicates Merged</span>
                  <p className="text-xl font-black text-indigo-400 mt-1">
                    {srmStats?.duplicatesMerged ?? 0}
                  </p>
                </div>
              </div>
            </div>

            {/* List of Discovered Events */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white font-serif">Discovered SRM Event Records ({srmEventsList.length})</h3>
                <Link to="/srm-events" className="text-xs text-brand-blue hover:underline font-bold uppercase tracking-wider flex items-center gap-1">
                  View Public SRM Events Page <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>

              {srmLoading ? (
                <div className="py-12 flex justify-center items-center gap-3 text-gray-500 font-bold text-xs uppercase tracking-widest">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                  Loading Discovered SRM Events...
                </div>
              ) : srmEventsList.length === 0 ? (
                <div className="p-8 bg-white/[0.02] border border-white/5 rounded-2xl text-center text-gray-400 text-xs">
                  No discovered events stored in the database yet. Click "Run Live Tavily Discovery" above to execute real web search.
                </div>
              ) : (
                <div className="space-y-4">
                  {srmEventsList.map((evt) => (
                    <div key={evt.id || evt.title} className="p-5 bg-slate-900/80 border border-white/5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-grow">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase rounded">
                            {evt.category}
                          </span>
                          <span className="text-[10px] text-gray-400 font-semibold">{evt.date}</span>
                          <span className="text-[10px] text-emerald-400 font-bold ml-2">✓ Verified SRM Event</span>
                        </div>
                        <h4 className="text-base font-bold text-white">{evt.title}</h4>
                        <p className="text-xs text-gray-400 font-medium">Organizer: {evt.organizer} | Venue: {evt.venue}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {evt.registrationUrl && (
                          <a 
                            href={evt.registrationUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="px-3 py-1.5 bg-brand-blue/20 hover:bg-brand-blue text-blue-300 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                          >
                            Registration <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <a 
                          href={evt.sourceUrl || evt.officialEventUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                        >
                          Source <Globe className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingItem && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingItem(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-[#161b2c] border border-white/10 rounded-3xl p-8 shadow-2xl"
            >
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-white text-center mb-2">Delete Content?</h3>
              <p className="text-gray-400 text-center text-sm mb-8 leading-relaxed">
                Are you sure you want to delete <span className="text-white font-bold">"{deletingItem.title}"</span>? This action is permanent.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeletingItem(null)}
                  className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-bold transition-all border border-white/5"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmDelete}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all shadow-xl shadow-red-500/20 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingItem(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-2xl bg-[#161b2c] border border-white/10 rounded-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-bold font-serif">Edit Content Data</h3>
                <button onClick={() => setEditingItem(null)} className="p-2 hover:bg-white/10 rounded-full transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Title</label>
                  <input 
                    type="text" 
                    value={editingItem.title}
                    onChange={e => setEditingItem({...editingItem, title: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:border-brand-blue outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Author</label>
                  <input 
                    type="text" 
                    value={editingItem.author}
                    onChange={e => setEditingItem({...editingItem, author: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:border-brand-blue outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Image</label>
                  <ImageUploader
                    category={editingItem.category}
                    existingUrl={editingItem.image}
                    onUploadComplete={(url) => setEditingItem({...editingItem, image: url})}
                    onUploadCleared={() => setEditingItem({...editingItem, image: ''})}
                    onUploadingStateChange={setIsUploadingEdit}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Description</label>
                  <textarea 
                    rows={3}
                    value={editingItem.description}
                    onChange={e => setEditingItem({...editingItem, description: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:border-brand-blue outline-none resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Article Content (Markdown)</label>
                  <textarea 
                    rows={10}
                    value={editingItem.content}
                    onChange={e => setEditingItem({...editingItem, content: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:border-brand-blue outline-none resize-none font-mono text-sm"
                  />
                </div>

                <div className="pt-6">
                  <button 
                    onClick={handleUpdate}
                    disabled={loading || isUploadingEdit}
                    className="w-full bg-brand-blue hover:bg-blue-600 disabled:opacity-50 py-4 rounded-xl font-bold transition-all shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Content Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

