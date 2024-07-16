import '../styles/home.css';
import FullCalendar from '@fullcalendar/react';
import dayGridMonth from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useEffect, useRef, useState } from 'react';
import { Modal, Ripple, Input, Range, initMDB } from "mdb-ui-kit";
import Entry from '../database/Entry';
import supabase from '../database/config/supabase';

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const colors = ['#FF0000', '#FF3300', '#FF6600', '#FF9900', '#FFCC00', '#FFFF00', '#CCFF00', '#99FF00', '#66FF00', '#33FF00', '#bdbdbd']; // gray at the end

const Home = () => {
  const calendar = useRef<FullCalendar>(null);
  const entryModal = useRef<HTMLDivElement>(null);
  const entryModalTitle = useRef<HTMLHeadingElement>(null);
  const entryModalLabel = useRef<HTMLLabelElement>(null);
  const entryModalRatingInput = useRef<HTMLInputElement>(null);
  const entryModalTextArea = useRef<HTMLTextAreaElement>(null);

  const [loading, setLoading] = useState<boolean>(true); // TODO: implement loading spinner
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    initMDB({ Modal, Ripple, Input, Range });

    (async () => {
      const { data, error } = await supabase
        .from('Entries')
        .select();

      if (error) {
        console.error(`Error fetching entries: ${error.message}`);
        throw error;
      }

      setEntries(data as Entry[]);
      calendar.current!.getApi().removeAllEvents();

      // All entries except for today's will be background events, making the whole square in the calendar the color of the rating
      // The entry for today will remain navy blue so that it stands out. It will be a foreground event, meaning the event will be a small rectangle within the box
      const today = data.find((entry: Entry) => entry.date === new Date().toISOString().split('T')[0]);
      data.forEach((entry: Entry) => {
        if (entry === today) return;
        calendar.current!.getApi().addEvent({
          title: entry.journalEntry,
          start: entry.date,
          allDay: true,
          display: 'background',
          color: colors[entry.rating - 1]
        });
      });
      
      if (today) {
        calendar.current!.getApi().addEvent({
          title: today.journalEntry,
          start: today.date,
          allDay: true,
          display: 'foreground',
          color: colors[today.rating - 1]
        });
      }
      
      setLoading(false);
    })();
  }, []);

  const setModalColor = (rating: number) => {
    const color = colors[rating - 1];
    (entryModal.current!.querySelector('.modal-header')! as HTMLElement).style.backgroundColor = color;
    entryModalRatingInput.current!.style.setProperty('--current-rating-color', color);
    (entryModalRatingInput.current!.parentElement!.querySelector('span.thumb')! as HTMLSpanElement).style.setProperty('--current-rating-color', color);
  }

  const handleDateSelect = (selectInfo: any) => {
    const date = new Date(selectInfo.start);
    const weekday = weekdays[date.getDay()];
    const month = date.toLocaleString('default', { month: 'long' });

    // rating colors
    entryModalRatingInput.current!.value = '5';
    setModalColor(11); // gray
    
    // Clear text area
    entryModalTextArea.current!.value = '';

    // Check if an entry already exists for the selected date
    const existingEntry: Entry | null = entries.find((entry: Entry) => entry.date === date.toISOString().split('T')[0]) || null;
    if (existingEntry) {
      entryModalTextArea.current!.value = existingEntry.journalEntry;
      let existingRating = existingEntry.rating;
      if (existingRating === 11) existingRating = 5; // gray
      entryModalRatingInput.current!.value = existingRating.toString();
      setModalColor(existingRating);
    }

    // Show modal popup
    entryModalTitle.current!.textContent = `${weekday}, ${month} ${date.getDate()}`;
    entryModalLabel.current!.textContent = date.getDate() === new Date().getDate() ? 'What happened today?' : (date.getDate() === new Date().getDate() - 1) ? `What happened yesterday?` : `What happened on ${weekday}?`;
    entryModal.current!.setAttribute('data-startStr', selectInfo.startStr);

    // Show modal
    new Modal(entryModal.current).show();
  };

  const handleSelectAllow = (selectInfo: any) => {
    const day = new Date(selectInfo.start);
    return 1 &&
      // Prevent the selection of multiple days at once
      (new Date(selectInfo.startStr).getDate() === new Date(selectInfo.endStr).getDate() - 1)
      // Don't allow if the day is in the future or is more than 5 days ago in the past, not including 'today'
      && (day <= new Date() && day >= new Date(new Date().setDate(new Date().getDate() - 6)));
  };

  const entryModalSave = async () => {
    const startStr = entryModal.current!.getAttribute('data-startStr')!;
    const text = entryModalTextArea.current!.value.trim();
    let rating = parseInt(entryModalRatingInput.current!.value);

    // If no text, don't save
    if (!text.length) return;

    // If rating is gray, set to 11
    if ((entryModal.current!.querySelector('.modal-header')! as HTMLElement).style.backgroundColor === "rgb(189, 189, 189)") rating = 11;

    // Check if an entry already exists for the selected date
    // If it already exists, update instead of inserting
    const existingEntry: Entry | null = entries.find((entry: Entry) => entry.date === startStr) || null;
    if (existingEntry) {
      const { error } = await supabase
        .from('Entries')
        .update({ rating, journalEntry: text })
        .eq('date', startStr);

      if (error) {
        console.error(`Error updating entry: ${error.message}`);
        throw error;
      }

      // Remove the existing event from the calendar
      const event = calendar.current!.getApi().getEvents().find((event: any) => event.startStr === startStr)!;
      event.setProp('title', text);
      event.setProp('color', colors[rating - 1]);
      event.setProp('display', new Date(startStr).toISOString().split('T')[0] === new Date().toISOString().split('T')[0] ? 'foreground' : 'background');
    } else {
      // Update the entry in the database
      const { error } = await supabase
        .from('Entries')
        .insert({ date: startStr, rating, journalEntry: text });

      if (error) {
        console.error(`Error inserting entry: ${error.message}`);
        throw error;
      }
      
      // If today, add as foreground event
      if (new Date(startStr).toISOString().split('T')[0] === new Date().toISOString().split('T')[0]) {
        calendar.current!.getApi().addEvent({
          title: text,
          start: startStr,
          allDay: true,
          display: 'foreground',
          color: colors[rating - 1]
        });
      } else {
        // Otherwise, add as background event
        calendar.current!.getApi().addEvent({
          title: text,
          start: startStr,
          allDay: true,
          display: 'background',
          color: colors[rating - 1]
        });
      }
    }
  };

  const onRatingRangeChange = (e: any) => {
    setModalColor(e.target.value);
  };

  const entryModalInputKeyHandler = (e: any) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      (entryModal.current!.querySelector('button.btn-primary')! as HTMLButtonElement).click();
    }
  };

  return (
    <div className="home">
      <FullCalendar
        headerToolbar={{
          left: 'prevYear,prev,next,nextYear',
          center: 'title',
          right: 'today'
        }}
        weekends={ true }
        initialView="dayGridMonth"
        plugins={[ dayGridMonth, interactionPlugin ]}
        ref={ calendar }
        editable={ true }
        selectable={ true }
        selectAllow={ handleSelectAllow }
        dayMaxEvents={ true }
        select={ handleDateSelect }
      />

      <div className="modal fade" tabIndex={ -1 } ref={ entryModal } aria-labelledby="entry-modal-label">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="entry-modal-label" ref={ entryModalTitle }>Modal title</h5>
              <button type="button" className="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">
              <div className="form-outline mb-2" data-mdb-input-init>
                <textarea className="form-control" id="textAreaExample" rows={ 4 } ref={ entryModalTextArea } onKeyDown={ entryModalInputKeyHandler }></textarea>
                <label className="form-label" htmlFor="textAreaExample" ref={ entryModalLabel }></label>
              </div>
              <div>
                <label className="form-label d-flex align-items-center" htmlFor="customRange2">
                  <span className="me-2">Rate your day</span>
                  <i className="fas fa-xmark fa-lg pointer-cursor" onClick={
                    () => {
                      entryModalRatingInput.current!.value = '5';
                      setModalColor(11);
                    }
                  }></i>
                </label>
                <div className="range" data-mdb-range-init>
                  <input type="range" className="form-range" min="1" max="10" id="customRange2" ref={ entryModalRatingInput } onChange={ onRatingRangeChange } onKeyDown={ entryModalInputKeyHandler } />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" data-mdb-ripple-init data-mdb-dismiss="modal">Close</button>
              <button type="button" className="btn btn-primary" data-mdb-ripple-init data-mdb-dismiss="modal" onClick={ entryModalSave }>Save</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
 
export default Home;