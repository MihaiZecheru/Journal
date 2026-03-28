import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import supabase from '../database/config/supabase';
import '../styles/shared-view.css';

interface SharedLink {
  type: 'entry' | 'summary';
  title: string;
  content: string;
  expires_at: string;
}

function parseSummaryContent(raw: string): { body: string; highlights: string[] } {
  const sepIndex = raw.indexOf('**Highlights:**');
  if (sepIndex === -1) return { body: raw.trim(), highlights: [] };
  const body = raw.substring(0, sepIndex).trim();
  const rest = raw.substring(sepIndex + '**Highlights:**'.length);
  const matches = rest.match(/1\.(.*?)\n2\.(.*?)\n3\.(.*?)\./);
  if (!matches) return { body, highlights: [] };
  return {
    body,
    highlights: [matches[1].trim(), matches[2].trim(), matches[3].trim()],
  };
}

const SharedView = () => {
  const { token } = useParams<{ token: string }>();
  const [link, setLink] = useState<SharedLink | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('shared_links')
        .select('type, title, content, expires_at')
        .eq('id', token)
        .single();

      if (error || !data) {
        setExpired(true);
        setLoading(false);
        return;
      }

      if (new Date(data.expires_at) < new Date()) {
        setExpired(true);
        setLoading(false);
        return;
      }

      setLink(data as SharedLink);
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="shared-view-bg" style={{ alignItems: 'center' }}>
        <div className="spinner-border text-secondary" role="status"></div>
      </div>
    );
  }

  if (expired || !link) {
    return (
      <div className="shared-view-bg" style={{ alignItems: 'center' }}>
        <div className="shared-view-expired-card">
          <div className="shared-view-expired-icon">
            <i className="fas fa-link-slash"></i>
          </div>
          <h2 className="shared-view-expired-title">Link expired or not found</h2>
          <p className="shared-view-expired-sub">This link is only valid for 24 hours after it was created.</p>
        </div>
      </div>
    );
  }

  if (link.type === 'summary') {
    const { body, highlights } = parseSummaryContent(link.content);
    return (
      <div className="shared-view-bg">
        <div className="shared-view-card">
          <div className="shared-view-header">
            <p className="shared-view-label">Monthly Summary</p>
            <h1 className="shared-view-title">{link.title}</h1>
          </div>
          <div className="shared-view-body">
            <p className="shared-view-text">{body}</p>
            {highlights.length === 3 && (
              <div className="shared-view-highlights">
                <p className="shared-view-highlights-label">Highlights</p>
                <ul className="shared-view-highlights-list">
                  {highlights.map((h, i) => (
                    <li key={i}>{h}{i === 2 ? '.' : ''}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="shared-view-footer">
            <i className="fas fa-lock"></i> Shared from a private journal &mdash; expires after 24h
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shared-view-bg">
      <div className="shared-view-card">
        <div className="shared-view-header">
          <p className="shared-view-label">Journal Entry</p>
          <h1 className="shared-view-title">{link.title}</h1>
        </div>
        <div className="shared-view-body">
          <p className="shared-view-text">{link.content}</p>
        </div>
        <div className="shared-view-footer">
          <i className="fas fa-lock"></i> Shared from a private journal &mdash; expires after 24h
        </div>
      </div>
    </div>
  );
};

export default SharedView;
