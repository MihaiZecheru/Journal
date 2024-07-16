import '../styles/home.css';
import FullCalendar from '@fullcalendar/react';
import dayGridMonth from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useEffect, useRef, useState } from 'react';
import { Modal, Ripple, Input, Range, initMDB } from "mdb-ui-kit";
import Entry from '../database/Entry';
import supabase from '../database/config/supabase';

function mobileCheck() {
  let check = false;
  (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor);
  return check;
};

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
  const entries = useRef<Entry[]>([]);

  useEffect(() => {
    initMDB({ Modal, Ripple, Input, Range });
    if (mobileCheck()) document.body.classList.add('mobile');

    (async () => {
      const { data, error } = await supabase
        .from('Entries')
        .select();

      if (error) {
        console.error(`Error fetching entries: ${error.message}`);
        throw error;
      }

      entries.current = data as Entry[];
      calendar.current!.getApi().removeAllEvents();

      // All entries except for today's will be background events, making the whole square in the calendar the color of the rating
      // The entry for today will remain navy blue so that it stands out. It will be a foreground event, meaning the event will be a small rectangle within the box
      const today = data.find((entry: Entry) => entry.date === new Date().toISOString().split('T')[0]);
      data.forEach((entry: Entry) => {
        if (entry === today) return;
        calendar.current!.getApi().addEvent({
          title: !document.body.classList.contains('mobile') ? entry.journalEntry : '',
          start: entry.date,
          allDay: true,
          display: 'background',
          color: colors[entry.rating - 1]
        });
      });
      
      if (today) {
        calendar.current!.getApi().addEvent({
          title: !document.body.classList.contains('mobile') ? today.journalEntry : '',
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
    const existingEntry: Entry | null = entries.current.find((entry: Entry) => entry.date === date.toISOString().split('T')[0]) || null;
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
    const existingEntry: Entry | null = entries.current.find((entry: Entry) => entry.date === startStr) || null;
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
          title: !document.body.classList.contains('mobile') ? text : '',
          start: startStr,
          allDay: true,
          display: 'foreground',
          color: colors[rating - 1]
        });
      } else {
        // Otherwise, add as background event
        calendar.current!.getApi().addEvent({
          title: !document.body.classList.contains('mobile') ? text : '',
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