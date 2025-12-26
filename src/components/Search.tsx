import { useEffect, useRef, useState } from "react";
import Entry from "../database/Entry";
import { UserID } from "../database/ID";
import { GetUserID } from "../database/GetUser";
import Loading from "./Loading";
import supabase from "../database/config/supabase";
import { useNavigate } from "react-router-dom";

const COLORS = ['#FF0000', '#FF3300', '#FF6600', '#FF9900', '#FFCC00', '#FFFF00', '#CCFF00', '#99FF00', '#66FF00', '#33FF00', '#bdbdbd']; // gray at the end

async function GetAllUserEntries(user_id: UserID): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('Entries')
    .select('*')
    .eq('user_id', user_id)
    .order('date', { ascending: true });

  if (error) {
    alert("ERROR getting all user entries from database: " + error.message);
    throw error;
  }

  return data;
}

const sortByDate = (entries: Entry[], ascending: boolean) => {
  return [...entries].sort((a, b) =>
    ascending
      ? a.date.localeCompare(b.date)
      : b.date.localeCompare(a.date)
  );
};

function isNumericString(str: string): boolean {
  return /^\d+$/.test(str);
}

const Search = () => {
  const searchBox = useRef<HTMLInputElement>(null);
  const [searchResults, setSearchResults] = useState<Entry[] | null>(null);
  const [allEntries, setAllEntries] = useState<Entry[]>();
  const [loading, setLoading] = useState<boolean>(true);
  const [sortByAscending, setSortByAscending] = useState<boolean>(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      GetAllUserEntries(await GetUserID()).then((entries: Entry[]) => {
        setAllEntries(entries);
        setLoading(false);
        searchBox.current?.focus();
      });
    })();
  }, []);

  const searchBoxOnKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const search_query = searchBox.current!.value.trim();

      if (isNumericString(search_query)) {
        setSearchResults(sortByDate(allEntries!.filter((entry: Entry) => entry.date.includes(search_query)), sortByAscending));
      } else {
        setSearchResults(sortByDate(allEntries!.filter((entry: Entry) => entry.journal_entry.includes(search_query)), sortByAscending));
      }
    }
  };

  const changeSortOrder = () => {
    const newSortByAscending = !sortByAscending;
    setSortByAscending(newSortByAscending);
    setSearchResults(sortByDate(searchResults || [], newSortByAscending));
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div style={{ backgroundColor: '#2c3e50', width: '100vw', height: '100vh' }}>
      <div style={searchResults === null ? { display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100vw', height: '100vh' } : { display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '2rem', width: '100vw' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '1.5rem' }}>
            <button className="btn btn-primary" onClick={() => navigate('/home')}>Home</button>
          </div>
          <div className="form-outline" data-mdb-input-init>
            <input type="text" id="search-box" className="" ref={searchBox} placeholder="Search" style={{ height: '50px', backgroundColor: 'white', width: '300px', borderRadius: '.5rem', padding: '.5rem' }} onKeyDown={searchBoxOnKeyDown} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="form-check form-switch" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: '1.25rem' }}>
              <input className="ascending-switch-input" type="checkbox" role="switch" id="ascending-switch" checked={sortByAscending} onClick={changeSortOrder} />
              <label className="ascending-switch-label" htmlFor="ascending-switch" style={{ marginLeft: '.5rem', color: '#FAF9F6' }}>Ascending</label>
            </div>
          </div>
        </div>
      </div>

      <div style={{ width: '100vw', height: '100%', marginTop: '2rem', overflowY: 'scroll', paddingBottom: '10rem' }}>
        {
          searchResults && searchResults.map((entry, index) => {
            return (
              <div key={index} style={{ display: 'flex', justifyContent: 'center', width: '100vw', color: COLORS[entry.rating - 1] }}>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', marginTop: '1rem' }}>
                  <h1>{entry.date} ({entry.rating === 11 ? 'x' : entry.rating} / 10){entry.starred ? <i className="fas fa-star" style={{ color: 'yellow', paddingLeft: '.75rem' }}></i> : ''}</h1>
                  <p style={{ maxWidth: '90%' }}>{entry.journal_entry}</p>
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}
 
export default Search;