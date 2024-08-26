import { User } from "@supabase/supabase-js";
import supabase from "./config/supabase";
import { UserID } from "./ID";

export default async function GetUser(): Promise<User> {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error('Error retrieving user: ', error);
    // If there was a bug just have him sign in again
    await supabase.auth.signOut();
    throw error;
  }

  return data.user;
}

export async function GetUserID(): Promise<UserID> {
  return (await GetUser()).id as UserID;
}