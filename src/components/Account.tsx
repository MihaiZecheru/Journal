import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../database/config/supabase";
import { User } from "@supabase/supabase-js";
import '../styles/account.css';

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const Account = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User>();
  const [entryCount, setEntryCount] = useState<number>();
  const [summaryCount, setSummaryCount] = useState<number>();
  const [bestMonth, setBestMonth] = useState<{ name: string, year: number, average_rating: string }>();

  useEffect(() => {
    (async () => {
      // Get user
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        alert(error);
        console.error(error);
        return;
      }

      setUser(data.user);

      // Get entry count
      const { count, error: countError } = await supabase
        .from('Entries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', data.user.id);

      if (countError) {
        alert(countError);
        console.error(countError);
        return;
      }

      setEntryCount(count || 0);

      // Get summary count
      const { count: _summary_count, error: countError1 } = await supabase
        .from('Summaries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', data.user.id);

      if (countError1) {
        alert(countError1);
        console.error(countError1);
        return;
      }

      setSummaryCount(_summary_count || 0);

      // Get best month
      const { data: bestMonthData, error: monthError } = await supabase
        .from('Summaries')
        .select('month, year, average_rating')
        .eq('user_id', data.user.id)
        .order('average_rating', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (monthError) {
        alert(monthError);
        console.error(monthError);
        return;
      }

      setBestMonth({ name: months[bestMonthData?.month], year: bestMonthData?.year, average_rating: bestMonthData?.average_rating })
    })();
  }, []);

  const exportToJSON = (data: any[], fileName: string) => {
    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${fileName.replace(/\.csv$/, '')}.json`);
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadEntries = async () => {
    if (!user?.id) return;

    const { data: entries, error } = await supabase
      .from('Entries')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      alert(error);
      console.error(error);
      return;
    }

    exportToJSON(entries, `journal.mzecheru.com_entries_${new Date().toLocaleDateString().replace('/', '-')}`);
  };

  const downloadSummaries = async () => {
    if (!user?.id) return;

    const { data: summaries, error } = await supabase
      .from('Summaries')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      alert(error);
      console.error(error);
      return;
    }

    exportToJSON(summaries, `journal.mzecheru.com_summaries_${new Date().toLocaleDateString().replace('/', '-')}`);
  };

  return (
    <div className="account-bg">
      <div className="account-card">
        <div className="account-header">
          <div className="account-avatar" title="Click to return to home" onClick={() => navigate('/home')}>
            <i className="fas fa-user"></i>
          </div>
          <p className="account-email">{user?.email}</p>
        </div>

        <div className="account-body">
          <div className="account-stats">
            <div className="account-stat-row">
              <span className="account-stat-label">Member since</span>
              <span className="account-stat-value">
                {user?.created_at ? new Date(user.created_at).toDateString().substring(4) : '—'}
              </span>
            </div>
            <div className="account-stat-row">
              <span className="account-stat-label">Entries written</span>
              <span className="account-stat-value">{entryCount ?? '—'}</span>
            </div>
            <div className="account-stat-row">
              <span className="account-stat-label">Summaries generated</span>
              <span className="account-stat-value">{summaryCount ?? '—'}</span>
            </div>
            <div className="account-stat-row">
              <span className="account-stat-label">Best month</span>
              <span className="account-stat-value">
                {bestMonth ? `${bestMonth.name} ${bestMonth.year} · ${bestMonth.average_rating}` : 'N/A'}
              </span>
            </div>
          </div>

          <div className="account-actions">
            <button className="btn btn-outline-primary" onClick={downloadEntries}>
              <i className="fas fa-download me-1"></i> Entries
            </button>
            <button className="btn btn-outline-primary" onClick={downloadSummaries}>
              <i className="fas fa-download me-1"></i> Summaries
            </button>
          </div>

          <div className="account-nav">
            <button className="btn btn-primary" onClick={() => navigate('/home')}>
              <i className="fas fa-home me-1"></i> Home
            </button>
            <button className="btn btn-outline-secondary" onClick={() => navigate('/logout')}>
              <i className="fas fa-sign-out-alt me-1"></i> Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Account;
