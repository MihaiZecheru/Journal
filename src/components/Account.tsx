import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../database/config/supabase";
import { User } from "@supabase/supabase-js";

const Account = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User>();
  const [entryCount, setEntryCount] = useState<number>();
  const [summaryCount, setSummaryCount] = useState<number>();

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
    })();
  }, []);

  const exportToJSON = (data: any[], fileName: string) => {
    // Convert the data to a JSON string
    // The 'null, 2' arguments add indentation (pretty-printing) 
    // so the file is human-readable. Use 'null, 0' for a smaller file size.
    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    // Trigger download
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${fileName.replace(/\.csv$/, '')}.json`);
    document.body.appendChild(link);
    link.click();
    
    // Clean up
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
    <div style={{ width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'whitesmoke' }}>
      <main style={{ width: '25%', height: '60%', backgroundColor: '#708090', borderRadius: '1rem', padding: '1rem' }}>
        <div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '2.5rem' }}>
          <img
            style={{ width: '50%', cursor: 'pointer' }}
            title="Click to return to home"
            onClick={() => navigate('/home')} 
            src="https://static.vecteezy.com/system/resources/previews/020/911/737/non_2x/user-profile-icon-profile-avatar-user-icon-male-icon-face-icon-profile-icon-free-png.png"
          />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <b>{user?.email}</b>
            <div>
              <button style={{ backgroundColor: 'var(--fc-button-bg-color)', color: 'whitesmoke', marginRight: '.5rem' }} onClick={() => navigate('/home')}>Home</button>
              <button style={{ backgroundColor: 'var(--fc-button-bg-color)', color: 'whitesmoke' }} onClick={() => navigate('/logout')}>Logout</button>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b>Member since</b>
            { user?.created_at && <b>{new Date(user?.created_at).toDateString().substring(4)}</b> }
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b>Entries written</b>
            <b>{entryCount}</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b>Summaries generated</b>
            <b>{summaryCount}</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
            <button style={{ backgroundColor: 'var(--fc-button-bg-color)', color: 'whitesmoke' }} onClick={downloadEntries}>Download Entries</button>
            <button style={{ backgroundColor: 'var(--fc-button-bg-color)', color: 'whitesmoke' }} onClick={downloadSummaries}>Download Summaries</button>
          </div>
        </div>
      </main>
    </div>
  );
}
 
export default Account;