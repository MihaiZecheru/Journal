import "../styles/summarize.css";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import supabase from "../database/config/supabase";
import { GetUserID } from "../database/GetUser";

function capitalizeFirstLetter(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function GenerateSummary(entries: string[]): Promise<string> {
  return fetch('https://journal.mzecheru.com/api/generate-summary', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ entries })
  }).then((res) => {
    if (res.status === 200) {
      return res.json();
    } else {
      alert('Summary failed with error code ' + res.status)
      return null;
    }
  }).then((res) => {
    return res.summary;
  }).catch((err) => {
    alert('Summary failed due to unknown error. ' + err.message);
    return null;
  });
}

/**
 * Get a summary from the database if it exists
 * 
 * @param month The month the summary is for
 * @param year The year the summary is for
 * @returns The summary if it exists, otherwise null
 */
async function GetExistingSummary(month: number, year: number): Promise<{ summary: string, average_rating: number } | null> {
  const { data, error } = await supabase
    .from('Summaries')
    .select('summary, average_rating')
    .eq('user_id', await GetUserID())
    .eq('month', month)
    .eq('year', year);

  if (error) {
    alert("ERROR getting summary: " + error.message);
    return null;
  }

  if (data.length === 0) {
    return null;
  }

  return { summary: data[0].summary, average_rating: data[0].average_rating };
}

/**
 * Save the summary to the database
 * 
 * @param month The month the summary is for
 * @param year The year the summary is for
 * @param summary The summary itself
 */
async function SaveSummary(month: number, year: number, summary: string, average_rating: number) {
  const { error } = await supabase
    .from('Summaries')
    .insert([
      { user_id: await GetUserID(), month, year, summary, average_rating }
    ]);

  if (error) {
    alert("ERROR saving summary: " + error.message);
  }
}

/**
 * Update the summary in the database for the given month/year
 * @param rawSummary The raw summary includes the highlights at the bottom
 */
async function UpdateSummary(month: number, year: number, rawSummary: string) {
  const { data, error } = await supabase
    .from('Summaries')
    .update({ summary: rawSummary })
    .eq('user_id', await GetUserID())
    .eq('month', month)
    .eq('year', year)
    .select();

  if (!error && data.length === 0) {
    alert("No summary row found to update");
  }

  if (error) {
    alert("ERROR updating summary: " + error.message);
    throw error;
  }
}

async function DeleteSummary(month: number, year: number): Promise<void> {
  const { error } = await supabase
    .from('Summaries')
    .delete()
    .eq('user_id', await GetUserID())
    .eq('month', month)
    .eq('year', year);

  if (error) {
    alert("ERROR deleting summary: " + error.message);
    throw error;
  }
}

// Note that month is 0-indexed
async function CalculateAverageRating(month: number, year: number): Promise<number> {
  const userId = await GetUserID();
  // Start: First day of the month
  const startDate = new Date(year, month, 1).toISOString().split('T')[0];
  // End: "Day 0" of the next month is actually the last day of the current month.
  const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('Entries')
    .select('rating')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) {
    console.error('Fetch error:', error.message);
    return 0;
  }

  if (!data || data.length === 0) return 0;
  const sum = data.reduce((acc, curr) => acc + curr.rating, 0);
  const average = sum / data.length;
  return parseFloat(average.toFixed(1));
}

async function SaveAverageRating(month: number, year: number, average_rating: number): Promise<void> {
  const userId = await GetUserID();

  const { error } = await supabase
  .from('Summaries')
  .update({ average_rating })
  .match({ 
    user_id: userId,
    month: month,
    year: year
  });

  if (error) {
    console.error('Save error:', error.message);
  }
}

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const Summarize = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [summary, setSummary] = useState<string>("");
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<[string, string, string] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [editMode, setEditMode] = useState<boolean>(false);
  const [rawSummary, setRawSummary] = useState<string>();
  const [averageRating, setAverageRating] = useState<number>();
  
  if (!params.year || !params.month) {
    navigate('/home');
  }

  const year = parseInt(params.year!);
  const month = capitalizeFirstLetter(params.month!);

  /**
   * Go to the summary page for the previous month
   */
  const goToPreviousMonth =(currMonth: string, currYear: number) => {
    let monthIndex = months.indexOf(currMonth);
    let year = currYear;

    if (monthIndex === 0) {
      monthIndex = 11;
      year--;
    } else {
      monthIndex--;
    }

    navigate(`/summarize/${months[monthIndex].toLowerCase()}/${year}`);
  }

  /**
   * Go to the summary page for the next month
   */
  const goToNextMonth = (currMonth: string, currYear: number) => {
    let monthIndex = months.indexOf(currMonth);
    let year = currYear;

    if (monthIndex === 11) {
      monthIndex = 0;
      year++;
    } else {
      monthIndex++;
    }

    navigate(`/summarize/${months[monthIndex].toLowerCase()}/${year}`);
  }

  useEffect(() => {
    setSummaryError(null);
    setLoading(true);

    const startTime = new Date().getTime();
    const date = new Date();
    const currentMonth = months[date.getMonth()];
    const currentYear = date.getFullYear();

    if (month === currentMonth && year === currentYear) {
      setSummaryError("You cannot summarize the current month");
      setLoading(false);
      return;
    }

    (async () => {
      const existingSummary = await GetExistingSummary(months.indexOf(month), year);

      if (existingSummary === null) {
        const monthIndex = months.indexOf(month) + 1;
        const formattedMonth = monthIndex.toString().padStart(2, '0');
  
        const startDate = `${year}-${formattedMonth}-01`;
        const nextMonthIndex = monthIndex === 12 ? 1 : monthIndex + 1;
        const nextYear = monthIndex === 12 ? year + 1 : year;
        const formattedNextMonth = nextMonthIndex.toString().padStart(2, '0');
  
        const { data, error } = await supabase
          .from('Entries')
          .select('journal_entry, rating')
          .eq('user_id', await GetUserID())
          .filter('date', 'gte', startDate)
          .filter('date', 'lt', `${nextYear}-${formattedNextMonth}-01`)
          .order('date', { ascending: true });
  
        if (error) {
          alert("ERROR: " + error.message + "\nRedirecting to home page");
          navigate('/home');
          return;
        }
  
        if (data.length < 15) {
          setSummaryError(`Not enough entries to summarize ${month} ${year}. You need at least 15 and only have ${data.length}`);
          setLoading(false);
          return;
        }
  
        const journal_entries: Array<string> = data.map((e: any) => e.journal_entry);
        const generated_summary: string = await GenerateSummary(journal_entries);
        
        const amountOfNoRatingEntries = data.reduce((acc, entry) => acc + (entry.rating == 1 ? 1 : 0), 0);
        const sumOfRatings = data.reduce((acc, entry) => acc + (entry.rating == 11 ? 0 : entry.rating), 0); // Ignores entries with no rating (that's when rating == 1)
        const average_rating = parseFloat((sumOfRatings / (data.length - amountOfNoRatingEntries)).toFixed(1));
        setAverageRating(average_rating);
        SaveSummary(months.indexOf(month), year, generated_summary, average_rating);
        setRawSummary(generated_summary);
        setSummary(generated_summary.substring(0, generated_summary.indexOf("**Highlights:**")).trim());
        const _highlights = generated_summary.match(/1\.(.*?)\n2\.(.*?)\n3\.(.*?)\./);
        setHighlights([_highlights![1].trim(), _highlights![2].trim(), _highlights![3].trim()]);
      } else {
        try {
          if (existingSummary.average_rating == null) {
            /**
             * Since the average rating was added to the summaries in a later version of the app,
             * this code is here for to calculate just the rating if it's not present.
             */
            const average_rating = await CalculateAverageRating(months.indexOf(month), year);
            await SaveAverageRating(months.indexOf(month), year, average_rating);
            setAverageRating(average_rating);
          } else {
            setAverageRating(existingSummary.average_rating);
          }

          const summary = existingSummary.summary;
          setRawSummary(summary);
          if (!summary.includes("**Highlights:**"))
            throw new TypeError("No **Highlights:** separator found");
          setSummary(summary.substring(0, summary.indexOf("**Highlights:**")).trim());
          const _highlights = summary.match(/1\.(.*?)\n2\.(.*?)\n3\.(.*?)\./);
          setHighlights([_highlights![1].trim(), _highlights![2].trim(), _highlights![3].trim()]);
        } catch (err) {
          if (err instanceof TypeError) {
            console.error(err);
            alert("The summary is formatted incorrectly. A new summary will be generated. The old summary has been copied to your clipboard, printed to console, " +
              "and saved to localstorage under '__saved_summary__'.");
            await DeleteSummary(months.indexOf(month), year);
            console.log("____OLD SUMMARY HERE____:", existingSummary.summary);
            window.localStorage.setItem("__saved_summary__", existingSummary.summary);
            navigator.clipboard.writeText(existingSummary.summary);
            window.location.reload();
          } else {
            throw err;
          }
        }
      }

      const endTime = new Date().getTime();
      const timeDiff = endTime - startTime;
      if (timeDiff < 1000) {
        setTimeout(() => setLoading(false), 1000 - timeDiff);
      } else {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const editTextAreaKeyDown = async (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.ctrlKey && (event.key === "Enter" || event.key === "s")) {
      event.preventDefault();
      setEditMode(false);
      await UpdateSummary(months.indexOf(month), year, rawSummary!);
      window.location.reload();
    }
  };

  return (
    <div className="summarize" key={`${month}-${year}`}>
      {
        loading ?
        
        <div className="card" style={{ "width": "36rem" }}>
          <div className="card-body">
            <h3 className="card-title">Summarizing {month}, {year}</h3>
            <div className="placeholder-wave">
              <span className="placeholder col-8"></span>
              <br />
              <span className="placeholder col-9"></span>
              <br />
              <span className="placeholder col-8"></span>
              <br />
              <span className="placeholder col-7"></span>
            </div>
          </div>
          <div className="spinner-border text-secondary summary-page-loading-spinner" role="status"></div>
        </div>
        : (
          summaryError === null ?
          <div className="card" style={{ "width": "36rem" }}>
            <div className="card-body">
              <h3 className="card-title">Summary for {month}, {year}</h3>
              <h5>Average rating of <b>{averageRating} / 10</b></h5>
              {
                editMode
                ? <textarea
                    className="card-text"
                    title="Ctrl+Enter to save"
                    style={{ width: '100%', height: '250px', padding: '1rem' }}
                    onKeyDown={editTextAreaKeyDown}
                    value={rawSummary}
                    onChange={(e) => setRawSummary(e.target.value)} />
                : <p className="card-text">{summary} <i className="fas fa-pen-to-square" style={{ cursor: 'pointer' }} onClick={() => setEditMode(!editMode)}></i></p>
              }
            </div>
            <h5 className="card-header">Important Highlights</h5>
            <ul className="list-group list-group-light list-group-small">
              <li className="list-group-item px-4">{highlights![0]}</li>
              <li className="list-group-item px-4">{highlights![1]}</li>
              <li className="list-group-item px-4">{highlights![2]}.</li>
            </ul>
            <div className="card-body d-flex justify-content-between">
            <a role="button" className="card-link" onClick={ () => goToPreviousMonth(month, year) }>Previous month</a>
              <a role="button" className="card-link" onClick={ () => navigate('/home') }>Back to home</a>
              <a role="button" className="card-link" onClick={ () => goToNextMonth(month, year) }>Next month</a>
            </div>
          </div>
          :
          <div className="card" style={{ "width": "36rem" }}>
            <div className="card-body">
              <h3 className="card-title">Summary for {month}, {year}</h3>
              <p className="card-text">{summaryError}</p>
            </div>
            <div className="card-body d-flex justify-content-between">
              <a role="button" className="card-link" onClick={ () => goToPreviousMonth(month, year) }>Previous month</a>
              <a role="button" className="card-link" onClick={ () => navigate('/home') }>Back to home</a>
              <a role="button" className="card-link" onClick={ () => goToNextMonth(month, year) }>Next month</a>
            </div>
          </div>
        )
      }
    </div>
  );
}
 
export default Summarize;