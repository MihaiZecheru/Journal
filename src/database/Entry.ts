import { UserID } from "./ID";
import TDateString from "./TDateString";

export default interface Entry {
  user_id: UserID;
  date: TDateString;
  rating: number; // 1 - 10
  journalEntry: string;
}