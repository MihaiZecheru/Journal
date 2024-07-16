import { UserID } from "./ID";
import TDateString from "./TDateString";

export default interface Entry {
  user_id: UserID;
  date: TDateString;
  rating: number; // 1 - 11; 1 - 10 for the rating, while 11 represents no rating
  journal_entry: string;
  hours_slept?: number;
}