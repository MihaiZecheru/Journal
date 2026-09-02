import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Modal } from 'mdb-ui-kit';
import supabase from '../database/config/supabase';
import { GetUserID } from '../database/GetUser';
import fileDownload from 'js-file-download';
import { getPhotoDate, getPhotoDateDetails, formatDateOrdinal, toLosAngelesDateString } from '../utils/exifUtils';
import { piStorage, PISTORAGE_CONSTRAINTS } from '../lib/pistorage';
import { createBebShortUrl } from '../lib/beb';
import ShortUrlModal from './ShortUrlModal';
import UploadSuccessModal from './UploadSuccessModal';
import ChangeDateModal from './ChangeDateModal';
import Entry from '../database/Entry';
import '../styles/memories.css';

interface MemoryPhoto {
  name: string;
  url: string; // Full-resolution actual image URL
  thumbnail_url: string; // Fast WebP thumbnail URL
  date: string;
  relativePath?: string;
}

interface BatchUploadItem {
  file: File;
  date: string;
  previewUrl: string;
  sizeFormatted: string;
  isOriginalDate: boolean;
  source?: string;
}

interface FailedUploadItem {
  id: string;
  file: File;
  date: string;
  formattedDate: string;
  reason: string;
}

interface AvailableMonth {
  key: string; // YYYY-MM
  year: number;
  month: number; // 0-11
  label: string; // "August 2026"
  count: number;
}

interface AvailableYear {
  year: number;
  label: string; // "2026"
  count: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const Memories: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMounted = useRef<boolean>(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const realToday = new Date();
  const realCurrentYear = realToday.getFullYear();
  const realCurrentMonth = realToday.getMonth();
  const realCurrentMonthKey = `${realCurrentYear}-${String(realCurrentMonth + 1).padStart(2, '0')}`;

  // Parse initial view settings from URL query parameters (?mode=month&year=2026&month=september)
  const initialModeParam = searchParams.get('mode');
  const initialYearParam = searchParams.get('year');
  const initialMonthParam = searchParams.get('month');

  const parsedInitialMode: 'month' | 'year' | 'unknown' =
    initialModeParam === 'unknown'
      ? 'unknown'
      : initialModeParam === 'year'
      ? 'year'
      : 'month';

  const parsedInitialYear =
    initialYearParam && !isNaN(parseInt(initialYearParam, 10))
      ? parseInt(initialYearParam, 10)
      : realCurrentYear;

  let parsedInitialMonth = realCurrentMonth;
  if (initialMonthParam) {
    const monthLower = initialMonthParam.toLowerCase();
    const mIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === monthLower);
    if (mIdx !== -1) {
      parsedInitialMonth = mIdx;
    } else {
      const num = parseInt(initialMonthParam, 10);
      if (!isNaN(num) && num >= 1 && num <= 12) {
        parsedInitialMonth = num - 1;
      }
    }
  }

  // View Mode: 'month' | 'year' | 'unknown'
  const [viewMode, setViewMode] = useState<'month' | 'year' | 'unknown'>(parsedInitialMode);

  // Indexed Memory Dates
  const [availableMonths, setAvailableMonths] = useState<AvailableMonth[]>([]);
  const [availableYears, setAvailableYears] = useState<AvailableYear[]>([]);
  const [unknownDateCount, setUnknownDateCount] = useState<number>(0);
  const [indexLoaded, setIndexLoaded] = useState<boolean>(false);

  // Active Selection
  const [currentMonth, setCurrentMonth] = useState<number>(parsedInitialMonth);
  const [currentYear, setCurrentYear] = useState<number>(parsedInitialYear);

  // Keep URL query parameters in sync with active view settings
  useEffect(() => {
    const newParams = new URLSearchParams();
    newParams.set('mode', viewMode);
    if (viewMode === 'month') {
      newParams.set('year', String(currentYear));
      newParams.set('month', MONTH_NAMES[currentMonth].toLowerCase());
    } else if (viewMode === 'year') {
      newParams.set('year', String(currentYear));
    }
    setSearchParams(newParams, { replace: true });
  }, [viewMode, currentYear, currentMonth, setSearchParams]);

  const [photos, setPhotos] = useState<MemoryPhoto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    photo: MemoryPhoto | null;
  }>({ visible: false, x: 0, y: 0, photo: null });

  // View Entry Modal State
  const viewEntryModalRef = useRef<HTMLDivElement>(null);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [selectedEntryDateTitle, setSelectedEntryDateTitle] = useState<string>('');

  // Existing entry dates in Supabase for displayed photos
  const [existingEntryDates, setExistingEntryDates] = useState<Set<string>>(new Set());

  // Date Picker Modal Ref
  const datePickerModalRef = useRef<HTMLDivElement>(null);

  // Bulk Upload Modal State
  const uploadModalRef = useRef<HTMLDivElement>(null);
  const [batchFiles, setBatchFiles] = useState<BatchUploadItem[]>([]);
  const [bulkDate, setBulkDate] = useState<string>(() => toLosAngelesDateString(new Date()));
  const [failedUploads, setFailedUploads] = useState<FailedUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Content Viewing Modal (Lightbox) State
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState<number | null>(null);

  // Copy Short URL Modal State
  const [shortUrlModalOpen, setShortUrlModalOpen] = useState<boolean>(false);
  const [isGeneratingShortUrl, setIsGeneratingShortUrl] = useState<boolean>(false);
  const [shortUrlData, setShortUrlData] = useState<{ shortUrl: string | null; destinationUrl: string } | null>(null);
  const [shortUrlError, setShortUrlError] = useState<string | null>(null);

  // Upload Success Modal State
  const [uploadSuccessModalOpen, setUploadSuccessModalOpen] = useState<boolean>(false);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string>('');

  // Change Date Modal State
  const [changeDateModalOpen, setChangeDateModalOpen] = useState<boolean>(false);
  const [changeDatePhoto, setChangeDatePhoto] = useState<MemoryPhoto | null>(null);

  // Modal Action Tooltip & Loading States
  const [modalTooltip, setModalTooltip] = useState<'copyImage' | 'copyUrl' | null>(null);
  const modalTooltipTimeoutRef = useRef<any>(null);
  const [isCopyingImage, setIsCopyingImage] = useState<boolean>(false);
  const shortUrlCache = useRef<Record<string, string>>({});

  const showModalTooltip = (type: 'copyImage' | 'copyUrl') => {
    setModalTooltip(type);
    if (modalTooltipTimeoutRef.current) {
      clearTimeout(modalTooltipTimeoutRef.current);
    }
    modalTooltipTimeoutRef.current = setTimeout(() => {
      setModalTooltip(null);
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (modalTooltipTimeoutRef.current) clearTimeout(modalTooltipTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setModalTooltip(null);
  }, [viewingPhotoIndex]);

  // Keyboard navigation for Content Viewing Modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewingPhotoIndex === null) return;
      if (e.key === 'ArrowLeft') {
        setViewingPhotoIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'ArrowRight') {
        setViewingPhotoIndex((prev) => (prev !== null && prev < photos.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'Escape') {
        if (uploadSuccessModalOpen) {
          setUploadSuccessModalOpen(false);
        } else if (shortUrlModalOpen) {
          setShortUrlModalOpen(false);
        } else {
          setViewingPhotoIndex(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewingPhotoIndex, photos.length, shortUrlModalOpen, uploadSuccessModalOpen]);

  const isVideoFile = (filename: string) => {
    return /\.(mp4|mov|webm|avi|mkv)$/i.test(filename);
  };

  // Preload adjacent 3 medias in either direction (6 total) for instant navigation
  useEffect(() => {
    if (viewingPhotoIndex === null || photos.length === 0) return;

    const offsets = [-3, -2, -1, 1, 2, 3];
    offsets.forEach((offset) => {
      const idx = viewingPhotoIndex + offset;
      if (idx >= 0 && idx < photos.length) {
        const media = photos[idx];
        if (!media || !media.url) return;

        if (isVideoFile(media.name)) {
          const video = document.createElement('video');
          video.preload = 'auto';
          video.muted = true;
          video.src = media.url;
        } else {
          const img = new Image();
          img.src = media.url;
          if (typeof img.decode === 'function') {
            img.decode().catch(() => {});
          }
        }
      }
    });
  }, [viewingPhotoIndex, photos]);

  const handlePrevPhoto = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setViewingPhotoIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
  };

  const handleNextPhoto = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setViewingPhotoIndex((prev) => (prev !== null && prev < photos.length - 1 ? prev + 1 : prev));
  };

  const handleCloseContentModal = () => {
    setViewingPhotoIndex(null);
    setModalTooltip(null);
  };

  // Helper to clear all session memories cache entries when mutations happen
  const clearMemoriesCache = () => {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith('journal_memories_cache_')) {
        sessionStorage.removeItem(key);
      }
    }
  };

  // Close context menu on global click
  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu.visible) {
        setContextMenu({ visible: false, x: 0, y: 0, photo: null });
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [contextMenu.visible]);

  // Index all memory dates from PiStorage
  const refreshMemoryIndex = async () => {
    try {
      const userID = await GetUserID();
      const userFolder = `${piStorage.defaultFolder}/${userID}`;
      const tree = await piStorage.getDirectoryTree(userFolder);

      if (!isMounted.current) return;

      const dateFolders = tree.directories || [];
      let unknownCount = 0;

      for (const folder of dateFolders) {
        if (folder.name === 'Unknown-Date' || folder.name === 'Unknown') {
          let count = typeof folder.itemCount === 'number' ? folder.itemCount : 0;
          if (count === 0) {
            const fTree = await piStorage.getDirectoryTree(folder.relativePath);
            count = fTree?.files ? fTree.files.filter((f) => f.name && !f.name.startsWith('.')).length : 0;
          }
          unknownCount += count;
          break;
        }
      }

      if (unknownCount === 0) {
        try {
          const directTree = await piStorage.getDirectoryTree(`${userFolder}/Unknown-Date`);
          if (directTree?.files) {
            unknownCount = directTree.files.filter((f) => f.name && !f.name.startsWith('.')).length;
          }
        } catch (_) {}
      }

      setUnknownDateCount(unknownCount);

      if (!dateFolders.length && unknownCount === 0) {
        setAvailableMonths([]);
        setAvailableYears([]);
        setIndexLoaded(true);
        return;
      }

      const monthCounts: Record<string, { year: number; month: number; count: number }> = {};
      const yearCounts: Record<number, number> = {};

      for (const folder of dateFolders) {
        if (folder.name === 'Unknown-Date' || folder.name === 'Unknown') continue;
        if (!folder.name || !folder.name.match(/^\d{4}-\d{2}-\d{2}$/)) continue;
        const [yearStr, monthStr] = folder.name.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10) - 1;
        const monthKey = `${year}-${monthStr}`;

        if (monthKey > realCurrentMonthKey) continue;

        let count = typeof folder.itemCount === 'number' ? folder.itemCount : 0;
        if (count === 0) {
          const fTree = await piStorage.getDirectoryTree(folder.relativePath);
          count = fTree?.files ? fTree.files.filter((f) => f.name && !f.name.startsWith('.')).length : 0;
        }
        if (count === 0) continue;

        if (!monthCounts[monthKey]) {
          monthCounts[monthKey] = { year, month, count: 0 };
        }
        monthCounts[monthKey].count += count;

        yearCounts[year] = (yearCounts[year] || 0) + count;
      }

      const monthsList: AvailableMonth[] = Object.keys(monthCounts)
        .sort()
        .map((key) => {
          const item = monthCounts[key];
          return {
            key,
            year: item.year,
            month: item.month,
            label: `${MONTH_NAMES[item.month]} ${item.year}`,
            count: item.count,
          };
        });

      const yearsList: AvailableYear[] = Object.keys(yearCounts)
        .map(Number)
        .sort((a, b) => a - b)
        .map((year) => ({
          year,
          label: `${year}`,
          count: yearCounts[year],
        }));

      if (!isMounted.current) return;

      setAvailableMonths(monthsList);
      setAvailableYears(yearsList);
      setIndexLoaded(true);

      if (viewMode !== 'unknown' && monthsList.length > 0) {
        const currentKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        const exists = monthsList.some((m) => m.key === currentKey);
        if (!exists) {
          const latest = monthsList[monthsList.length - 1];
          setCurrentMonth(latest.month);
          setCurrentYear(latest.year);
        }
      }
    } catch (err) {
      console.error('Error building memory index:', err);
      if (isMounted.current) setIndexLoaded(true);
    }
  };

  useEffect(() => {
    refreshMemoryIndex();
  }, []);

  const currentFetchId = useRef<number>(0);

  // Fetch photos for selected Month or Year (with sessionStorage Caching)
  const fetchPhotos = async () => {
    const fetchId = ++currentFetchId.current;
    let cacheKey = '';
    try {
      const userID = await GetUserID();
      cacheKey =
        viewMode === 'unknown'
          ? `journal_memories_cache_v2_${userID}_unknown`
          : viewMode === 'month'
          ? `journal_memories_cache_v2_${userID}_month_${currentYear}_${currentMonth}`
          : `journal_memories_cache_v2_${userID}_year_${currentYear}`;

      // Always show loading spinner immediately on collection switch
      if (isMounted.current && fetchId === currentFetchId.current) {
        setLoading(true);
        setPhotos([]);
      }

      // Instant cache check
      const cachedData = sessionStorage.getItem(cacheKey);
      if (cachedData) {
        try {
          const { photos: cachedPhotos } = JSON.parse(cachedData);
          if (isMounted.current && fetchId === currentFetchId.current) {
            setPhotos(cachedPhotos);
            // Brief visual loading feedback when switching collections even on cache hit
            setTimeout(() => {
              if (isMounted.current && fetchId === currentFetchId.current) {
                setLoading(false);
              }
            }, 200);
          }
        } catch (e) {
          console.warn('Cache parse error:', e);
        }
      }

      const monthStr = String(currentMonth + 1).padStart(2, '0');
      const monthPrefix = `${currentYear}-${monthStr}-`;
      const yearPrefix = `${currentYear}-`;

      const userFolder = `${piStorage.defaultFolder}/${userID}`;
      const tree = await piStorage.getDirectoryTree(userFolder);

      if (!isMounted.current || fetchId !== currentFetchId.current) return;

      const dateFolders = tree.directories || [];
      const matchingFolders = dateFolders.filter((folder) => {
        if (viewMode === 'unknown') {
          return folder.name === 'Unknown-Date' || folder.name === 'Unknown';
        }
        if (!folder.name || !folder.name.match(/^\d{4}-\d{2}-\d{2}$/)) return false;
        if (viewMode === 'month') return folder.name.startsWith(monthPrefix);
        return folder.name.startsWith(yearPrefix);
      });

      const allPhotos: MemoryPhoto[] = [];

      for (const folder of matchingFolders) {
        const folderTree = await piStorage.getDirectoryTree(folder.relativePath);
        if (folderTree && folderTree.files) {
          folderTree.files.forEach((file) => {
            if (file.name && !file.name.startsWith('.')) {
              allPhotos.push({
                name: file.name,
                url: piStorage.getFileUrl(file.viewUrl || file.relativePath),
                thumbnail_url: piStorage.getThumbnailUrl(file.thumbnailUrl || file.relativePath),
                date: folder.name,
                relativePath: file.relativePath,
              });
            }
          });
        }
      }

      // If viewing unknown photos and nothing found in directories array, query Unknown-Date directly
      if (viewMode === 'unknown' && allPhotos.length === 0) {
        try {
          const directTree = await piStorage.getDirectoryTree(`${userFolder}/Unknown-Date`);
          if (directTree && directTree.files) {
            directTree.files.forEach((file) => {
              if (file.name && !file.name.startsWith('.')) {
                allPhotos.push({
                  name: file.name,
                  url: piStorage.getFileUrl(file.viewUrl || file.relativePath),
                  thumbnail_url: piStorage.getThumbnailUrl(file.thumbnailUrl || file.relativePath),
                  date: 'Unknown-Date',
                  relativePath: file.relativePath,
                });
              }
            });
          }
        } catch (_) {}
      }

      if (!isMounted.current || fetchId !== currentFetchId.current) return;

      // Sort photos chronologically by date and filename
      allPhotos.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

      setPhotos(allPhotos);
      sessionStorage.setItem(cacheKey, JSON.stringify({ photos: allPhotos, timestamp: Date.now() }));

      // Check which photo dates have written entries in Supabase
      const photoDates = Array.from(new Set(allPhotos.map((p) => p.date)));
      if (photoDates.length > 0) {
        const { data: entriesData } = await supabase
          .from('Entries')
          .select('date')
          .eq('user_id', userID)
          .in('date', photoDates);
        if (isMounted.current && fetchId === currentFetchId.current) {
          setExistingEntryDates(new Set((entriesData || []).map((e: any) => e.date)));
        }
      } else {
        if (isMounted.current && fetchId === currentFetchId.current) {
          setExistingEntryDates(new Set());
        }
      }
    } catch (err) {
      console.error('Error fetching photos:', err);
      if (isMounted.current && fetchId === currentFetchId.current && !sessionStorage.getItem(cacheKey)) {
        setPhotos([]);
      }
    } finally {
      if (isMounted.current && fetchId === currentFetchId.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (indexLoaded) {
      fetchPhotos();
    }
  }, [currentMonth, currentYear, viewMode, indexLoaded]);

  // Navigation Index Calculations
  const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  const currentMonthIndex = availableMonths.findIndex((m) => m.key === currentMonthKey);
  const currentYearIndex = availableYears.findIndex((y) => y.year === currentYear);

  const canPrev =
    viewMode === 'month'
      ? currentMonthIndex > 0
      : currentYearIndex > 0;

  const canNext =
    viewMode === 'month'
      ? currentMonthIndex !== -1 && currentMonthIndex < availableMonths.length - 1
      : currentYearIndex !== -1 && currentYearIndex < availableYears.length - 1;

  const handlePrev = () => {
    if (!canPrev) return;
    if (viewMode === 'month') {
      const prev = availableMonths[currentMonthIndex - 1];
      if (prev) {
        setCurrentMonth(prev.month);
        setCurrentYear(prev.year);
      }
    } else {
      const prev = availableYears[currentYearIndex - 1];
      if (prev) {
        setCurrentYear(prev.year);
      }
    }
  };

  const handleNext = () => {
    if (!canNext) return;
    if (viewMode === 'month') {
      const next = availableMonths[currentMonthIndex + 1];
      if (next) {
        setCurrentMonth(next.month);
        setCurrentYear(next.year);
      }
    } else {
      const next = availableYears[currentYearIndex + 1];
      if (next) {
        setCurrentYear(next.year);
      }
    }
  };

  // Right-Click Context Menu Trigger
  const handleContextMenu = (e: React.MouseEvent, photo: MemoryPhoto) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      photo,
    });
  };

  // Context Menu Action: View Journal Entry
  const handleViewJournalEntry = async (date: string) => {
    try {
      const userID = await GetUserID();
      const { data, error } = await supabase
        .from('Entries')
        .select('*')
        .eq('user_id', userID)
        .eq('date', date)
        .maybeSingle();

      if (error) {
        alert('Could not load entry for ' + date);
        return;
      }

      if (!data) {
        alert(`No journal entry was written for ${formatDateOrdinal(date)}.`);
        return;
      }

      setSelectedEntry(data as Entry);
      setSelectedEntryDateTitle(formatDateOrdinal(date));
      if (viewEntryModalRef.current) {
        new Modal(viewEntryModalRef.current).show();
      }
    } catch (err) {
      console.error('Error in handleViewJournalEntry:', err);
    }
  };

  // Helper to convert cross-origin image bitmap to clean PNG blob for system clipboard
  const convertImageToPngBlob = (imageUrl: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas blob conversion failed'));
          }
        }, 'image/png');
      };
      img.onerror = (err) => reject(err);
      img.src = imageUrl;
    });
  };

  // Context Menu Action: Copy Image (Copies actual raster image data to clipboard)
  const handleCopyImage = async (photo: MemoryPhoto) => {
    setContextMenu({ visible: false, x: 0, y: 0, photo: null });
    try {
      if (!navigator.clipboard || !window.ClipboardItem) {
        alert('Image copying is not supported by your browser.');
        return;
      }
      const pngBlob = await convertImageToPngBlob(photo.url);
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': pngBlob,
        }),
      ]);
      alert('Image copied to clipboard! You can now paste the photo into chat apps or documents.');
    } catch (err: any) {
      console.error('Error copying image to clipboard:', err);
      alert('Failed to copy image to clipboard.');
    }
  };

  // Context Menu Action: Copy URL
  const handleCopyUrl = async (photo: MemoryPhoto) => {
    setContextMenu({ visible: false, x: 0, y: 0, photo: null });
    try {
      await navigator.clipboard.writeText(photo.url);
      alert('Image URL copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy URL:', err);
      alert('Could not copy URL.');
    }
  };

  // Context Menu / Modal Action: Copy short URL
  const handleOpenShortUrlModal = async (photo: MemoryPhoto) => {
    setContextMenu({ visible: false, x: 0, y: 0, photo: null });
    setShortUrlModalOpen(true);
    setShortUrlError(null);

    if (shortUrlCache.current[photo.url]) {
      const cached = shortUrlCache.current[photo.url];
      setShortUrlData({
        shortUrl: cached,
        destinationUrl: photo.url,
      });
      setIsGeneratingShortUrl(false);
      try {
        await navigator.clipboard.writeText(cached);
      } catch (cErr) {
        console.warn('Clipboard write error:', cErr);
      }
      return;
    }

    setShortUrlData({
      shortUrl: null,
      destinationUrl: photo.url,
    });
    setIsGeneratingShortUrl(true);

    try {
      const bebRes = await createBebShortUrl(photo.url);
      shortUrlCache.current[photo.url] = bebRes.shortUrl;
      setShortUrlData({
        shortUrl: bebRes.shortUrl,
        destinationUrl: photo.url,
      });
      setIsGeneratingShortUrl(false);
      try {
        await navigator.clipboard.writeText(bebRes.shortUrl);
      } catch (cErr) {
        console.warn('Clipboard write error:', cErr);
      }
    } catch (err: any) {
      console.error('Failed to create short URL:', err);
      setShortUrlError(err.message || 'Short URL service is currently unreachable.');
      setShortUrlData({
        shortUrl: null,
        destinationUrl: photo.url,
      });
      setIsGeneratingShortUrl(false);
      try {
        await navigator.clipboard.writeText(photo.url);
      } catch (cErr) {
        console.warn('Clipboard write error:', cErr);
      }
    }
  };

  // Image Viewer Modal Action: Copy Image (Shows tooltip above button, no alert popups)
  const handleModalCopyImage = async (photo: MemoryPhoto) => {
    if (isCopyingImage) return;
    try {
      if (!navigator.clipboard || !window.ClipboardItem) {
        console.warn('Image copying is not supported by your browser.');
        return;
      }
      setIsCopyingImage(true);
      const pngBlob = await convertImageToPngBlob(photo.url);
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': pngBlob,
        }),
      ]);
      showModalTooltip('copyImage');
    } catch (err: any) {
      console.error('Error copying image to clipboard:', err);
    } finally {
      setIsCopyingImage(false);
    }
  };

  // Image Viewer Modal Action: Copy Image URL (Shows tooltip above button, no alert popups)
  const handleModalCopyUrl = async (photo: MemoryPhoto) => {
    try {
      await navigator.clipboard.writeText(photo.url);
      showModalTooltip('copyUrl');
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  // Context Menu / Modal Action: Delete Memory
  const handleDeleteMemory = async (photo: MemoryPhoto) => {
    setContextMenu({ visible: false, x: 0, y: 0, photo: null });
    const proceed = window.confirm(`Are you sure you want to delete this memory photo (${photo.name})?`);
    if (!proceed) return;

    try {
      const userID = await GetUserID();
      const targetPath = photo.relativePath || `${piStorage.defaultFolder}/${userID}/${photo.date}/${photo.name}`;
      await piStorage.deleteFile(targetPath);

      clearMemoriesCache();
      setPhotos((prev) => prev.filter((p) => !(p.name === photo.name && p.date === photo.date)));
      setViewingPhotoIndex(null);
      await refreshMemoryIndex();
    } catch (err: any) {
      console.error('Error deleting memory:', err);
      alert('Failed to delete memory: ' + (err.message || 'Unknown error'));
    }
  };

  // Context Menu / Modal Action: Open Change Date Modal
  const handleOpenChangeDateModal = (photo: MemoryPhoto) => {
    setContextMenu({ visible: false, x: 0, y: 0, photo: null });
    setChangeDatePhoto(photo);
    setChangeDateModalOpen(true);
  };

  // Action: Confirm Change Date and Move File in PiStorage
  const handleConfirmChangeDate = async (newDate: string) => {
    if (!changeDatePhoto) return;

    const userID = await GetUserID();
    const sourcePath =
      changeDatePhoto.relativePath ||
      `${piStorage.defaultFolder}/${userID}/${changeDatePhoto.date}/${changeDatePhoto.name}`;
    const targetFolder = `${piStorage.defaultFolder}/${userID}/${newDate}`;

    await piStorage.moveFile(sourcePath, targetFolder);

    clearMemoriesCache();
    setChangeDateModalOpen(false);
    setChangeDatePhoto(null);
    setViewingPhotoIndex(null);

    await refreshMemoryIndex();
    await fetchPhotos();
  };

  // Helper to parse and queue selected/dropped files
  const processSelectedFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;
    const parsedList: BatchUploadItem[] = [];

    for (const file of files) {
      const details = await getPhotoDateDetails(file);
      const previewUrl = URL.createObjectURL(file);
      const sizeMB = file.size / (1024 * 1024);
      const sizeFormatted = sizeMB < 1 ? `${Math.round(file.size / 1024)} KB` : `${sizeMB.toFixed(1)} MB`;
      parsedList.push({
        file,
        date: details.date,
        previewUrl,
        sizeFormatted,
        isOriginalDate: details.isOriginalDate,
        source: details.source,
      });
    }

    setBatchFiles((prev) => [...prev, ...parsedList]);
  };

  // Bulk Upload File Selection via input
  const handleBatchFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    await processSelectedFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  // Drag and drop event handlers
  const handleDropzoneDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDropzoneDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDropzoneDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDropzoneDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).filter(
        (f) =>
          f.type.startsWith('image/') ||
          f.type.startsWith('video/') ||
          /\.(jpe?g|png|gif|webp|heic|heif|mp4|mov|webm|avi|mkv)$/i.test(f.name)
      );
      if (droppedFiles.length > 0) {
        await processSelectedFiles(droppedFiles);
      }
    }
  };

  // Update date for a single item in the batch upload preview
  const handleUpdateBatchFileDate = (index: number, newDate: string) => {
    setBatchFiles((prev) =>
      prev.map((item, i) => (i === index ? { ...item, date: newDate, isOriginalDate: true } : item))
    );
  };

  // Batch apply a date to all selected items
  const handleApplyBulkDate = () => {
    if (!bulkDate) return;
    setBatchFiles((prev) => prev.map((item) => ({ ...item, date: bulkDate, isOriginalDate: true })));
  };

  // Set all selected items to Unknown Date
  const handleSetAllUnknown = () => {
    setBatchFiles((prev) =>
      prev.map((item) => ({ ...item, date: 'Unknown-Date', isOriginalDate: true }))
    );
  };

  // Process Bulk Upload (Indiscriminate - saves for any date without requiring an entry)
  const processBatchUpload = async () => {
    if (batchFiles.length === 0) return;
    setIsUploading(true);
    const totalFilesToUpload = batchFiles.length;
    setUploadProgress({ current: 0, total: totalFilesToUpload });

    try {
      const userID = await GetUserID();
      const filesToUpload: { file: File; date: string }[] = [];
      const newFailedUploads: FailedUploadItem[] = [];

      batchFiles.forEach((item) => {
        if (item.file.size > PISTORAGE_CONSTRAINTS.MAX_FILE_SIZE_BYTES) {
          const sizeGB = (item.file.size / (1024 * 1024 * 1024)).toFixed(2);
          newFailedUploads.push({
            id: Math.random().toString(36).substring(2, 9),
            file: item.file,
            date: item.date,
            formattedDate: formatDateOrdinal(item.date),
            reason: `File is ${sizeGB} GB (exceeds 1.5 GB limit).`,
          });
        } else {
          filesToUpload.push({ file: item.file, date: item.date });
        }
      });

      let uploadedSuccessCount = 0;

      if (filesToUpload.length > 0) {
        const totalValid = filesToUpload.length;
        setUploadProgress({ current: 0, total: totalValid });

        const grouped: Record<string, File[]> = {};
        filesToUpload.forEach((item) => {
          const folderDate = item.date === 'Unknown' || item.date === 'Unknown-Date' ? 'Unknown-Date' : item.date;
          if (!grouped[folderDate]) grouped[folderDate] = [];
          grouped[folderDate].push(item.file);
        });

        const datesArr = Object.keys(grouped);
        let cumulativeUploaded = 0;

        for (const date of datesArr) {
          const filesForDate = grouped[date];
          const targetFolder = `${piStorage.defaultFolder}/${userID}/${date}`;

          try {
            const uploadRes = await piStorage.uploadFiles(
              targetFolder,
              filesForDate,
              (chunkUploaded, chunkTotal) => {
                const currentCount = Math.min(totalValid, cumulativeUploaded + chunkUploaded);
                setUploadProgress({ current: currentCount, total: totalValid });
              }
            );
            uploadedSuccessCount += uploadRes.uploadedCount || 0;
            cumulativeUploaded += filesForDate.length;
            setUploadProgress({ current: Math.min(totalValid, cumulativeUploaded), total: totalValid });

            if (uploadRes.failed && uploadRes.failed.length > 0) {
              uploadRes.failed.forEach((fail) => {
                const originalName = fail.original_name || fail.original_filename;
                const matchedFile = filesForDate.find((f) => f.name === originalName) || filesForDate[0];
                newFailedUploads.push({
                  id: Math.random().toString(36).substring(2, 9),
                  file: matchedFile,
                  date,
                  formattedDate: formatDateOrdinal(date),
                  reason: fail.error || 'Server rejected file upload',
                });
              });
            }
          } catch (uploadErr: any) {
            console.error(`Error uploading files for ${date}:`, uploadErr);
            filesForDate.forEach((file) => {
              newFailedUploads.push({
                id: Math.random().toString(36).substring(2, 9),
                file,
                date,
                formattedDate: formatDateOrdinal(date),
                reason: uploadErr.message || 'Upload failed',
              });
            });
            cumulativeUploaded += filesForDate.length;
          }
        }
      }

      clearMemoriesCache();
      setFailedUploads((prev) => [...prev, ...newFailedUploads]);
      setBatchFiles([]);
      setIsUploading(false);
      setUploadProgress(null);

      await refreshMemoryIndex();
      fetchPhotos();

      if (filesToUpload.length > 0 && newFailedUploads.length === 0) {
        const closeBtn = uploadModalRef.current?.querySelector(
          'button[data-mdb-dismiss="modal"]'
        ) as HTMLButtonElement;
        if (closeBtn) closeBtn.click();

        setUploadSuccessMessage(
          `Successfully uploaded ${uploadedSuccessCount} memory photo${uploadedSuccessCount === 1 ? '' : 's'}!`
        );
        setUploadSuccessModalOpen(true);
      }
    } catch (err: any) {
      alert(`Upload failed: ${err.message || err}`);
      setIsUploading(false);
    }
  };

  // Retry Failed Item
  const handleRetryUpload = async (failedItem: FailedUploadItem) => {
    try {
      const userID = await GetUserID();

      if (failedItem.file.size > PISTORAGE_CONSTRAINTS.MAX_FILE_SIZE_BYTES) {
        const sizeGB = (failedItem.file.size / (1024 * 1024 * 1024)).toFixed(2);
        alert(`This file (${sizeGB} GB) exceeds the 1.5 GB limit.`);
        return;
      }

      const targetFolder = `${piStorage.defaultFolder}/${userID}/${failedItem.date}`;
      const uploadRes = await piStorage.uploadFiles(targetFolder, [failedItem.file]);

      if (uploadRes.failed && uploadRes.failed.length > 0) {
        alert(`Upload failed: ${uploadRes.failed[0].error}`);
        return;
      }

      clearMemoriesCache();
      const remainingFailed = failedUploads.filter((item) => item.id !== failedItem.id);
      setFailedUploads(remainingFailed);

      if (remainingFailed.length === 0) {
        const closeBtn = uploadModalRef.current?.querySelector(
          'button[data-mdb-dismiss="modal"]'
        ) as HTMLButtonElement;
        if (closeBtn) closeBtn.click();
      }

      setUploadSuccessMessage(`Successfully uploaded memory for ${failedItem.formattedDate}!`);
      setUploadSuccessModalOpen(true);

      await refreshMemoryIndex();
      fetchPhotos();
    } catch (err: any) {
      alert(`Retry failed: ${err.message || err}`);
    }
  };

  const headerTitle =
    viewMode === 'unknown'
      ? 'Unknown Date'
      : viewMode === 'month'
      ? `${MONTH_NAMES[currentMonth]} ${currentYear}`
      : `${currentYear}`;

  return (
    <div className="memories-container">
      {/* Mathematically Centered 3-Column Header Bar */}
      <div className="memories-header">
        <div className="memories-header-left">
          <button
            type="button"
            className="memories-nav-btn"
            onClick={() => navigate('/home')}
          >
            <i className="fas fa-arrow-left"></i> Home
          </button>

          <select
            className="memories-view-select"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as 'month' | 'year' | 'unknown')}
          >
            <option value="month">View by Month</option>
            <option value="year">View by Year</option>
            <option value="unknown">
              Unknown Date{unknownDateCount > 0 ? ` (${unknownDateCount})` : ''}
            </option>
          </select>
        </div>

        <div className="memories-header-center">
          <div className="month-navigator">
            {viewMode !== 'unknown' && (
              <button
                type="button"
                className="month-arrow-btn"
                onClick={handlePrev}
                disabled={!canPrev}
                title={canPrev ? 'Previous Date with Memories' : 'No earlier dates with memories'}
              >
                <i className="fas fa-chevron-left"></i>
              </button>
            )}

            <h3
              className="month-title-clickable"
              onClick={() => {
                if (datePickerModalRef.current) {
                  new Modal(datePickerModalRef.current).show();
                }
              }}
              title="Click to select date with memories"
            >
              {viewMode === 'unknown' ? (
                <>
                  <i className="far fa-calendar-times me-2 text-warning"></i>
                  {headerTitle}
                </>
              ) : (
                headerTitle
              )}
            </h3>

            {viewMode !== 'unknown' && (
              <button
                type="button"
                className="month-arrow-btn"
                onClick={handleNext}
                disabled={!canNext}
                title={canNext ? 'Next Date with Memories' : 'No later dates with memories'}
              >
                <i className="fas fa-chevron-right"></i>
              </button>
            )}
          </div>
        </div>

        <div className="memories-header-right">
          <button
            type="button"
            className="memories-nav-btn"
            onClick={() => {
              if (uploadModalRef.current) new Modal(uploadModalRef.current).show();
            }}
          >
            <i className="fas fa-cloud-arrow-up"></i>Upload Memories
          </button>
        </div>
      </div>

      {/* Centered Loading State */}
      {loading && (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
          <p className="mt-2 text-light opacity-75">Loading memories for {headerTitle}...</p>
        </div>
      )}

      {/* Global Empty State */}
      {!loading && availableMonths.length === 0 && unknownDateCount === 0 && (
        <div className="memories-empty-state">
          <i className="fas fa-images fa-4x"></i>
          <h4>No memories found</h4>
          <p>You haven't uploaded any memories yet. Use the "Upload Memories" button above to add your first photos!</p>
        </div>
      )}

      {/* Period Empty State */}
      {!loading && (availableMonths.length > 0 || unknownDateCount > 0) && photos.length === 0 && (
        <div className="memories-empty-state">
          <i className="fas fa-images fa-4x"></i>
          <h4>No memories found for {headerTitle}</h4>
          <p>Use the "Upload Memories" button above to add photos{viewMode === 'unknown' ? ' with an unknown date' : ' for this date'}!</p>
        </div>
      )}

      {/* Memory Photo Grid */}
      {!loading && photos.length > 0 && (
        <div className="memories-grid">
          {photos.map((photo, idx) => (
            <div
              key={idx}
              className="memory-card"
              onClick={() => setViewingPhotoIndex(idx)}
              onContextMenu={(e) => handleContextMenu(e, photo)}
              style={{ cursor: 'pointer' }}
              title={`Click to view ${isVideoFile(photo.name) ? 'video' : 'photo'} (${photo.name})`}
            >
              <img
                src={photo.thumbnail_url || photo.url}
                alt={photo.name}
                loading="lazy"
                onError={(e) => {
                  if (e.currentTarget.src !== photo.url) {
                    e.currentTarget.src = photo.url;
                  }
                }}
              />
              <div className="memory-card-date">
                {formatDateOrdinal(photo.date)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Right-Click Custom Context Menu */}
      {contextMenu.visible && contextMenu.photo && (
        <div
          className="custom-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <ul>
            {existingEntryDates.has(contextMenu.photo.date) ? (
              <li onClick={() => {
                const date = contextMenu.photo!.date;
                setContextMenu({ visible: false, x: 0, y: 0, photo: null });
                handleViewJournalEntry(date);
              }}>
                <i className="fas fa-book-open"></i>View written entry
              </li>
            ) : (
              <li
                className="disabled-option"
                title="No written entry exists for this date"
                onClick={(e) => e.stopPropagation()}
              >
                <i className="fas fa-book-open"></i>No written entry exists
              </li>
            )}
            <li onClick={() => {
              const url = contextMenu.photo!.url;
              setContextMenu({ visible: false, x: 0, y: 0, photo: null });
              window.open(url, '_blank');
            }}>
              <i className="fas fa-arrow-up-right-from-square"></i>Open in new tab
            </li>
            <li onClick={() => handleCopyImage(contextMenu.photo!)}>
              <i className="fas fa-copy"></i>Copy image
            </li>
            <li onClick={() => handleCopyUrl(contextMenu.photo!)}>
              <i className="fas fa-link"></i>Copy image URL
            </li>
            <li onClick={() => handleOpenShortUrlModal(contextMenu.photo!)}>
              <i className="fas fa-share-nodes"></i>Copy short URL
            </li>
            <li
              onClick={async () => {
                const photo = contextMenu.photo!;
                setContextMenu({ visible: false, x: 0, y: 0, photo: null });
                const res = await fetch(photo.url);
                const blob = await res.blob();
                fileDownload(blob, photo.name);
              }}
            >
              <i className="fas fa-download"></i>Download
            </li>
            <li
              className="change-date-option"
              onClick={() => handleOpenChangeDateModal(contextMenu.photo!)}
            >
              <i className="far fa-calendar-alt"></i>Change date
            </li>
            <li
              className="delete-option"
              onClick={() => handleDeleteMemory(contextMenu.photo!)}
            >
              <i className="fas fa-trash-can"></i>Delete memory
            </li>
          </ul>
        </div>
      )}

      {/* Date Selection Picker Modal */}
      <div
        className="modal fade memories-modal"
        ref={datePickerModalRef}
        tabIndex={-1}
        aria-hidden="true"
      >
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">
                Select {viewMode === 'month' ? 'Month' : 'Year'} with Memories
              </h5>
              <button
                type="button"
                className="btn-close"
                data-mdb-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '350px', overflowY: 'auto' }}>
              {viewMode === 'month' && (
                <div>
                  {availableMonths.length === 0 && <p className="text-light opacity-75">No months with memories found.</p>}
                  {availableMonths.map((m) => {
                    const isActive = m.key === currentMonthKey;
                    return (
                      <div
                        key={m.key}
                        className={`date-picker-item ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          setCurrentMonth(m.month);
                          setCurrentYear(m.year);
                          const closeBtn = datePickerModalRef.current?.querySelector(
                            'button[data-mdb-dismiss="modal"]'
                          ) as HTMLButtonElement;
                          if (closeBtn) closeBtn.click();
                        }}
                      >
                        <span className="fw-bold text-white">{m.label}</span>
                        <span className="badge bg-primary rounded-pill">
                          {m.count} photo{m.count === 1 ? '' : 's'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {viewMode === 'year' && (
                <div>
                  {availableYears.length === 0 && <p className="text-light opacity-75">No years with memories found.</p>}
                  {availableYears.map((y) => {
                    const isActive = y.year === currentYear;
                    return (
                      <div
                        key={y.year}
                        className={`date-picker-item ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          setCurrentYear(y.year);
                          const closeBtn = datePickerModalRef.current?.querySelector(
                            'button[data-mdb-dismiss="modal"]'
                          ) as HTMLButtonElement;
                          if (closeBtn) closeBtn.click();
                        }}
                      >
                        <span className="fw-bold text-white">{y.label}</span>
                        <span className="badge bg-primary rounded-pill">
                          {y.count} photo{y.count === 1 ? '' : 's'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="date-picker-divider">
                <div
                  className={`date-picker-item ${viewMode === 'unknown' ? 'active' : ''}`}
                  onClick={() => {
                    setViewMode('unknown');
                    const closeBtn = datePickerModalRef.current?.querySelector(
                      'button[data-mdb-dismiss="modal"]'
                    ) as HTMLButtonElement;
                    if (closeBtn) closeBtn.click();
                  }}
                >
                  <span className="fw-bold text-white">
                    <i className="far fa-calendar-times me-2 text-warning"></i>Unknown Date
                  </span>
                  <span className="badge bg-secondary rounded-pill">
                    {unknownDateCount} photo{unknownDateCount === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                data-mdb-dismiss="modal"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* View Entry Modal */}
      <div
        className="modal fade memories-modal"
        ref={viewEntryModalRef}
        tabIndex={-1}
        aria-hidden="true"
      >
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{selectedEntryDateTitle}</h5>
              <button
                type="button"
                className="btn-close"
                data-mdb-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body">
              {selectedEntry && (
                <div>
                  <div className="d-flex align-items-center mb-3">
                    <span className="badge bg-primary fs-6 me-2">
                      Rating: {selectedEntry.rating === 11 ? 'None' : `${selectedEntry.rating}/10`}
                    </span>
                    {selectedEntry.starred && (
                      <span className="badge bg-warning text-dark">
                        <i className="fas fa-star me-1"></i>Starred
                      </span>
                    )}
                  </div>
                  <div className="p-3 bg-dark text-light rounded border border-secondary mb-3">
                    <p className="m-0 style-preserve-line-breaks">{selectedEntry.journal_entry}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                data-mdb-dismiss="modal"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Upload Memories Modal */}
      <div
        className="modal fade modal-lg memories-modal"
        ref={uploadModalRef}
        tabIndex={-1}
        aria-labelledby="upload-modal-label"
        aria-hidden="true"
      >
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="upload-modal-label">
                <i className="fas fa-cloud-arrow-up me-2"></i>Upload Memories
              </h5>
              <button
                type="button"
                className="btn-close"
                data-mdb-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>
            <div
              className="modal-body"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={handleDropzoneDrop}
            >
              <p className="text-light opacity-75 small mb-3">
                Select or drop photos below. Photos will be organized by date (America/Los Angeles time) and saved to Memories.
              </p>

              {/* High-Contrast Dropzone */}
              <div
                className={`upload-memories-dropzone p-4 text-center border mb-3 ${isDraggingOver ? 'dragging' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => document.getElementById('memories-file-input')?.click()}
                onDragOver={handleDropzoneDragOver}
                onDragEnter={handleDropzoneDragEnter}
                onDragLeave={handleDropzoneDragLeave}
                onDrop={handleDropzoneDrop}
              >
                <i className="fas fa-images fa-3x"></i>
                <h5>Click or drag & drop photos here</h5>
                <span className="dropzone-subtitle">Supports photos and videos up to 1.5 GB (server compresses automatically)</span>
                <input
                  type="file"
                  id="memories-file-input"
                  multiple
                  accept="image/*,video/*"
                  className="d-none"
                  onChange={handleBatchFileSelect}
                />
              </div>

              {/* Batch Files Preview */}
              {batchFiles.length > 0 && (
                <div className="upload-preview-container">
                  <div className="upload-preview-header">
                    <h6>
                      <i className="fas fa-images me-2 text-primary"></i>Selected Photos ({batchFiles.length})
                    </h6>
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm py-1 px-2"
                      onClick={() => setBatchFiles([])}
                      disabled={isUploading}
                    >
                      <i className="fas fa-trash-can me-1"></i>Clear All
                    </button>
                  </div>

                  {/* Batch Date Quick Setter */}
                  <div className="upload-batch-toolbar">
                    <div className="upload-batch-section">
                      <div className="upload-batch-toolbar-label">
                        <i className="far fa-calendar-check text-primary"></i>
                        <span>Set date for all:</span>
                      </div>
                      <div className="upload-batch-toolbar-actions">
                        <input
                          type="date"
                          className="upload-batch-date-input"
                          value={bulkDate}
                          onChange={(e) => setBulkDate(e.target.value)}
                          disabled={isUploading}
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm py-1 px-2"
                          onClick={handleApplyBulkDate}
                          disabled={!bulkDate || isUploading}
                          title="Apply selected date to all photos"
                        >
                          Apply
                        </button>
                      </div>
                    </div>

                    <div className="upload-batch-divider" role="separator"></div>

                    <div className="upload-batch-section">
                      <button
                        type="button"
                        className="upload-batch-unknown-btn"
                        onClick={handleSetAllUnknown}
                        disabled={isUploading}
                        title="Set all selected photos to Unknown Date"
                      >
                        <i className="far fa-calendar-times text-warning me-1"></i>Set All to Unknown
                      </button>
                    </div>
                  </div>

                  {batchFiles.some((item) => !item.isOriginalDate && item.date !== 'Unknown-Date') && (
                    <div className="upload-untrusted-date-alert mb-3">
                      <i className="fas fa-triangle-exclamation text-warning me-2"></i>
                      <span>
                        Some photos lack original capture metadata (<strong>DateTimeOriginal</strong> or <strong>CreateDate</strong>). We estimated their dates from file/filename info — please verify, set manually, or mark as <strong>Unknown</strong>.
                      </span>
                    </div>
                  )}

                  {/* Cards Grid */}
                  <div className="upload-preview-grid">
                    {batchFiles.map((item, idx) => (
                      <div key={idx} className="upload-preview-card">
                        <div className="upload-card-thumb-container">
                          <img
                            src={item.previewUrl}
                            alt={item.file.name}
                            className="upload-card-thumb"
                          />
                          {item.date === 'Unknown-Date' ? (
                            <span
                              className="upload-card-unknown-badge"
                              title="Marked as Unknown Date"
                            >
                              <i className="far fa-calendar-times me-1"></i>Unknown Date
                            </span>
                          ) : !item.isOriginalDate ? (
                            <span
                              className="upload-card-warning-badge"
                              title="Date not from DateTimeOriginal or CreateDate. Please set manually or mark as Unknown."
                            >
                              <i className="fas fa-triangle-exclamation me-1"></i>Check date
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="upload-card-remove-btn"
                            title="Remove photo"
                            onClick={() => setBatchFiles(batchFiles.filter((_, i) => i !== idx))}
                            disabled={isUploading}
                          >
                            <i className="fas fa-xmark"></i>
                          </button>
                        </div>
                        <div className="upload-card-body">
                          <div className="upload-card-filename" title={item.file.name}>
                            {item.file.name}
                          </div>
                          <div className="upload-card-meta">
                            <span className="upload-card-size-badge">{item.sizeFormatted}</span>
                            <span className="text-light opacity-75">{formatDateOrdinal(item.date)}</span>
                          </div>
                          <div className="upload-card-date-field">
                            {item.date === 'Unknown-Date' ? (
                              <div>
                                <div className="upload-card-date-header">
                                  <label className="upload-card-date-label">
                                    <i className="far fa-calendar-alt text-primary"></i>Date (LA):
                                  </label>
                                  <button
                                    type="button"
                                    className="upload-card-set-date-btn"
                                    onClick={() => handleUpdateBatchFileDate(idx, toLosAngelesDateString(new Date()))}
                                    disabled={isUploading}
                                    title="Assign a date to this photo"
                                  >
                                    <i className="fas fa-calendar-day me-1"></i>Set Date
                                  </button>
                                </div>
                                <div className="upload-card-unknown-box">
                                  <span className="small text-white d-flex align-items-center">
                                    <i className="far fa-calendar-times text-warning me-1"></i>Unknown Date
                                  </span>
                                  <span className="badge bg-secondary" style={{ fontSize: '0.62rem' }}>Unknown-Date</span>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div className="upload-card-date-header">
                                  <label className="upload-card-date-label">
                                    <i className="far fa-calendar-alt text-primary"></i>Date (LA):
                                  </label>
                                  <button
                                    type="button"
                                    className="upload-card-unknown-btn"
                                    onClick={() => handleUpdateBatchFileDate(idx, 'Unknown-Date')}
                                    disabled={isUploading}
                                    title="Mark this photo as having an Unknown Date"
                                  >
                                    Unknown
                                  </button>
                                </div>
                                <input
                                  type="date"
                                  className={`upload-card-date-input ${!item.isOriginalDate ? 'upload-card-date-input-warning' : ''}`}
                                  value={item.date}
                                  onChange={(e) => handleUpdateBatchFileDate(idx, e.target.value)}
                                  disabled={isUploading}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload Status / Progress */}
              {isUploading && uploadProgress && (
                <div className="alert alert-info" role="alert">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <span className="fw-semibold small">
                      <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                      Uploading photos to PiStorage...
                    </span>
                    <span className="fw-bold small ms-2">
                      {uploadProgress.current}/{uploadProgress.total}
                    </span>
                  </div>
                  <div className="progress" style={{ height: '16px', backgroundColor: 'rgba(0,0,0,0.1)' }}>
                    <div
                      className="progress-bar progress-bar-striped progress-bar-animated bg-primary"
                      role="progressbar"
                      style={{
                        width: `${uploadProgress.total > 0 ? Math.min(100, Math.round((uploadProgress.current / uploadProgress.total) * 100)) : 0}%`,
                        transition: 'width 0.3s ease',
                      }}
                      aria-valuenow={uploadProgress.current}
                      aria-valuemin={0}
                      aria-valuemax={uploadProgress.total}
                    ></div>
                  </div>
                </div>
              )}

              {/* Failed Uploads List with Retries */}
              {failedUploads.length > 0 && (
                <div className="failed-uploads-container">
                  <h6 className="text-danger fw-bold mb-2">
                    <i className="fas fa-circle-exclamation me-2"></i>Failed Uploads
                  </h6>
                  <p className="small text-light opacity-75 mb-2">
                    The following photos could not be uploaded (e.g. file size exceeds limit or server rejected file). Click <b>Retry</b> to try again.
                  </p>
                  <div>
                    {failedUploads.map((failedItem) => (
                      <div key={failedItem.id} className="failed-upload-item">
                        <div>
                          <span className="fw-bold text-white">{failedItem.formattedDate}</span>
                          <span className="text-light opacity-75 ms-2 small">({failedItem.file.name})</span>
                          <div className="text-danger small mt-1">{failedItem.reason}</div>
                        </div>
                        <div>
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => handleRetryUpload(failedItem)}
                          >
                            <i className="fas fa-rotate-right me-1"></i>Retry
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                data-mdb-dismiss="modal"
                disabled={isUploading}
              >
                Close
              </button>
              {batchFiles.length > 0 && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setBatchFiles([])}
                  disabled={isUploading}
                >
                  Clear Selection
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={processBatchUpload}
                disabled={batchFiles.length === 0 || isUploading}
              >
                {isUploading ? 'Uploading...' : `Upload ${batchFiles.length} Photo${batchFiles.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Viewing Modal (Lightbox) */}
      {viewingPhotoIndex !== null && photos[viewingPhotoIndex] && (
        <div
          className="content-modal-backdrop"
          onClick={handleCloseContentModal}
        >
          <div
            className="content-modal-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left Media Viewing Area with Centered Navigation Arrows */}
            <div className="content-modal-media-area">
              <button
                type="button"
                className="content-modal-arrow-btn left-arrow"
                onClick={handlePrevPhoto}
                disabled={viewingPhotoIndex <= 0}
                title="Previous media (Left Arrow)"
              >
                <i className="fas fa-chevron-left"></i>
              </button>

              {isVideoFile(photos[viewingPhotoIndex].name) ? (
                <video
                  key={photos[viewingPhotoIndex].url}
                  src={photos[viewingPhotoIndex].url}
                  autoPlay
                  controls
                  loop
                  playsInline
                  className="content-modal-media"
                />
              ) : (
                <img
                  key={photos[viewingPhotoIndex].url}
                  src={photos[viewingPhotoIndex].url}
                  alt={photos[viewingPhotoIndex].name}
                  className="content-modal-media"
                />
              )}

              <button
                type="button"
                className="content-modal-arrow-btn right-arrow"
                onClick={handleNextPhoto}
                disabled={viewingPhotoIndex >= photos.length - 1}
                title="Next media (Right Arrow)"
              >
                <i className="fas fa-chevron-right"></i>
              </button>

              {/* Hidden DOM preloader for 3 medias in either direction (6 total) */}
              <div style={{ display: 'none' }} aria-hidden="true">
                {[-3, -2, -1, 1, 2, 3].map((offset) => {
                  const targetIdx = viewingPhotoIndex + offset;
                  if (targetIdx < 0 || targetIdx >= photos.length) return null;
                  const media = photos[targetIdx];
                  if (!media || !media.url) return null;

                  if (isVideoFile(media.name)) {
                    return (
                      <video
                        key={`preload-video-${media.url}`}
                        src={media.url}
                        preload="auto"
                        muted
                        playsInline
                      />
                    );
                  }
                  return (
                    <img
                      key={`preload-img-${media.url}`}
                      src={media.url}
                      alt=""
                      loading="eager"
                    />
                  );
                })}
              </div>
            </div>

            {/* Right Sidebar Section */}
            <div className="content-modal-sidebar">
              <div>
                <div className="content-modal-sidebar-header">
                  <div className="content-modal-date-display">
                    {formatDateOrdinal(photos[viewingPhotoIndex].date)}
                  </div>
                  <button
                    type="button"
                    className="content-modal-close-btn"
                    onClick={handleCloseContentModal}
                    title="Close (Esc)"
                  >
                    <i className="fas fa-xmark"></i>
                  </button>
                </div>

                <div className="content-modal-actions-list">
                  {existingEntryDates.has(photos[viewingPhotoIndex].date) ? (
                    <button
                      type="button"
                      className="content-modal-action-item"
                      onClick={() => {
                        const date = photos[viewingPhotoIndex].date;
                        handleCloseContentModal();
                        handleViewJournalEntry(date);
                      }}
                    >
                      <i className="fas fa-book-open"></i>
                      <span>View written entry</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="content-modal-action-item disabled"
                      disabled
                      title="No written entry exists for this date"
                    >
                      <i className="fas fa-book-open"></i>
                      <span>No written entry exists</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="content-modal-action-item"
                    onClick={() => window.open(photos[viewingPhotoIndex].url, '_blank')}
                  >
                    <i className="fas fa-arrow-up-right-from-square"></i>
                    <span>Open in new tab</span>
                  </button>

                  <button
                    type="button"
                    className="content-modal-action-item"
                    onClick={() => handleModalCopyImage(photos[viewingPhotoIndex])}
                    disabled={isCopyingImage}
                  >
                    {modalTooltip === 'copyImage' && (
                      <span className="copied-tooltip">Copied!</span>
                    )}
                    <i className={isCopyingImage ? "fas fa-spinner fa-spin" : "fas fa-copy"}></i>
                    <span>Copy image</span>
                  </button>

                  <button
                    type="button"
                    className="content-modal-action-item"
                    onClick={() => handleModalCopyUrl(photos[viewingPhotoIndex])}
                  >
                    {modalTooltip === 'copyUrl' && (
                      <span className="copied-tooltip">Copied!</span>
                    )}
                    <i className="fas fa-link"></i>
                    <span>Copy image URL</span>
                  </button>

                  <button
                    type="button"
                    className="content-modal-action-item"
                    onClick={() => handleOpenShortUrlModal(photos[viewingPhotoIndex])}
                  >
                    <i className="fas fa-share-nodes"></i>
                    <span>Copy short URL</span>
                  </button>

                  <button
                    type="button"
                    className="content-modal-action-item"
                    onClick={async () => {
                      const photo = photos[viewingPhotoIndex];
                      const res = await fetch(photo.url);
                      const blob = await res.blob();
                      fileDownload(blob, photo.name);
                    }}
                  >
                    <i className="fas fa-download"></i>
                    <span>Download</span>
                  </button>

                  <button
                    type="button"
                    className="content-modal-action-item change-date-action"
                    onClick={() => handleOpenChangeDateModal(photos[viewingPhotoIndex])}
                  >
                    <i className="far fa-calendar-alt"></i>
                    <span>Change date</span>
                  </button>

                  <button
                    type="button"
                    className="content-modal-action-item delete-action"
                    onClick={() => handleDeleteMemory(photos[viewingPhotoIndex])}
                  >
                    <i className="fas fa-trash-can"></i>
                    <span>Delete memory</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Copy Short URL Modal */}
      <ShortUrlModal
        isOpen={shortUrlModalOpen}
        isLoading={isGeneratingShortUrl}
        shortUrl={shortUrlData?.shortUrl ?? null}
        destinationUrl={shortUrlData?.destinationUrl ?? null}
        error={shortUrlError}
        onClose={() => setShortUrlModalOpen(false)}
        successSubtitle="7-day short link generated & copied to clipboard:"
        errorSubtitle="Short URL generation failed. Full image URL copied to clipboard:"
        destinationLabel="DESTINATION SIGNED URL"
        destinationFallbackLabel="FULL IMAGE URL"
        destinationExpiryText="Expires in 1 week"
      />

      {/* Upload Success Modal */}
      <UploadSuccessModal
        isOpen={uploadSuccessModalOpen}
        onClose={() => setUploadSuccessModalOpen(false)}
        title="Successfully Uploaded"
        message={uploadSuccessMessage}
      />

      {/* Change Date Modal */}
      <ChangeDateModal
        isOpen={changeDateModalOpen}
        photoName={changeDatePhoto?.name ?? null}
        currentDate={changeDatePhoto?.date ?? null}
        onClose={() => {
          setChangeDateModalOpen(false);
          setChangeDatePhoto(null);
        }}
        onConfirm={handleConfirmChangeDate}
      />
    </div>
  );
};

export default Memories;
