import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from 'mdb-ui-kit';
import supabase from '../database/config/supabase';
import { GetUserID } from '../database/GetUser';
import fileDownload from 'js-file-download';
import { getPhotoDate, formatDateOrdinal, generateMemoriesFileName } from '../utils/exifUtils';
import Entry from '../database/Entry';
import '../styles/memories.css';

interface MemoryPhoto {
  name: string;
  url: string;
  date: string;
}

interface FailedUploadItem {
  id: string;
  file: File;
  date: string;
  formattedDate: string;
  reason: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const Memories: React.FC = () => {
  const navigate = useNavigate();

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth());
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());

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

  // Bulk Upload Modal State
  const uploadModalRef = useRef<HTMLDivElement>(null);
  const [batchFiles, setBatchFiles] = useState<{ file: File; date: string; previewUrl: string }[]>([]);
  const [failedUploads, setFailedUploads] = useState<FailedUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  // Close context menu on any document click
  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu.visible) {
        setContextMenu({ visible: false, x: 0, y: 0, photo: null });
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [contextMenu.visible]);

  // Fetch photos for the selected month
  const fetchMonthPhotos = async (month: number, year: number) => {
    setLoading(true);
    try {
      const userID = await GetUserID();
      const monthStr = String(month + 1).padStart(2, '0');
      const datePrefix = `${year}-${monthStr}-`;

      // List all date subfolders for this user
      const { data: dateFolders, error: listError } = await supabase.storage
        .from('Memories')
        .list(userID, { limit: 10000 });

      if (listError) {
        console.error('Error listing memory date folders:', listError);
        setPhotos([]);
        setLoading(false);
        return;
      }

      // Filter folders matching the selected year and month prefix
      const matchingFolders = (dateFolders || []).filter((folder) =>
        folder.name.startsWith(datePrefix)
      );

      const allPhotoPaths: { name: string; date: string; path: string }[] = [];

      for (const folder of matchingFolders) {
        const { data: filesInFolder, error: filesErr } = await supabase.storage
          .from('Memories')
          .list(`${userID}/${folder.name}`, { limit: 10000 });

        if (filesErr) continue;

        if (filesInFolder) {
          filesInFolder.forEach((file) => {
            if (file.name && !file.name.startsWith('.')) {
              allPhotoPaths.push({
                name: file.name,
                date: folder.name,
                path: `${userID}/${folder.name}/${file.name}`,
              });
            }
          });
        }
      }

      if (allPhotoPaths.length === 0) {
        setPhotos([]);
      } else {
        const { data: signedUrls, error: urlErr } = await supabase.storage
          .from('Memories')
          .createSignedUrls(
            allPhotoPaths.map((p) => p.path),
            3600 * 24 * 7
          );

        if (urlErr) {
          console.error('Error getting signed URLs:', urlErr);
          setPhotos([]);
        } else {
          const loadedPhotos: MemoryPhoto[] = signedUrls.map((res, idx) => ({
            name: allPhotoPaths[idx].name,
            url: res.signedUrl,
            date: allPhotoPaths[idx].date,
          }));
          setPhotos(loadedPhotos);
        }
      }
    } catch (err) {
      console.error('Error fetching month photos:', err);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthPhotos(currentMonth, currentYear);
  }, [currentMonth, currentYear]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
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

  // Context Menu Option: View Journal Entry
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
        console.error('Error fetching entry:', error);
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

  // Process Bulk Upload (with Entry Existence Validation)
  const processBatchUpload = async () => {
    if (batchFiles.length === 0) return;
    setIsUploading(true);
    setUploadStatus('Checking journal entries for photo dates...');

    try {
      const userID = await GetUserID();
      const uniqueDates = Array.from(new Set(batchFiles.map((b) => b.date)));

      // Query database to check which dates have entries
      const { data: existingEntries, error: entryErr } = await supabase
        .from('Entries')
        .select('date')
        .eq('user_id', userID)
        .in('date', uniqueDates);

      if (entryErr) {
        console.error('Error verifying journal entries:', entryErr);
        alert('Could not verify journal entries. Please try again.');
        setIsUploading(false);
        return;
      }

      const validDatesSet = new Set((existingEntries || []).map((e: any) => e.date));

      const filesToUpload: { file: File; date: string }[] = [];
      const newFailedUploads: FailedUploadItem[] = [];

      batchFiles.forEach((item) => {
        if (validDatesSet.has(item.date)) {
          filesToUpload.push({ file: item.file, date: item.date });
        } else {
          newFailedUploads.push({
            id: Math.random().toString(36).substring(2, 9),
            file: item.file,
            date: item.date,
            formattedDate: formatDateOrdinal(item.date),
            reason: 'No journal entry exists for this day',
          });
        }
      });

      let uploadedSuccessCount = 0;

      if (filesToUpload.length > 0) {
        // Group files to upload by date
        const grouped: Record<string, File[]> = {};
        filesToUpload.forEach((item) => {
          if (!grouped[item.date]) grouped[item.date] = [];
          grouped[item.date].push(item.file);
        });

        const datesArr = Object.keys(grouped);
        for (const date of datesArr) {
          const filesForDate = grouped[date];

          // Check existing file count for numbering format
          const { data: existingFiles } = await supabase.storage
            .from('Memories')
            .list(`${userID}/${date}`, { limit: 10000 });

          const existingCount = existingFiles ? existingFiles.length : 0;

          for (let j = 0; j < filesForDate.length; j++) {
            const file = filesForDate[j];
            const customName = generateMemoriesFileName(
              userID,
              date,
              existingCount,
              j + 1,
              file.name
            );

            setUploadStatus(
              `Uploading photo ${uploadedSuccessCount + 1}/${filesToUpload.length} (${date})...`
            );

            const { error: uploadErr } = await supabase.storage
              .from('Memories')
              .upload(`${userID}/${date}/${customName}`, file, { upsert: true });

            if (uploadErr) {
              console.error('Error uploading file:', uploadErr);
            } else {
              uploadedSuccessCount++;
            }
          }
        }
      }

      setFailedUploads((prev) => [...prev, ...newFailedUploads]);
      setBatchFiles([]);
      setIsUploading(false);
      setUploadStatus('');

      // Refresh memory photo grid
      fetchMonthPhotos(currentMonth, currentYear);

      if (filesToUpload.length > 0 && newFailedUploads.length === 0) {
        alert(`Successfully uploaded ${uploadedSuccessCount} memory photo(s)!`);
        const closeBtn = uploadModalRef.current?.querySelector(
          'button[data-mdb-dismiss="modal"]'
        ) as HTMLButtonElement;
        if (closeBtn) closeBtn.click();
      }
    } catch (err: any) {
      console.error('Error during batch upload:', err);
      alert(`Upload failed: ${err.message || err}`);
      setIsUploading(false);
    }
  };

  // Retry Uploading a Single Failed Item
  const handleRetryUpload = async (failedItem: FailedUploadItem) => {
    try {
      const userID = await GetUserID();

      // Check if entry now exists for this date
      const { data: entryData, error: entryErr } = await supabase
        .from('Entries')
        .select('date')
        .eq('user_id', userID)
        .eq('date', failedItem.date)
        .maybeSingle();

      if (entryErr) {
        console.error('Error checking entry on retry:', entryErr);
        alert('Could not verify entry.');
        return;
      }

      if (!entryData) {
        alert(
          `Still no journal entry found for ${failedItem.formattedDate}. Please write an entry for this day first before retrying!`
        );
        return;
      }

      // Entry exists! Upload the file
      const { data: existingFiles } = await supabase.storage
        .from('Memories')
        .list(`${userID}/${failedItem.date}`, { limit: 10000 });

      const existingCount = existingFiles ? existingFiles.length : 0;
      const customName = generateMemoriesFileName(
        userID,
        failedItem.date,
        existingCount,
        1,
        failedItem.file.name
      );

      const { error: uploadErr } = await supabase.storage
        .from('Memories')
        .upload(`${userID}/${failedItem.date}/${customName}`, failedItem.file, {
          upsert: true,
        });

      if (uploadErr) {
        alert(`Upload failed: ${uploadErr.message}`);
        return;
      }

      // Remove from failed list
      setFailedUploads((prev) => prev.filter((item) => item.id !== failedItem.id));
      alert(`Successfully uploaded memory for ${failedItem.formattedDate}!`);

      // Refresh memory photo grid
      fetchMonthPhotos(currentMonth, currentYear);
    } catch (err: any) {
      console.error('Error retrying upload:', err);
      alert(`Retry failed: ${err.message || err}`);
    }
  };

  return (
    <div className="memories-container">
      {/* Header Bar */}
      <div className="memories-header">
        <div className="d-flex align-items-center gap-3">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/home')}
          >
            <i className="fas fa-arrow-left me-2"></i>Back to Journal
          </button>
          <h2 className="m-0 fw-bold">Memories Collection</h2>
        </div>

        {/* Month Navigator */}
        <div className="month-navigator">
          <button
            type="button"
            className="btn btn-outline-secondary btn-floating"
            onClick={handlePrevMonth}
            title="Previous Month"
          >
            <i className="fas fa-chevron-left"></i>
          </button>
          <h3>{`${MONTH_NAMES[currentMonth]} ${currentYear}`}</h3>
          <button
            type="button"
            className="btn btn-outline-secondary btn-floating"
            onClick={handleNextMonth}
            title="Next Month"
          >
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>

        <div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (uploadModalRef.current) new Modal(uploadModalRef.current).show();
            }}
          >
            <i className="fas fa-cloud-arrow-up me-2"></i>Upload Memories
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
          <p className="mt-2 text-muted">Loading memories for {MONTH_NAMES[currentMonth]} {currentYear}...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && photos.length === 0 && (
        <div className="text-center py-5 my-4 border rounded bg-white">
          <i className="fas fa-images fa-4x text-muted mb-3"></i>
          <h4>No memories found for {MONTH_NAMES[currentMonth]} {currentYear}</h4>
          <p className="text-muted">Use the "Upload Memories" button above to add photos for this month!</p>
        </div>
      )}

      {/* Memory Photo Grid */}
      {!loading && photos.length > 0 && (
        <div className="memories-grid">
          {photos.map((photo, idx) => (
            <div
              key={idx}
              className="memory-card"
              onContextMenu={(e) => handleContextMenu(e, photo)}
            >
              <img src={photo.url} alt={photo.name} />
              <div className="memory-card-date">
                {formatDateOrdinal(photo.date)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Right-Click Context Menu */}
      {contextMenu.visible && contextMenu.photo && (
        <div
          className="custom-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <ul>
            <li onClick={() => window.open(contextMenu.photo!.url, '_blank')}>
              <i className="fas fa-arrow-up-right-from-square me-2"></i>Open in new tab
            </li>
            <li
              onClick={async () => {
                const res = await fetch(contextMenu.photo!.url);
                const blob = await res.blob();
                fileDownload(blob, contextMenu.photo!.name);
              }}
            >
              <i className="fas fa-download me-2"></i>Download
            </li>
            <li onClick={() => handleViewJournalEntry(contextMenu.photo!.date)}>
              <i className="fas fa-book-open me-2"></i>View journal entry
            </li>
          </ul>
        </div>
      )}

      {/* View Entry Modal */}
      <div
        className="modal fade"
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
                  <div className="p-3 bg-light rounded border mb-3">
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
        className="modal fade modal-lg"
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
              <p className="text-muted small mb-3">
                Select or drop photos below. Photos will be read for EXIF dates and added to that day's Memories section. Note: Photos require an existing journal entry for that date.
              </p>

              {/* High-Contrast Dropzone */}
              <div
                className="upload-memories-dropzone p-4 text-center border mb-3"
                style={{ cursor: 'pointer' }}
                onClick={() => document.getElementById('memories-file-input')?.click()}
              >
                <i className="fas fa-images fa-3x mb-2 text-primary"></i>
                <h5>Click or drag & drop photos here</h5>
                <span className="dropzone-subtitle">Supports JPEG, PNG, HEIC, WebP</span>
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
                  <h6>Selected Photos ({batchFiles.length}):</h6>
                  <div
                    className="d-flex flex-wrap gap-2 p-2 border rounded bg-light"
                    style={{ maxHeight: '200px', overflowY: 'auto' }}
                  >
                    {batchFiles.map((item, idx) => (
                      <div
                        key={idx}
                        className="position-relative border rounded p-1 bg-white"
                        style={{ width: '100px' }}
                      >
                        <img
                          src={item.previewUrl}
                          alt="preview"
                          className="w-100 rounded"
                          style={{ height: '70px', objectFit: 'cover' }}
                        />
                        <div
                          className="small text-truncate text-center mt-1 fw-bold text-primary"
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
                  <p className="small text-muted mb-2">
                    The following photos were not uploaded because no journal entry was written for that day. Write an entry for the date and click <b>Retry</b>.
                  </p>
                  <div>
                    {failedUploads.map((failedItem) => (
                      <div key={failedItem.id} className="failed-upload-item">
                        <div>
                          <span className="fw-bold text-dark">{failedItem.formattedDate}</span>
                          <span className="text-muted ms-2 small">({failedItem.file.name})</span>
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
