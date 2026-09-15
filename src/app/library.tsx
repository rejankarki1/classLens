import { Redirect } from 'expo-router';

export default function LibraryCompatibilityRedirect() {
  return <Redirect href={"/catchup" as any} />;
}
