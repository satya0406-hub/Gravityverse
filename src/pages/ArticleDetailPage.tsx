import { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion } from 'motion/react';
import { Calendar, User, ArrowLeft, Loader2, Clock } from 'lucide-react';
import { formatDate } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import { handleFirestoreError } from '../lib/errorHandler';
import { trackLearning } from '../lib/analytics';

interface Post {
  id: string;
  title: string;
  description: string;
  content: string;
  image: string;
  author: string;
  date: any;
  category: string;
}

export function ArticleDetailPage() {
  const { category: paramCategory, id: paramId } = useParams();
  const location = useLocation();
  const { user, updateProfile } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPost() {
      const pathSegments = location.pathname.split('/').filter(Boolean);
      const articleId = paramId || (pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : undefined);
      if (!articleId) {
        setLoading(false);
        return;
      }
      
      const initialCategory = paramCategory || (pathSegments.length >= 2 ? pathSegments[0] : 'blog');

      try {
        const collectionMap: Record<string, string> = {
          blog: 'blogs',
          stories: 'stories',
          news: 'news',
          laws: 'laws'
        };
        const primaryCol = collectionMap[initialCategory.toLowerCase()] || initialCategory.toLowerCase();
        const candidateCollections = Array.from(new Set([primaryCol, 'blogs', 'stories', 'news', 'laws']));

        let foundPost: Post | null = null;
        for (const colName of candidateCollections) {
          try {
            const docRef = doc(db, colName, articleId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              const data = docSnap.data();
              foundPost = { id: docSnap.id, ...data } as Post;
              break;
            }
          } catch {
            // Check next candidate collection
          }
        }
        
        if (foundPost) {
          setPost(foundPost);
          try {
            trackLearning.articleRead(foundPost.id, foundPost.title || '', foundPost.category || 'Blog', 0);
          } catch (e) {
            console.warn('Analytics trackLearning.articleRead failed:', e);
          }
        }
      } catch (err) {
        console.warn("ArticleDetailPage fetch notice:", err);
        try {
          handleFirestoreError(err, 'get', `${initialCategory}/${articleId}`);
        } catch (e) {
          // Handled for logging
        }
      } finally {
        setLoading(false);
      }
    }
    fetchPost();
  }, [paramId, paramCategory, location.pathname]);

  useEffect(() => {
    if (!post) return;
    const startTime = Date.now();
    let completed = false;

    const handleScroll = () => {
      if (completed) return;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const scrollPercent = (window.scrollY / docHeight) * 100;
      if (scrollPercent >= 90) {
        const timeSpent = Math.round((Date.now() - startTime) / 1000);
        if (timeSpent >= 5) {
          completed = true;
          try {
            trackLearning.articleCompleted(
              post.id,
              post.title || '',
              post.category || 'Laws',
              timeSpent
            );
          } catch (e) {
            console.warn('Analytics articleCompleted failed:', e);
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      const timeSpent = Math.round((Date.now() - startTime) / 1000);
      try {
        trackLearning.articleRead(
          post.id,
          post.title || '',
          post.category || 'Laws',
          timeSpent
        );
      } catch (e) {
        console.warn('Analytics final articleRead failed:', e);
      }
    };
  }, [post]);

  if (loading) {
    return (
      <div className="pt-40 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-brand-blue animate-spin" />
        <span className="text-gray-400">Loading article...</span>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="pt-40 text-center">
        <h1 className="text-2xl font-bold mb-4">Article Not Found</h1>
        <Link to="/" className="text-brand-blue hover:underline">Return Home</Link>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-24 px-4 max-w-4xl mx-auto">
      <Link to={(() => {
        const cat = (post.category || 'Blog').toLowerCase();
        if (cat === 'stories') return '/stories';
        if (cat === 'news') return '/news';
        if (cat === 'laws') return '/laws';
        return '/blog';
      })()} className="inline-flex items-center gap-2 text-gray-500 hover:text-brand-blue mb-8 transition-colors group">
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        Back to {post.category || 'Blog'}
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {post.image && (
          <div className="aspect-[21/9] rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
            <img 
              src={post.image} 
              alt={post.title} 
              className="w-full h-full object-cover" 
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=800';
              }}
            />
          </div>
        )}

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500">
            <span className="flex items-center gap-2 bg-brand-blue/10 text-brand-blue px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              {post.category || 'Laws'}
            </span>
            <span className="flex items-center gap-2"><Calendar className="w-4 h-4" /> {formatDate(post.date?.toDate?.() || post.date)}</span>
            <span className="flex items-center gap-2"><User className="w-4 h-4" /> {post.author}</span>
            <span className="flex items-center gap-2"><Clock className="w-4 h-4" /> 5 min read</span>
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold font-serif leading-tight text-white">{post.title}</h1>
          <p className="text-xl text-gray-400 italic leading-relaxed border-l-4 border-brand-blue pl-6 py-2">
            {post.description}
          </p>
        </div>

        <div className="prose prose-invert max-w-none prose-blue prose-p:text-gray-300 prose-p:leading-relaxed prose-headings:font-serif prose-headings:text-white prose-a:text-brand-blue">
          <ReactMarkdown>{post.content}</ReactMarkdown>
        </div>
      </motion.div>
    </div>
  );
}
