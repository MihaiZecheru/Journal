import { UserID } from "./ID";
import TDateString from "./TDateString";

export default interface CustomTracker {
  user_id: UserID;
  type: TCustomTrackerTypeField;
  name: string;
}

export type TCustomTrackerTypeField = "text" | "checkbox";