import React, { useEffect, useRef } from 'react';
import '../styles/upload-success-modal.css';

export interface UploadSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  submessage?: string;
}

export const UploadSuccessModal: React.FC<UploadSuccessModalProps> = ({
  isOpen,
  onClose,
  title = 'Successfully Uploaded',
  message,
  submessage,
}) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  // Focus close button when modal opens for quick keyboard dismissal (Enter/Space)
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        closeBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="upload-success-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-success-title"
    >
      <div
        className="upload-success-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top-Right Close Button (X) */}
        <button
          type="button"
          className="upload-success-close-x"
          onClick={onClose}
          aria-label="Close modal"
          title="Close"
        >
          <i className="fas fa-xmark"></i>
        </button>

        {/* Success Icon Badge */}
        <div className="upload-success-badge">
          <div className="upload-success-badge-inner">
            <i className="fas fa-check"></i>
          </div>
        </div>

        {/* Modal Content */}
        <div className="upload-success-content">
          <h3 id="upload-success-title" className="upload-success-title">
            {title}
          </h3>
          {message && <p className="upload-success-message">{message}</p>}
          {submessage && <p className="upload-success-submessage">{submessage}</p>}
        </div>

        {/* Modal Footer with Close Button */}
        <div className="upload-success-footer">
          <button
            type="button"
            ref={closeBtnRef}
            className="upload-success-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadSuccessModal;
