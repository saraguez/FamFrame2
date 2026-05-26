import React, { useState, createContext, useContext, useEffect, useRef } from 'react';
import { 
  Sparkles, UploadCloud, Image as ImageIcon, Trash2, Camera, 
  Shield, ShieldOff, Play, Pause, X, ChevronLeft, ChevronRight, 
  Link as LinkIcon, Loader2, Maximize, Minimize, Edit3, Check 
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, updateDoc, doc } from 'firebase/firestore';

// --- 1. FIREBASE INITIALIZATION ---
// Safely use Canvas preview config OR your personal Vercel config
const personalFirebaseConfig = {
  apiKey: "AIzaSyBEGOUuBCZv_cRDZzZWCTJpEzTj_TOrY9M",
  authDomain: "famframe-dceb8.firebaseapp.com",
  projectId: "famframe-dceb8",
  storageBucket: "famframe-dceb8.firebasestorage.app",
  messagingSenderId: "216485333201",
  appId: "1:216485333201:web:5ff726702d9523f7589df0"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : personalFirebaseConfig;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : "my-family-frame";

// --- 2. CONTEXT & STATE MANAGEMENT ---
const PhotoContext = createContext(null);

export function usePhotos() {
  const context = useContext(PhotoContext);
  if (!context) {
    throw new Error("usePhotos must be used within a PhotoProvider");
  }
  return context;
}

function PhotoProvider({ children }) {
  const [user, setUser] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Auth Effect: Sign the user in silently to access the database
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenError) {
            console.warn("Custom token mismatch. Falling back to anonymous login.");
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Database Effect: Listen to real-time changes in the cloud
  useEffect(() => {
    if (!user) return; // Guard clause
    
    const photosRef = collection(db, 'artifacts', appId, 'public', 'data', 'photos');
    
    const unsubscribe = onSnapshot(
      photosRef, 
      (snapshot) => {
        const fetchedPhotos = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        }));
        
        // Sort in memory: newest first
        fetchedPhotos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        
        setPhotos(fetchedPhotos);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching photos real-time:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Actions
  const addPhoto = async (url, caption = '') => {
    if (!user) return;
    try {
      const photosRef = collection(db, 'artifacts', appId, 'public', 'data', 'photos');
      await addDoc(photosRef, {
        url,
        caption, 
        createdAt: Date.now(),
        addedBy: user.uid
      });
    } catch (error) {
      console.error("Failed to add photo:", error);
    }
  };

  const removePhoto = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'photos', id));
    } catch (error) {
      console.error("Failed to remove photo:", error);
    }
  };

  const updatePhotoCaption = async (id, newCaption) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'photos', id), {
        caption: newCaption
      });
    } catch (error) {
      console.error("Failed to update caption:", error);
    }
  };

  const toggleAdmin = () => setIsAdmin(prev => !prev);

  return (
    <PhotoContext.Provider value={{ photos, isAdmin, addPhoto, removePhoto, updatePhotoCaption, toggleAdmin, loading }}>
      {children}
    </PhotoContext.Provider>
  );
}

// --- 3. COMPONENTS ---

function Header() {
  const { isAdmin, toggleAdmin } = usePhotos();
  
  return (
    <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-xl tracking-tight">
          <Camera className="text-orange-500 size-6" />
          FamFrame Cloud
        </div>
        
        <button
          onClick={toggleAdmin}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            isAdmin 
              ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' 
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {isAdmin ? <Shield className="size-4" /> : <ShieldOff className="size-4" />}
          {isAdmin ? 'Admin View' : 'Guest View'}
        </button>
      </div>
    </header>
  );
}

function UploadZone() {
  const { addPhoto } = usePhotos();
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState(''); 
  const [defaultCaption, setDefaultCaption] = useState(''); // Stores the auto-generated location/date
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  // Auto-generate Caption on load
  useEffect(() => {
    const fetchLocation = async () => {
      const date = new Date();
      const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      
      try {
        // Free IP-based location API (no annoying popups needed)
        const response = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client');
        const data = await response.json();
        
        const city = data.city || data.locality;
        const country = data.countryName;
        
        let generated = monthYear;
        if (city && country) {
          generated = `${monthYear} • ${city}, ${country}`;
        }
        
        setDefaultCaption(generated);
        setCaption(generated); // Pre-fill the input box
      } catch (error) {
        // If location fails, just use the date
        setDefaultCaption(monthYear);
        setCaption(monthYear);
      }
    };
    
    fetchLocation();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (url.trim()) {
      setIsSubmitting(true);
      await addPhoto(url.trim(), caption.trim());
      setUrl('');
      setCaption(defaultCaption); // Reset back to auto-caption
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 20); 
    if (files.length === 0) return;

    setIsSubmitting(true);
    
    const processFile = (file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
          const img = new Image();
          img.onload = async () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1000;
            const MAX_HEIGHT = 1000;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            await addPhoto(dataUrl, caption.trim());
            resolve();
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
    };

    await Promise.all(files.map(file => processFile(file)));

    setIsSubmitting(false);
    setCaption(defaultCaption); // Reset back to auto-caption
    if (fileInputRef.current) fileInputRef.current.value = ''; 
  };

  const addRandomDemo = async () => {
    setIsSubmitting(true);
    const demos = [
      'https://images.unsplash.com/photo-1511895426328-dc8714191300?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1609220136736-443140cffec6?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1542037104857-ffbb0b9155fb?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1476703993599-0035a21b17a9?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1581952971145-21950d60d3d2?q=80&w=1200&auto=format&fit=crop'
    ];
    const randomUrl = demos[Math.floor(Math.random() * demos.length)];
    await addPhoto(randomUrl, caption.trim() || "A magical family moment! ✨");
    setIsSubmitting(false);
  };

  return (
    <div className="relative border-2 border-dashed rounded-3xl p-8 sm:p-12 flex flex-col items-center justify-center text-center transition-all duration-200 border-slate-300 bg-slate-50 hover:bg-slate-100">
      <div className="bg-white p-4 rounded-full shadow-sm mb-4">
        {isSubmitting ? (
          <Loader2 className="size-8 text-orange-500 animate-spin" />
        ) : (
          <UploadCloud className="size-8 text-orange-500" />
        )}
      </div>
      <h3 className="text-xl font-semibold text-slate-900 mb-2">
        Share a new photo
      </h3>
      <p className="text-slate-500 max-w-sm mb-6 text-sm">
        Upload directly from your device (up to 20 at once), paste a link, or use our magical sample generator.
      </p>

      {/* Auto-filled Caption Field */}
      <div className="w-full max-w-md mb-6 relative">
        <input 
          type="text" 
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Write a caption (optional)..." 
          className="block w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm outline-none bg-white shadow-sm transition-all"
          disabled={isSubmitting}
          maxLength={100}
        />
        {caption === defaultCaption && caption !== '' && (
          <span className="absolute -top-2.5 right-4 bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-orange-200">
            Auto-Detected
          </span>
        )}
      </div>
      
      {/* 1. Device Upload Button */}
      <input 
        type="file" 
        accept="image/*" 
        multiple
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        className="hidden" 
      />
      <button 
        onClick={() => fileInputRef.current?.click()}
        disabled={isSubmitting}
        className="w-full max-w-md bg-orange-500 hover:bg-orange-600 text-white px-6 py-3.5 rounded-xl text-base font-semibold transition-all shadow-sm shadow-orange-500/20 active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2 mb-6"
      >
        <Camera className="size-5" />
        {isSubmitting ? "Uploading..." : "Upload from Device"}
      </button>

      <div className="flex items-center gap-4 w-full max-w-md mb-6">
        <div className="h-px bg-slate-200 flex-1"></div>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">OR PASTE URL</span>
        <div className="h-px bg-slate-200 flex-1"></div>
      </div>
      
      {/* 2. URL Form */}
      <form onSubmit={handleAdd} className="w-full max-w-md flex flex-col sm:flex-row gap-2 mb-6">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <LinkIcon className="h-4 w-4 text-slate-400" />
          </div>
          <input 
            type="url" 
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste image URL (https://...)" 
            className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm outline-none bg-white"
            disabled={isSubmitting}
          />
        </div>
        <button 
          type="submit"
          disabled={isSubmitting}
          className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-70 flex-shrink-0"
        >
          Add Link
        </button>
      </form>

      {/* 3. Demo Button */}
      <button 
        onClick={addRandomDemo}
        disabled={isSubmitting}
        className="text-sm font-semibold text-orange-600 hover:text-orange-700 bg-orange-100/50 hover:bg-orange-100 px-5 py-2 rounded-full transition-colors flex items-center gap-2"
      >
        <Sparkles className="size-4" /> Add a random family moment
      </button>
    </div>
  );
}

function PhotoGrid() {
  const { photos, isAdmin, removePhoto, updatePhotoCaption, loading } = usePhotos();
  
  // State for inline editing
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-slate-400 border border-slate-200 border-dashed rounded-2xl bg-slate-50/50">
        <Loader2 className="size-10 mb-4 animate-spin text-orange-500" />
        <p className="font-medium text-slate-500">Syncing with the family cloud...</p>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-slate-400 border border-slate-200 border-dashed rounded-2xl bg-slate-50/50">
        <ImageIcon className="size-14 mb-4 opacity-40 text-slate-400" />
        <p className="font-medium text-slate-500">No photos yet. Be the first to add one!</p>
      </div>
    );
  }

  const handleStartEdit = (photo) => {
    setEditingId(photo.id);
    setEditValue(photo.caption || "");
  };

  const handleSaveEdit = async (id) => {
    await updatePhotoCaption(id, editValue);
    setEditingId(null);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 animate-in fade-in duration-500">
      {photos.map((photo) => (
        <div key={photo.id} className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-100 shadow-sm hover:shadow-md transition-all">
          <img 
            src={photo.url} 
            alt={photo.caption || "Family moment"} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1594322436404-5a0526db4d13?q=80&w=800&auto=format&fit=crop'; }} 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
          
          {/* Display caption on hover in the grid */}
          {photo.caption && editingId !== photo.id && (
            <div className="absolute bottom-0 inset-x-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 pointer-events-none">
              <p className="text-white text-sm font-medium line-clamp-2 drop-shadow-md">
                {photo.caption}
              </p>
            </div>
          )}
          
          {/* Admin Tools: Edit & Delete Buttons */}
          {isAdmin && editingId !== photo.id && (
            <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 shadow-sm z-20">
              <button 
                onClick={() => handleStartEdit(photo)}
                className="p-2.5 bg-blue-500/95 hover:bg-blue-600 text-white rounded-full shadow-sm"
                title="Edit caption"
              >
                <Edit3 className="size-4" />
              </button>
              <button 
                onClick={() => removePhoto(photo.id)}
                className="p-2.5 bg-red-500/95 hover:bg-red-600 text-white rounded-full shadow-sm"
                title="Delete photo"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )}

          {/* Inline Edit Mode Overlay */}
          {isAdmin && editingId === photo.id && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm p-4 flex flex-col justify-center items-center gap-3 z-30">
              <p className="text-white text-xs font-semibold uppercase tracking-wider">Edit Caption</p>
              <textarea 
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full text-sm p-3 rounded-xl bg-white/10 text-white border border-white/20 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none resize-none"
                rows={3}
                placeholder="Who's in the photo?"
                autoFocus
              />
              <div className="flex gap-2 w-full">
                <button 
                  onClick={() => setEditingId(null)}
                  className="flex-1 py-2 bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleSaveEdit(photo.id)}
                  className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <Check className="size-4" /> Save
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SlideshowOverlay({ isOpen, onClose }) {
  const { photos } = usePhotos();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !isPlaying || photos.length === 0) return;

    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % photos.length);
    }, 3000); // 3 seconds!

    return () => clearInterval(timer);
  }, [isOpen, isPlaying, photos.length]);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setIsPlaying(true);
    }
  }, [isOpen, photos.length]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (!isOpen || photos.length === 0) return null;

  const safeIndex = currentIndex >= photos.length ? 0 : currentIndex;
  
  const handleNext = () => setCurrentIndex((prev) => (prev + 1) % photos.length);
  const handlePrev = () => setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && containerRef.current) {
        await containerRef.current.requestFullscreen();
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  };

  const handleClose = async () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen().catch(console.error);
    }
    onClose();
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black flex flex-col animate-in fade-in duration-300"
    >
      <div className="absolute top-0 inset-x-0 p-4 sm:p-6 flex justify-between items-center z-20 bg-gradient-to-b from-black/60 to-transparent text-white">
        <div className="text-white/80 font-medium tracking-wide drop-shadow-md">
          {safeIndex + 1} / {photos.length}
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2.5 bg-white/10 hover:bg-white/25 rounded-full transition-colors backdrop-blur-sm"
            title={isPlaying ? "Pause slideshow" : "Play slideshow"}
          >
            {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" fill="currentColor" />}
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2.5 bg-white/10 hover:bg-white/25 rounded-full transition-colors backdrop-blur-sm"
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </button>
          <button 
            onClick={handleClose}
            className="p-2.5 bg-white/10 hover:bg-white/25 rounded-full transition-colors backdrop-blur-sm"
            title="Close slideshow"
          >
            <X className="size-6" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <button 
          onClick={handlePrev}
          className="absolute left-4 sm:left-8 p-3 bg-black/40 hover:bg-black/70 text-white rounded-full z-20 transition-colors backdrop-blur-sm hidden sm:block"
        >
          <ChevronLeft className="size-8" />
        </button>
        
        <img 
          key={photos[safeIndex].id}
          src={photos[safeIndex].url} 
          alt={photos[safeIndex].caption || "Slideshow"} 
          className="w-full h-full object-contain animate-in fade-in zoom-in-95 duration-500"
          onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1594322436404-5a0526db4d13?q=80&w=800&auto=format&fit=crop'; }}
        />

        <button 
          onClick={handleNext}
          className="absolute right-4 sm:right-8 p-3 bg-black/40 hover:bg-black/70 text-white rounded-full z-20 transition-colors backdrop-blur-sm hidden sm:block"
        >
          <ChevronRight className="size-8" />
        </button>
        
        {/* Caption Overlay in Slideshow */}
        {photos[safeIndex].caption && (
          <div className="absolute bottom-8 sm:bottom-12 inset-x-0 flex justify-center z-20 px-6 animate-in slide-in-from-bottom-4 duration-500 pointer-events-none">
            <div className="bg-black/60 backdrop-blur-md text-white px-8 py-3.5 rounded-full text-base sm:text-lg font-medium shadow-2xl max-w-2xl text-center border border-white/10 tracking-wide">
              {photos[safeIndex].caption}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- 4. MAIN APPLICATION ROUTE ---

function Hub() {
  const { photos = [], isAdmin = false, loading = true } = usePhotos() || {};
  const [isSlideshowOpen, setIsSlideshowOpen] = useState(false);

  useEffect(() => {
    document.title = "FamFrame — A shared family photo frame";
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <Header />
      <main className="mx-auto max-w-6xl px-5 sm:px-8 py-10 sm:py-14 space-y-12">
        
        {/* Hero Section */}
        <section className="space-y-4">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-orange-100 text-orange-700">
            <Sparkles className="size-3.5" /> Global Sync Active
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1]">
            Share a moment.<br />
            <span className="text-orange-500">Make Mom smile.</span>
          </h1>
          <p className="text-slate-500 text-lg sm:text-xl max-w-2xl leading-relaxed">
            Add a photo here and it instantly synchronizes across every family member's screen, anywhere in the world.
          </p>
        </section>

        {/* Upload Interface */}
        <UploadZone />

        {/* Gallery Interface */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-slate-100 pb-4 gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">The album</h2>
              <p className="text-sm text-slate-500 mt-1.5 flex items-center gap-2 h-5">
                {!loading && (
                  <>
                    {photos.length} photo{photos.length === 1 ? "" : "s"} in the frame
                    {isAdmin && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-slate-300 mx-1" />
                        <span className="text-orange-500 font-medium flex items-center gap-1">
                          <Shield className="size-3.5" /> Admin mode
                        </span>
                      </>
                    )}
                  </>
                )}
              </p>
            </div>
            
            <button
              onClick={() => setIsSlideshowOpen(true)}
              disabled={photos.length === 0 || loading}
              className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-full font-medium transition-all shadow-sm shadow-orange-500/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none w-full sm:w-auto"
            >
              <Play className="size-4" fill="currentColor" />
              Play Slideshow
            </button>
          </div>
          
          <PhotoGrid />
        </section>
        
      </main>

      <SlideshowOverlay 
        isOpen={isSlideshowOpen} 
        onClose={() => setIsSlideshowOpen(false)} 
      />
    </div>
  );
}

export default function App() {
  return (
    <PhotoProvider>
      <Hub />
    </PhotoProvider>
  );
}