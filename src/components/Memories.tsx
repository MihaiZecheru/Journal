import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Modal } from 'mdb-ui-kit';
import supabase from '../database/config/supabase';
import { GetUserID } from '../database/GetUser';
import fileDownload from 'js-file-download';
import { getPhotoDate, formatDateOrdinal } from '../utils/exifUtils';
import { piStorage, PISTORAGE_CONSTRAINTS } from '../lib/pistorage';
import { createBebShortUrl } from '../lib/beb';
import Entry from '../database/Entry';
import '../styles/memories.css';

interface MemoryPhoto {
  name: string;
  url: string; // Full-resolution actual image URL
  thumbnail_url: string; // Fast WebP thumbnail URL
  date: string;
  relativePath?: string;
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

  const parsedInitialMode: 'month' | 'year' =
    initialModeParam === 'year' || initialModeParam === 'month' ? initialModeParam : 'month';

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

  // View Mode: 'month' | 'year'
  const [viewMode, setViewMode] = useState<'month' | 'year'>(parsedInitialMode);

  // Indexed Memory Dates
  const [availableMonths, setAvailableMonths] = useState<AvailableMonth[]>([]);
  const [availableYears, setAvailableYears] = useState<AvailableYear[]>([]);
  const [indexLoaded, setIndexLoaded] = useState<boolean>(false);

  // Active Selection
  const [currentMonth, setCurrentMonth] = useState<number>(parsedInitialMonth);
  const [currentYear, setCurrentYear] = useState<number>(parsedInitialYear);

  // Keep URL query parameters in sync with active view settings
  useEffect(() => {
    const newParams = new URLSearchParams();
    newParams.set('mode', viewMode);
    newParams.set('year', String(currentYear));
    if (viewMode === 'month') {
      newParams.set('month', MONTH_NAMES[currentMonth].toLowerCase());
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

  // Date Picker Modal Ref
  const datePickerModalRef = useRef<HTMLDivElement>(null);

  // Bulk Upload Modal State
  const uploadModalRef = useRef<HTMLDivElement>(null);
  const [batchFiles, setBatchFiles] = useState<{ file: File; date: string; previewUrl: string }[]>([]);
  const [failedUploads, setFailedUploads] = useState<FailedUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');

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
      if (!dateFolders.length) {
        setAvailableMonths([]);
        setAvailableYears([]);
        setIndexLoaded(true);
        return;
      }

      const monthCounts: Record<string, { year: number; month: number; count: number }> = {};
      const yearCounts: Record<number, number> = {};

      for (const folder of dateFolders) {
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

      if (monthsList.length > 0) {
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
      cacheKey = viewMode === 'month'
        ? `journal_memories_cache_${userID}_month_${currentYear}_${currentMonth}`
        : `journal_memories_cache_${userID}_year_${currentYear}`;

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

      if (!isMounted.current || fetchId !== currentFetchId.current) return;

      // Sort photos chronologically by date and filename
      allPhotos.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

      setPhotos(allPhotos);
      sessionStorage.setItem(cacheKey, JSON.stringify({ photos: allPhotos, timestamp: Date.now() }));
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

  // Context Menu Action: Send to Friend
  const handleSendToFriend = async (photo: MemoryPhoto) => {
    setContextMenu({ visible: false, x: 0, y: 0, photo: null });
    try {
      // Generate a short URL with a random 9-digit hexadecimal alias pointing to the image URL
      let shareUrl = photo.url;
      try {
        const bebRes = await createBebShortUrl(photo.url);
        shareUrl = bebRes.shortUrl;
      } catch (shortErr) {
        console.warn('Could not generate Beb short link, falling back to full image URL:', shortErr);
      }

      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Journal Memory Photo',
            text: `Check out this memory photo from ${formatDateOrdinal(photo.date)}!`,
            url: shareUrl,
          });
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          console.warn('Native share error:', err);
        }
      }

      await navigator.clipboard.writeText(shareUrl);
      alert(`Shortened photo link (${shareUrl}) copied to clipboard! You can now send it to a friend.`);
    } catch (e: any) {
      alert('Could not share photo link: ' + (e.message || e));
    }
  };

  // Context Menu Action: Delete Memory
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
      await refreshMemoryIndex();
    } catch (err: any) {
      console.error('Error deleting memory:', err);
      alert('Failed to delete memory: ' + (err.message || 'Unknown error'));
    }
  };

  // Bulk Upload File Selection
  const handleBatchFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const filesArr = Array.from(e.target.files);
    const parsedList: { file: File; date: string; previewUrl: string }[] = [];

    for (const file of filesArr) {
      const date = await getPhotoDate(file);
      const previewUrl = URL.createObjectURL(file);
      parsedList.push({ file, date, previewUrl });
    }

    setBatchFiles((prev) => [...prev, ...parsedList]);
    e.target.value = '';
  };

  // Process Bulk Upload
  const processBatchUpload = async () => {
    if (batchFiles.length === 0) return;
    setIsUploading(true);
    setUploadStatus('Checking journal entries for photo dates...');

    try {
      const userID = await GetUserID();
      const uniqueDates = Array.from(new Set(batchFiles.map((b) => b.date)));

      const { data: existingEntries, error: entryErr } = await supabase
        .from('Entries')
        .select('date')
        .eq('user_id', userID)
        .in('date', uniqueDates);

      if (entryErr) {
        alert('Could not verify journal entries. Please try again.');
        setIsUploading(false);
        return;
      }

      const validDatesSet = new Set((existingEntries || []).map((e: any) => e.date));

      const filesToUpload: { file: File; date: string }[] = [];
      const newFailedUploads: FailedUploadItem[] = [];

      batchFiles.forEach((item) => {
        if (!validDatesSet.has(item.date)) {
          newFailedUploads.push({
            id: Math.random().toString(36).substring(2, 9),
            file: item.file,
            date: item.date,
            formattedDate: formatDateOrdinal(item.date),
            reason: 'No journal entry exists for this day',
          });
        } else if (item.file.size > PISTORAGE_CONSTRAINTS.MAX_IMAGE_SIZE_BYTES) {
          const sizeMB = (item.file.size / (1024 * 1024)).toFixed(1);
          newFailedUploads.push({
            id: Math.random().toString(36).substring(2, 9),
            file: item.file,
            date: item.date,
            formattedDate: formatDateOrdinal(item.date),
            reason: `Image is ${sizeMB} MB (exceeds ${PISTORAGE_CONSTRAINTS.MAX_IMAGE_SIZE_MB} MB limit). Please compress first.`,
          });
        } else {
          filesToUpload.push({ file: item.file, date: item.date });
        }
      });

      let uploadedSuccessCount = 0;

      if (filesToUpload.length > 0) {
        const grouped: Record<string, File[]> = {};
        filesToUpload.forEach((item) => {
          if (!grouped[item.date]) grouped[item.date] = [];
          grouped[item.date].push(item.file);
        });

        const datesArr = Object.keys(grouped);
        for (const date of datesArr) {
          const filesForDate = grouped[date];
          const targetFolder = `${piStorage.defaultFolder}/${userID}/${date}`;

          setUploadStatus(
            `Uploading ${filesForDate.length} photo(s) to PiStorage (${date})...`
          );

          try {
            const uploadRes = await piStorage.uploadFiles(targetFolder, filesForDate);
            uploadedSuccessCount += uploadRes.uploadedCount || 0;

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
          }
        }
      }

      clearMemoriesCache();
      setFailedUploads((prev) => [...prev, ...newFailedUploads]);
      setBatchFiles([]);
      setIsUploading(false);
      setUploadStatus('');

      await refreshMemoryIndex();
      fetchPhotos();

      if (filesToUpload.length > 0 && newFailedUploads.length === 0) {
        alert(`Successfully uploaded ${uploadedSuccessCount} memory photo(s)!`);
        const closeBtn = uploadModalRef.current?.querySelector(
          'button[data-mdb-dismiss="modal"]'
        ) as HTMLButtonElement;
        if (closeBtn) closeBtn.click();
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

      const { data: entryData, error: entryErr } = await supabase
        .from('Entries')
        .select('date')
        .eq('user_id', userID)
        .eq('date', failedItem.date)
        .maybeSingle();

      if (entryErr || !entryData) {
        alert(
          `Still no journal entry found for ${failedItem.formattedDate}. Please write an entry for this day first before retrying!`
        );
        return;
      }

      if (failedItem.file.size > PISTORAGE_CONSTRAINTS.MAX_IMAGE_SIZE_BYTES) {
        const sizeMB = (failedItem.file.size / (1024 * 1024)).toFixed(1);
        alert(`This image (${sizeMB} MB) exceeds the ${PISTORAGE_CONSTRAINTS.MAX_IMAGE_SIZE_MB} MB limit. Please compress it before retrying.`);
        return;
      }

      const targetFolder = `${piStorage.defaultFolder}/${userID}/${failedItem.date}`;
      const uploadRes = await piStorage.uploadFiles(targetFolder, [failedItem.file]);

      if (uploadRes.failed && uploadRes.failed.length > 0) {
        alert(`Upload failed: ${uploadRes.failed[0].error}`);
        return;
      }

      clearMemoriesCache();
      setFailedUploads((prev) => prev.filter((item) => item.id !== failedItem.id));
      alert(`Successfully uploaded memory for ${failedItem.formattedDate}!`);

      await refreshMemoryIndex();
      fetchPhotos();
    } catch (err: any) {
      alert(`Retry failed: ${err.message || err}`);
    }
  };

  const headerTitle =
    viewMode === 'month'
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
            <i className="fas fa-arrow-left"></i>Back to Home
          </button>

          <select
            className="memories-view-select"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as 'month' | 'year')}
          >
            <option value="month">View by Month</option>
            <option value="year">View by Year</option>
          </select>
        </div>

        <div className="memories-header-center">
          <div className="month-navigator">
            <button
              type="button"
              className="month-arrow-btn"
              onClick={handlePrev}
              disabled={!canPrev}
              title={canPrev ? 'Previous Date with Memories' : 'No earlier dates with memories'}
            >
              <i className="fas fa-chevron-left"></i>
            </button>

            <h3
              className="month-title-clickable"
              onClick={() => {
                if (datePickerModalRef.current) {
                  new Modal(datePickerModalRef.current).show();
                }
              }}
              title="Click to select date with memories"
            >
              {headerTitle}
            </h3>

            <button
              type="button"
              className="month-arrow-btn"
              onClick={handleNext}
              disabled={!canNext}
              title={canNext ? 'Next Date with Memories' : 'No later dates with memories'}
            >
              <i className="fas fa-chevron-right"></i>
            </button>
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
      {!loading && availableMonths.length === 0 && (
        <div className="memories-empty-state">
          <i className="fas fa-images fa-4x"></i>
          <h4>No memories found</h4>
          <p>You haven't uploaded any memories yet. Use the "Upload Memories" button above to add your first photos!</p>
        </div>
      )}

      {/* Period Empty State */}
      {!loading && availableMonths.length > 0 && photos.length === 0 && (
        <div className="memories-empty-state">
          <i className="fas fa-images fa-4x"></i>
          <h4>No memories found for {headerTitle}</h4>
          <p>Use the "Upload Memories" button above to add photos for this date!</p>
        </div>
      )}

      {/* Memory Photo Grid */}
      {!loading && photos.length > 0 && (
        <div className="memories-grid">
          {photos.map((photo, idx) => (
            <div
              key={idx}
              className="memory-card"
              onClick={() => window.open(photo.url, '_blank')}
              onContextMenu={(e) => handleContextMenu(e, photo)}
              style={{ cursor: 'pointer' }}
              title={`Click to view full image (${photo.name})`}
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
            {/* Group 1: Open & View */}
            <li onClick={() => window.open(contextMenu.photo!.url, '_blank')}>
              <i className="fas fa-arrow-up-right-from-square"></i>Open in new tab
            </li>
            <li onClick={() => handleViewJournalEntry(contextMenu.photo!.date)}>
              <i className="fas fa-book-open"></i>View journal entry
            </li>

            {/* Group 2: Copy & Export */}
            <li className="menu-divider-top" onClick={() => handleCopyImage(contextMenu.photo!)}>
              <i className="fas fa-copy"></i>Copy image
            </li>
            <li onClick={() => handleCopyUrl(contextMenu.photo!)}>
              <i className="fas fa-link"></i>Copy URL
            </li>
            <li
              onClick={async () => {
                const res = await fetch(contextMenu.photo!.url);
                const blob = await res.blob();
                fileDownload(blob, contextMenu.photo!.name);
              }}
            >
              <i className="fas fa-download"></i>Download
            </li>

            {/* Group 3: Share */}
            <li className="menu-divider-top" onClick={() => handleSendToFriend(contextMenu.photo!)}>
              <i className="fas fa-paper-plane"></i>Send to friend
            </li>

            {/* Group 4: Destructive */}
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
            <div className="modal-body">
              <p className="text-light opacity-75 small mb-3">
                Select or drop photos below. Photos will be read for EXIF dates and added to that day's Memories section. Note: Photos require an existing journal entry for that date.
              </p>

              {/* High-Contrast Dropzone */}
              <div
                className="upload-memories-dropzone p-4 text-center border mb-3"
                style={{ cursor: 'pointer' }}
                onClick={() => document.getElementById('memories-file-input')?.click()}
              >
                <i className="fas fa-images fa-3x"></i>
                <h5>Click or drag & drop photos here</h5>
                <span className="dropzone-subtitle">Supports JPEG, PNG, HEIC, WebP (max 2 MB per image, uploaded in batches of 5)</span>
                <input
                  type="file"
                  id="memories-file-input"
                  multiple
                  accept="image/*"
                  className="d-none"
                  onChange={handleBatchFileSelect}
                />
              </div>

              {/* Batch Files Preview */}
              {batchFiles.length > 0 && (
                <div className="mb-3">
                  <h6 className="text-light">Selected Photos ({batchFiles.length}):</h6>
                  <div
                    className="d-flex flex-wrap gap-2 p-2 border rounded bg-dark"
                    style={{ maxHeight: '200px', overflowY: 'auto' }}
                  >
                    {batchFiles.map((item, idx) => (
                      <div
                        key={idx}
                        className="position-relative border rounded p-1 bg-secondary"
                        style={{ width: '100px' }}
                      >
                        <img
                          src={item.previewUrl}
                          alt="preview"
                          className="w-100 rounded"
                          style={{ height: '70px', objectFit: 'cover' }}
                        />
                        <div
                          className="small text-truncate text-center mt-1 fw-bold text-white"
                          title={formatDateOrdinal(item.date)}
                        >
                          {item.date}
                        </div>
                        <button
                          type="button"
                          className="btn-close position-absolute top-0 end-0 bg-white rounded-circle p-1"
                          aria-label="Remove"
                          onClick={() => setBatchFiles(batchFiles.filter((_, i) => i !== idx))}
                        ></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload Status / Progress */}
              {isUploading && (
                <div className="alert alert-info text-center" role="alert">
                  <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                  {uploadStatus}
                </div>
              )}

              {/* Failed Uploads List with Retries */}
              {failedUploads.length > 0 && (
                <div className="failed-uploads-container">
                  <h6 className="text-danger fw-bold mb-2">
                    <i className="fas fa-circle-exclamation me-2"></i>Failed Uploads (No entry exists for this day)
                  </h6>
                  <p className="small text-light opacity-75 mb-2">
                    The following photos were not uploaded because no journal entry was written for that day. Write an entry for the date and click <b>Retry</b>.
                  </p>
                  <div>
                    {failedUploads.map((failedItem) => (
                      <div key={failedItem.id} className="failed-upload-item">
                        <div>
                          <span className="fw-bold text-white">{failedItem.formattedDate}</span>
                          <span className="text-light opacity-75 ms-2 small">({failedItem.file.name})</span>
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
    </div>
  );
};

export default Memories;
