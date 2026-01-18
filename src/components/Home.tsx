import '../styles/home.css';
import "primereact/resources/themes/lara-light-cyan/theme.css";
import { FileUpload } from 'primereact/fileupload';
import { PrimeReactProvider } from 'primereact/api';
import FullCalendar from '@fullcalendar/react';
import dayGridMonth from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useEffect, useRef, useState } from 'react';
import { Modal, Ripple, Input, Range, initMDB } from "mdb-ui-kit";
import Entry from '../database/Entry';
import supabase from '../database/config/supabase';
import Loading from './Loading';
import { GetUserID } from '../database/GetUser';
import TDateString from '../database/TDateString';
import CustomTracker, { TCustomTrackerTypeField } from '../database/CustomTracker';
import icons from '../icons';
import { useNavigate } from 'react-router-dom';
import fileDownload from 'js-file-download'
import { UserID } from '../database/ID';

function mobileCheck() {
  let check = false;
  (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor); // eslint-disable-line
  return check;
}

function GetTodaysDate(): TDateString {
  const pstDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const year = pstDate.getFullYear();
  const month = String(pstDate.getMonth() + 1).padStart(2, '0');
  const day = String(pstDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const colors = ['#FF0000', '#FF3300', '#FF6600', '#FF9900', '#FFCC00', '#FFFF00', '#CCFF00', '#99FF00', '#66FF00', '#33FF00', '#bdbdbd']; // gray at the end

function sort_custom_trackers(trackers: CustomTracker[]): CustomTracker[] {
  // Sort the custom trackers so that text-input trackers are first and checkbox trackers are last
  return trackers.sort((a: CustomTracker, b: CustomTracker) => a.type === b.type ? 0 : a.type === 'text' ? -1 : 1);
}

async function SetStarredValue(user_id: UserID, date: TDateString, starred: boolean) {
  const { error } = await supabase.
    from('Entries')
    .update({ starred })
    .eq('date', date)
    .eq('user_id', user_id);

  if (error) {
    console.error(`Error setting starred value: ${error.message}`);
    throw error;
  }
}

function loadCalendar(entries: Entry[], calendarAPI: any) {
    calendarAPI.removeAllEvents();

    // All entries except for today's will be background events, making the whole square in the calendar the color of the rating
    // The entry for today will remain navy blue so that it stands out. It will be a foreground event, meaning the event will be a small rectangle within the box
    const today = entries.find((entry: Entry) => entry.date === GetTodaysDate());
    entries.forEach((entry: Entry) => {
      if (entry === today) return;
      calendarAPI.addEvent({
        title: entry.journal_entry,
        start: entry.date,
        allDay: true,
        display: 'background',
        color: colors[entry.rating - 1],
        extendedProps: {
          custom_trackers: entry.custom_trackers,
          starred: entry.starred
        }
      });
    });
    
    if (today) {
      calendarAPI.addEvent({
        title: today.journal_entry,
        start: today.date,
        allDay: true,
        display: 'foreground',
        color: colors[today.rating - 1],
        extendedProps: {
          custom_trackers: today.custom_trackers
        }
      });
    }
}

const Home = () => {
  const navigate = useNavigate();
  const calendar = useRef<FullCalendar>(null);

  // Entry modal
  const entryModal = useRef<HTMLDivElement>(null);
  const entryModalTitle = useRef<HTMLHeadingElement>(null);
  const entryModalLabel = useRef<HTMLLabelElement>(null);
  const entryModalRatingInput = useRef<HTMLInputElement>(null);
  const entryModalTextArea = useRef<HTMLTextAreaElement>(null);
  const dayRatingDisplayNumber = useRef<HTMLSpanElement>(null);
  const fileUploadComponent = useRef<FileUpload>(null);
  const entryModalStarredDisplay = useRef<HTMLDivElement>(null);

  // Custom Trackers
  const customTrackersModal = useRef<HTMLDivElement>(null);
  const customTrackersModalBody = useRef<HTMLDivElement>(null);
  const addCustomTrackerModal = useRef<HTMLDivElement>(null);
  const [customTrackers, setCustomTrackers] = useState<CustomTracker[]>([]);

  // Add custom trackers modal
  const addCustomTrackerTypeLabel = useRef<HTMLLabelElement>(null);
  const addCustomTrackerType = useRef<HTMLInputElement>(null);
  const addCustomTrackerName = useRef<HTMLInputElement>(null);
  const setCustomTrackerIconModal = useRef<HTMLDivElement>(null);
  const iconsGrid = useRef<HTMLDivElement>(null);

  // View entry modal
  const viewEntryModal = useRef<HTMLDivElement>(null);
  const viewEntryModalBody = useRef<HTMLDivElement>(null);
  const viewEntryModalTitle = useRef<HTMLHeadingElement>(null);
  const viewEntryModalRatingDisplay = useRef<HTMLSpanElement>(null);
  const viewEntryModalStarredDisplay = useRef<HTMLDivElement>(null);

  // View memories modal
  const viewMemoriesModal = useRef<HTMLDivElement>(null);
  const viewMemoriesModalBody = useRef<HTMLDivElement>(null);
  const viewMemoriesModalDateDisplay = useRef<HTMLSpanElement>(null);
  const [viewMemoriesModalFiles, setViewMemoriesModalFiles] = useState<{ name: string, url: string, date: string}[]>([]);

  // View entry memories modal
  const viewEntryMemoriesModal = useRef<HTMLDivElement>(null);
  const viewEntryMemoriesModalBody = useRef<HTMLDivElement>(null);
  const viewEntryMemoriesModalDateDisplay = useRef<HTMLSpanElement>(null);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [editMode, setEditMode] = useState<boolean>(false);
  const entries = useRef<Entry[]>([]);

  useEffect(() => {
    initMDB({ Modal, Ripple, Input, Range });
    const timeStamp = Date.now();
    if (mobileCheck()) document.body.classList.add('mobile');

    (async () => {
      const { data, error } = await supabase
        .from('Entries')
        .select()
        .eq('user_id', await GetUserID());

      if (error) {
        console.error(`Error fetching entries: ${error.message}`);
        throw error;
      }

      entries.current = data as Entry[];
      loadCalendar(data as Entry[], calendar.current!.getApi());

      const { data: data1, error: error1 } = await supabase
        .from('CustomTrackers')
        .select()
        .eq('user_id', await GetUserID());

      if (error1) {
        console.error(`Error fetching custom trackers: ${error1.message}`);
        throw error;
      }

      setCustomTrackers(sort_custom_trackers(data1));

      // If a 1.5 seconds haven't passed, wait until they have
      while (Date.now() - timeStamp < 1500) continue;
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const btns = document.querySelectorAll('.fc-custom-btn-button')!;

    const customTrackersBtn = btns[0]!;
    customTrackersBtn.innerHTML = '<i class="far fa-square-check me-2"></i>Custom Trackers';
    customTrackersBtn.addEventListener('click', () => {
      new Modal(customTrackersModal.current).show();
    });

    const editModeBtn = btns[1]!;
    editModeBtn.textContent = 'Edit Mode';
    editModeBtn.addEventListener('click', () => setEditMode(prevEditMode => !prevEditMode));

    const searchBtn = btns[2]!;
    searchBtn.innerHTML = '<i class="fas fa-magnifying-glass me-2"></i>Search';
    searchBtn.addEventListener('click', () => {
      navigate('/search');
    });

    const logoutBtn = btns[3]!;
    logoutBtn.innerHTML = '<i class="far fa-user me-2"></i>Logout';;
    logoutBtn.addEventListener('click', () => {
      setLoading(true);
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/login');
      }, 1000);
    });
  }, []);

  useEffect(() => {
    const editModeBtn = document.querySelectorAll('.fc-custom-btn-button')![1] as HTMLButtonElement;
    editModeBtn.innerHTML = (editMode ? '<i class="fas fa-check me-2"></i>' : '<i class="fas fa-xmark me-2"></i>') + 'Edit Mode';
  }, [editMode]);

  useEffect(() => {
    customTrackersModalBody.current!.querySelectorAll('.custom-tracker-input').forEach((input: Element) => new Input(input));
  }, [customTrackers]);

  const setModalColor = (rating: number) => {
    const color = colors[rating - 1];
    (entryModal.current!.querySelector('.modal-header')! as HTMLElement).style.backgroundColor = color;
    entryModalRatingInput.current!.style.setProperty('--current-rating-color', color);
    (entryModalRatingInput.current!.parentElement!.querySelector('span.thumb')! as HTMLSpanElement)?.style.setProperty('--current-rating-color', color);
  }

  const handleDateSelect = (selectInfo: any) => {
    const date = new Date(new Date(selectInfo.start).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const weekday = weekdays[date.getDay()];
    const month = date.toLocaleString('default', { month: 'long' });
    const isMoreThanSixDaysAgo = (new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24) > 7;

    // Activate custom tracker inputs and clear input
    document.querySelectorAll('.custom-tracker-input').forEach((input: Element) => {
      const inputBox = input.querySelector('input') as HTMLInputElement;
      if (inputBox?.type === 'checkbox') inputBox.checked = false;
      else inputBox.value = '';
      new Input(input);
    });

    // Clear custom tracker icon colors
    document.querySelectorAll('.custom-tracker-input-icon').forEach((icon: Element) => icon.classList.remove('active-custom-tracker-color'));

    // rating colors
    entryModalRatingInput.current!.value = '5';
    dayRatingDisplayNumber.current!.textContent = 'x';
    setModalColor(11); // gray
    
    // Clear text area
    entryModalTextArea.current!.value = '';

    // Set modal title
    entryModalTitle.current!.textContent = `${weekday}, ${month} ${date.getDate()}`;
    entryModalLabel.current!.textContent = date.getDate() === new Date().getDate() ? 'What happened today?' : (date.getDate() === new Date().getDate() - 1) ? `What happened yesterday?` : `What happened on ${weekday}?`;
    entryModal.current!.setAttribute('data-startstr', selectInfo.startStr);

    // Hide delete button
    (entryModal.current!.querySelector('.btn-danger') as HTMLButtonElement).classList.add('visually-hidden');

    // Check if an entry already exists for the selected date
    const existingEntry: Entry | null = entries.current.find((entry: Entry) => entry.date === date.toISOString().split('T')[0]) || null;

    // Show view modal
    if (isMoreThanSixDaysAgo && editMode === false) {
      if (!existingEntry) return alert(`No entry exists for ${weekday}, ${month} ${date.getDate()}`);
      viewEntryModalTitle.current!.textContent = `${weekday}, ${month} ${date.getDate()}`;
      viewEntryModalRatingDisplay.current!.textContent = existingEntry.rating === 11 ? 'x' : existingEntry.rating.toString();
      viewEntryModalStarredDisplay.current!.innerHTML = existingEntry.starred ? '<i class="fas fa-star fa-lg view-entry-modal-display-star"></i>' : '<i class="far fa-star fa-lg view-entry-modal-display-star"></i>';
      document.querySelector('.view-entry-modal-display-star')?.addEventListener('click', async (e: any) => {
        e.target!.classList.toggle('fas');
        e.target!.classList.toggle('far');
        if (!existingEntry.starred) {
          existingEntry.starred = true;
          await SetStarredValue(await GetUserID(), existingEntry.date, true);
        } else {
          existingEntry.starred = false;
          await SetStarredValue(await GetUserID(), existingEntry.date, false);
        }
        calendar.current!.getApi().getEvents().find((event: any) => event.startStr === existingEntry.date)!.setExtendedProp('starred', existingEntry.starred);
        entries.current.map((entry: Entry) => entry.date === existingEntry.date ? existingEntry : entry);
      });
      const color = colors[existingEntry.rating - 1];
			viewEntryModal.current!.setAttribute('data-startstr', existingEntry.date);
      viewEntryModalTitle.current!.parentElement!.style.backgroundColor = color;
      viewEntryModalBody.current!.innerHTML = `
        <div class="mb-2 view-entry-text-content-box"><span>${existingEntry.journal_entry}</span></div>
        <div class="mb-2">
          ${
            existingEntry.custom_trackers ? customTrackers.map((custom_tracker: CustomTracker) => {
              const value = existingEntry.custom_trackers![custom_tracker.name];
              const isCheckbox = value === true || value === false;
              if (isCheckbox) {
                return `<div class="d-flex align-items-center mt-2"><i class="fa-lg me-2 ${value === true ? 'active-custom-tracker-color' : ''} ${customTrackers.find((tracker: CustomTracker) => tracker.name === custom_tracker.name)?.icon_classname}"></i><span>${custom_tracker.name}</span></div>`;
              } else {
                if (value === '' || !value || value === null) return '';
                return `<div class="mt-2 d-flex align-items-center view-entry-text-content-box"><span class="active-custom-tracker-color">${custom_tracker.name}:</span><span> ${value}</span></div>`;
              }
            }).join('') : ''
          }
        </div>
      `;

      (async () => {
        const userID = await GetUserID();

        const { data, error } = await supabase.storage
          .from('Memories')
          .list(`${userID}/${existingEntry.date}`);

        if (error) {
          console.error(`Error listing files: ${error.message}`);
          throw error;
        }

        if (!data.length) setViewMemoriesModalFiles([]);
        else {
          const { data: urls, error: urls_error } = await supabase.storage
            .from('Memories')
            .createSignedUrls(data.map((file: any) => `${userID}/${existingEntry.date}/${file.name}`), 3600 * 24 * 7);

          if (urls_error) {
            console.error(`Error getting signed URLs: ${urls_error.message}`);
            throw urls_error;
          }

          setViewMemoriesModalFiles(urls.map((url: { signedUrl: string }, index: number) => {
            return {
              name: data[index].name,
              url: url.signedUrl,
              date: existingEntry.date
            };
          }));
        }
      })();

      return new Modal(viewEntryModal.current).show();
    // Show create/edit entry modal
    } else {
      // Check for any locally saved draft when creating an entry
      // Open the entryModal with the locally saved draft
      const locallySavedEntryData = window.localStorage.getItem("entry-modal-draft");
      if (!existingEntry && locallySavedEntryData && JSON.parse(locallySavedEntryData).date == entryModalTitle.current!.textContent && JSON.parse(locallySavedEntryData).draft.length > 0) {
        const useLocalDraft = window.confirm("Unsaved local changes have been detected. Do you want to load them?");
        if (useLocalDraft) {
          entryModalTextArea.current!.value = JSON.parse(locallySavedEntryData).draft;
        }
        
        return new Modal(entryModal.current).show();
      }

      // Open the entryModal in its empty state
      if (!existingEntry) return new Modal(entryModal.current).show();

      // Check for any locally saved draft when editing an entry
      if (locallySavedEntryData && JSON.parse(locallySavedEntryData).date == entryModalTitle.current!.textContent && JSON.parse(locallySavedEntryData).draft.length > 0) {
        const useLocalDraft = window.confirm("Unsaved local changes have been detected. Do you want to load them? Saying no will delete the unsaved draft.");
        if (useLocalDraft) {
          entryModalTextArea.current!.value = JSON.parse(locallySavedEntryData).draft;
        } else {
          // Set textarea to existing entry
          entryModalTextArea.current!.value = existingEntry.journal_entry;
          window.localStorage.removeItem("entry-modal-draft");
        }
      } else {
        // Set textarea to existing entry
        entryModalTextArea.current!.value = existingEntry.journal_entry;
      }

      // Set slider to existing rating
      let existingRating = existingEntry.rating;

      // Set modal color
      entryModalRatingInput.current!.value = (existingRating === 11 ? 5 : existingRating).toString();
      dayRatingDisplayNumber.current!.textContent = existingRating === 11 ? 'x' : existingRating.toString();
      entryModalStarredDisplay.current!.innerHTML = existingEntry.starred
        ? '<i class="fas fa-star fa-lg entry-modal-display-star"></i>'
        : '<i class="far fa-star fa-lg entry-modal-display-star"></i>';
        document.querySelector('.entry-modal-display-star')?.addEventListener('click', async (e: any) => {
          e.target!.classList.toggle('fas');
          e.target!.classList.toggle('far');
          if (!existingEntry.starred) {
            existingEntry.starred = true;
            await SetStarredValue(await GetUserID(), existingEntry.date, true);
          } else {
            existingEntry.starred = false;
            await SetStarredValue(await GetUserID(), existingEntry.date, false);
          }
          calendar.current!.getApi().getEvents().find((event: any) => event.startStr === existingEntry.date)!.setExtendedProp('starred', existingEntry.starred);
          entries.current.map((entry: Entry) => entry.date === existingEntry.date ? existingEntry : entry);
        });
      setModalColor(existingRating);

      // Show delete button
      (entryModal.current!.querySelector('.btn-danger') as HTMLButtonElement).classList.remove('visually-hidden');

      // Set custom trackers
      if (existingEntry.custom_trackers) {
        Object.keys(existingEntry.custom_trackers).forEach((key: string) => {
          const value = existingEntry.custom_trackers![key];
          const input = document.querySelector(`.custom-tracker-input[data-tracker-name="${key}"] input`) as HTMLInputElement;
          if (input === null) return;
          if (input.type === 'checkbox') {
            input.checked = value as boolean;
            const i = input.parentElement?.parentElement?.querySelector('i') as HTMLElement;
            if (input.checked) i.classList.add('active-custom-tracker-color');
          } else {
            input.value = value as string;
          }
        });
      }

      // Clear file upload component of old files
      fileUploadComponent.current!.clear();

      (async () => {
        const userID = await GetUserID();

        const { data, error } = await supabase.storage
          .from('Memories')
          .list(`${userID}/${existingEntry.date}`);

        if (error) {
          console.error(`Error listing files: ${error.message}`);
          throw error;
        }

        if (!data.length) setViewMemoriesModalFiles([]);
        else {
          const { data: urls, error: urls_error } = await supabase.storage
            .from('Memories')
            .createSignedUrls(data.map((file: any) => `${userID}/${existingEntry.date}/${file.name}`), 3600 * 24 * 7);

          if (urls_error) {
            console.error(`Error getting signed URLs: ${urls_error.message}`);
            throw urls_error;
          }

          setViewMemoriesModalFiles(urls.map((url: { signedUrl: string }, index: number) => {
            return {
              name: data[index].name,
              url: url.signedUrl,
              date: existingEntry.date
            };
          }));
        }
      })();

      // Show modal
      new Modal(entryModal.current).show();
    }
  };

  const handleSelectAllow = (selectInfo: any) => {
    // Prevent the selection of multiple days at once
    const start = new Date(selectInfo.startStr).getDate();
    const end = new Date(selectInfo.endStr).getDate();
    const today = new Date();
    const endDate = new Date(selectInfo.endStr);
    today.setHours(0);   today.setMinutes(0);
    today.setSeconds(0); today.setMilliseconds(0);
    endDate.setHours(0);   endDate.setMinutes(0);
    endDate.setSeconds(0); endDate.setMilliseconds(0);
    const dateIsInTheFuture = endDate.getTime() > today.getTime();
    return ((start === end - 1) || (start === 31 && end === 1) || (start === 30 && end === 1)) && !dateIsInTheFuture;
  };

  const entryModalSave = async () => {
    const startStr = entryModal.current!.getAttribute('data-startstr')!;
    const text = entryModalTextArea.current!.value.trim();
    let rating = parseInt(entryModalRatingInput.current!.value);

    // Get custom trackers
    const customTrackers: { [key: string]: string | boolean } = {};
    document.querySelectorAll('.custom-tracker-input').forEach((input: Element) => {
      const name = input.getAttribute('data-tracker-name')!;
      const value = input.querySelector('input')?.type === 'checkbox' ? (input.querySelector('input') as HTMLInputElement).checked : (input.querySelector('input') as HTMLInputElement).value;
      if (name && (value || value === false)) customTrackers[name] = value;
    });

    // If no text, don't save
    if (!text.length) return alert("Text must be entered in the 'what happened' box to save the entry");

    // If rating is gray, set to 11
    if ((entryModal.current!.querySelector('.modal-header')! as HTMLElement).style.backgroundColor === "rgb(189, 189, 189)") rating = 11;

    // Check if an entry already exists for the selected date
    // If it already exists, update instead of inserting
    const existingEntry: Entry | null = entries.current.find((entry: Entry) => entry.date === startStr) || null;
    if (existingEntry) {
      // Update the entry in the database
      const { error } = await supabase
        .from('Entries')
        .update({ rating, journal_entry: text, custom_trackers: customTrackers, starred: false })
        .eq('date', startStr)
        .eq('user_id', await GetUserID());

      if (error) {
        console.error(`Error updating entry: ${error.message}`);
        throw error;
      }

      // Add to entries
      const index = entries.current.findIndex((entry: Entry) => entry.date === startStr);
      entries.current[index] = { user_id: await GetUserID(), date: startStr as TDateString, rating, journal_entry: text, custom_trackers: customTrackers, starred: false };

      // Remove the existing event from the calendar
      const event = calendar.current!.getApi().getEvents().find((event: any) => event.startStr === startStr)!;
      event.setProp('title', text);
      event.setProp('color', colors[rating - 1]);
      event.setProp('display', startStr === GetTodaysDate() ? 'foreground' : 'background');
      event.setExtendedProp('custom_trackers', customTrackers);
    } else {
      // Add the entry to the database
      const { error } = await supabase
        .from('Entries')
        .insert({ user_id: await GetUserID(), date: startStr, rating, journal_entry: text, custom_trackers: customTrackers, starred: false });

      if (error) {
        console.error(`Error inserting entry: ${error.message}`);
        throw error;
      }

      // Add to entries
      entries.current.push({ user_id: await GetUserID(), date: startStr as TDateString, rating, journal_entry: text, custom_trackers: customTrackers, starred: false });
      
      // If today, add as foreground event
      if (startStr === GetTodaysDate()) {
        calendar.current!.getApi().addEvent({
          title: text,
          start: startStr,
          allDay: true,
          display: 'foreground',
          color: colors[rating - 1],
          extendedProps: {
            custom_trackers: customTrackers
          }
        });
      } else {
        // Otherwise, add as background event
        calendar.current!.getApi().addEvent({
          title: text,
          start: startStr,
          allDay: true,
          display: 'background',
          color: colors[rating - 1],
          extendedProps: {
            custom_trackers: customTrackers
          }
        });
      }
    }

    window.localStorage.removeItem("entry-modal-draft");
  };

  const onRatingRangeChange = (e: any) => {
    setModalColor(e.target.value);
    dayRatingDisplayNumber.current!.textContent = e.target.value;
  };

  const entryModalInputKeyHandler = (e: any) => {
    if ((e.key === 'Enter' && e.ctrlKey) || (e.key === 's' && e.ctrlKey)) {
      e.preventDefault();
      (entryModal.current!.querySelector('button.save-button')! as HTMLButtonElement).click();
    }
  };

  const entryModalDelete = async (startStr: string) => {
    const existingEntry: Entry | null = entries.current.find((entry: Entry) => entry.date === startStr) || null;
    if (!existingEntry) return;
    const userID = await GetUserID();

    // Remove the entry from the DB
    const { error } = await supabase
      .from('Entries')
      .delete()
      .eq('date', startStr)
      .eq('user_id', userID);

    if (error) {
      console.error(`Error deleting entry: ${error.message}`);
      throw error;
    }

    // Remove the associated images from the storage
    deleteAllMemories(startStr);

    // Remove the existing event from the calendar
    const event = calendar.current!.getApi().getEvents().find((event: any) => event.startStr === startStr)!;
    event.remove();

    // Remove from entries
    entries.current = entries.current.filter((entry: Entry) => entry.date !== startStr);

    // Close modal
    (entryModal.current!.querySelector('button.btn-secondary') as HTMLButtonElement).click();
  }

  const deleteCustomTracker = async (name: string) => {
    setCustomTrackers(sort_custom_trackers(customTrackers.filter((tracker: CustomTracker) => tracker.name !== name)));

    const { error } = await supabase
      .from('CustomTrackers')
      .delete()
      .eq('user_id', await GetUserID())
      .eq('name', name);

    if (error) {
      console.error(`Error deleting custom tracker: ${error.message}`);
      throw error;
    }
  };

  const createNewCustomTracker = async (name: string, type: TCustomTrackerTypeField) => {
    if (!name) return;

    // Close modal
    (addCustomTrackerModal.current!.querySelector('button.btn-secondary') as HTMLButtonElement).click();

    // Object to insert into the customTrackers state hook
    const newTracker: CustomTracker = { user_id: await GetUserID(), name: name[0].toUpperCase() + name.substring(1), type, icon_classname: 'fas fa-circle' };
    
    // Check to see if a tracker with this name already exists
    if (customTrackers.find((tracker: CustomTracker) => tracker.name === name)) {
      return alert(`A custom tracker with the name '${name}' already exists`);
    }

    const { error } = await supabase
      .from('CustomTrackers')
      .insert(newTracker);

    if (error) {
      console.error(`Error inserting custom tracker: ${error.message}`);
      throw error;
    }

    setCustomTrackers(sort_custom_trackers([...customTrackers, newTracker]));
  };

  const customCalendarRendering = (arg: any) => {
    const event = arg.event;
    const starred = event.extendedProps?.starred || false;
    const custom_trackers = event.extendedProps?.custom_trackers as Record<string, string | boolean>;
    
    return (
      <div>
        <div className="d-flex align-items-center me-1">
          {
            starred ? <div><i className="fas fa-star fa-lg date-display-star"></i></div> : <div><i className="far fa-star fa-lg date-display-star"></i></div>
          }
          {
            custom_trackers && Object.keys(custom_trackers).map((key: string) => {
              const value = custom_trackers[key];
              const type = value === true || value === false ? 'checkbox' : 'text';
              if (type !== 'checkbox' || value === false) return '';
              if (!customTrackers.length) return '';
              const icon_classname = customTrackers.find((tracker: CustomTracker) => tracker.name === key)?.icon_classname;
              const trackerIcon = <i className={ "fa-lg " + icon_classname }></i>;
              return <div className="calendar-event-custom-tracker ms-1 mt-1" key={ key }>{ trackerIcon }</div>
            })
          }
        </div>
        {
          !document.body.classList.contains('mobile') && <div className="calendar-event-title ms-1 me-2">{ event.title }</div>
        }
      </div>
    );
  };

  const saveCustomTrackerIcon = async (custom_tracker_name: string, icon_classname: string) => {
    const { error } = await supabase
      .from('CustomTrackers')
      .update({ icon_classname })
      .eq('user_id', await GetUserID())
      .eq('name', custom_tracker_name);

    if (error) {
      console.error(`Error updating custom tracker icon: ${error.message}`);
      throw error;
    }

    setCustomTrackers(sort_custom_trackers(customTrackers.map((tracker: CustomTracker) => tracker.name === custom_tracker_name ? { ...tracker, icon_classname } : tracker)));
  };

  const fileUploadHandler = (e: any) => {
    try {
      let errorToThrow;
      e.files.forEach(async (file: any) => {
        // Upload the file to the user's folder
        // A subfolder is made for each date
        const { error } = await supabase.storage
          .from('Memories')
          .upload(`${await GetUserID()}/${entryModal.current!.getAttribute('data-startstr')!}/${file.name}`, file);
          
        if (error) {
          console.error(`Error uploading file: ${error.message}`);
          if (error.message === 'The resource already exists')
            alert(`A file with the name '${file.name}' already exists`);
          else {
            alert(`Error uploading file: ${error.message}`);
            errorToThrow = error
          }
        }

        
        fileUploadComponent.current!.setFiles(fileUploadComponent.current!.getFiles().filter((f: any) => f !== file).sort((a: any, b: any) => a.size - b.size));
        fileUploadComponent.current!.setUploadedFiles(fileUploadComponent.current!.getUploadedFiles().concat(file).sort((a: any, b: any) => a.size - b.size));
      });
      
      setViewMemoriesModalFiles(viewMemoriesModalFiles.concat(e.files.map((file: any) => ({ name: file.name, url: URL.createObjectURL(file), date: entryModal.current!.getAttribute('data-startstr')! }))));
      if (errorToThrow) throw errorToThrow;
    } catch (error: any) {
      console.error(`Error uploading file: ${error.message}`);
    }
  };

  // Remove a single file from the database's storage
  const removeFileFromMemoriesModal = async (date: string, fileName: string) => {
    const userID = await GetUserID();
    
    const { error } = await supabase.storage
      .from('Memories')
      .remove([`${userID}/${date}/${fileName}`]);

    if (error) {
      console.error(`Error removing file: ${error.message}`);
      throw error;
    }

    setViewMemoriesModalFiles(viewMemoriesModalFiles.filter((file: { name: string }) => file.name !== fileName));
  };

  // Delete all memories for a specific date
  const deleteAllMemories = async (date: string) => {
    const userID = await GetUserID();

    // List all files
    const { data, error: listError } = await supabase.storage
    .from('Memories')
    .list(`${userID}/${date}`, { limit: 10_000 });

    if (listError) {
      console.error(`Error listing files: ${listError.message}`);
      throw listError;
    }

    if (!data.length) return;
    const pathsToDelete = data.map((file) => `${userID}/${date}/${file.name}`);

    // Remove all files
    const { error } = await supabase.storage
      .from('Memories')
      .remove(pathsToDelete);

    if (error) {
      console.error(`Error removing file: ${error.message}`);
      throw error;
    }

    setViewMemoriesModalFiles([]);
  };

  const setupViewMemoriesModal = async (date: string) => {
    const userID = await GetUserID();
    const dateString = `${months[parseInt(date.split('-')[1]) - 1]} ${date.split('-')[2]}, ${date.substring(0, 4)}`;
    viewMemoriesModalDateDisplay.current!.textContent = dateString;

    // Get all files
    const { data, error } = await supabase.storage
      .from('Memories')
      .list(`${userID}/${date}`, { limit: 10_000 });

    if (error) {
      console.error(`Error listing files: ${error.message}`);
      throw error;
    }

    if (!data.length) {
      setViewMemoriesModalFiles([]);
    } else {
      const { data: urls, error: urls_error } = await supabase.storage
        .from('Memories')
        .createSignedUrls(data.map((file: any) => `${userID}/${date}/${file.name}`), 3600 * 24 * 7);

      if (urls_error) {
        console.error(`Error getting signed URLs: ${urls_error.message}`);
        throw urls_error;
      }

      setViewMemoriesModalFiles(urls.map((url: { signedUrl: string }, index: number) => {
        return {
          name: data[index].name,
          url: url.signedUrl,
          date
        };
      }));
    }
  };

  const performIconSearch = (q: string) => {
    const grid_icons = iconsGrid.current!.querySelectorAll('i');
    grid_icons.forEach((icon: Element) => {
      const icon_name = icon.getAttribute('data-icon-class-string')!;
      if (icon_name.includes(q)) icon.classList.remove('d-none');
      else icon.classList.add('d-none');
    });
  };

  useEffect(() => {
    document.querySelector(".fc-toolbar-title")?.addEventListener('click', (e: any) => {
      // Ex: 'August 2024'
      const yearAndMonth = e.target.textContent.split(' ');
      const month = yearAndMonth[0].toLowerCase();
      const year = yearAndMonth[1];
      navigate(`/summarize/${month}/${year}`);
    });
  }, []);

  // Prevent progress from being lost when writing the modal by storing unsaved work in localStorage
  const saveEntryModalDraftLocally = (e: any) => {
    const data = { date: document.getElementById("entry-modal-label")?.innerText, draft: e.target.value };
    window.localStorage.setItem("entry-modal-draft", JSON.stringify(data));
  };

  return (
    <div className="home">
      { loading && <Loading /> }
      <FullCalendar
        headerToolbar={{
          left: 'prevYear,prev,next,nextYear',
          center: 'title',
          right: 'custom-btn,custom-btn,custom-btn,custom-btn'
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
        eventContent={ customCalendarRendering }
      />

      <div className="modal fade" tabIndex={ -1 } ref={ entryModal } aria-labelledby="entry-modal-label">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="entry-modal-label" ref={ entryModalTitle }>Modal title (dynamically changed)</h5>
              <div className="ms-2" ref={ entryModalStarredDisplay }></div>
              <button type="button" className="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">
              <div className="form-outline mb-2" data-mdb-input-init>
                <textarea className="form-control" id="textAreaExample" rows={ 4 } ref={ entryModalTextArea } onKeyDown={ entryModalInputKeyHandler } onChange={ saveEntryModalDraftLocally }></textarea>
                <label className="form-label" htmlFor="textAreaExample" ref={ entryModalLabel }></label>
              </div>
              <div>
                <label className="form-label d-flex align-items-center justify-content-between" htmlFor="customRange2">
                  <div className="d-flex align-items-center">
                    <span className="me-2 no-highlight">Rate your day</span>
                    <i className="fas fa-xmark fa-lg pointer-cursor" onClick={
                      () => {
                        entryModalRatingInput.current!.value = '5';
                        dayRatingDisplayNumber.current!.textContent = 'x';
                        setModalColor(11);
                      }
                    }></i>
                  </div>
                  <b><span ref={ dayRatingDisplayNumber }>x</span> / 10</b>
                </label>
                <div className="range" data-mdb-range-init>
                  <input type="range" className="form-range" min="1" max="10" id="customRange2" ref={ entryModalRatingInput } onChange={ onRatingRangeChange } onKeyDown={ entryModalInputKeyHandler } />
                </div>
              </div>
              <div>
                <span style={{ "color": "var(--mdb-form-control-label-color)" }} className="no-highlight">Trackers</span>
                { customTrackers && customTrackers.map((tracker: CustomTracker, index: number) => {
                    const id = tracker.name.replaceAll(' ', '-') + '-' + index.toString() + '-calendar-input';
                    return tracker.type === 'checkbox'
                      ? <div className="d-flex align-items-center" key={ id }>
                          <i className={ "custom-tracker-input-icon fa-lg me-2 " + tracker.icon_classname }></i>
                          <div className="form-check form-switch mb-2 mt-2 custom-tracker-input" data-mdb-input-init data-tracker-name={ tracker.name }>
                            <input className="form-check-input" type="checkbox" id={ id } onChange={ (e) => e.target.parentElement?.parentElement!.querySelector('i')!.classList.toggle('active-custom-tracker-color') } />
                            <label className="form-check-label me-2 no-highlight" htmlFor={ id }>{ tracker.name }</label>
                          </div>
                        </div>
                      : <div className="form-outline me-2 mt-2 custom-tracker-input" data-mdb-input-init key={ id } data-tracker-name={ tracker.name } >
                          <input type="text" id={ id } className="form-control" />
                          <label className="form-label" htmlFor={ id }>{ tracker.name }</label>
                        </div>
                  })
                }
              </div>
            </div>
            
            <PrimeReactProvider>
              <FileUpload
                accept="image/*"
                auto={ false }
                maxFileSize={ 10_485_760 } // 10MB
                multiple
                name="fileUpload[]"
                chooseLabel="Add Memories"
                emptyTemplate={ <p className="m-0">Drag and drop files here</p> }
                customUpload={ true }
                uploadHandler={ fileUploadHandler }
                ref={ fileUploadComponent }
                onSelect={ (e) => fileUploadComponent.current!.setFiles(e.files.sort((a: any, b: any) => a.size - b.size)) } // sort selected files by size
              />
            </PrimeReactProvider>

            <div className="d-flex align-items-center justify-content-center m-2">
              <button type="button" className="btn btn-secondary me-2 w-50" data-mdb-ripple-init onClick={ async () => {
                  const date = entryModal.current!.getAttribute('data-startstr')!;
                  await setupViewMemoriesModal(date);
                  new Modal(viewMemoriesModal.current!).show();
                }}><span>Show Memories</span><span className="badge rounded-pill badge-dark ms-2">{ viewMemoriesModalFiles.length }</span>
              </button>
              <button type="button" className="btn btn-secondary w-50" data-mdb-ripple-init onClick={ async () => {
                const date = entryModal.current!.getAttribute('data-startstr')!;
                const proceed = window.confirm(`Are you sure you want to delete all memories for ${date}?`);
                if (!proceed) return;
                await deleteAllMemories(date);
                alert(`All memories for ${date} have been deleted`);
              }}>Delete All Memories</button>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" data-mdb-ripple-init data-mdb-dismiss="modal">Close</button>
              <button type="button" className="btn btn-danger visually-hidden" data-mdb-ripple-init data-mdb-dismiss="modal" onClick={ () => {
                const proceed = window.confirm('Are you sure you want to delete this entry?');
                if (proceed) entryModalDelete(entryModal.current!.getAttribute('data-startstr')!);
              }}>Delete</button>
              <button type="button" className="btn btn-success save-button" data-mdb-ripple-init data-mdb-dismiss="modal" onClick={ entryModalSave }>Save</button>
            </div>
          </div>
        </div>
      </div>

      <div className="modal fade" ref={ customTrackersModal } tabIndex={ -1 } aria-labelledby="custom-trackers-modalLabel" aria-hidden="true">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="custom-trackers-modalLabel">Custom Trackers</h5>
              <button type="button" className="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body" ref={ customTrackersModalBody }>
              { !customTrackers.length && 'No custom trackers' }
              { customTrackers && customTrackers.map((tracker: CustomTracker, index: number) => {
                  const id = tracker.name.replaceAll(' ', '-') + '-' + index.toString() + '-calendar-input';
                  return tracker.type === 'checkbox' ?
                  <div className="d-flex align-items-center justify-content-between">
                    <div className="d-flex">
                      <h5>#{ index + 1 }</h5>
                      <div className="vr ms-2 me-2"></div>
                      <div className="d-flex align-items-center justify-content-center">
                        <i className={ "fa-lg mb-2 me-2 checkbox-custom-tracker-icon " + tracker.icon_classname } data-tracker-name={ tracker.name } onClick={ () => {
                          new Input(document.getElementById('icon-search')!.parentElement!);
                          setCustomTrackerIconModal.current!.setAttribute('data-tracker-name', tracker.name);
                          new Modal(setCustomTrackerIconModal.current!).show();
                        }}></i>
                      </div>
                      <div className="form-check form-switch mb-2 custom-tracker-input" data-mdb-input-init key={ id }>
                        <input className="form-check-input" type="checkbox" id={ id } />
                        <label className="form-check-label me-2 no-highlight" htmlFor={ id }>{ tracker.name }</label>
                      </div>
                    </div>
                    <i className="far fa-trash-can fa-lg custom-tracker-trash-can" onClick={ () => deleteCustomTracker(tracker.name) }></i>
                  </div>
                  : <div className="d-flex align-items-center justify-content-center">
                      <h5>#{ index + 1 }</h5>
                      <div className="vr me-2 ms-2"></div>
                      <div className="form-outline mb-2 me-2 custom-tracker-input" data-mdb-input-init key={ id }>
                        <input type="text" id={ id } className="form-control" />
                        <label className="form-label" htmlFor={ id }>{ tracker.name }</label>
                      </div>
                      <i className="far fa-trash-can fa-lg custom-tracker-trash-can" onClick={ () => deleteCustomTracker(tracker.name) }></i>
                    </div>
                })
              }
            </div>
            <div className="modal-footer d-flex justify-content-between">
              <div>
                <i className="fas fa-square-plus fa-2x add-custom-tracker-btn" onClick={ () => {
                  new Input(addCustomTrackerName.current!.parentElement);
                  addCustomTrackerName.current!.value = '';
                  addCustomTrackerType.current!.checked = true;
                  new Modal(addCustomTrackerModal.current).show();
                }}></i>
              </div>
              <div>
                <button type="button" className="btn btn-secondary custom-tracker-modal-close-btn" data-mdb-ripple-init data-mdb-dismiss="modal">Close</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="modal fade" id="add-custom-tracker-modal" ref={ addCustomTrackerModal } tabIndex={ -1 } aria-labelledby="add-custom-tracker-modal-label" aria-hidden="true">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="add-custom-tracker-modal-label">Add Custom Tracker</h5>
              <button type="button" className="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">
              <div className="form-outline mb-2" data-mdb-input-init>
                <input type="text" id="add-custom-tracker-name" className="form-control" ref={ addCustomTrackerName } />
                <label className="form-label" htmlFor="add-custom-tracker-name">Tracker Name</label>
              </div>
              <div className="form-check form-switch">
                <input className="form-check-input" type="checkbox" role="switch" id="add-custom-tracker-type" ref={ addCustomTrackerType } onChange={ (e) => {
                  addCustomTrackerTypeLabel.current!.textContent = (e.target as HTMLInputElement).checked ? 'Checkbox' : 'Text Input';
                }} />
                <label className="form-check-label" htmlFor="add-custom-tracker-type" ref={ addCustomTrackerTypeLabel }>Checkbox</label>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" data-mdb-ripple-init data-mdb-dismiss="modal">Close</button>
              <button type="button" className="btn btn-primary" data-mdb-ripple-init onClick={ () => {
                const icon = document.querySelector('.icons-grid i.selected');
                icon?.classList.remove('selected');
                createNewCustomTracker(
                  addCustomTrackerName.current!.value.trim(),
                  addCustomTrackerType.current!.checked ? 'checkbox' : 'text'
                );
              }}>Add Tracker</button>
            </div>
          </div>
        </div>
      </div>

      <div className="modal fade" id="add-custom-tracker-icon-modal" tabIndex={ -1 } aria-labelledby="add-custom-tracker-icon-modal-label" aria-hidden="true" ref={ setCustomTrackerIconModal }>
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="add-custom-tracker-icon-modal-label">Select Custom Tracker Icon</h5>
              <button type="button" className="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">
              <div className="d-flex align-items-center">
                <div className="form-outline w-75" data-mdb-input-init>
                  <i className="fas fa-magnifying-glass trailing"></i>
                  <input type="text" id="icon-search" className="form-control form-icon-trailing" onKeyDown={ (e) => {
                      if (e.key === 'Enter') performIconSearch((e.target as HTMLInputElement).value.trim());
                    }} />
                  <label className="form-label" htmlFor="icon-search">Search</label>
                </div>
              </div>
              <div className="icons-grid pt-4" ref={ iconsGrid }>
                {
                  icons.map((icon: string) => {
                    const iconSlot = document.getElementById('save-btn-icon-slot') as HTMLDivElement;
                    return (
                      <i className={ "fa-lg mb-2 me-2 " + icon } data-icon-class-string={ icon } key={ icon } onClick={ (e) => {
                        document.querySelectorAll('.icons-grid i.selected').forEach((icon: Element) => icon.classList.remove('selected'));
                        (e.target as HTMLElement).classList.add('selected');
                        iconSlot.innerHTML = `<i class="${ 'fa-lg ' + icon }"></i>`;
                      }}></i>
                    );
                  })
                }
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" id="icon" data-mdb-ripple-init data-mdb-dismiss="modal">Close</button>
              <button
                type="button"
                className="btn btn-primary d-flex justify-content-center align-items-center"
                data-mdb-ripple-init
                onClick={() => {
                  (document.querySelector('#add-custom-tracker-icon-modal .btn-secondary') as HTMLButtonElement).click();
                  const tracker_name = setCustomTrackerIconModal.current!.getAttribute('data-tracker-name')!;
                  const icon_class_string = document.querySelector('.icons-grid i.selected')?.getAttribute('data-icon-class-string');
                  if (!icon_class_string) return alert('You must select an icon before saving');
                  saveCustomTrackerIcon(tracker_name, icon_class_string) ;
                }}>
                <span>Save Icon</span>
                <div id="save-btn-icon-slot" className="ms-2"></div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="modal fade modal" ref={ viewEntryModal } tabIndex={ -1 } aria-labelledby="view-entry-modal-label" aria-hidden="true" data-startstr="DYNAMICALLY ADDED">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header d-flex justify-content-between align-items-center">
              <h5 className="modal-title" id="view-entry-modal-label" ref={ viewEntryModalTitle }>DYNAMIC TITLE</h5>
              <div className="d-flex align-items-center">
                <b><span ref={ viewEntryModalRatingDisplay }>x</span> / 10</b>
                <div className="ms-3" ref={ viewEntryModalStarredDisplay }></div>
                <button type="button" className="btn-close ms-2 d-flex align-items-center" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close" style={{ marginLeft: 0 }}></button>
              </div>
            </div>
            <div className="modal-body" ref={ viewEntryModalBody }>

            </div>
            <div className="modal-footer d-flex justify-content-between align-items-center">
              <div>
                <button type="button" className="btn btn-secondary me-2" data-mdb-ripple-init onClick={ async () => {
                  const date = viewEntryModal.current!.getAttribute('data-startstr')!;
                  await setupViewMemoriesModal(date);
                  viewEntryMemoriesModalDateDisplay.current!.textContent = `${months[parseInt(date.split('-')[1]) - 1]} ${date.split('-')[2]}, ${date.substring(0, 4)}`;
                  new Modal(viewEntryMemoriesModal.current!).show();
                }}><span>View Memories</span><span className="badge rounded-pill badge-dark ms-2">{ viewMemoriesModalFiles.length }</span></button>
                <button type="button" className="btn btn-danger me-2" data-mdb-ripple-init data-mdb-dismiss="modal" onClick={() => {
                  const proceed = window.confirm('Are you sure you want to delete this entry?');
                  if (proceed) entryModalDelete(viewEntryModal.current!.getAttribute('data-startstr')!);
                }}>Delete</button>
                <button type="button" className="btn btn-secondary" data-mdb-ripple-init data-mdb-dismiss="modal">Close</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="modal fade modal-xl" ref={ viewEntryMemoriesModal } tabIndex={ -1 } aria-labelledby="view-memories-modal-label" aria-hidden="true">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="view-memories-modal-label">Memories - <span ref={ viewEntryMemoriesModalDateDisplay }>DYNAMICALLY ADDED</span></h5>
              <button type="button" className="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body d-flex justify-content-center align-items-center" ref={ viewEntryMemoriesModalBody }>
              { viewMemoriesModalFiles.length === 0 && <div className="text-center">No memories saved</div> }
              { viewMemoriesModalFiles.length > 0 &&
                <div className="image-grid" style={{ "gridTemplateColumns": `repeat(${viewMemoriesModalFiles.length > 3 ? 3 : viewMemoriesModalFiles.length}, 1fr)` }}>
                  {
                    viewMemoriesModalFiles.map((file: { name: string, url: string, date: string }) => {
                      return (
                        <a href={ file.url } target="_blank"><img src={ file.url } alt={ file.name } className="img-thumbnail no-highlight" /></a>
                      );
                    })
                  }
                </div>
              }
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" data-mdb-ripple-init data-mdb-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>

      <div className="modal fade" ref={ viewMemoriesModal } tabIndex={ -1 } aria-labelledby="view-memories-modal-label" aria-hidden="true">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="view-memories-modal-label">Memories - <span ref={ viewMemoriesModalDateDisplay }>DYNAMICALLY ADDED</span></h5>
              <button type="button" className="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body" ref={ viewMemoriesModalBody }>
              { viewMemoriesModalFiles.length === 0 && <div className="text-center">No memories saved</div> }
              { viewMemoriesModalFiles.length > 0 &&
                viewMemoriesModalFiles.map((file: { name: string, url: string, date: string }) => {
                  return (
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div className="d-flex align-items-center">
                        <img src={ file.url } alt={ file.name } className="img-thumbnail no-highlight" />
                        <a href={ file.url} target="_blank" className="text-decoration-none btn-primary">{ file.name }</a>
                      </div>
                      <div className="d-flex align-items-center">
                        <button className="btn btn-floating btn-secondary btn-sm me-2 " type="button" style={{ color: "var(--mdb-primary)" }} onClick={ async () => fileDownload(await fetch(file.url).then(res => res.blob()), file.name) }>
                          <i className="fas fa-download"></i>
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={ () => removeFileFromMemoriesModal(file.date, file.name) }>Remove</button>
                      </div>
                    </div>
                  );
                })
              }
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" data-mdb-ripple-init data-mdb-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
 
export default Home;
