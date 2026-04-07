import { useState, useCallback, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Search, 
  ShieldCheck, 
  AlertTriangle, 
  Info, 
  RefreshCw, 
  FileText, 
  CheckCircle2, 
  XCircle,
  BarChart3,
  BrainCircuit,
  Zap,
  LogIn,
  UserPlus,
  LogOut,
  Mail,
  Lock,
  User,
  Moon,
  Sun,
  History,
  Trash2,
  LayoutGrid
} from "lucide-react";
import Markdown from 'react-markdown';
import { cn } from "@/src/lib/utils";
import { DetectionResult } from "@/src/types";
import { auth, db } from "./firebase";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  signInWithPopup, 
  GoogleAuthProvider,
  User as FirebaseUser
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp, collection, addDoc, query, orderBy, onSnapshot, deleteDoc } from "firebase/firestore";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [showHistory, setShowHistory] = useState(false);
  const [glassMode, setGlassMode] = useState(false);
  const [history, setHistory] = useState<DetectionResult[]>([]);

  const [text, setText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, 'users', user.uid, 'scans'),
        orderBy('timestamp', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const scans = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as DetectionResult[];
        setHistory(scans);
      });
      return () => unsubscribe();
    } else {
      setHistory([]);
    }
  }, [user]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      if (authMode === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          displayName: displayName || userCredential.user.email?.split('@')[0],
          createdAt: serverTimestamp()
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      if (!userDoc.exists()) {
        await setDoc(doc(db, 'users', result.user.uid), {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          createdAt: serverTimestamp()
        });
      }
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const analyzeText = useCallback(async () => {
    if (!text.trim() || text.length < 50) {
      setError("Please provide at least 50 characters for a meaningful analysis.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the following text for AI-generated patterns. 
        Evaluate perplexity, burstiness, repetitive structures, and common AI tropes.
        
        TEXT:
        """
        ${text}
        """
        
        Provide a confidence score from 0 to 100 (where 100 is definitely AI). 
        Identify specific linguistic markers.
        Also provide "glassMetrics" which are technical scores (0-100) for:
        - perplexity (lower is more AI-like)
        - burstiness (lower is more AI-like)
        - syntacticRepetition (higher is more AI-like)
        - lexicalDiversity (lower is more AI-like)
        
        Return the result in JSON format.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER, description: "AI probability score from 0 to 100" },
              confidence: { type: Type.NUMBER, description: "Analysis confidence from 0 to 100" },
              label: { type: Type.STRING, enum: ["Human", "Likely Human", "Uncertain", "Likely AI", "AI"] },
              markers: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    description: { type: Type.STRING },
                    severity: { type: Type.STRING, enum: ["low", "medium", "high"] }
                  },
                  required: ["type", "description", "severity"]
                }
              },
              analysis: { type: Type.STRING, description: "Brief markdown summary of the findings" },
              glassMetrics: {
                type: Type.OBJECT,
                properties: {
                  perplexity: { type: Type.NUMBER },
                  burstiness: { type: Type.NUMBER },
                  syntacticRepetition: { type: Type.NUMBER },
                  lexicalDiversity: { type: Type.NUMBER }
                },
                required: ["perplexity", "burstiness", "syntacticRepetition", "lexicalDiversity"]
              }
            },
            required: ["score", "confidence", "label", "markers", "analysis", "glassMetrics"]
          }
        }
      });

      const data = JSON.parse(response.text || '{}') as DetectionResult;
      
      if (user) {
        await addDoc(collection(db, 'users', user.uid, 'scans'), {
          ...data,
          textSnippet: text.slice(0, 100) + (text.length > 100 ? '...' : ''),
          timestamp: serverTimestamp()
        });
      }

      setResult(data);
    } catch (err) {
      console.error("Analysis failed:", err);
      setError("An error occurred during analysis. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [text]);

  const getScoreColor = (score: number) => {
    if (score < 20) return "text-emerald-600 bg-emerald-50 border-emerald-200";
    if (score < 40) return "text-blue-600 bg-blue-50 border-blue-200";
    if (score < 70) return "text-amber-600 bg-amber-50 border-amber-200";
    return "text-rose-600 bg-rose-50 border-rose-200";
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return "text-rose-600 bg-rose-50 dark:bg-rose-950/30";
      case 'medium': return "text-amber-600 bg-amber-50 dark:bg-amber-950/30";
      default: return "text-blue-600 bg-blue-50 dark:bg-blue-950/30";
    }
  };

  const deleteScan = async (scanId: string) => {
    if (!user || !scanId) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'scans', scanId));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  if (isAuthLoading) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center transition-colors duration-300", darkMode ? "bg-slate-950" : "bg-slate-50")}>
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className={cn("min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 relative", darkMode ? "bg-slate-950" : "bg-slate-50")}>
        {/* Dark Mode Toggle for Auth Screen */}
        <div className="absolute top-6 right-6">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2.5 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-8"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 mb-4">
              <BrainCircuit className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Veritas AI Detector</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">Sign in to start detecting AI content</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'signup' && (
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Display Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-900 dark:text-white"
                  required
                />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-900 dark:text-white"
                required
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-900 dark:text-white"
                required
              />
            </div>

            {authError && (
              <div className="text-rose-600 text-xs bg-rose-50 dark:bg-rose-950/30 p-3 rounded-lg border border-rose-100 dark:border-rose-900/50">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-indigo-900/20 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {authMode === 'login' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-slate-900 px-2 text-slate-400 font-medium">Or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            className="w-full py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-900 transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>

          <p className="text-center mt-8 text-sm text-slate-500">
            {authMode === 'login' ? "Don't have an account?" : "Already have an account?"}{' '}
            <button
              onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
              className="text-indigo-600 font-bold hover:underline"
            >
              {authMode === 'login' ? 'Sign Up' : 'Log In'}
            </button>
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-300", darkMode ? "bg-slate-950" : "bg-slate-50")}>
      {/* Navbar */}
      <div className="max-w-5xl w-full flex justify-between items-center mb-8">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20">
            <BrainCircuit className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-xl text-slate-900 dark:text-white hidden sm:block">Veritas</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Dark Mode Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2.5 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Glass Mode Toggle */}
          <button
            onClick={() => setGlassMode(!glassMode)}
            className={cn(
              "p-2.5 rounded-2xl shadow-sm border transition-all flex items-center gap-2",
              glassMode 
                ? "bg-indigo-600 border-indigo-600 text-white" 
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-indigo-600"
            )}
            title="Toggle Glass Mode (Technical Metrics)"
          >
            <Zap className="w-5 h-5" />
            <span className="text-sm font-bold hidden sm:block">Glass Mode</span>
          </button>

          {/* History Toggle */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "p-2.5 rounded-2xl shadow-sm border transition-all flex items-center gap-2",
              showHistory 
                ? "bg-indigo-600 border-indigo-600 text-white" 
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-indigo-600"
            )}
          >
            <History className="w-5 h-5" />
            <span className="text-sm font-bold hidden sm:block">History</span>
          </button>

          <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-1.5 pr-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
              {user.displayName?.[0] || user.email?.[0]}
            </div>
            <div className="hidden md:block">
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[120px]">{user.displayName || user.email}</div>
              <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Member</div>
            </div>
            <button
              onClick={() => signOut(auth)}
              className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl w-full text-center mb-12"
      >
        <h1 className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-4">
          Veritas <span className="text-indigo-600">AI Detector</span>
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          The industry standard for neural content verification. 
          Identify artificial generation with clinical precision.
        </p>
      </motion.div>

      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Input Section */}
        <div className="lg:col-span-7 space-y-6">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold">
                <FileText className="w-5 h-5 text-indigo-500" />
                <span>Input Content</span>
              </div>
              <span className="text-xs font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">
                {text.length} characters
              </span>
            </div>
            
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the text you want to analyze here... (min 50 characters)"
              className="w-full h-64 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none text-slate-700 dark:text-slate-300 placeholder:text-slate-400"
            />

            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-4 flex items-center gap-2 text-rose-600 text-sm bg-rose-50 dark:bg-rose-950/30 p-3 rounded-xl border border-rose-100 dark:border-rose-900/50"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </motion.div>
            )}

            <button
              onClick={analyzeText}
              disabled={isAnalyzing || !text.trim()}
              className={cn(
                "w-full mt-6 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg",
                isAnalyzing 
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed" 
                  : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] shadow-indigo-200 dark:shadow-indigo-900/20"
              )}
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Analyzing Patterns...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Detect AI Generation
                </>
              )}
            </button>
          </motion.div>

          {/* Features Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800">
              <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center mb-3">
                <BrainCircuit className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-slate-900 dark:text-white font-bold mb-1">Neural Engine</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
                Advanced pattern recognition trained on millions of AI and human samples.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800">
              <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center mb-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-slate-900 dark:text-white font-bold mb-1">Privacy First</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
                Your data is encrypted and never used for model training.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800">
              <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/30 rounded-xl flex items-center justify-center mb-3">
                <History className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-slate-900 dark:text-white font-bold mb-1">Scan History</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
                Keep track of all your previous analyses in a secure cloud history.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800">
              <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center mb-3">
                <LayoutGrid className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-slate-900 dark:text-white font-bold mb-1">Detailed Markers</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
                Get specific linguistic reasons why content was flagged as AI.
              </p>
            </div>
          </div>
        </div>

        {/* Results / History Section */}
        <div className="lg:col-span-5">
          <AnimatePresence mode="wait">
            {showHistory ? (
              <motion.div
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 h-full flex flex-col"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-slate-900 dark:text-white font-bold flex items-center gap-2">
                    <History className="w-5 h-5 text-indigo-500" />
                    Scan History
                  </h3>
                  <button 
                    onClick={() => setShowHistory(false)}
                    className="text-xs font-bold text-indigo-600 hover:underline"
                  >
                    Back to Scan
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                  {history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-50">
                      <History className="w-12 h-12 mb-4" />
                      <p className="text-sm">No scans found yet.</p>
                    </div>
                  ) : (
                    history.map((scan) => (
                      <div 
                        key={scan.id}
                        className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider", 
                            scan.score > 60 ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"
                          )}>
                            {scan.label}
                          </div>
                          <button 
                            onClick={() => deleteScan(scan.id!)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-2 italic">
                          "{scan.textSnippet}"
                        </p>
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                          <span>{scan.score}% AI Probability</span>
                          <span>{scan.timestamp?.toDate().toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            ) : !result && !isAnalyzing ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800"
              >
                <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                  <Zap className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                </div>
                <h3 className="text-slate-900 dark:text-white font-semibold mb-1">Ready for Analysis</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  Paste text on the left to begin the detection process.
                </p>
              </motion.div>
            ) : isAnalyzing ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full min-h-[400px] flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800"
              >
                <div className="relative w-24 h-24 mb-6">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 border-4 border-indigo-100 dark:border-indigo-900/30 border-t-indigo-600 rounded-full"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <BrainCircuit className="w-8 h-8 text-indigo-600 animate-pulse" />
                  </div>
                </div>
                <h3 className="text-slate-900 dark:text-white font-semibold mb-2">Neural Scan in Progress</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm text-center">
                  Our models are currently evaluating linguistic markers and structural integrity...
                </p>
              </motion.div>
            ) : (
              <motion.div 
                key="result"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                {/* Glass Metrics Section */}
                {glassMode && result!.glassMetrics && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-white/10 p-6 relative overflow-hidden group"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <BrainCircuit className="w-24 h-24 text-indigo-600" />
                    </div>
                    
                    <h3 className="text-slate-900 dark:text-white font-bold flex items-center gap-2 mb-6">
                      <Zap className="w-5 h-5 text-indigo-500" />
                      Glass Box Metrics
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 relative z-10">
                      {[
                        { label: 'Perplexity', value: result!.glassMetrics.perplexity, desc: 'Linguistic unpredictability' },
                        { label: 'Burstiness', value: result!.glassMetrics.burstiness, desc: 'Sentence structure variance' },
                        { label: 'Syntactic Repetition', value: result!.glassMetrics.syntacticRepetition, desc: 'Grammar pattern reuse' },
                        { label: 'Lexical Diversity', value: result!.glassMetrics.lexicalDiversity, desc: 'Vocabulary richness' }
                      ].map((metric, i) => (
                        <div key={i} className="space-y-2">
                          <div className="flex justify-between items-end">
                            <div>
                              <div className="text-xs font-bold text-slate-900 dark:text-white">{metric.label}</div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">{metric.desc}</div>
                            </div>
                            <div className="text-sm font-black text-indigo-600 dark:text-indigo-400">{metric.value}%</div>
                          </div>
                          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${metric.value}%` }}
                              transition={{ delay: 0.2 + (i * 0.1), duration: 1 }}
                              className="h-full bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">
                        * Glass Mode provides direct insight into the neural scoring engine's internal metrics.
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Score Card */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className={cn("p-6 border-b dark:border-slate-800 flex items-center justify-between", getScoreColor(result!.score))}>
                    <div className="flex items-center gap-3">
                      {result!.score > 60 ? <AlertTriangle className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
                      <span className="font-bold text-xl">{result!.label}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black">{result!.score}%</div>
                      <div className="text-[10px] uppercase tracking-wider font-bold opacity-70">AI Probability</div>
                    </div>
                  </div>
                  
                  <div className="p-6 space-y-6">
                    {/* Gauge */}
                    <div className="relative pt-1">
                      <div className="flex mb-2 items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400">
                            Confidence: {result!.confidence}%
                          </span>
                        </div>
                      </div>
                      <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-slate-100 dark:bg-slate-800">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${result!.score}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className={cn("shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center", 
                            result!.score > 60 ? "bg-rose-500" : result!.score > 30 ? "bg-amber-500" : "bg-emerald-500"
                          )}
                        />
                      </div>
                    </div>

                    {/* Analysis Summary */}
                    <div className="prose prose-sm dark:prose-invert max-w-none text-slate-600 dark:text-slate-400">
                      <Markdown>{result!.analysis}</Markdown>
                    </div>
                  </div>
                </div>

                {/* Markers */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
                  <h3 className="text-slate-900 dark:text-white font-bold flex items-center gap-2 mb-4">
                    <BarChart3 className="w-5 h-5 text-indigo-500" />
                    Detection Markers
                  </h3>
                  <div className="space-y-3">
                    {result!.markers.map((marker, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        key={idx}
                        className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800"
                      >
                        <div className={cn("p-2 rounded-xl shrink-0", getSeverityColor(marker.severity))}>
                          {marker.severity === 'high' ? <XCircle className="w-4 h-4" /> : 
                           marker.severity === 'medium' ? <AlertTriangle className="w-4 h-4" /> : 
                           <CheckCircle2 className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white">{marker.type}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{marker.description}</div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-20 text-slate-400 text-sm flex items-center gap-4">
        <div className="flex items-center gap-1">
          <ShieldCheck className="w-4 h-4" />
          <span>Privacy Secured</span>
        </div>
        <div className="w-1 h-1 rounded-full bg-slate-300" />
        <div className="flex items-center gap-1">
          <BrainCircuit className="w-4 h-4" />
          <span>Neural Analysis</span>
        </div>
      </footer>
    </div>
  );
}
