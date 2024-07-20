import { UserID } from "./ID";
import TDateString from "./TDateString";

export default interface CustomTracker {
  user_id: UserID;
  type: TCustomTrackerTypeField;
  name: string;
  icon_classname: string; // The class name of the icon to display, e.g. "fas fa-circle"
}

export type TCustomTrackerTypeField = "text" | "checkbox";