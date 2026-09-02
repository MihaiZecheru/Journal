import React, { useState, useEffect, useRef } from 'react';
import { formatDateOrdinal, toLosAngelesDateString } from '../utils/exifUtils';
import '../styles/change-date-modal.css';

export interface ChangeDateModalProps {
  isOpen: boolean;
  photoName: string | null;
  currentDate: string | null;
  onClose: () => void;
  onConfirm: (newDate: string) => Promise<void>;
}

export const ChangeDateModal: React.FC<ChangeDateModalProps> = ({
  isOpen,
  photoName,
  currentDate,
  onClose,
  onConfirm,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsSubmitting(false);
      // Pre-fill selected date from currentDate if valid YYYY-MM-DD, or fallback to today in LA time
      if (currentDate && /^\d{4}-\d{2}-\d{2}$/.test(currentDate)) {
        setSelectedDate(currentDate);
      } else {
        setSelectedDate(toLosAngelesDateString(new Date()));
      }
      // Auto focus date input
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    }
  }, [isOpen, currentDate]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const formattedDateDisplay = selectedDate ? formatDateOrdinal(selectedDate) : '';

  const handleConfirmAction = async () => {
    if (!selectedDate || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(selectedDate);
    } catch (err: any) {
      console.error('Error changing date:', err);
      setError(err.message || 'Failed to move file to new date folder.');
      setIsSubmitting(false);
    }
  };

  const handleKeyDownInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmAction();
    }
  };

  return (
    <div
      className="change-date-modal-backdrop"
      onClick={!isSubmitting ? onClose : undefined}
    >
      <div
        className="change-date-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="change-date-header">
          <div className="change-date-icon-circle">
            <i className="far fa-calendar-alt"></i>
          </div>
          <div>
            <h4 className="change-date-title">Change Memory Date</h4>
            {photoName && (
              <p className="change-date-subtitle" title={photoName}>
                {photoName}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="change-date-error-alert">
            <i className="fas fa-circle-exclamation me-2"></i>
            <span>{error}</span>
          </div>
        )}

        <div className="change-date-body">
          <label className="change-date-label">
            Select New Date:
          </label>
          <input
            ref={inputRef}
            type="date"
            className="change-date-input"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            onKeyDown={handleKeyDownInput}
            disabled={isSubmitting}
          />

          {formattedDateDisplay && (
            <div className="change-date-formatted-preview">
              <i className="far fa-calendar-check me-2 text-primary"></i>
              <span className="formatted-date-text">{formattedDateDisplay}</span>
            </div>
          )}
        </div>

        <div className="change-date-footer">
          <button
            type="button"
            className="change-date-cancel-btn"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="change-date-confirm-btn"
            onClick={handleConfirmAction}
            disabled={!selectedDate || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <i className="fas fa-spinner fa-spin me-2"></i>Moving...
              </>
            ) : (
              <>
                <i className="fas fa-check me-2"></i>Confirm
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangeDateModal;
