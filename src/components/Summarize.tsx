import "../styles/summarize.css";
import { useEffect, useState } from "react";
import { NavigateFunction, useNavigate, useParams } from "react-router-dom";
import OpenAI from "openai";
import Entry from "../database/Entry";
import supabase from "../database/config/supabase";
import { GetUserID } from "../database/GetUser";
const openAI = new OpenAI({ apiKey: process.env.REACT_APP_OPENAI_API_KEY!, dangerouslyAllowBrowser: true, organization: process.env.REACT_APP_OPENAI_ORG_ID, project: process.env.REACT_APP_OPENAI_PROJECT_ID });

function capitalizeFirstLetter(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Summarize the given entries
 * 
 * @param entries Each item in the list is the content of an entry
 * @returns An AI generated summary of the given entries
 */
async function GenerateSummary(entries: Array<string>): Promise<string> {
  const response = await openAI.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      "role": "user",
      "content": `You are to summarize a user's journal entries for a month. Do not make assumptions, don't be sappy. Be more direct. Use second person only, less formal. Max of 5 sentences. There's ${entries.length} entries. START: ${entries.join("\nNext:\n")}\nThen, type "**Highlights:**" and separately from the summary give 3 events that are highlights from the month, still in second person, numbered.`
    }]
  });
  return response.choices[0].message.content!;
}

/**
 * Get a summary from the database if it exists
 * 
 * @param month The month the summary is for
 * @param year The year the summary is for
 * @returns The summary if it exists, otherwise null
 */
async function GetExistingSummary(month: number, year: number): Promise<string | null> {
  const { data, error } = await supabase
    .from('Summaries')
    .select('summary')
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

  return data[0].summary;
}

/**
 * Save the summary to the database
 * 
 * @param month The month the summary is for
 * @param year The year the summary is for
 * @param summary The summary itself
 */
async function SaveSummary(month: number, year: number, summary: string) {
  const { error } = await supabase
    .from('Summaries')
    .insert([
      { user_id: await GetUserID(), month, year, summary }
    ]);

  if (error) {
    alert("ERROR saving summary: " + error.message);
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
          .select('journal_entry')
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
  
        const entries: Array<string> = data.map((e: any) => e.journal_entry);
        const generated_summary: string = await GenerateSummary(entries);
        
        SaveSummary(months.indexOf(month), year, generated_summary);
        setSummary(generated_summary.substring(0, generated_summary.indexOf("**Highlights:**")).trim());
        const _highlights = generated_summary.match(/1\.(.*?)\n2\.(.*?)\n3\.(.*?)\./);
        setHighlights([_highlights![1].trim(), _highlights![2].trim(), _highlights![3].trim()]);
      } else {
        setSummary(existingSummary.substring(0, existingSummary.indexOf("**Highlights:**")).trim());
        const _highlights = existingSummary.match(/1\.(.*?)\n2\.(.*?)\n3\.(.*?)\./);
        setHighlights([_highlights![1].trim(), _highlights![2].trim(), _highlights![3].trim()]);
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
              <p className="card-text">{summary}</p>
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