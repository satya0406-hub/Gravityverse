import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, X, RefreshCw, CheckCircle, AlertCircle, FileText, Loader2, Image as ImageIcon } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';

interface ImageUploaderProps {
  category: string; // 'Blog' | 'Stories' | 'News'
  onUploadComplete: (url: string) => void;
  onUploadCleared: () => void;
  onUploadingStateChange: (isUploading: boolean) => void;
  existingUrl?: string;
}

export function ImageUploader({
  category,
  onUploadComplete,
  onUploadCleared,
  onUploadingStateChange,
  existingUrl = ''
}: ImageUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingUrl || null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploaded, setIsUploaded] = useState(!!existingUrl);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTaskRef = useRef<any>(null);

  // Sync with existingUrl if it changes externally (e.g. edit mode opens)
  useEffect(() => {
    if (existingUrl) {
      setPreviewUrl(existingUrl);
      setIsUploaded(true);
    } else if (!file) {
      setPreviewUrl(null);
      setIsUploaded(false);
    }
  }, [existingUrl]);

  // Clean up ObjectURL when component unmounts
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const validateAndProcessFile = (fileToProcess: File) => {
    setError(null);
    
    // Check file types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(fileToProcess.type)) {
      setError('Unsupported file format. Please upload JPG, JPEG, PNG, or WEBP.');
      return;
    }

    // Check size (5MB limit)
    const maxSize = 5 * 1024 * 1024;
    if (fileToProcess.size > maxSize) {
      setError('File is too large. Maximum allowed size is 5 MB.');
      return;
    }

    setFile(fileToProcess);
    
    // Create preview
    const objectUrl = URL.createObjectURL(fileToProcess);
    setPreviewUrl(objectUrl);
    
    // Start upload process
    startUpload(fileToProcess);
  };

  const startUpload = (fileToUpload: File) => {
    if (!fileToUpload) return;
    
    setIsUploading(true);
    setProgress(0);
    setError(null);
    setIsUploaded(false);
    onUploadingStateChange(true);

    const folderMap: Record<string, string> = {
      Blog: 'blogs',
      Stories: 'stories'
    };
    const folder = folderMap[category] || 'blogs';
    const extension = fileToUpload.name.split('.').pop() || 'png';
    const uniqueId = Math.random().toString(36).substring(2, 10);
    const uniqueFilename = `${Date.now()}-${uniqueId}.${extension}`;
    const storageRef = ref(storage, `gravityverse/${folder}/${uniqueFilename}`);

    const task = uploadBytesResumable(storageRef, fileToUpload);
    uploadTaskRef.current = task;

    task.on(
      'state_changed',
      (snapshot) => {
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        setProgress(percent);
      },
      (err) => {
        console.error('Storage Upload Error:', err);
        setError('Upload failed. Please check your network connection and try again.');
        setIsUploading(false);
        onUploadingStateChange(false);
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          setIsUploaded(true);
          setIsUploading(false);
          onUploadingStateChange(false);
          onUploadComplete(downloadUrl);
        } catch (err: any) {
          console.error('Error fetching download URL:', err);
          setError('Failed to retrieve the uploaded image path.');
          setIsUploading(false);
          onUploadingStateChange(false);
        }
      }
    );
  };

  const handleCancel = () => {
    if (uploadTaskRef.current) {
      uploadTaskRef.current.cancel();
      uploadTaskRef.current = null;
    }
  };

  const handleRemove = () => {
    handleCancel();
    setFile(null);
    setPreviewUrl(null);
    setIsUploaded(false);
    setIsUploading(false);
    setProgress(0);
    setError(null);
    onUploadingStateChange(false);
    onUploadCleared();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      validateAndProcessFile(droppedFile);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndProcessFile(selectedFile);
    }
  };

  const handleRetry = () => {
    if (file) {
      startUpload(file);
    }
  };

  return (
    <div className="w-full">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/png, image/jpeg, image/jpg, image/webp"
        className="hidden"
      />

      <AnimatePresence mode="wait">
        {!previewUrl && !error && (
          <motion.div
            key="empty-state"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={triggerFileInput}
            className={`w-full h-48 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
              isDragOver
                ? 'border-brand-blue bg-brand-blue/10 scale-[1.02]'
                : 'border-white/10 hover:border-brand-blue/40 bg-white/5 hover:bg-white/8'
            }`}
          >
            <div className="w-12 h-12 rounded-xl bg-brand-blue/10 flex items-center justify-center text-brand-blue shadow-lg shadow-blue-500/10">
              <Upload className="w-6 h-6 animate-pulse" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-bold text-white">Drag & drop image here, or <span className="text-brand-blue hover:underline">browse</span></p>
              <p className="text-xs text-gray-500 font-medium">Supports JPG, JPEG, PNG, WEBP (Max 5 MB)</p>
            </div>
          </motion.div>
        )}

        {error && (
          <motion.div
            key="error-state"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full p-6 border border-red-500/20 bg-red-500/10 rounded-2xl flex flex-col sm:flex-row items-center sm:items-start gap-4"
          >
            <div className="p-2 rounded-xl bg-red-500/20 text-red-400 shrink-0">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-3 flex-1 text-center sm:text-left">
              <div>
                <p className="text-sm font-bold text-red-400">Upload Failure</p>
                <p className="text-xs text-gray-400 mt-1">{error}</p>
              </div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                {file && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry Upload
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRemove}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  Clear File
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {previewUrl && !error && (
          <motion.div
            key="preview-state"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full p-4 border border-white/10 bg-white/5 rounded-2xl flex flex-col md:flex-row gap-5 items-center"
          >
            {/* Image Preview Window */}
            <div className="relative w-full md:w-32 h-32 rounded-xl overflow-hidden border border-white/10 shrink-0 bg-neutral-900/50 flex items-center justify-center group">
              <img
                src={previewUrl}
                alt="Selected preview"
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
              {isUploaded && (
                <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center backdrop-blur-[1px]">
                  <CheckCircle className="w-8 h-8 text-emerald-400 filter drop-shadow" />
                </div>
              )}
            </div>

            {/* Meta & Status Panel */}
            <div className="flex-1 w-full space-y-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-blue" />
                  <p className="text-sm font-bold text-white truncate max-w-xs md:max-w-md">
                    {file?.name || 'Uploaded image'}
                  </p>
                </div>
                {file && (
                  <p className="text-xs text-gray-500 font-medium">
                    Size: {formatBytes(file.size)}
                  </p>
                )}
              </div>

              {/* Uploading Status Overlay */}
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs text-gray-400 font-semibold">
                    <span className="flex items-center gap-1.5 text-brand-blue animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading image...
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      className="h-full bg-brand-blue"
                    />
                  </div>
                </div>
              )}

              {/* Success State */}
              {isUploaded && !isUploading && (
                <p className="text-xs text-emerald-400 font-bold flex items-center gap-1.5">
                  ✓ Image uploaded successfully
                </p>
              )}

              {/* Controls */}
              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={triggerFileInput}
                  disabled={isUploading}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-gray-400 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border border-white/5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Replace Image
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="px-3 py-1.5 bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border border-white/5"
                >
                  Remove Image
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
