export type Year = 'Freshman' | 'Sophomore' | 'Junior' | 'Senior' | 'Graduate';

export const years: Year[] = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];

/** Non-sensitive profile fields only; passwords and email stay in auth.users. */
export type Profile = {
  id: string;
  name: string;
  year: Year;
  major: string;
};

export type ProfileInput = Omit<Profile, 'id'>;

export type FriendRequest = {
  /** Friendship row ID, used to accept. */
  id: string;
  from: Profile;
};
