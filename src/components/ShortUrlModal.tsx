import React, { useState, useRef, useEffect } from 'react';
import '../styles/short-url-modal.css';

export interface ShortUrlModalProps {
  isOpen: boolean;
  isLoading: boolean;
  shortUrl: string | null;
  destinationUrl: string | null;
  error: string | null;
  onClose: () => void;
  title?: string;
  successSubtitle?: string;
  errorSubtitle?: string;
  destinationLabel?: string;
  destinationFallbackLabel?: string;
  destinationExpiryText?: string;
}

export const ShortUrlModal: React.FC<ShortUrlModalProps> = ({
  isOpen,
  isLoading,
  shortUrl,
  destinationUrl,
  error,
  onClose,
  title = 'Share Link Ready',
  successSubtitle = '24-hour short link generated & copied to clipboard:',
  errorSubtitle = 'Short URL generation failed. Full share link copied to clipboard:',
  destinationLabel = 'DESTINATION SHARE URL',
  destinationFallbackLabel = 'FULL SHARE URL',
  destinationExpiryText = 'Expires in 24 hours',
}) => {
  const [copiedShortTooltip, setCopiedShortTooltip] = useState<boolean>(false);
  const [copiedLongTooltip, setCopiedLongTooltip] = useState<boolean>(false);
  const shortTooltipTimeoutRef = useRef<any>(null);
  const longTooltipTimeoutRef = useRef<any>(null);

  // Clean up tooltip timeouts on unmount
  useEffect(() => {
    return () => {
      if (shortTooltipTimeoutRef.current) clearTimeout(shortTooltipTimeoutRef.current);
      if (longTooltipTimeoutRef.current) clearTimeout(longTooltipTimeoutRef.current);
    };
  }, []);

  // Reset tooltips when modal opens or closes
  useEffect(() => {
    setCopiedShortTooltip(false);
    setCopiedLongTooltip(false);
  }, [isOpen]);

  // Handle ESC key press to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyShortUrl = async () => {
    if (!shortUrl) return;
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopiedShortTooltip(true);
      if (shortTooltipTimeoutRef.current) clearTimeout(shortTooltipTimeoutRef.current);
      shortTooltipTimeoutRef.current = setTimeout(() => {
        setCopiedShortTooltip(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy short URL:', err);
    }
  };

  const handleCopyLongUrl = async () => {
    if (!destinationUrl) return;
    try {
      await navigator.clipboard.writeText(destinationUrl);
      setCopiedLongTooltip(true);
      if (longTooltipTimeoutRef.current) clearTimeout(longTooltipTimeoutRef.current);
      longTooltipTimeoutRef.current = setTimeout(() => {
        setCopiedLongTooltip(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy destination URL:', err);
    }
  };

  return (
    <div
      className="short-url-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="short-url-card"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading ? (
          <div className="short-url-loading-container">
            <div className="short-url-spinner"></div>
            <div className="short-url-loading-text">Generating short URL...</div>
            <div className="short-url-loading-subtext">Connecting to beb.mzecheru.com</div>
          </div>
        ) : (
          <>
            {/* Header: Success or Service Failure Notice */}
            {error ? (
              <div className="short-url-header">
                <div className="short-url-warn-circle">
                  <div className="short-url-warn-inner">
                    <i className="fas fa-triangle-exclamation"></i>
                  </div>
                </div>
                <div>
                  <h4 className="short-url-title">Short URL Service Failed</h4>
                  <p className="short-url-subtitle text-warning">
                    {errorSubtitle}
                  </p>
                </div>
              </div>
            ) : (
              <div className="short-url-header">
                <div className="short-url-check-circle">
                  <div className="short-url-check-inner">
                    <i className="fas fa-check"></i>
                  </div>
                </div>
                <div>
                  <h4 className="short-url-title">{title}</h4>
                  <p className="short-url-subtitle">
                    {successSubtitle}
                  </p>
                </div>
              </div>
            )}

            {/* Primary Box: Short URL (only shown when short URL is available) */}
            {shortUrl && (
              <div className="short-url-box primary-link-box">
                <div className="short-url-link-group">
                  <i className="fas fa-link link-icon primary-link-icon"></i>
                  <span className="short-url-text">{shortUrl}</span>
                </div>
                <div className="copy-btn-wrapper">
                  {copiedShortTooltip && (
                    <span className="copied-tooltip">
                      Copied!
                    </span>
                  )}
                  <button
                    type="button"
                    className="short-url-copy-btn"
                    onClick={handleCopyShortUrl}
                    title="Copy short link"
                  >
                    <i className="far fa-copy"></i>
                    <span>Copy</span>
                  </button>
                </div>
              </div>
            )}

            {/* Secondary Box: Destination URL with Copy button */}
            {destinationUrl && (
              <>
                <div className="destination-header-row">
                  <span className="destination-label">
                    {shortUrl ? destinationLabel : destinationFallbackLabel}
                  </span>
                  <span className="destination-status">{destinationExpiryText}</span>
                </div>
                <div className={`short-url-box destination-box${!shortUrl ? ' standalone-destination-box' : ''}`}>
                  <div className="short-url-link-group">
                    <i className="fas fa-link link-icon destination-link-icon"></i>
                    <span className="destination-url-text" title={destinationUrl}>
                      {destinationUrl}
                    </span>
                  </div>
                  <div className="copy-btn-wrapper">
                    {copiedLongTooltip && (
                      <span className="copied-tooltip">
                        Copied!
                      </span>
                    )}
                    <button
                      type="button"
                      className="short-url-copy-btn"
                      onClick={handleCopyLongUrl}
                      title="Copy full URL"
                    >
                      <i className="far fa-copy"></i>
                      <span>Copy</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Bottom Got It Button */}
            <div className="short-url-footer">
              <button
                type="button"
                className="short-url-got-it-btn"
                onClick={onClose}
              >
                Got it
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ShortUrlModal;
